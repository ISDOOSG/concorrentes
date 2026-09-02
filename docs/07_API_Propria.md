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
do primeiro, e o acesso direto ao `id` alheio devolve `404`. **Reconfirmado em
02/09** nas rotas novas: `GET /competitors/{id}/seo` com token de outro
usuário devolve `null`.

## O que está pronto

Identidade (`/auth/signup`, `/auth/login`, `/auth/me`) — bcrypt + JWT HS256,
24h. O primeiro usuário cadastrado vira `admin` em `profiles`.

CRUD e leitura, tudo que depende só do Postgres local:
`competitors` · `alerts` · `swot` · `snapshots` · `ads` · `llm/settings` ·
`scraper-keys` · **`seo`** · **`social`** · **`instagram-handle`**.

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

O tool-calling que as edge functions usavam para garantir a forma da resposta
virou **`responseSchema`** do Gemini: o Google valida a estrutura antes de
devolver, em vez de o erro só aparecer no parse.

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
`model` / `llm_model` do relatório — nas provas de 02/09 as duas coisas
aconteceram, e o registro mostra qual foi qual.

⚠️ No tier gratuito o Google usa o conteúdo enviado para melhorar os produtos
deles. Como o prompt carrega dado de concorrente de cliente, migrar para o
pago é decisão do dono — e é só habilitar cobrança no mesmo projeto, sem
tocar em código.

## As três operações de IA portadas

| Rota | Vem de | Regra própria |
|---|---|---|
| `POST /competitors/{id}/swot` | `generate-swot` | contexto = último snapshot + até 10 anúncios + último Instagram; 4 itens por quadrante, `title` 120, `evidence` 600 |
| `POST /competitors/{id}/seo` | `analyze-seo-competitor` | nota travada em 0–100, `intent` só aceita os 4 valores do enum, **uma análise por concorrente** (update, não insert — o front lê com `maybeSingle`, que estoura com duas linhas) |
| `POST /competitors/{id}/social/analyze` | `analyze-social-ig` | posts compactados antes do prompt; histórico preservado (uma linha por análise) |

**As três respondem `409` quando não há dado coletado**, em vez de gerar
análise. Com só nome e URL o modelo inventaria — e pareceria análise de
verdade.

**PROVADO em 02/09, ponta a ponta e pelo domínio público**, com a Pastelaria
Velasco: 409 antes do dado, `201` depois, `GET` relendo o gravado, o segundo
`POST` de SEO atualizando a mesma linha em vez de criar outra, o handle do
Instagram limpo no servidor (`  @PastelariaVelasco/  ` → `pastelariavelasco`),
e isolamento entre usuários. Dado de teste apagado no fim.

## O front não fala mais com a Supabase

Em 02/09 saíram as duas últimas amarras:

- `src/lib/data/hooks/use-seo-analysis.ts` e `src/lib/social/api.ts` agora
  usam `apiFetch`. Os adaptadores de linha→domínio não mudaram: a API devolve
  as mesmas colunas que o `supabase-js` devolvia.
- Os adaptadores que viviam em `providers/supabase.ts` foram extraídos para
  **`providers/adapters.ts`**. Era por causa deles que o `supabase-js`
  continuava no grafo de imports: `providers/api.ts` importava de lá.
- `server-fns/` foi esvaziado (`seo`, `crawl`, `ads`, `integrations`) e o
  `start.ts` perdeu o `attachSupabaseAuth` — sem server function, não há
  middleware global a registrar.
- `src/integrations/supabase/`, o `providers/supabase.ts` e a dependência
  `@supabase/supabase-js` foram apagados; as `VITE_SUPABASE_*` saíram do `.env`.

**MEDIDO no build publicado:** `grep -rl supabase .output/` não devolve
**nenhum arquivo**, e o bundle do cliente cita `/seo`, `social/snapshots`,
`social/analysis`, `social/analyze` e `instagram-handle`.

## 🚨 Duas armadilhas medidas em 02/09

**1. `npm run build` derruba o site.** O preset padrão do Nitro neste projeto
é `cloudflare-module`: o `.output/server/index.mjs` sai exportando um handler
de Worker, não subindo servidor. O serviço inicia, sai com código 0 em ~360 ms
e o nginx passa a bater em porta vazia. **O build da VPS é
`npm run build:vps`** (`NITRO_PRESET=node-server vite build`), script criado
para que isso não dependa de alguém lembrar. Aconteceu de verdade: o front
ficou fora por cerca de um minuto.

**2. `social_snapshots` e `social_analyses` não têm chave estrangeira para
`competitors`.** Apagar um concorrente deixa as duas linhas órfãs — provado
duas vezes na limpeza dos testes. As outras cinco tabelas
(`snapshots`, `changes`, `ads_snapshots`, `seo_analyses`, `swot_reports`)
têm `ON DELETE CASCADE`. O `DB_SCHEMA.sql` já marcava isso como
`TODO(revisao)`: **a origem na Supabase também não tinha a FK**, e a migração
preservou verbatim. ⏳ Falta decisão do dono: entra FK com `ON DELETE CASCADE`,
como as outras cinco?

## O que ainda responde 501, e por quê

`POST /competitors/{id}/crawl` (Firecrawl) ·
`POST /competitors/{id}/social/fetch` (ScrapeCreators) ·
`POST /competitors/{id}/ads/fetch` (ScrapeCreators) ·
`POST /competitors/{id}/ads-suggestion` (ScrapeCreators + LLM) ·
`POST /scraper-keys/{provider}/test` (Firecrawl / ScrapeCreators)

Falham alto, com mensagem dizendo de qual serviço dependem — em vez de
devolver vazio e parecer que funcionaram. **As cinco dependem de chave que o
dono ainda não forneceu**, não de código por escrever: a parte de IA já existe
em `ia.py`.

## O que falta para o produto rodar 100% aqui

1. **Chave Firecrawl e chave ScrapeCreators.** Sem elas, nenhum dado entra no
   sistema — e sem dado, SWOT, SEO e Social respondem 409 corretamente, mas
   respondem 409.
2. Portar os coletores `crawl-competitor`, `fetch-competitor-social` e
   `fetch-competitor-ads`, e refazer em serviço a cadeia que os 4 gatilhos do
   banco faziam por `pg_net` — extensão que **não existe** no banco novo.
   Hoje a cadeia está cortada: criar concorrente grava `crawl_status='failed'`
   com uma mensagem que manda chamar `bootstrap-app-config`, edge function que
   não existe mais.
3. Agendamento dos dois "daily" (crawl e anúncios) como cron da VPS.
4. Trocar o `vite.config.ts`, que hoje é `defineConfig()` de
   `@lovable.dev/vite-tanstack-config` — última dependência de código da
   Lovable. Está público no npm, então dá para reinstalar, mas o pipeline de
   build é deles.
5. Apagar `supabase/functions/` (13 funções) quando os coletores estiverem
   portados.
6. Revogar `EXECUTE` de PUBLIC em `get_llm_key` / `get_scraper_key`.
7. Backup do banco e cópia da `CONCORRENTES_CRIPTO_CHAVE` fora da VPS — hoje
   é cópia única, e sem ela as chaves BYOK viram texto cifrado indecifrável.
8. Decidir a FK de `social_snapshots` / `social_analyses` (armadilha 2, acima).
