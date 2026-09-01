# API própria — a base que substitui a Supabase

**Escrita e no ar em 2026-09-01.** Roda em `127.0.0.1:8012`, unidade systemd
de usuário `concorrentes.service`, habilitada (sobe sozinha no reboot).

| | |
|---|---|
| Código | `api/` (`main.py`, `db.py`, `auth.py`) |
| Ambiente | `api/venv` — FastAPI 0.115, uvicorn 0.34, psycopg2, PyJWT, bcrypt |
| Segredos | `api/.env`, modo 600 — JWT secret e chave de cifra, gerados na VPS, nunca impressos |
| Banco | `concorrentes` local, via `.env.db` (o mesmo de antes) |
| Serviço | `systemctl --user status concorrentes` |

## A decisão que estrutura tudo

**A autorização não fica no banco.** Toda consulta que toca dado de cliente
carrega `where user_id = %s` explícito, vindo do JWT.

Por quê: no schema portado para a VPS, `auth.uid()` é um stub que devolve
`NULL` — as policies de RLS da Supabase não vieram junto. E as funções
`get_llm_key` / `get_scraper_key` foram preservadas verbatim **com** a falha
de dono que a auditoria de 31/08 achou (aceitam qualquer `_user_id`). Este
serviço **não chama nenhuma das duas**. É o que o `04_Acesso_e_Seguranca.md`,
seção 8, já recomendava: *"não é corrigir, é desenhar sem a superfície"*.

**MEDIDO em 01/09:** com dois usuários criados, o segundo vê `0` concorrentes
do primeiro, e o acesso direto ao `id` alheio devolve `404`.

## O que está pronto

Identidade (`/auth/signup`, `/auth/login`, `/auth/me`) — bcrypt + JWT HS256,
24h. O primeiro usuário cadastrado vira `admin` em `profiles`.

CRUD e leitura, tudo que depende só do Postgres local:
`competitors` (listar, ver, criar, alternar status, apagar, vincular ads) ·
`alerts` (listar com join em `changes`, marcar lido) · `swot` (ler o último) ·
`snapshots` (último e lista) · `ads` (listar, ler sugestão) ·
`llm/settings` (provider, modelo, chaves) · `scraper-keys` (BYOK).

**As chaves BYOK são cifradas de verdade**, com `pgp_sym_encrypt` do pgcrypto
e chave do `.env` — a coluna `encrypted_key` é `bytea`. MEDIDO: 92 bytes
começando em `c30d0407` (cabeçalho de pacote PGP), nada legível. A API nunca
devolve a chave, só o `key_hint` (4 últimos caracteres).

## O que responde 501, e por quê

`POST /competitors/{id}/crawl` (Firecrawl) ·
`POST /competitors/{id}/swot` (LLM) ·
`POST /competitors/{id}/ads/fetch` (ScrapeCreators) ·
`POST /competitors/{id}/ads-suggestion` (ScrapeCreators + LLM) ·
`POST /scraper-keys/{provider}/test` (Firecrawl / ScrapeCreators)

Falham alto, com mensagem dizendo de qual serviço dependem — em vez de
devolver vazio e parecer que funcionaram. Essas cinco são a **segunda camada**
do desacoplamento: dependem de API de terceiro, que nunca sai (é a função do
produto), mas precisam ser portadas das edge functions.

## 🔴 O que bloqueia o front hoje

**O app exige Node ≥ 22.12. A VPS tem Node 18.19.1.** Não é preferência, é
`engines` declarado: `@tanstack/react-start@1.167` pede `>=22.12.0` e
`vite@7.3.1` pede `^20.19 || >=22.12`. Nesse Node ele não compila nem roda,
com ou sem Supabase.

Não é um SPA estático: é **TanStack Start** (SSR), com `src/start.ts`,
`src/server-fns/` (4 arquivos) e rotas `_authed`. O alvo de build declarado
é **Cloudflare** (`@cloudflare/vite-plugin`), então rodar na VPS também exige
trocar o adaptador para Node.

## O caminho até o front falar com esta API

O projeto **já tem a costura pronta**: `src/lib/data/index.ts` expõe o
`DataProvider` por um `Proxy` que hoje alterna entre `providers/mock.ts` e
`providers/supabase.ts`, com override de build por `VITE_DATA_PROVIDER`.

Falta escrever `providers/api.ts` — mesma interface de 26 métodos, apontando
para `https://concorrentes.imagohub.com.br/api`. Os 10 hooks em
`lib/data/hooks/` e todos os componentes ficam intactos.

Ordem sugerida: (1) Node 22 na VPS, (2) `providers/api.ts`, (3) trocar as 8
chamadas de `supabase.auth.*` pela nossa `/auth/*`, (4) nginx + certificado,
(5) as cinco operações de terceiro.
