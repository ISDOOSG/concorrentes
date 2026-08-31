# Architecture — Análise de Concorrentes

> **Versão:** 1.0
> **Autor:** Aria (@architect)
> **Data:** 2026-04-26
> **PRD de referência:** [prd.md v1.0](./prd.md)

## 1. Visão Arquitetural

Sistema **monolítico modular** rodando sobre **Cloudflare Workers** (frontend SSR + APIs leves) com **Supabase** como spine de dados, auth, storage e jobs assíncronos via **Edge Functions**. Integrações externas (Firecrawl, ScrapFly, Similarweb, LLM) são chamadas exclusivamente do server-side para proteger API keys.

```
┌─────────────────────────────────────────────────────────────┐
│                  Cloudflare Workers (Edge)                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  TanStack Start app (SSR + React 19 + shadcn/ui)     │   │
│  │  - Routes: /, /login, /dashboard, /competitors/:id   │   │
│  │  - Server functions (BFF para Supabase)              │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                             │
                             │ JWT (Supabase Auth)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                         Supabase                             │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────────────┐  │
│  │Postgres │  │  Auth   │  │ Storage  │  │ Edge Funcs   │  │
│  │ + RLS   │  │  email  │  │ buckets  │  │ (Deno)       │  │
│  └─────────┘  └─────────┘  └──────────┘  └──────┬───────┘  │
│                                                  │          │
│                              pg_cron / scheduled │          │
│                                                  │          │
└──────────────────────────────────────────────────┼──────────┘
                                                   │
                                                   ▼
                          ┌───────────────────────────────────┐
                          │       Integrações Externas        │
                          │  Firecrawl │ ScrapFly │ Similarweb│
                          │              LLM Provider          │
                          └───────────────────────────────────┘
```

## 2. Princípios Arquiteturais

1. **Server-side only para integrações externas** — API keys nunca expostas no browser.
2. **RLS first** — toda tabela de domínio carrega `user_id` e tem RLS ativo.
3. **Async by default** — qualquer operação > 2s vira job em Edge Function disparada por cron ou trigger.
4. **Idempotência em jobs** — crawls re-rodados não duplicam snapshots; usar hash de conteúdo.
5. **Cost-aware** — cachear agressivamente (Similarweb cobra por chamada; LLM idem). Snapshot diário, não horário.
6. **Schema migrations versionadas** — toda mudança de DB via `supabase/migrations/` numerada.

## 3. Data Model (PostgreSQL via Supabase)

### 3.1 Tabelas de domínio

```sql
-- profiles: extensão do auth.users com metadados
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  url_quota int not null default 5,
  created_at timestamptz not null default now()
);

-- competitors: URLs sob monitoramento
create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  url text not null,
  status text not null default 'active' check (status in ('active', 'paused')),
  last_crawled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, url)
);

-- snapshots: estado de cada crawl (texto extraído + metadados)
create table public.snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  crawled_at timestamptz not null default now(),
  content_hash text not null,
  raw_text text,
  structured_data jsonb,        -- preços, headlines, CTAs extraídos
  traffic_data jsonb,           -- payload Similarweb
  screenshot_path text,         -- path no Storage
  source text not null,         -- 'firecrawl' | 'scrapfly'
  cost_cents int default 0
);

create index on public.snapshots (competitor_id, crawled_at desc);

-- changes: diffs detectados entre snapshots consecutivos
create table public.changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  from_snapshot_id uuid not null references public.snapshots(id),
  to_snapshot_id uuid not null references public.snapshots(id),
  detected_at timestamptz not null default now(),
  change_type text not null,    -- 'price' | 'copy' | 'feature' | 'design' | 'traffic'
  severity text not null,       -- 'info' | 'warning' | 'critical'
  summary text not null,
  diff jsonb not null,
  alerted boolean not null default false
);

create index on public.changes (user_id, detected_at desc);

-- alerts: notificações geradas para o usuário
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  change_id uuid references public.changes(id) on delete cascade,
  channel text not null default 'in_app',  -- v1 só in_app
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- swot_reports: relatórios SWOT gerados por IA
create table public.swot_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  generated_at timestamptz not null default now(),
  strengths jsonb not null,
  weaknesses jsonb not null,
  opportunities jsonb not null,
  threats jsonb not null,
  llm_model text not null,
  cost_cents int default 0
);
```

