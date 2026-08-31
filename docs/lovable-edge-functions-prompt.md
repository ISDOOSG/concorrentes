# Prompt Lovable — Edge Functions pendentes

> Cole no Lovable. Frontend e schema base já estão prontos no repo (provider supabase em `src/lib/data/providers/supabase.ts`). Faltam Edge Functions + scheduler pra fechar o loop end-to-end. **NÃO mexa no frontend nem em migrations já aplicadas.** Spec canônica: `docs/architecture.md`.

## Contexto rápido

- Schema já aplicado: `profiles`, `competitors`, `snapshots`, `changes`, `alerts`, `swot_reports`, `user_llm_settings`, `user_llm_keys`, `user_scraper_keys` (BYOK), `app_config`
- Funções já existentes: `encrypt_llm_key(plain)` / `decrypt_llm_key(enc)`, `get_scraper_key(provider)` / `set_scraper_key(...)`
- Triggers já existentes: `on_change_inserted` (chama `generate-alerts`), `handle_new_user` (cria profile no signup)
- Edge function existente: `test-scraper-key`
- BYOK scrapers: cada user traz suas próprias chaves Firecrawl/ScrapFly/Similarweb. Edge funcs devem chamar `get_scraper_key(provider)` para descriptografar e usar.
- BYOK LLM: idem para Anthropic/OpenAI/Gemini via `decrypt_llm_key(encrypted_key)`. Lovable AI é default quando user não tem chave.

## Edge Functions a deployar (em ordem)

### 1. `crawl-competitor` — coração do produto

**Trigger:** HTTP POST `{ competitor_id }` com JWT do user
**Responsabilidade:**
1. Carrega competitor pelo id (RLS valida user)
2. Busca chave Firecrawl do user via `get_scraper_key('firecrawl')`. Se não tiver, retorna 400 com mensagem "Configure sua chave Firecrawl em /settings/integrations"
3. Chama Firecrawl `POST https://api.firecrawl.dev/v2/scrape` com `{ url, formats: ['markdown', 'screenshot'] }`, timeout 30s
4. Em erro/bloqueio (4xx/5xx ou timeout), tenta ScrapFly via `get_scraper_key('scrapfly')` (se user tiver). Se não tiver fallback, retorna erro claro.
5. Extrai `structured_data` jsonb com heurísticas básicas no markdown:
   - Preços (regex `R\$\s?\d+|US\$\s?\d+|€\s?\d+`)
   - H1 (primeira linha que começa com `# `)
   - CTAs (links/botões com texto típico: "começar", "agendar", "demo", "teste grátis", etc)
6. Calcula `content_hash` = SHA-256 do markdown normalizado (lowercase, sem espaços extras)
7. Faz upload do screenshot PNG para `screenshots/{user_id}/{competitor_id}/{snapshot_id}.png`
8. Tenta Similarweb via `get_scraper_key('similarweb')`. Cache: se houve fetch < 30 dias para o domínio (consulta no `snapshots.traffic_data->>'fetched_at'`), reusa. Senão chama `GET https://api.similarweb.com/v1/website/{domain}/general-data/description?api_key=...`. Sem chave → omite tráfego (não é bloqueio).
9. Insere row em `snapshots` com tudo. Atualiza `competitors.last_crawled_at`.
10. Retorna `{ ok: true, snapshot_id, source }`

**Custos:** registra `cost_cents` aproximado por chamada externa.

### 2. `detect-changes` — disparada por trigger

**Trigger:** HTTP POST `{ snapshot_id }` (chamado por DB trigger `on_snapshot_inserted`)
**Responsabilidade:**
1. Busca o novo snapshot e o snapshot anterior do mesmo competitor (ordem desc por `crawled_at`, offset 1)
2. Se não há anterior (primeiro snapshot), retorna sem fazer nada
3. Calcula diff de:
   - `structured_data.prices` (qualquer mudança = `change_type=pricing`)
   - `structured_data.h1` (diff = `change_type=copy`)
   - `structured_data.ctas` (diff = `change_type=copy`)
   - Texto markdown completo (diff > 5% palavras → `change_type=content`)
   - `traffic_data.visits` delta > 30% MoM → `change_type=traffic`
