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

## Coletores próprios — `coletores.py`, escrito em 2026-09-02

Porta `crawl-competitor`, `fetch-competitor-social`, `fetch-competitor-ads`
(parte Meta) e `test-scraper-key`. Mesma regra do `ia.py`: `urllib` da
biblioteca padrão, chave BYOK do usuário primeiro e chave do serviço como piso.

| Rota | O que faz |
|---|---|
| `POST /competitors/{id}/crawl` | Firecrawl v2 → snapshot → diff contra o anterior → `changes` |
| `POST /competitors/{id}/social/fetch` | ScrapeCreators → `social_snapshots` (upsert do dia) |
| `POST /competitors/{id}/ads/fetch` | ScrapeCreators → `ads_snapshots` (Meta) |
| `POST /scraper-keys/{provider}/test` | uma chamada barata que prova a chave |

**Duas diferenças deliberadas em relação à edge function original:**

1. **Sem screenshot.** A original subia o PNG para o Storage da Supabase, que
   não existe aqui. `snapshots.screenshot_path` fica `NULL` até haver um lugar
   decidido para guardar imagem. O crawl não falha por isso.
2. **Não insere em `alerts`.** A original inseria explicitamente, mas o gatilho
   `on_change_inserted` → `invoke_generate_alerts()` já faz isso dentro do
   banco — e esse gatilho veio na migração. Inserir dos dois lados duplicaria
   todo alerta.

⚠️ **Crédito é finito.** Medido em 02/09: Firecrawl com **1000** créditos no
período (renova 02/10), ScrapeCreators com **100**. Cada perfil de Instagram
custa 1; cada busca de anúncio custa 1. Por isso o crawl herdou a trava de
idempotência de 60 s da original.

### 🚨 O defeito que só aparece no segundo crawl

**A detecção de mudanças nunca funcionou, nem na Lovable.** A edge function
gravava `change_type` `"pricing"` / `"content"` e `severity`
`"high"` / `"medium"` / `"low"`. A tabela `changes` só aceita
`price|copy|feature|design|traffic` e `info|warning|critical` — toda inserção
de mudança violava o CHECK. Ninguém viu porque o banco de origem estava vazio
e um segundo crawl nunca aconteceu.

O vocabulário agora é o que o front já lê (`SEVERITY_FROM_DB` e
`CHANGE_TYPE_FROM_DB` em `providers/adapters.ts`) — **escolha minha, não
herdada**:

| Mudança | `change_type` | `severity` | Gera alerta? |
|---|---|---|---|
| Preços | `price` | `critical` | sim |
| CTAs | `copy` | `warning` | sim |
| H1 | `copy` | `info` | **não** |
| Conteúdo, sem sinal estruturado | `traffic` (o front lê como "content") | `info` | **não** |

`info` não gera alerta porque `invoke_generate_alerts` pula essa severidade de
propósito — mudança pequena fica registrada e silenciosa.

**PROVADO em 02/09, pelo domínio público**, contra `https://imagohub.com.br`
(site do próprio dono, para não bater em terceiro num teste): primeiro crawl
`201` com 6.785 caracteres e o título real da página; segundo crawl imediato
`429` pela trava; depois de envelhecer o snapshot anterior e trocar o que ele
dizia ter visto, o terceiro crawl detectou **3 mudanças** e o gatilho gerou
**2 alertas** (o `info` ficou de fora, como desenhado). O Instagram foi
coletado de verdade — 12 posts, 268.646.292 seguidores — e analisado em
seguida. Dado de teste apagado no fim.

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

## Nenhuma rota responde 501

Eram cinco no começo de 02/09. A última a cair foi
`POST /competitors/{id}/ads-suggestion`, porta de `suggest-ads-links`.

### `ads-suggestion` — como ela decide

Junta candidatos de **duas origens** e deixa o modelo arbitrar:

1. **O que o próprio site publica** — varredura do markdown do último crawl
   atrás de `facebook.com/…`, `instagram.com/…` e
   `adstransparency.google.com/advertiser/ARnnn`. As listas de bloqueio vieram
   da edge function original e existem por um motivo prático: site qualquer
   linka `facebook.com/sharer` e `instagram.com/p` o tempo todo, e sem elas o
   "candidato" mais frequente seria o botão de compartilhar.
