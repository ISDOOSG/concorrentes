# PO Validation Report — Epic 1

**Validator:** @po (Pax)
**Date:** 2026-04-26
**Stories validated:** E1.1, E1.2, E1.3

## Checklist (10 pontos por story)

| # | Critério | E1.1 | E1.2 | E1.3 |
|---|----------|------|------|------|
| 1 | User story tem formato As/I want/So that claro | ✅ | ✅ | ✅ |
| 2 | ACs são testáveis (não-ambíguos, mensuráveis) | ✅ | ✅ | ✅ |
| 3 | Escopo bem delimitado (não vaza pra outras stories) | ✅ | ✅ | ✅ |
| 4 | Tasks/subtasks cobrem todos os ACs | ✅ | ✅ | ✅ |
| 5 | Dependências explícitas | ✅ (—) | ✅ (E1.1) | ✅ (E1.2) |
| 6 | Dev notes suficientes (referências a paths, libs, decisions) | ✅ | ✅ | ✅ |
| 7 | Plano de testes manual minimamente definido | ✅ | ✅ | ✅ |
| 8 | File List previsto (mesmo que vazio inicialmente) | ✅ | ✅ | ✅ |
| 9 | Sem inventar features fora do PRD/Architecture | ✅ | ✅ | ✅ |
| 10 | Estimável (entrega em ≤ 1 sessão de dev) | ✅ | ✅ | ✅ |
| **Score** | | **10/10** | **10/10** | **10/10** |
| **Verdict** | | **GO** | **GO** | **GO** |

## Observações

### E1.1
- ✅ Migration auto-contida, RLS desde o dia 1.
- ⚠️ **Manual step** (habilitar provider no Dashboard) é aceitável em E1.1, mas Dev deve documentar exatamente onde clicar, com print, no PR.
- 💡 Considerar adicionar policy `for select` em `auth.users` se algum lugar precisar listar (não precisa em E1, ok).

### E1.2
- ✅ Forms com Zod cobrem casos comuns.
- ⚠️ AC "submit duplo bloqueado" é importante em produção — confirmar que isso será testado.
- 💡 Mensagem de erro genérica "E-mail ou senha incorretos" em login é boa prática (não vaza enumeração).

### E1.3
- ✅ Pattern de `beforeLoad` é canônico para TanStack Router.
- ⚠️ Atenção crítica: server-side session em Cloudflare Workers + TanStack Start tem nuances de cookie handling. Dev pode precisar criar `src/integrations/supabase/server.ts` com cliente que reads/writes cookies via `request`/`response` do server context. Não é trivial — alocar tempo extra.
- 💡 `queryClient.clear()` no logout é essencial — bem capturado.

## Decisão final

**Todas as 3 stories de E1 estão GO. Pode iniciar implementação na ordem E1.1 → E1.2 → E1.3.**

— Pax, garantindo que o backlog está executável 🎯
