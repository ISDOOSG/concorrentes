# Prompt para Lovable — Backend Análise de Concorrentes

> Cole o conteúdo abaixo no Lovable para que ele gere todo o backend de uma vez.
> Toda a especificação técnica detalhada está em `docs/architecture.md` no repo.

---

Olá Lovable. O frontend (rotas, design system, componentes, dashboard, login, telas de competitor/alertas/SWOT/compare/onboard/settings) já está implementado e commitado em `main`. Os componentes consomem dados via `src/lib/data/` (provider pattern). Hoje o provider ativo é `mock` (localStorage) — quero substituir por `supabase` real implementando o backend completo.

A especificação canônica está em `docs/architecture.md`. Por favor:

## 1. Aplicar TODAS as migrations (em ordem)

**Migration `0001_init.sql` — Auth + Profiles**
- Habilitar extension `pgcrypto`
- Tabela `public.profiles` (id uuid PK ref auth.users, full_name, plan default 'free', url_quota int default 5, created_at)
- RLS habilitado, 4 policies padrão (`auth.uid() = id` em select/insert/update/delete)
- Função `handle_new_user()` SECURITY DEFINER que insere profile no signup
- Trigger `on_auth_user_created after insert on auth.users`

**Migration `0002_competitors.sql`**
- Tabela `public.competitors` (id, user_id ref auth.users, name, url, status default 'active', last_crawled_at, created_at, unique(user_id, url))
- RLS + 4 policies padrão por `auth.uid() = user_id`

**Migration `0003_snapshots.sql` + Storage**
- Tabela `public.snapshots` (id, user_id, competitor_id ref ON DELETE CASCADE, crawled_at, content_hash, raw_text, structured_data jsonb, traffic_data jsonb, screenshot_path, source ('firecrawl'|'scrapfly'), cost_cents)
- Index em `(competitor_id, crawled_at desc)`
- RLS + 4 policies padrão
- Storage bucket privado `screenshots` com policies por path `{user_id}/...`

**Migration `0004_changes.sql` + Trigger**
- Tabela `public.changes` (id, user_id, competitor_id, from_snapshot_id, to_snapshot_id, detected_at, change_type, severity, summary, diff jsonb, alerted bool default false)
- Index em `(user_id, detected_at desc)`
- RLS + policies
- Trigger `after insert on snapshots` que invoca Edge Function `detect-changes` via `pg_net.http_post`

**Migration `0005_alerts.sql` + Trigger**
- Tabela `public.alerts` (id, user_id, change_id, channel default 'in_app', read_at, created_at)
- RLS + policies
- Trigger `after insert on changes` quando `severity != 'info'` invoca Edge Function `generate-alerts`

**Migration `0006_user_llm_settings.sql`**
- Tabela `public.user_llm_settings` (user_id PK, provider check in lovable/anthropic/openai/gemini default 'lovable', model_classification, model_swot, updated_at)
- RLS + policies

**Migration `0007_user_llm_keys.sql` + Cripto**
- Tabela `public.user_llm_keys` (user_id, provider, encrypted_key bytea, key_hint text, created_at, PRIMARY KEY (user_id, provider))
- RLS + policies (encrypted_key NUNCA retorna ao client — só edge functions descriptografam)
- Funções SECURITY DEFINER `encrypt_llm_key(plain text)` e `decrypt_llm_key(enc bytea)` usando pgcrypto AES-256-GCM com master key vinda de secret `LLM_KEY_ENCRYPTION_SECRET`

**Migration `0008_swot_reports.sql`**
- Tabela `public.swot_reports` (id, user_id, competitor_id, generated_at, strengths/weaknesses/opportunities/threats jsonb, llm_model, cost_cents)
- RLS + policies

**Migration `0009_pg_cron.sql`**
- Habilitar `pg_cron`
- Cron diário às 03:00 UTC que invoca `daily-crawl-scheduler` Edge Function via `pg_net.http_post`

## 2. Edge Functions a deployar

Todas com runtime Deno padrão Supabase. Use o helper `_shared/llm-provider.ts` (provider router que respeita Lovable AI default + BYOK).

1. **`crawl-competitor`** — recebe `competitor_id`, chama Firecrawl (timeout 30s), fallback ScrapFly em erro, captura screenshot via Firecrawl, sobe para Storage, busca tráfego Similarweb (cache 30 dias por domínio), insere snapshot
2. **`detect-changes`** — disparada por trigger; busca snapshot anterior, calcula diff de structured_data + traffic, classifica via LLM (modelo "classification": Haiku/GPT-4o-mini/Gemini Flash/Lovable equivalent), insere em `changes`
3. **`generate-alerts`** — disparada por trigger; cria `alerts` para changes com severity != info
4. **`generate-swot`** — HTTP POST com `competitor_id`; agrega últimos 30d de snapshots+changes, prompt LLM ("swot": Sonnet/GPT-4o/Gemini Pro), grava em `swot_reports`
5. **`save-llm-key`** — recebe `{ provider, key }`, valida com test call no provider, criptografa via `encrypt_llm_key`, grava em `user_llm_keys`
6. **`delete-llm-key`** — remove chave do user para provider
7. **`daily-crawl-scheduler`** — itera competitors com `status='active'`, enfileira `crawl-competitor` com concorrência limitada a 5/usuário

## 3. Secrets necessários (configurar no Lovable Cloud)

- `LOVABLE_API_KEY` (já provisionado pelo Lovable Cloud)
- `LLM_KEY_ENCRYPTION_SECRET` (gerar 256-bit hex 1x)
- `FIRECRAWL_API_KEY`
- `SCRAPFLY_API_KEY`
- `SIMILARWEB_API_KEY`

## 4. Ordem de execução sugerida

1. Aplicar migrations 0001 a 0009 em sequência (`supabase db push`)
2. Configurar secrets
3. Deploy edge functions na ordem: `crawl-competitor` → `detect-changes` → `generate-alerts` → `generate-swot` → `save-llm-key` → `delete-llm-key` → `daily-crawl-scheduler`
4. Validar que pg_cron está agendado

## 5. Após o backend estar pronto

Avise para que eu (Claude Code) possa:
- Regenerar `src/integrations/supabase/types.ts` (`supabase gen types`)
- Implementar `src/lib/data/providers/supabase.ts` (substituindo os stubs)
- Trocar `VITE_DATA_PROVIDER=supabase` no `.env`
- Testar fluxo end-to-end (signup → cadastrar URL → crawl real → ver snapshot real)

**Referência canônica:** `docs/architecture.md` no repo (todas as policies SQL exatas, tipos de schema, prompts LLM, integrações externas).
