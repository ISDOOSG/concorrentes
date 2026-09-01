# Provisionamento na VPS — banco e porta

**Feito em 2026-08-31**, adiantado sem esperar as decisões pendentes do
`05_Pendencias.md`. Este documento é só deste projeto — cada um dos três
(`lead-king`, `diagnostico-vibe`, `concorrentes`) tem o seu, separado.

---

## Banco

| | |
|---|---|
| Database | `concorrentes` |
| Role (login, sem `CREATEDB`) | `concorrentes` |
| Host | `127.0.0.1` (mesmo cluster Postgres da VPS) |
| Porta do Postgres | `5432` |
| Esquema aplicado | `docs/DB_SCHEMA.sql` — testado, roda sem erro (inclui o shim `auth.users`/`auth.uid()`) |
| Tabelas | 16 (as 15 do produto + `public.usuario`) |

Segue o mesmo padrão já usado na VPS para os outros projetos (`movizap`,
`hubuser`/`hubfotos`, `ia_movichat`/`ia_agente_movichat`): role de login sem
`CREATEDB`, dono de um único banco, sem acesso a nada além do seu.

## Credencial

| Arquivo | Conteúdo | Permissão |
|---|---|---|
| `.env.db` | `CONCORRENTES_DB_HOST`, `_PORTA`, `_NOME`, `_USUARIO`, `_SENHA` | `600` |
| `.pgpass` | linha `host:porta:banco:usuario:senha`, formato padrão do Postgres | `600` |

Nenhum dos dois está versionado nem foi impresso em lugar nenhum desta
conversa — a senha foi gerada dentro do script que criou o banco e só existe
nesses dois arquivos.

⚠️ `.env.db` só tem a conexão com o banco. **Não** tem porta de serviço,
`LLM_KEY_ENCRYPTION_SECRET` nem chave de terceiro — isso continua dependendo
das decisões B.1 a D.5 do `05_Pendencias.md`.

## Porta reservada para o serviço (ainda não escrito)

**8012** — nenhum processo a está usando ainda. Reservada só para evitar que
outro projeto futuro pegue o mesmo número.

## O que isto NÃO resolve

A correção de `get_llm_key`/`get_scraper_key` (item B.1, crítico — ver
`04_Acesso_e_Seguranca.md`), a reconstrução do `vite.config.ts` sem
`@lovable.dev/vite-tanstack-config` (item D.3), nginx, systemd, subdomínio e
o cofre de segredos continuam bloqueados. Isto aqui é só a fundação: o banco
existe e está pronto para receber o serviço assim que ele for escrito.