4. Para cada diff detectado, chama LLM (provider router conforme item 8 abaixo) modelo "classification" com prompt curto pra classificar severity:
   - `info` → diff trivial (typo, ordem)
   - `warning` → mudança copy/feature meaningful
   - `critical` → mudança preço, lançamento de feature, traffic >30%
5. Insere uma row em `changes` por diff classificado
6. **NÃO** dispare `generate-alerts` aqui — o trigger DB `on_change_inserted` (já existente) faz isso automaticamente.

**Trigger DB a criar (em migration nova):**
```sql
create or replace function public.invoke_detect_changes()
returns trigger language plpgsql security definer set search_path = public, extensions
as $$
declare fn_url text; service_key text;
begin
  select value into fn_url from public.app_config where key = 'functions_base_url';
  select value into service_key from public.app_config where key = 'service_role_key';
  if fn_url is null or service_key is null then return new; end if;
  perform net.http_post(
    url := fn_url || '/detect-changes',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || service_key
    ),
    body := jsonb_build_object('snapshot_id', new.id)
  );
  return new;
end; $$;

create trigger on_snapshot_inserted
  after insert on public.snapshots
  for each row execute function public.invoke_detect_changes();
```

### 3. `generate-alerts`

**Trigger:** HTTP POST `{ change_id }` (já existe trigger `on_change_inserted`)
**Responsabilidade:**
1. Carrega o change
2. Se `severity = 'info'`, retorna sem fazer nada (já filtrado no trigger, mas double-check)
3. Insere `alerts` row com `change_id`, `user_id` do change, `channel='in_app'`
4. Marca `changes.alerted = true`

### 4. `generate-swot`

**Trigger:** HTTP POST `{ competitor_id }` com JWT do user
**Responsabilidade:**
1. Valida que competitor é do user (via RLS na select)
2. Agrega últimos 30 dias de:
   - `snapshots` (raw_text + structured_data + traffic_data)
   - `changes` (severity != info)
3. Monta prompt LLM pedindo JSON com 4 arrays `{ strengths, weaknesses, opportunities, threats }`, cada item `{ title, evidence }`, baseado nas evidências dos snapshots
4. Chama LLM modelo "swot" via provider router (item 8)
5. Parseia resposta como JSON, valida schema com zod-like check
6. Insere row em `swot_reports` com `competitor_id`, `user_id`, `llm_model`, `cost_cents`, e os 4 arrays
7. Retorna `{ ok: true, report_id }`

**Limite:** 1 SWOT por competitor a cada 24h (verificar `swot_reports.generated_at` mais recente).

### 5. `save-llm-key`

**Trigger:** HTTP POST `{ provider, key }` com JWT do user
**Responsabilidade:**
1. Valida `provider in ('anthropic','openai','gemini')`
2. Valida que `key.length >= 16` e formato esperado por provider
3. **Test call** ao provider antes de salvar:
   - Anthropic: `POST https://api.anthropic.com/v1/messages` com modelo Haiku, prompt de 1 token
   - OpenAI: `GET https://api.openai.com/v1/models`
   - Gemini: `GET https://generativelanguage.googleapis.com/v1beta/models?key=...`
4. Se test passa, chama `encrypt_llm_key(key)` para obter `encrypted_key bytea`
5. Upsert em `user_llm_keys` com `(user_id, provider, encrypted_key, key_hint = key.slice(-4))`
6. Retorna `{ ok: true, key_hint }`

### 6. `delete-llm-key`

**Trigger:** HTTP POST `{ provider }` com JWT do user
**Responsabilidade:**
- Delete em `user_llm_keys` filtrando `user_id = auth.uid() and provider = $1`
- Retorna `{ ok: true }`

