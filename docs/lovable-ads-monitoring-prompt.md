# Prompt Lovable — Monitoramento de Anúncios (Meta + Google) via ScrapeCreators

> Cole no Lovable. Frontend (PR 3) está sendo desenvolvido em paralelo pelo Claude Code com mock data + tab "Anúncios" + UI de vínculo. Quando você terminar este PR, o frontend só plumba o `data` provider e funciona end-to-end.
>
> **NÃO mexa em frontend.** Spec canônica continua em `docs/architecture.md`.

## Mudança estratégica

Pivotamos a estratégia de monitoramento:

- **REMOVER ScrapFly e Similarweb** do produto (não são MVP)
- **ADICIONAR ScrapeCreators** — uma única chave BYOK que cobre Meta Ads + Google Ads
- **MANTER Firecrawl** — continua sendo o scraper de landing page (preços, copy, screenshots)

Documentação ScrapeCreators: https://docs.scrapecreators.com/v1/facebook/adLibrary/ad

## 1. Migration: tabela `ads_snapshots` + colunas `competitors` + ajustar enum

```sql
-- 0012_ads_monitoring.sql

-- Identificadores opcionais por competitor
alter table public.competitors
  add column facebook_page_id text,
  add column google_advertiser_id text,
  add column last_ads_fetched_at timestamptz;

-- Tabela de snapshots de ads (Meta + Google)
create table public.ads_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  source text not null check (source in ('meta', 'google')),
  ad_archive_id text not null,
  fetched_at timestamptz not null default now(),
  active boolean,
  body_text text,
  cta_text text,
  cta_url text,
  page_name text,
  creatives jsonb,           -- array de { type: 'image'|'video', url, thumbnail }
  targeting jsonb,           -- age ranges, gender, countries, location audiences
  spend_estimate jsonb,      -- { lower_bound, upper_bound, currency }
  impressions_estimate jsonb,
  start_date timestamptz,
  end_date timestamptz,
  platforms text[],          -- ['facebook','instagram','audience_network','messenger']
  raw jsonb                  -- payload completo da API pra futuro
);

create index ads_snapshots_competitor_idx
  on public.ads_snapshots (competitor_id, source, fetched_at desc);

create index ads_snapshots_user_idx
  on public.ads_snapshots (user_id, fetched_at desc);

-- Unique soft: 1 row por ad por dia (idempotência)
create unique index ads_snapshots_dedupe_idx
  on public.ads_snapshots (competitor_id, source, ad_archive_id, (fetched_at::date));

alter table public.ads_snapshots enable row level security;

create policy "ads_snapshots_select_own" on public.ads_snapshots
  for select using (auth.uid() = user_id);
create policy "ads_snapshots_insert_own" on public.ads_snapshots
  for insert with check (auth.uid() = user_id);
create policy "ads_snapshots_update_own" on public.ads_snapshots
  for update using (auth.uid() = user_id);
create policy "ads_snapshots_delete_own" on public.ads_snapshots
  for delete using (auth.uid() = user_id);

-- Realtime opcional pra refresh ao concluir fetch
alter publication supabase_realtime add table public.ads_snapshots;

-- Atualizar enum de scraper providers: tirar scrapfly/similarweb, adicionar scrapecreators
alter table public.user_scraper_keys
  drop constraint user_scraper_keys_provider_check;
alter table public.user_scraper_keys
  add constraint user_scraper_keys_provider_check
    check (provider in ('firecrawl', 'scrapecreators'));

-- Limpa chaves antigas (scrapfly/similarweb) se existirem
delete from public.user_scraper_keys
  where provider in ('scrapfly', 'similarweb');
```

## 2. Edge Function: `fetch-competitor-ads`

Padrão idêntico ao `crawl-competitor`. Spec:

**Trigger:**
- HTTP POST com `{ competitor_id }` + JWT do user (RLS valida ownership)
- OU `{ competitor_id, user_id }` + `Authorization: Bearer <service_role>` quando invocada por scheduler

**Lógica:**

1. Carregar competitor (id, user_id, facebook_page_id, google_advertiser_id)
2. Lookup chave ScrapeCreators via `get_scraper_key('scrapecreators')` no contexto do user
   - Se ausente → retorna 400 com `"Configure sua chave ScrapeCreators em /settings/integrations"`