### 3.2 RLS Policies (single-tenant)

Padrão aplicado a **todas** as tabelas de domínio:

```sql
alter table public.<tabela> enable row level security;

create policy "users_select_own" on public.<tabela>
  for select using (auth.uid() = user_id);

create policy "users_insert_own" on public.<tabela>
  for insert with check (auth.uid() = user_id);

create policy "users_update_own" on public.<tabela>
  for update using (auth.uid() = user_id);

create policy "users_delete_own" on public.<tabela>
  for delete using (auth.uid() = user_id);
```

`profiles` usa `auth.uid() = id` em vez de `user_id`.

### 3.3 Storage

**Bucket:** `screenshots` (privado).

**Path pattern:** `{user_id}/{competitor_id}/{snapshot_id}.png`

**Storage policies:**
```sql
create policy "users_read_own_screenshots" on storage.objects
  for select using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```
(análoga para insert/delete)

## 4. Edge Functions (Supabase Deno runtime)

| Função | Trigger | Responsabilidade |
|--------|---------|------------------|
| `crawl-competitor` | HTTP (manual) + scheduled | Chama Firecrawl (com fallback ScrapFly), salva snapshot, gera screenshot, busca tráfego Similarweb |
| `detect-changes` | DB trigger após `snapshots` insert | Compara último snapshot com o anterior, gera linhas em `changes` |
| `generate-alerts` | DB trigger após `changes` insert (severity != info) | Cria `alerts` |
| `generate-swot` | HTTP (on-demand pelo usuário) | Agrega últimos N snapshots → prompt LLM (via provider router) → grava `swot_reports` |
| `daily-crawl-scheduler` | pg_cron diário (03h UTC) | Enfileira `crawl-competitor` para todos `competitors` com `status='active'` |
| `save-llm-key` | HTTP | Recebe API key plain, criptografa via `encrypt_llm_key`, grava em `user_llm_keys` |
| `delete-llm-key` | HTTP | Remove chave do usuário para um provider |

**Concorrência:** crawls paralelos limitados a 5 por usuário para não estourar quotas externas.

## 5. Integrações Externas

| Serviço | Uso | Custo aprox. | Notas |
|---------|-----|--------------|-------|
| **Firecrawl** | Scraping de landing pages (markdown + screenshot) | ~$0.001/página | BYOK obrigatório. Sem fallback no MVP |
| **ScrapeCreators** | Anúncios ativos no Meta (FB/IG) e Google Ads | 1 crédito/ad consultado | BYOK opcional. Sem chave, aba "Anúncios" fica vazia |
| **LLM (multi-provider)** | Classificação de mudanças + SWOT | varia por provider | Lovable AI (default) ou BYOK Anthropic/OpenAI/Gemini |

> **Removidos do MVP** (mantidos no histórico do repo): ScrapFly (fallback de scraping pesado) e Similarweb (métricas de tráfego). Podem voltar em v1.1 conforme demanda.

### 5.1 LLM Providers — BYOK + Lovable AI

A plataforma suporta **4 provedores de LLM**, com **Lovable AI** como fallback automático para usuários que não trouxeram chave própria (BYOK — *Bring Your Own Key*).

