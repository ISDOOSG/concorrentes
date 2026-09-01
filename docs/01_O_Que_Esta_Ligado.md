# O que está ligado hoje — e a deriva entre documento e código

**MEDIDO** em 2026-08-31, comparando `docs/prd.md`, `docs/architecture.md` e
o repositório real.

---

## A contradição central: modelo de tenancy

**O PRD (seção 8, v1.0, aprovado 2026-04-26) diz:**

> *"Single-tenant por usuário... Sem workspaces, teams, organizações ou
> compartilhamento entre contas. Não há roles, convites ou hierarquia de
> permissões — o owner da conta é o único acessor."*

**O código implementado faz o oposto:**

- Existe `profiles.role` com `CHECK (role IN ('admin','member'))`
- Existe a tabela `invites`, com `email`, `invited_by`, `accepted_at`
- Existe a Edge Function `invite-user`, que **verifica `profiles.role =
  'admin'`** antes de convidar
- Existe o trigger `enforce_invite_only` em `auth.users`, que bloqueia
  cadastro direto quando já há usuário no banco
- O `README.md` documenta esse fluxo de admin/convite como o comportamento
  oficial do produto

Ou seja: o modelo de acesso real é **multi-usuário com hierarquia**, e o
documento que deveria governar a decisão diz o contrário. Isso não é erro
de leitura — é deriva de três gerações de remix sem atualizar o PRD.

---

## A contradição secundária: quantas Edge Functions existem

**`architecture.md`, seção 4, documenta 7:**

```
crawl-competitor · detect-changes · generate-alerts · generate-swot ·
daily-crawl-scheduler · save-llm-key · delete-llm-key
```

**O repositório tem 12:**

```
analyze-seo-competitor · analyze-social-ig · bootstrap-app-config ·
crawl-competitor · daily-ads-scheduler · detect-changes ·
fetch-competitor-ads · fetch-competitor-social · generate-swot ·
invite-user · save-llm-key · suggest-ads-links · test-scraper-key
```

Só 4 se sobrepõem (`crawl-competitor`, `detect-changes`, `generate-swot`,
`save-llm-key`). `generate-alerts` e `delete-llm-key` da lista antiga não
existem mais — provavelmente absorvidas por triggers (`invoke_generate_alerts`)
ou por outra função. As 9 novas cobrem um recurso inteiro que a arquitetura
nunca documentou: **monitoramento de anúncios** (Meta/Google Ads via
ScrapeCreators) e **análise de Instagram** — confirmado pelos 4 prompts em
`docs/lovable-*-prompt.md` que existem só para essas features.

---

## O que está ligado de fato — por tabela

| Tabela | Tem função/trigger que a usa? | Nota |
|---|---|---|
| `competitors`, `snapshots`, `changes`, `alerts`, `swot_reports` | ✅ sim | fluxo original, documentado |
| `profiles`, `invites` | ✅ sim | fluxo de admin/convite, não documentado no PRD |
| `app_config` | ✅ sim | guarda `service_role_key`/`functions_base_url` para os `invoke_*` chamarem Edge Functions via `pg_net` |
| `seo_analyses` | ✅ sim | `analyze-seo-competitor` |
| `social_analyses`, `social_snapshots` | ✅ sim | `analyze-social-ig`, `fetch-competitor-social` |
| `ads_snapshots` | ✅ sim | `fetch-competitor-ads`, `daily-ads-scheduler` |
| `user_llm_settings`, `user_llm_keys` | ✅ sim | BYOK de LLM |
| `user_scraper_keys` | ✅ sim | BYOK de scraping (Firecrawl/ScrapeCreators) |

**Nenhuma tabela é mobília** no sentido do `diagnostico-vibe` — todas têm
código que as usa. O problema aqui não é recurso não construído; é
**documentação que não foi atualizada junto com o código**, e **duas
funções com controle de acesso que não bate com o resto do desenho**.

---

## Estado medido: banco vazio

Confirmado na extração SQL de 31/08 — **as 15 tabelas com 0 linhas**.
Ninguém usou o produto de verdade ainda, nem cadastrou chave BYOK. É a
janela para corrigir antes que exista dado real em risco.
