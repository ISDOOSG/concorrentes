# Prompt Lovable — Sugestão automática de Facebook Page + Google Advertiser

> Auto-detectar `facebook_page_id` e `google_advertiser_id` ao cadastrar concorrente, usando: (A) regex no markdown do crawl, (B) ScrapeCreators search APIs, (C) LLM como árbitro pra escolher entre candidatos. Frontend (PR paralelo Claude Code) já está pronto pra ler `competitors.facebook_page_suggestion` / `google_advertiser_suggestion` / `ads_link_confidence` / `ads_link_reasoning`. **NÃO mexa em frontend.**

## 1. Migration: colunas novas em `competitors`

```sql
-- 0013_ads_link_suggestions.sql
alter table public.competitors
  add column if not exists facebook_page_suggestion text,
  add column if not exists google_advertiser_suggestion text,
  add column if not exists ads_link_confidence jsonb,
  add column if not exists ads_link_reasoning text,
  add column if not exists ads_link_suggested_at timestamptz;
```

`ads_link_confidence` formato: `{ "meta": 0.92, "google": 0.65 }` (valores 0-1).

## 2. Edge Function `suggest-ads-links`

**Trigger:**
- HTTP POST `{ competitor_id }` com JWT do user OU service_role + `user_id`
- Idempotente: se `ads_link_suggested_at < 24h`, retorna o que já tem (não regrava)

**Algoritmo:**

### Passo A — extrair candidatos do markdown

Carrega o snapshot mais recente do competitor. No `raw_text` (markdown), aplica regex:

```ts
const FB_RE = /facebook\.com\/(?!sharer|tr\?|plugins)([\w.\-]+)/gi;
const GOOGLE_RE = /adstransparency\.google\.com\/advertiser\/(AR\d+)/gi;
const IG_RE = /instagram\.com\/([\w.\-]+)/gi;  // backup p/ inferir FB
```

Coleta tudo, deduplica, mantém top 5.

### Passo B — ScrapeCreators search

Usa chave do user via `get_scraper_key('scrapecreators')`. Se ausente, pula esse passo (continua com só candidatos do A).

```
GET https://api.scrapecreators.com/v1/facebook/adLibrary/search/companies
    ?query={competitor.name}&limit=5
GET https://api.scrapecreators.com/v1/google/adLibrary/advertisers/search
    ?query={competitor.name}&limit=5
```

Header: `x-api-key: <key>`. Mantém top 5 de cada.

### Passo C — LLM como árbitro

Usa o provider router (Lovable AI default ou BYOK). Modelo "classification" (rápido).

Prompt:

```
Você está identificando contas oficiais de um concorrente em redes sociais e
plataformas de ads.

Concorrente:
- Nome: {competitor.name}
- URL: {competitor.url}
- Domínio: {extractDomain(url)}

Candidatos do site (extraídos do markdown):
- Facebook: {fbFromSite[]}
- Instagram (use só pra inferir FB se necessário): {igFromSite[]}
- Google Advertiser: {googleFromSite[]}

Candidatos do ScrapeCreators search:
- Facebook (top 5): {fbFromSearch[].map(c => `${c.name} (id: ${c.id}, ${c.followers_count} seguidores)`)}
- Google (top 5): {googleFromSearch[].map(a => `${a.advertiser_name} (id: ${a.advertiser_id}, ${a.country})`)}

Tarefa: identificar a Page/Advertiser oficial deste concorrente. Não invente.
Se não tiver certeza alta, retorne null + confidence baixa.

Retorne ESTRITAMENTE este JSON:
{
  "facebook_page_id": "<id ou username>" | null,
  "google_advertiser_id": "AR..." | null,
  "confidence": { "meta": 0.0-1.0, "google": 0.0-1.0 },
  "reasoning": "1-2 frases em PT-BR explicando a escolha"
}
```

Parse o JSON. Valida campos. Em caso de erro de parse, retorna `null` em ambos com confidence 0 e reasoning explicando falha.

### Passo D — persistir

```sql
update public.competitors set
  facebook_page_suggestion = $1,
  google_advertiser_suggestion = $2,
  ads_link_confidence = $3,
  ads_link_reasoning = $4,
  ads_link_suggested_at = now()
where id = $5;
```

**NÃO** preenche `facebook_page_id` / `google_advertiser_id` automaticamente. Frontend pré-popula campos com a sugestão e usuário confirma manualmente.

**Retorna 200** com payload:

```json
{
  "ok": true,
  "facebook_page_id": "...",
  "google_advertiser_id": "...",
  "confidence": { "meta": 0.92, "google": 0.65 },
  "reasoning": "..."
}
```

## 3. Trigger automático

Após o trigger `on_snapshot_inserted` (que dispara `detect-changes`), adicionar ramo que também invoca `suggest-ads-links` na PRIMEIRA snapshot do competitor (se `competitor.ads_link_suggested_at IS NULL`):

```sql
create or replace function public.invoke_suggest_ads_links()
returns trigger language plpgsql security definer set search_path = public, extensions
as $$
declare fn_url text; service_key text; user_id_val uuid; suggested timestamptz;
begin
  select user_id, ads_link_suggested_at into user_id_val, suggested
    from public.competitors where id = new.competitor_id;
  if suggested is not null and suggested > now() - interval '24 hours' then
    return new;  -- já sugerido recentemente
  end if;
  select value into fn_url from public.app_config where key = 'functions_base_url';
  select value into service_key from public.app_config where key = 'service_role_key';
  if fn_url is null or service_key is null then return new; end if;
  perform net.http_post(
    url := fn_url || '/suggest-ads-links',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || service_key
    ),
    body := jsonb_build_object('competitor_id', new.competitor_id, 'user_id', user_id_val)
  );
  return new;
end; $$;

revoke execute on function public.invoke_suggest_ads_links() from public, anon, authenticated;

create trigger on_snapshot_suggest_ads
  after insert on public.snapshots
  for each row execute function public.invoke_suggest_ads_links();
```

## 4. Erros e edge cases

- ScrapeCreators sem chave → pula passo B, segue só com markdown. Confidence cai automaticamente.
- LLM falhar → retorna `null/null/0/0/"falha técnica: <msg>"`
- Markdown vazio → retorna `null/null/0/0/"sem snapshot disponível"`
- LLM retorna ID claramente bogus (regex `/^[a-z0-9_.-]+$/i` falha pra FB ou `/^AR\d+$/` falha pra Google) → trata como null

## 5. Custos por competitor

- Markdown (passo A): 0 — já temos
- ScrapeCreators search (passo B): 2 créditos (1 Meta + 1 Google)
- LLM classification (passo C): ~500 tokens, ~$0.0001 com Haiku ou equivalente Lovable AI

Total: ~2 créditos ScrapeCreators + custo LLM negligível.

## 6. Tipos TS

Após a migration, regenere `src/integrations/supabase/types.ts`.

## Ordem de execução

1. Aplicar migration `0013_ads_link_suggestions.sql`
2. Criar Edge Function `suggest-ads-links`
3. Criar trigger `on_snapshot_suggest_ads`
4. Regenerar tipos TS
5. Avisar quando concluir — frontend já está pronto pra plumbar (ler colunas novas no `getAdsLinkSuggestions`)

## O que NÃO entra

- Auto-preencher `facebook_page_id` direto (sempre passa pelo OK do user)
- Cache de search ScrapeCreators (não vale a pena pra brand novo)
- Refresh automático periódico (1x por competitor é suficiente — re-roda só após delete + recrawl)

**Spec canônica:** `docs/architecture.md`. Este adendo amplia §5 (Integrações) e §3.1 (Data Model).
