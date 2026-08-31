# Epic 8 — pg_cron + Scheduled Daily Crawls

> **MVP:** —
> **Depende de:** E3, E4
> **Stories:** 1

## Objetivo

Automatizar o crawl diário de todos os competitors ativos via `pg_cron` no Supabase, fechando o loop "monitoramento contínuo" prometido no PRD.

## Critérios de aceite (epic-level)

- [ ] Extension `pg_cron` habilitada via migration
- [ ] Edge Function `daily-crawl-scheduler` enfileira crawl para todos `competitors` com `status='active'`
- [ ] Concorrência limitada a 5 crawls paralelos por usuário
- [ ] Cron job ativo às 03:00 UTC todos os dias
- [ ] Log de execução visível em tabela `cron_runs` (opcional, mas útil para debugging)

## Stories propostos

### E8.1 — pg_cron + scheduler + log
- Migration habilitando `pg_cron`
- Migration agendando job diário 03:00 UTC que invoca Edge Function via `pg_net.http_post`
- Edge Function `daily-crawl-scheduler` itera sobre competitors ativos respeitando concorrência
- Tabela opcional `cron_runs (id, started_at, finished_at, total_competitors, errors jsonb)` para troubleshooting

## Dependências técnicas

- E3 concluído (`crawl-competitor` real)
- Permissão para habilitar `pg_cron` no projeto Supabase
- `pg_net` extension habilitada (vem por padrão)

## Riscos

- **Burst de chamadas externas:** se 1000 users × 50 URLs = 50k crawls às 03:00, vai estourar Firecrawl. Mitigação: jitter aleatório ± 60min na hora do crawl por usuário (v1.1)
- **Falha silenciosa:** sem log de cron, bug pode passar dias despercebido. Logar é importante

## Out of scope

- Frequência configurável por usuário — v1.1
- Pause global via flag de admin — v2
- Retry policy automático — v1.1 (em v1, falha = só registra e segue)
