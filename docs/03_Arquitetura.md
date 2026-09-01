# Arquitetura — as 12 Edge Functions reais e o que cada uma vira na VPS

**MEDIDO** em 2026-08-31: 12 funções em `supabase/functions/`, mais 6 funções
de banco que fazem o papel de "invocador" via `pg_net` (`invoke_*`). A
`architecture.md` documenta só 7 — ver `01_O_Que_Esta_Ligado.md` para a
deriva completa.

⚠️ **Nem tudo abaixo foi lido linha a linha.** Li por inteiro
`bootstrap-app-config`, `invite-user` e `save-llm-key`; as demais foram
conferidas por varredura de padrão de autenticação (`SERVICE_ROLE`,
`getUser`/`Authorization`, menção a papel/admin). Onde a tabela diz "SIM" para
autenticação, é a varredura que diz — não é garantia de que a lógica de
autorização *dentro* de cada uma esteja correta, só que ela lê a sessão.

---

## Quadro geral

| Função | Auth (varredura) | O que faz (pelo nome/uso) | Destino na VPS |
|---|---|---|---|
| `bootstrap-app-config` | service_role OU one-shot | grava `service_role_key`/`functions_base_url` em `app_config` | 🔴 não migra como está — vira variável de `.env`, não linha de tabela |
| `crawl-competitor` | SIM | Firecrawl (+ fallback), screenshot, snapshot | rota de serviço, chama Firecrawl direto |
| `detect-changes` | SIM | compara snapshots, classifica mudança | idem |
| `generate-swot` | SIM | agrega snapshots/changes, chama LLM, grava relatório | idem — troca Lovable AI por provedor próprio quando `provider='lovable'` |
| `analyze-seo-competitor` | SIM | análise SEO via LLM | idem |
| `analyze-social-ig` | SIM | análise de Instagram via LLM | idem |
| `fetch-competitor-ads` | SIM | busca anúncios ativos (Meta/Google) via ScrapeCreators | idem |
| `fetch-competitor-social` | SIM | snapshot de perfil do Instagram | idem |
| `suggest-ads-links` | SIM | sugere página de anúncios do concorrente | idem |
| `daily-ads-scheduler` | SIM | dispara `fetch-competitor-ads` para todos ativos | vira cron da VPS |
| `invite-user` | SIM, **e checa `role='admin'`** | envia convite, grava em `invites` | rota admin — a trava já está certa, portar como está |
| `save-llm-key` | SIM (via client do próprio usuário) | grava chave BYOK cifrada | rota autenticada — padrão de menor privilégio, portar como está |
| `test-scraper-key` | SIM | valida chave de scraping antes de salvar | rota autenticada |

---

## As 6 funções `invoke_*` — o mecanismo que substitui o `pg_notify`

Diferente do `diagnostico-vibe` (que usa `pg_notify`, nunca escutado por
ninguém) e do `lead-king` (sem fila), este projeto **realmente invoca a Edge
Function via `pg_net.http_post`**, direto de dentro de um trigger ou de uma
função de banco:

```sql
select value into service_key from public.app_config where key = 'service_role_key';
perform net.http_post(
  url := fn_url || '/crawl-competitor',
  headers := jsonb_build_object('Authorization', 'Bearer ' || service_key),
  body := jsonb_build_object('competitor_id', new.id, 'user_id', new.user_id)
);
```

**Testado na VPS:** confirmei que essas funções **não vazam a
`service_role_key`** de volta ao chamador — ela só entra no header HTTP
interno, nunca no retorno.

| Função | Tipo | Dispara em | Chamável direto via RPC? |
|---|---|---|---|
| `invoke_crawl_competitor` | trigger | INSERT em `competitors` | não (função de trigger, exige contexto `NEW`) |
| `invoke_detect_changes` | trigger | INSERT em `snapshots` | não |
| `invoke_generate_alerts` | trigger | INSERT em `changes` | não |
| `invoke_suggest_ads_links` | trigger | INSERT em `snapshots` | não |
| `invoke_daily_crawl_scheduler` | `RETURNS void` | pg_cron (03h UTC) | 🔴 **sim** — tinha `EXECUTE` para `anon` |
| `invoke_daily_ads_scheduler` | `RETURNS void` | pg_cron | 🔴 **sim** — idem |

As duas últimas não vazam segredo, mas **disparam trabalho pago** (Firecrawl,
ScrapeCreators, LLM) para todos os usuários de uma vez, sem limite, se
chamadas por qualquer um com a chave pública. Na VPS, essas viram função
interna do cron, nunca rota HTTP exposta.

---

## O padrão `app_config` — não migra como tabela

`app_config` é chave-valor genérico (`key`, `value`), guardando
`functions_base_url` e `service_role_key`. Na arquitetura Supabase, isso
existe porque as funções de banco (`invoke_*`) precisam montar a URL e o
header HTTP para chamar de volta a Edge Function — um Postgres não tem
`.env` próprio, então guarda no banco mesmo, protegido por RLS sem policy
(deny total).

**Na VPS, esse problema não existe.** O serviço da aplicação **é** o mesmo
processo que teria a lógica de `invoke_*` — não precisa fazer HTTP de volta
para si mesmo. `app_config` como tabela pode sumir; `service_role_key`
nunca existiu como conceito fora do Supabase.

---

## Provedores externos — continuam externos, por natureza

| Serviço | Uso | Migra? |
|---|---|---|
| Firecrawl | scraping de landing page | não — é API paga, fica externa |
| ScrapeCreators | anúncios Meta/Google | não — idem |
| LLM (Lovable AI / Anthropic / OpenAI / Gemini) | classificação + SWOT | o **Lovable AI** não migra (é gateway da plataforma); BYOK dos outros três continua igual |

Igual aos outros dois projetos: tirando o que é API paga por natureza, o
resto é código a traduzir para o padrão de serviço da VPS.