2. **O top 5 de cada acervo de anúncio**, pelo ScrapeCreators.

**Regra própria, não herdada:** o id que o modelo devolve é conferido contra o
formato antes de virar sugestão — advertiser do Google é sempre `ARnnn` — e id
fora do formato é descartado com confiança zero.

⚠️ **É a rota mais cara do serviço:** 2 créditos de ScrapeCreators por chamada.

**PROVADO nos dois sentidos, pelo domínio público.** Com nome e site coerentes
(Magazine Luiza), devolveu a página real `133378606695344` — justificando pelos
14 milhões de seguidores — e o anunciante `AR14248386603834671105`, com
confiança 0,99 e 0,90. Com o nome trocado de propósito ("Pastelaria Velasco"
apontando para `magazineluiza.com.br`), devolveu **null nos dois**, confiança 0,
e a razão explicando a divergência. A trava do "não invente" funciona.

## Agendamento — `scripts/agendador.py`

Substitui `daily-crawl-scheduler` e `daily-ads-scheduler`, que eram cron da
Supabase. **Chama a própria API** em vez de mexer no banco: a rota `/crawl` já
faz a cadeia inteira, e duplicar isso criaria dois lugares para a mesma regra —
um deles fadado a envelhecer.

| | |
|---|---|
| `crawl` | todo concorrente `status = 'active'` · cron **03:50** |
| `ads` | ativo **e** com página do Facebook ou anunciante do Google vinculado · cron **05:10** |
| Log | `logs/concorrentes_agendador.log` |

**Sequencial de propósito.** A original rodava 5 por usuário em paralelo contra
infra elástica; aqui o crédito é finito e a VPS é compartilhada com outros seis
projetos. Sai com código 0 mesmo com falha parcial — o cron não deve gritar por
um concorrente que bloqueou scraping; só devolve 1 quando **tudo** falhou.

Testado com `env -i`, que é como o cron executa. Provado com um concorrente
real: selecionou, crawleou, e na segunda rodada seguida a trava de 60 s pulou
corretamente.

## 🧹 A Lovable saiu do repositório

- **`vite.config.ts` é próprio.** Era `defineConfig()` de
  `@lovable.dev/vite-tanstack-config`; agora monta os mesmos plugins
  (`tsConfigPaths`, `tailwindcss`, `tanstackStart`, `viteReact`) e declara
  `nitro({ preset: "node-server" })`. **Isso mata a armadilha de 02/09:** o
  pacote deles tinha `defaultPreset: "cloudflare-module"` fixo no código, e por
  isso `npm run build` gerava um Worker que exporta handler em vez de subir
  servidor. Agora o build padrão já sai certo — `build:vps` fica só por
  compatibilidade com quem decorou.
- **`supabase/` foi apagada** — as 13 edge functions, o `config.toml` e a pasta
  `.lovable/`. Tudo permanece no histórico do git.
- **`@lovable.dev/vite-tanstack-config` saiu do `package.json`.**

⚠️ **O que foi apagado sem porta equivalente:** a parte **Google Ads** da
`fetch-competitor-ads` — só a Meta foi portada. Está no histórico do git se um
dia for preciso.

## Backup — `scripts/backup_db.py`, cron 02:20

**Existia porque não existia.** Até 02/09 o cron salvava hub-fotos (03:00),
MoviChat (03:30) e MoviZap (02:40); o `backup_projetos.sh` empacotava o
*diretório* do concorrentes — código, docs e migrações —, e o **banco não tinha
uma linha de backup em lugar nenhum**.

Segue o padrão do `backup_db.py` do MoviZap, inclusive nas duas disciplinas que
custaram caro lá: **a senha nunca passa por `argv`** (vai para um `.pgpass`
temporário 0600, apagado no `finally`) e **o arquivo só vira definitivo depois
de ser reaberto e conferido** — 14 tabelas essenciais precisam aparecer dentro
dele, senão o `.parcial` é descartado.

Retenção de 14 dias. Log em `logs/concorrentes_backup.log`. Testado com
`env -i`, como o cron executa: 16 tabelas, 1.581 linhas.

