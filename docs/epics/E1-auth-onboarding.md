# Epic 1 — Auth + Onboarding

> **MVP:** ✅ Sim
> **Depende de:** —
> **Stories:** 3

## Objetivo

Permitir que um usuário crie uma conta, autentique e tenha seu profile inicializado, com **single-tenant por usuário** garantido por RLS desde o primeiro registro.

## Critérios de aceite (epic-level)

- [ ] Usuário consegue se cadastrar com e-mail + senha via Supabase Auth
- [ ] Usuário consegue fazer login e logout
- [ ] Após signup, registro em `profiles` é criado automaticamente (trigger ou server fn)
- [ ] Rotas em `_authed/` redirecionam para `/login` se não houver session
- [ ] RLS habilitado em `profiles` desde a primeira migration

## Stories propostos

### E1.1 — Setup Supabase Auth + migration inicial
- Aplicar migration `0001_init.sql` (extensions, profiles + RLS, função `handle_new_user`)
- Configurar provider e-mail/senha no Supabase
- Gerar tipos TypeScript (`bun supabase gen types`)

### E1.2 — Telas de signup e login
- Rotas `/signup` e `/login` com forms (React Hook Form + Zod)
- Mensagens de erro claras (e-mail inválido, senha fraca, credenciais erradas)
- Redirect pós-login para `/dashboard`

### E1.3 — Layout protegido `_authed/` + logout
- Layout `src/routes/_authed/__root.tsx` que valida session no server (`beforeLoad`)
- Header com botão de logout
- Página `/dashboard` placeholder (apenas "Olá, {nome}")

## Dependências técnicas

- Supabase project já provisionado (`xkdvfopvassssvkuxjnp`)
- `@supabase/supabase-js` já instalado
- shadcn/ui Form + Input + Button já disponíveis

## Out of scope

- OAuth (Google/GitHub) — fica para v2
- Recuperação de senha por e-mail — fica para v1.1 (mas Supabase já oferece, é só plugar UI)
- Onboarding wizard / tour — fica para v1.1
