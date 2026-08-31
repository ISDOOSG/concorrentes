# Epic 5 — Dashboard Comparativo

> **MVP:** —
> **Depende de:** E3
> **Stories:** 3

## Objetivo

Tela principal `/dashboard` com visão lado-a-lado de métricas de tráfego, SEO e presença digital de todos os competidores monitorados — uma resposta direta ao requisito "Dashboard de Comparação".

## Critérios de aceite (epic-level)

- [ ] `/dashboard` lista todos os competidores em cards com KPIs principais
- [ ] Tabela comparativa com coluna por métrica (visitas/mês, bounce rate, top pages, last change)
- [ ] Gráficos de tendência (recharts) — tráfego últimos 30 dias por competidor
- [ ] Quota visual: "X / Y URLs usadas" baseado em `profiles.url_quota`
- [ ] Estado vazio elegante quando usuário ainda não tem competitors

## Stories propostos

### E5.1 — Dashboard overview cards
- Cards por competitor com: nome, URL, last_crawled_at, # changes 7d, # alerts não-lidos
- Click → leva para `/competitors/$id`
- Empty state com CTA "Adicionar primeiro competidor"

### E5.2 — Tabela comparativa multi-competidor
- Tabela densa com row por competitor e cols (visits, bounce, pages/visit, primeira mudança recente)
- Sort por coluna
- Export CSV (server fn)

### E5.3 — Gráficos de tendência
- Recharts: line chart de tráfego dos últimos 30 dias, multi-line (1 linha por competitor)
- Toggle para escolher qual métrica plotar
- Indicador de quota no header do dashboard

## Dependências técnicas

- E3 concluído (snapshots populados com `traffic_data`)
- recharts já no `package.json`

## Out of scope

- Customização de dashboard (drag-drop widgets) — v2
- Compartilhamento de dashboard via link público — v2
