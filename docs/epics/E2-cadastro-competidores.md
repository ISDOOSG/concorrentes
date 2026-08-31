# Epic 2 — Cadastro de Competidores

> **MVP:** ✅ Sim
> **Depende de:** E1
> **Stories:** 3

## Objetivo

Permitir que o usuário gerencie a lista de competidores monitorados (CRUD completo) e dispare crawl manual para ter o primeiro snapshot.

## Critérios de aceite (epic-level)

- [ ] Migration `0002_competitors.sql` com tabela + RLS aplicada
- [ ] Usuário cadastra competidor com nome + URL (validação Zod de URL válida)
- [ ] Lista de competidores em `/competitors` com status, last_crawled_at e ações (pausar, deletar)
- [ ] Página de detalhe `/competitors/:id` com placeholder para snapshots/changes
- [ ] Botão "Crawlear agora" dispara Edge Function (mesmo que ainda fake em E2 — implementação real em E3)

## Stories propostos

### E2.1 — Migration `competitors` + tipos
- DDL conforme architecture.md §3.1
- RLS policies padrão
- Regenerar tipos TS

### E2.2 — CRUD completo na UI
- Rota `/competitors/index.tsx` com lista (TanStack Query) + dialog de criação
- Rota `/competitors/$id.tsx` com header (nome + URL + status) e tabs vazias para "Snapshots", "Mudanças", "Screenshots", "SWOT"
- Pause/resume e delete com confirmação

### E2.3 — Botão "Crawlear agora" (stub)
- Server fn que invoca Edge Function `crawl-competitor` (em E3 ela passa a fazer trabalho real)
- Em E2, função apenas insere snapshot fake e atualiza `last_crawled_at`
- UI mostra toast "Crawl iniciado" + invalidate query

## Dependências técnicas

- E1 concluído (auth + RLS pattern estabelecido)
- shadcn/ui Dialog, Table, Tabs, Toast (sonner)

## Out of scope

- Bulk import (CSV de competidores) — v1.1
- Tags/categorias de competidores — v1.1
- Limite de quota visual (mostrar "X/50 URLs") — pode entrar em E5 (dashboard)
