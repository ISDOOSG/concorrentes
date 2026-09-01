# Documentação do Análise de Concorrentes (`remix-of-remix-of-an-lise-de-concorrentes`)

> Criada em 2026-08-31. É meu, vai ficar aqui, e no fim o único acesso externo
> será o GitHub — nada de Supabase. O Supabase sai na migração, mesma regra
> aplicada ao `lead-king` e ao `diagnostico-vibe`.

## Como ler

| Marca | O que significa |
|---|---|
| **MEDIDO** | conferido contra o código, contra o banco de origem, ou por teste na VPS |
| **INFERIDO** | deduzido por convenção de nome ou leitura de uso — não confirmado |
| **DESCONHECIDO** | precisa de decisão do dono |

## Ordem de leitura

| # | Arquivo | O que cobre |
|---|---|---|
| **1** | `01_O_Que_Esta_Ligado.md` | 🚨 comece aqui — deriva entre PRD/arquitetura e o que foi de fato implementado |
| 2 | `02_Modelo_Dados.md` | as 15 tabelas, o que migra e o que muda |
| 3 | `03_Arquitetura.md` | as 12 edge functions reais x as 7 documentadas, o que cada uma vira na VPS |
| 4 | `04_Acesso_e_Seguranca.md` | 🔴 o achado mais grave dos três projetos até agora |
| 5 | `05_Pendencias.md` | o que falta decidir para a Fase 1 |
| 6 | `06_Provisionamento_VPS.md` | o banco real já provisionado, a porta reservada — o que já está pronto |

## Os artefatos de banco

Extraídos com o `PADRAO_extrair_supabase.sql` **consolidado num arquivo só**
(evolução do processo usado nos dois primeiros projetos, que pedia 3 blocos
separados):

| Arquivo | O que é |
|---|---|
| `DB_SCHEMA.sql` | **o DDL para rodar na VPS** — sem RLS, sem papéis do Supabase, com `auth.users`/`auth.uid()` substituídos por um shim de compatibilidade. **Testado**: roda sem erro, 6 testes funcionais |
| `DB_CATALOGO.md` | o banco de **origem**, como estava no Supabase |
| `DB_FUNCOES.md` | o corpo das 17 funções, com nota em cada achado |
| `origem/extracao.csv` | o export cru, arquivo único |

## O que este projeto é

**Análise de Concorrentes (Viver de IA)** — inteligência competitiva
whitelabel: monitora site, anúncios e Instagram de concorrentes, gera
alertas de mudança e SWOT por IA. É `remix-of-remix` — **terceira geração**
de remix Lovable, e isso explica boa parte do que este documento encontrou.

**Pilha** — TanStack Start + React 19 + Tailwind v4 + shadcn/ui, deploy em
**Cloudflare Workers**; Supabase (Postgres, Auth, Storage, 12 Edge Functions
em Deno) — sai na migração.

**Projeto de origem:** `jqqcifqhkngpikhgjzig`. Postgres **17.6**.

## Muito mais maduro que os outros dois, e isso é bom e ruim ao mesmo tempo

**Bom:** este é o único dos três que chegou com **PRD, arquitetura
documentada (382 linhas) e 8 épicos com histórias**. E o código bate melhor
com boas práticas — `invite-user` checa papel de admin antes de convidar,
`set_llm_key`/`set_scraper_key` se auto-amarram a `auth.uid()` em vez de
confiar em parâmetro do cliente.

**Ruim:** com três gerações de remix, a documentação **não acompanhou** o
código. A arquitetura documenta 7 Edge Functions; o repositório tem 12. O
PRD diz *"sem roles, convites ou hierarquia — single-tenant"*; o código
implementa admin, convite por e-mail e papel de membro. Ver
`01_O_Que_Esta_Ligado.md`.

## 🔴 O achado que decide a prioridade

`get_llm_key(_user_id, _provider)` e `get_scraper_key(_user_id, _provider)`
são `SECURITY DEFINER`, tinham `EXECUTE` para `anon`, e **não verificam se
`_user_id` é quem está chamando**. Qualquer pessoa com a chave pública do
bundle rouba a chave Anthropic/OpenAI/Gemini ou Firecrawl/ScrapeCreators de
**qualquer usuário**, em texto puro. É pior que os achados dos outros dois
projetos — lá a exposição era de escopo do projeto; aqui é por usuário, e o
custo cai na conta de terceiros. Detalhe completo em
`04_Acesso_e_Seguranca.md`.

**Nada vazou ainda** — as 15 tabelas estão com 0 linhas, confirmado na
extração de 31/08.
