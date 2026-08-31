# Epic 4 — Detecção de Mudanças & Alertas

> **MVP:** — (pós-MVP, mas crítico para valor do produto)
> **Depende de:** E3
> **Stories:** 3

## Objetivo

Quando um novo snapshot entra, comparar com o anterior, classificar mudanças via LLM (modelo de classificação rápido), gerar alertas in-app quando severity != info.

## Critérios de aceite (epic-level)

- [ ] Migrations `0004_changes.sql` e `0005_alerts.sql` aplicadas
- [ ] Edge Function `detect-changes` disparada por DB trigger após `snapshots` insert
- [ ] LLM classifica mudanças em: `price` | `copy` | `feature` | `design` | `traffic`
- [ ] Severity: `info` (mudanças triviais), `warning` (copy/feature), `critical` (preço, traffic >30%)
- [ ] Edge Function `generate-alerts` cria alerta se severity != info
- [ ] Página `/alerts` lista alertas com badge de não-lidos no header

## Stories propostos

### E4.1 — Migrations + trigger
- DDL `changes` + `alerts` + RLS
- DB trigger `after insert on snapshots` invoca `detect-changes` via `pg_net` (HTTP)

### E4.2 — Edge Function `detect-changes`
- Busca snapshot anterior do mesmo competitor
- Calcula diff de `structured_data` (price, headlines, CTAs)
- Calcula delta de tráfego (`traffic_data`)
- Para texto, gera embedding ou diff textual e envia para LLM (Lovable AI default) classificar tipo + severity
- Insere linhas em `changes`

### E4.3 — Edge Function `generate-alerts` + UI `/alerts`
- Trigger em changes (severity != info) cria alert
- Rota `/alerts` lista alertas (lidos/não-lidos), com filtro por competitor e por severity
- Header global mostra badge "N novos alertas"
- Marcar como lido via `read_at`

## Dependências técnicas

- E3 concluído (snapshots existem e têm structured_data)
- LLM provider router pronto (E6.1 em paralelo, ou usa Lovable AI direto se E6 ainda não rodou)

## Riscos

- **LLM classificando errado:** taxa de erro alta inflará alertas inúteis. Mitigação: começar conservador (severity default = info), treinar prompts iterativamente
- **Loop infinito de triggers:** garantir que `changes` insert NÃO dispara nova invocação de `detect-changes`

## Out of scope

- Notificações por e-mail / Slack / webhook — v1.1
- Resumo diário de alertas — v1.1
- Snooze / mute por competitor — v1.1