3. Se `facebook_page_id` presente, chamar:
   ```
   GET https://api.scrapecreators.com/v1/facebook/adLibrary/company/ads?company_id={fb_page_id}
   Header: x-api-key: {scrapecreators_key}
   ```
4. Se `google_advertiser_id` presente, chamar:
   ```
   GET https://api.scrapecreators.com/v1/google/company/ads?advertiser_id={google_advertiser_id}
   Header: x-api-key: {scrapecreators_key}
   ```
5. Para cada ad retornado, fazer **UPSERT** em `ads_snapshots` com source apropriada
6. Atualizar `competitors.last_ads_fetched_at = now()`
7. Retornar `{ ok: true, meta_count, google_count }`

**Tratamento de erro PT-BR (igual padrão do crawl-competitor):**
- 401/403 → `"Chave ScrapeCreators inválida ou expirada"`
- 429 → `"Limite de requisições atingido — tente em alguns minutos"`
- 402 → `"Créditos ScrapeCreators esgotados"`
- timeout → `"Timeout ao buscar ads"`
- competitor sem `facebook_page_id` E sem `google_advertiser_id` → 400 `"Vincule a Facebook Page ou Google Advertiser deste concorrente em /competitors/[id] antes de buscar ads"`

**Server function wrapper opcional** (`src/server/ads.functions.ts`):
- `triggerFetchCompetitorAds({ competitor_id })` invocando a Edge Function via `supabase.functions.invoke`
- Mesma estrutura do `triggerCrawlCompetitor` que vocês já criaram

## 3. Edge Function `crawl-competitor`: remover ScrapFly e Similarweb

No arquivo `supabase/functions/crawl-competitor/index.ts`:

- **Remover** import + uso de `callScrapfly` (não há mais fallback)
- **Remover** import + uso de `callSimilarweb` (sem dados de tráfego no MVP)
- Se Firecrawl falhar, simplesmente lançar erro com mensagem PT-BR clara (ex: `"Firecrawl falhou: HTTP 403 — site bloqueando scraping"`). Sem tentar mais nada.
- Remover `traffic_data` do snapshot (continua existindo no schema, só não preenchemos mais)
- Remover lookup de chave `scrapfly` e `similarweb`

## 4. pg_cron: scheduler diário inclui ads

Atualizar (ou criar) job pg_cron diário:

```sql
-- 03:00 UTC: crawl-competitor (já existente)
-- 04:00 UTC: fetch-competitor-ads (novo)

select cron.schedule(
  'daily-ads-fetch',
  '0 4 * * *',
  $$
  select net.http_post(
    url := (select value from public.app_config where key = 'functions_base_url') || '/daily-ads-scheduler',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization', 'Bearer ' || (select value from public.app_config where key = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

E criar Edge Function leve `daily-ads-scheduler` que itera competitors com `facebook_page_id` ou `google_advertiser_id` setados e enfileira `fetch-competitor-ads` (concorrência 5/user).

## 5. Tipos TS regenerados

Após aplicar as migrations, regenere `src/integrations/supabase/types.ts` para o frontend pegar os novos campos.

## Ordem de execução

1. Migration `0012_ads_monitoring.sql`
2. Atualizar Edge Function `crawl-competitor` (remover ScrapFly + Similarweb)
3. Criar Edge Function `fetch-competitor-ads`
4. Criar Edge Function `daily-ads-scheduler` + agendar pg_cron
5. Regenerar tipos TS
6. Avisar quando concluir

## O que NÃO entra nesta entrega

- Tab "Anúncios" no frontend → eu (Claude Code) faço em paralelo
- Cadastro de Facebook Page / Google Advertiser ID na UI → eu faço em paralelo
- Card de anúncio com creative/copy/CTA → eu faço em paralelo
- Atualização do `/settings/integrations` removendo ScrapFly/Similarweb → eu faço

Quando você concluir, avise no chat. O frontend já vai estar pronto pra plumbar.

**Spec canônica:** `docs/architecture.md`. Este adendo amplia formalmente a §5 (Integrações) e §3.1 (Data Model).
