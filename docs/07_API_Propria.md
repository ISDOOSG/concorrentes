# API própria — a base que substitui a Supabase

**Escrita e no ar em 2026-09-01.** Roda em `127.0.0.1:8012`, unidade systemd
de usuário `concorrentes.service`, habilitada (sobe sozinha no reboot).

| | |
|---|---|
| Código | `api/` (`main.py`, `db.py`, `auth.py`, `ia.py`) |
| Ambiente | `api/venv` — FastAPI 0.115, uvicorn 0.34, psycopg2, PyJWT, bcrypt |
| Segredos | `api/.env`, modo 600 — JWT secret, chave de cifra e chave do Gemini, nunca impressos |
| Banco | `concorrentes` local, via `.env.db` (o mesmo de antes) |
| Serviço | `systemctl --user status concorrentes` |

## A decisão que estrutura tudo

**A autorização não fica no banco.** Toda consulta que toca dado de cliente
carrega `where user_id = %s` explícito, vindo do JWT.

Por quê: no schema portado para a VPS, `auth.uid()` é um stub que devolve
`NULL` — as policies de RLS da Supabase não vieram junto. E as funções
`get_llm_key` / `get_scraper_key` foram preservadas verbatim **com** a falha
de dono que a auditoria de 31/08 achou (aceitam qualquer `_user_id`). Este
serviço **não chama nenhuma das duas** — nem mesmo `ia.py`, que decifra a
chave BYOK por `SELECT` direto com o `user_id` do token. É o que o
`04_Acesso_e_Seguranca.md`, seção 8, já recomendava: *"não é corrigir, é
desenhar sem a superfície"*.

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

## IA própria — `ia.py`, escrito em 2026-09-02

Substitui o gateway `ai.gateway.lovable.dev`, que autenticava com chave da
Lovable e morre junto com o laboratório. Fala direto com
`generativelanguage.googleapis.com`, com a chave do dono do projeto em
`CONCORRENTES_GEMINI_CHAVE`. Sem dependência nova: `urllib` da biblioteca
padrão — o venv não tem httpx nem requests, e um POST com JSON não justifica
instalar um.

**Ordem de resolução da chave**, em `ia.resolver()`: chave BYOK do usuário
para o provedor escolhido → chave do serviço. Quem tiver `provider = 'lovable'`
gravado (o padrão do laboratório) cai no Gemini do projeto em vez de falhar.

### 🚨 Os modelos das edge functions estão mortos

**MEDIDO em 02/09**, contra a chave nova — não presumido:

| Modelo | Resposta |
|---|---|
| `gemini-2.5-flash`, `-flash-lite`, `-pro` | *"no longer available to new users"* — eram o que as edge functions pediam, e só funcionavam pelo acesso legado do gateway |
| `gemini-pro-latest` | *"exceeded your current quota"* — **no tier gratuito, Pro não é opção** |
| `gemini-3.6-flash`, `-3.7-flash`, `gemini-flash-latest` | *"high demand"* — o gratuito não alcança o flash mais novo |
| **`gemini-3.5-flash`** | ✅ responde — é o `MODELO_ANALISE` |
| **`gemini-flash-lite-latest`** / `gemini-3.1-flash-lite` | ✅ responde — é o `MODELO_LEVE` |

O gratuito é instável no flash de topo: **o mesmo modelo respondeu numa
chamada e recusou na seguinte**. Por isso `_com_queda()` tenta o modelo
escolhido e, só quando ele vem congestionado, repete no leve. **A queda não é
silenciosa:** o nome do modelo que rodou de fato é o que vai para a coluna
`llm_model` do relatório.

⚠️ No tier gratuito o Google usa o conteúdo enviado para melhorar os produtos
deles. Como o prompt carrega dado de concorrente de cliente, migrar para o
pago é decisão do dono — e é só habilitar cobrança no mesmo projeto, sem
tocar em código.

## `POST /competitors/{id}/swot` — porta da edge function `generate-swot`

Monta o contexto com o que o banco tem (último snapshot, até 10 anúncios,
último perfil de Instagram), usa o mesmo prompt de sistema da edge function
original, e normaliza a resposta antes de gravar: no máximo 4 itens por
quadrante, `title` até 120 caracteres, `evidence` até 600.

**Sem dado coletado, responde `409`** em vez de gerar análise. Com só nome e
URL o modelo inventaria — e pareceria análise de verdade.

**PROVADO em 02/09, ponta a ponta**, com a Pastelaria Velasco: concorrente e
snapshot criados, `POST` devolveu `201` com 12 itens citando preço, horário e
canal de venda do texto do site; `GET` releu o relatório gravado; o dado de
teste foi apagado e o banco voltou a `0` linhas em `competitors`,
`snapshots` e `swot_reports`.

## O que ainda responde 501, e por quê

`POST /competitors/{id}/crawl` (Firecrawl) ·
`POST /competitors/{id}/ads/fetch` (ScrapeCreators) ·
`POST /competitors/{id}/ads-suggestion` (ScrapeCreators + LLM) ·
`POST /scraper-keys/{provider}/test` (Firecrawl / ScrapeCreators)

Falham alto, com mensagem dizendo de qual serviço dependem — em vez de
devolver vazio e parecer que funcionaram. **As quatro dependem de chave que o
dono ainda não forneceu**, não de código por escrever: a parte de IA já existe
em `ia.py`.

## O que já foi feito e saiu desta lista

- **Node 22** instalado na VPS (`~/.local/node22`) — o app exige `>= 22.12`.
- **`providers/api.ts`** escrito, com os 26 métodos; `src/lib/data/index.ts`
  hoje alterna entre `mock` e `api`. O `providers/supabase.ts` continua no
  disco mas **ninguém o importa** — é código morto, sai na faxina.
- **nginx + certificado** em `concorrentes.imagohub.com.br`, com `/api/`
  para a 8012 e `/` para o SSR na 8013.
- **SWOT**, acima.

## O que falta para o produto rodar 100% aqui

1. Rotas de **SEO** e **Social** na API — hoje não existe nenhuma, e as duas
   telas ainda leem direto do Postgres do Supabase, que não resolve mais.
2. Trocar `requireSupabaseAuth` (em `src/start.ts` e nos `server-fns/`) pelo
   token local.
3. Portar os **coletores** — `crawl-competitor`, `fetch-competitor-social`,
   `fetch-competitor-ads` — e refazer em serviço a cadeia que os 4 gatilhos do
   banco faziam por `pg_net`, extensão que **não existe** no banco novo.
4. Faxina: apagar `supabase/`, `src/integrations/supabase/`,
   `providers/supabase.ts`, `@supabase/supabase-js`, as `VITE_SUPABASE_*`, e
   trocar o `vite.config.ts` pelo próprio (hoje é `@lovable.dev/vite-tanstack-config`).
5. Revogar `EXECUTE` de PUBLIC em `get_llm_key` / `get_scraper_key`.
6. Backup do banco e cópia da `CONCORRENTES_CRIPTO_CHAVE` fora da VPS — hoje
   é cópia única, e sem ela as chaves BYOK viram texto cifrado indecifrável.
