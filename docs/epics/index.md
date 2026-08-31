# Epics — Análise de Concorrentes v1

> Derivados de [PRD v1.0](../prd.md) e [Architecture v1.0](../architecture.md)

| ID | Título | Stories | MVP? | Depende de |
|----|--------|---------|------|------------|
| [E1](./E1-auth-onboarding.md) | Auth + Onboarding | 3 | ✅ | — |
| [E2](./E2-cadastro-competidores.md) | Cadastro de Competidores | 3 | ✅ | E1 |
| [E3](./E3-crawl-snapshot-engine.md) | Crawl & Snapshot Engine | 4 | ✅ | E2 |
| [E4](./E4-deteccao-mudancas-alertas.md) | Detecção de Mudanças & Alertas | 3 | — | E3 |
| [E5](./E5-dashboard-comparativo.md) | Dashboard Comparativo | 3 | — | E3 |
| [E6](./E6-swot-llm-config.md) | SWOT por IA + Configuração de LLM Provider | 3 | — | E3 |
| [E7](./E7-historico-screenshots.md) | Histórico de Screenshots | 1 | — | E3 |
| [E8](./E8-scheduled-crawls.md) | pg_cron + Scheduled Daily Crawls | 1 | — | E3, E4 |

**Total:** 21 stories. **MVP:** E1 + E2 + E3 = 10 stories.

## Sequência de execução recomendada

```
E1 (auth) → E2 (CRUD competitors) → E3 (crawl engine)
              ↓
   ┌──────────┼──────────┬──────────┐
   ▼          ▼          ▼          ▼
   E4        E5         E6         E7
(alerts)  (dashboard) (swot)  (screenshots)
              ↓
              E8 (cron)
```