🚨 **O QUE ESTE BACKUP SOZINHO NÃO RESTAURA.** As chaves BYOK estão cifradas
com `pgp_sym_encrypt`, e a chave mestra vive em `api/.env`
(`CONCORRENTES_CRIPTO_CHAVE`), que **não entra no dump nem no
`backup_projetos.sh`** — decisão do dono em 28/08 de não empacotar `.env`.
Restaurar sem ela devolve `user_llm_keys` e `user_scraper_keys` como texto
cifrado indecifrável. Por isso os dois arquivos de segredo foram copiados para
`Documentos\Credenciais_VPS_2026-08-28` na máquina do dono, ao lado dos outros
oito projetos. **Rotacionar um segredo na VPS deixa essa cópia velha em
silêncio.**

## Os gatilhos do banco, encerrados

Dos quatro herdados, sobrou **um**, e é o que funciona:

| Gatilho | Destino | O que houve |
|---|---|---|
| `on_competitor_inserted` | `invoke_crawl_competitor` | 🗑️ derrubado — fazia a tela mentir ao nascer |
| `on_snapshot_inserted` | `invoke_detect_changes` | 🗑️ derrubado — o diff virou parte do crawl |
| `on_snapshot_suggest_ads` | `invoke_suggest_ads_links` | 🗑️ derrubado — virou rota explícita, e deixou de gastar crédito como efeito colateral |
| `on_change_inserted` | `invoke_generate_alerts` | ✅ **fica** — roda inteiro dentro do banco, sem `pg_net`, e é ele que cria o alerta |

Os três derrubados chamavam edge functions por `net.http_post`, e o `pg_net`
**não existe neste banco**. Paravam antes disso, na guarda do `app_config`
vazio — mas alguém preenchendo `app_config` por engano os reativaria contra um
destino que não existe mais. As funções ficam: não são alcançáveis de fora, e
apagá-las exigiria recriar caso a decisão se reverta.

**PROVADO depois de derrubar**, com a cadeia inteira: concorrente nasce com
`crawl_status = 'never'` e sem erro · crawl grava snapshot · segundo crawl
detecta **3 mudanças** · o gatilho que ficou gera **2 alertas** (o `info` fora,
como desenhado).

## Anúncios: os dois acervos

A parte **Google** foi recuperada do histórico do git em 02/09 — quando
`supabase/functions/` foi apagada, só a Meta tinha sido portada.

⚠️ **UM LADO NÃO DERRUBA O OUTRO.** Se o Meta falhar e o Google responder, a
busca vale pelo Google, e vice-versa; só estoura quando os dois falham. Falhar
inteiro por causa de um deles esconderia dado que existe.

🚨 **O id do anúncio do Google é `creativeId`.** Medido contra a resposta real:
o item traz `advertiserId`, `creativeId`, `format`, `adUrl`, `advertiserName`,
`imageUrl`, `firstShown`, `lastShown` — e nada mais. Na primeira tentativa a
porta procurava `adId`/`ad_id`/`id`, e o resultado foi **40 anúncios recebidos
e zero gravados**, sem erro nenhum: a inserção pula quem não tem identificador.
O `ok: true` mentia.

Duas escolhas que vêm da original e continuam valendo: **`active` fica `None`**
no acervo do Google, porque o plano básico não devolve esse sinal — `False`
diria "está parado", que é diferente de "não sei"; e o rótulo cai para
*"Criativo &lt;formato&gt; · &lt;anunciante&gt;"* quando não há texto, porque linha vazia
parece defeito na tela.

**PROVADO pelo domínio público:** 409 sem nenhum id vinculado; com o anunciante
`AR14248386603834671105` do Magalu, **40 recebidos, 40 gravados**, lidos de
volta pela API, e o dado de teste apagado no fim.

## O que falta — uma coisa só

1. ⏳ **Onde guardar screenshot de crawl.** A edge function pedia o formato
   `screenshot` ao Firecrawl e subia o PNG para o Storage da Supabase, que não
   existe aqui. As opções são disco da VPS servido pelo nginx, ou não ter.
   `snapshots.screenshot_path` já existe e fica `NULL`. É decisão do dono.

E duas contas de terceiro para vigiar, que não são trabalho e sim orçamento:
**Firecrawl** com 1000 créditos/mês (renova 02/10) e **ScrapeCreators com
menos de 90** — cada perfil de Instagram custa 1, cada busca de anúncio 1, cada
sugestão 2.