| Provider | Modelos sugeridos | Quando usar |
|----------|-------------------|-------------|
| **Lovable AI** | router gerenciado (`google/gemini-2.5-flash` para classificação, `google/gemini-2.5-pro` ou `anthropic/claude-sonnet-4` para SWOT) | **Default** — zero config; cobrança via Lovable Cloud |
| **Anthropic** | `claude-haiku-4-5` (classificação) / `claude-sonnet-4-6` (SWOT) | Usuário tem conta Anthropic e quer controle de custo direto |
| **OpenAI** | `gpt-4o-mini` (classificação) / `gpt-4o` (SWOT) | Usuário prefere GPT |
| **Google Gemini** | `gemini-2.5-flash` (classificação) / `gemini-2.5-pro` (SWOT) | Usuário tem créditos Google AI |

**Resolução do provider em runtime:**

```
1. Lê preference do usuário em `user_llm_settings.provider`
2. Se provider != 'lovable':
   2a. Busca chave em `user_llm_keys` (criptografada AES-256-GCM)
   2b. Se chave ausente ou inválida → fallback para Lovable AI + flag warning
3. Senão: usa Lovable AI (Edge Function reads LOVABLE_API_KEY de env)
```

**Schema adicional:**

```sql
create table public.user_llm_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'lovable'
    check (provider in ('lovable', 'anthropic', 'openai', 'gemini')),
  model_classification text,      -- override opcional
  model_swot text,                -- override opcional
  updated_at timestamptz not null default now()
);
alter table public.user_llm_settings enable row level security;
-- policies padrão (auth.uid() = user_id)

create table public.user_llm_keys (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai', 'gemini')),
  encrypted_key bytea not null,   -- pgcrypto AES-256-GCM
  key_hint text,                  -- últimos 4 chars (UI mostra "sk-...abcd")
  created_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.user_llm_keys enable row level security;
-- policies padrão; encrypted_key NUNCA retorna ao client (only edge functions descriptografam)
```

**Encryption strategy:**
- Master key via Supabase secret `LLM_KEY_ENCRYPTION_SECRET` (256 bits, hex)
- `pgcrypto` extension habilitada
- Funções `encrypt_llm_key(plain text)` e `decrypt_llm_key(enc bytea)` em SECURITY DEFINER, acessíveis só por service role
- Cliente envia chave plain via HTTPS para Edge Function `save-llm-key` que criptografa e grava

**Provider router (Edge Function helper):**

```ts
// supabase/functions/_shared/llm-provider.ts
export async function getLLMClient(userId: string, useCase: 'classification' | 'swot') {
  const settings = await getUserLLMSettings(userId);
  if (settings.provider === 'lovable') return lovableClient(useCase);
  const key = await getDecryptedKey(userId, settings.provider);
  if (!key) {
    logFallback(userId, settings.provider, 'missing_key');
    return lovableClient(useCase);
  }
  return providerClient(settings.provider, key, useCase);
}
```

**Secrets management:**
- `LOVABLE_API_KEY` — Edge Function secret (já provisionado pelo Lovable Cloud)
- `LLM_KEY_ENCRYPTION_SECRET` — Edge Function secret (gerar 1x)
- Demais API keys de scraping (Firecrawl, ScrapFly, Similarweb): Edge Function secrets
- Chaves LLM dos usuários **NUNCA** em env — sempre criptografadas em `user_llm_keys`

## 6. Frontend (TanStack Start)

### 6.1 Estrutura de rotas

```
src/routes/
  __root.tsx
  index.tsx                  → landing pública / redirect se logado
  login.tsx                  → e-mail + senha
  signup.tsx                 → cadastro
  _authed/                   → layout protegido (verifica session)
    dashboard.tsx            → overview (últimos alertas + competitors)
    competitors/
      index.tsx              → lista + ação "adicionar URL"
      $id.tsx                → detalhe (snapshots, changes, screenshots, SWOT)
    alerts.tsx               → lista completa de alertas
    settings.tsx             → perfil, plano
```

### 6.2 Camadas

- **UI:** shadcn/ui já instalado, Tailwind v4
- **State server:** TanStack Query
- **State client (forms):** React Hook Form + Zod
- **Cliente Supabase:** `src/integrations/supabase/client.ts` (já existe)
- **Server functions:** TanStack Start `createServerFn` para chamadas autenticadas