### 7. `daily-crawl-scheduler`

**Trigger:** invocada por `pg_cron` diário às 03:00 UTC
**Responsabilidade:**
1. Para cada user com competitors ativos:
2. Itera `competitors where status='active'` daquele user
3. Enfileira `crawl-competitor` para cada com **concorrência limitada a 5 paralelos por user**
4. Aguarda completion (com `Promise.allSettled`)
5. Loga `cron_runs` (criar tabela opcional pra troubleshooting):
```sql
create table if not exists public.cron_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  total int default 0,
  errors jsonb default '[]'::jsonb
);
```

### 8. Helper compartilhado: `_shared/llm-provider.ts`

```ts
// Resolve LLM client by user preference + BYOK fallback to Lovable AI
type UseCase = 'classification' | 'swot';
type LLMResponse = { content: string; tokens: number; costCents: number };

export async function callLLM(
  userId: string,
  useCase: UseCase,
  prompt: string,
  jsonOutput = false
): Promise<LLMResponse> {
  // 1. Read user_llm_settings.provider (default 'lovable')
  // 2. If provider != 'lovable':
  //    a. Read user_llm_keys.encrypted_key for that provider
  //    b. If exists: decrypt via decrypt_llm_key, use that provider
  //    c. If missing or 401/403 in runtime: log fallback, use Lovable AI
  // 3. If provider == 'lovable': use LOVABLE_API_KEY env
  // 4. Map useCase → model:
  //    classification: claude-haiku-4-5 / gpt-4o-mini / gemini-2.5-flash / lovable-fast
  //    swot: claude-sonnet-4-6 / gpt-4o / gemini-2.5-pro / lovable-best
  // 5. Build provider-specific request, parse response, return { content, tokens, costCents }
}
```

## Pg_cron migration

```sql
-- 0009_pg_cron.sql
create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'daily-crawl',
  '0 3 * * *',
  $$
  select net.http_post(
    url := (select value from public.app_config where key = 'functions_base_url') || '/daily-crawl-scheduler',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization', 'Bearer ' || (select value from public.app_config where key = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

## Secrets necessários (configurar no Lovable Cloud)

- `LOVABLE_API_KEY` (já existe no Lovable Cloud)
- `LLM_KEY_ENCRYPTION_SECRET` — gere 1x: `openssl rand -hex 32` e adicione em `app_config` (key='llm_key_encryption_secret') OU como GUC `app.llm_key_encryption_secret`. **As funções de cripto já checam ambos** (ver `encrypt_llm_key`).
- `app_config.functions_base_url` = URL base das edge functions (ex: `https://xkdvfopvassssvkuxjnp.supabase.co/functions/v1`)
- `app_config.service_role_key` = service_role JWT do projeto

## Ordem de deploy sugerida

1. Criar/aplicar migration `0009_pg_cron.sql`
2. Configurar `LLM_KEY_ENCRYPTION_SECRET` em `app_config`
3. Criar trigger `on_snapshot_inserted` (em migration nova)
4. Deploy `_shared/llm-provider.ts`
5. Deploy edge functions na ordem: `crawl-competitor` → `detect-changes` → `generate-alerts` → `generate-swot` → `save-llm-key` → `delete-llm-key` → `daily-crawl-scheduler`
6. Validar pg_cron com `select * from cron.job` e `select * from cron.job_run_details order by start_time desc limit 5`

## Quando estiver pronto

Avise no chat. Eu (Claude Code) vou:
- Trocar `VITE_DATA_PROVIDER=supabase` no `.env`
- Testar fluxo: signup → cadastrar URL → crawl real → ver snapshot → SWOT → salvar BYOK LLM
- Reportar bugs caso encontre

**Não toque** em `src/`, `docs/architecture.md` ou em migrations já aplicadas. Especificação canônica continua em `docs/architecture.md`.