## 7. Fluxos Críticos

### 7.1 Cadastro de competidor

```
User → POST /competitors (server fn)
     → insert competitors (RLS valida user_id)
     → invoke edge function `crawl-competitor` (fire-and-forget)
     → return 201
     → UI mostra "crawl em andamento"
     → query polling em snapshots ou subscribe via Realtime
```

### 7.2 Detecção diária de mudanças

```
pg_cron (3h da manhã UTC)
  → daily-crawl-scheduler
  → para cada competitor active: enfileira crawl-competitor
  → crawl-competitor: Firecrawl/ScrapFly → screenshot → Similarweb → insert snapshot
  → trigger detect-changes: compara hash, classifica via Haiku
  → se severity != info: trigger generate-alerts
  → user vê badge no /alerts no próximo login
```

### 7.3 SWOT on-demand

```
User clica "Gerar SWOT" em /competitors/:id
  → POST server fn → invoke generate-swot
  → função agrega últimos 30 dias de snapshots + changes
  → prompt para Sonnet 4.6
  → grava swot_reports
  → UI exibe resultado
```

## 8. Deploy & Infraestrutura

| Camada | Plataforma | Notas |
|--------|-----------|-------|
| Frontend + SSR | Cloudflare Workers | `wrangler.jsonc` já no repo |
| DB + Auth + Storage + Edge Funcs | Supabase | project_id `xkdvfopvassssvkuxjnp` (já configurado) |
| Cron | pg_cron no Supabase | criado via migration |
| Secrets | Supabase Dashboard + Cloudflare env | nunca em `.env` commitado |

**Branch strategy:** trunk-based. `main` = production. Feature branches → PR → merge.

**Migrations:** `supabase/migrations/{timestamp}_{name}.sql`. Aplicar via `supabase db push` (link já existe via `config.toml`).

## 9. Roadmap de Stories (alta granularidade)

| Epic | Tema | Stories estimadas |
|------|------|-------------------|
| **E1** | Auth + Onboarding | 3 |
| **E2** | Cadastro de Competidores (CRUD + crawl manual) | 3 |
| **E3** | Crawl & Snapshot Engine (Firecrawl + ScrapFly + Similarweb + Storage) | 4 |
| **E4** | Detecção de Mudanças & Alertas | 3 |
| **E5** | Dashboard Comparativo | 3 |
| **E6** | SWOT por IA + Configuração de LLM Provider (BYOK) | 3 |
| **E7** | Histórico de Screenshots | 1 |
| **E8** | pg_cron + scheduled crawls diários | 1 |

Total estimado: **~21 stories** para v1 completo. MVP enxuto = E1+E2+E3 (mínimo 10 stories).

## 10. Riscos Técnicos & Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Sites bloqueando scraping | Alto | Fallback Firecrawl → ScrapFly; respeitar `robots.txt` |
| Custos de Similarweb explodindo | Alto | Cache 30 dias por domínio; limitar quota por plano |
| LLM gerando SWOT genérico | Médio | Prompts ricos com dados reais (snapshots + changes); few-shot |
| RLS mal configurado vazando dados | Crítico | Test suite específico de RLS antes de cada deploy |
| Cloudflare Workers + TanStack Start edge cases | Médio | Lovable já validou scaffold; manter `wrangler dev` no loop |

## 11. Decisões Confirmadas (v1)

| # | Decisão | Resolução |
|---|---------|-----------|
| 1 | **LLM providers** | Multi-provider (Lovable AI default + BYOK Anthropic/OpenAI/Gemini) |
| 2 | **Frequência de crawl** | Diária fixa, 03h UTC |
| 3 | **Retenção de snapshots** | Ilimitada em v1; rotação só se virar custo |
| 4 | **Auth** | E-mail + senha em v1; OAuth (Google/GitHub) em fase posterior |
