# Pendências — plano de migração

## 🟢 Adiantado em 31/08 — sem esperar as decisões pendentes

Detalhe completo em **`06_Provisionamento_VPS.md`** (documento próprio deste
projeto — cada um dos três tem o seu). Resumo: banco real `concorrentes`
provisionado (16 tabelas), `DB_SCHEMA.sql` rodado, credencial em `.env.db`,
porta **8012** reservada.

⚠️ Isto **não** substitui as decisões de B/C/D abaixo — é só a fundação de
banco/porta, que dava para adiantar sem esperar por elas.

Estado em 2026-08-31, depois da extração SQL completa e da validação do
`DB_SCHEMA.sql` na VPS.

---

## A. Já resolvido pela extração — não repreguntar

15 tabelas, 162 colunas, 50 constraints (20 FK, 12 CHECK, 4 UNIQUE), 28
índices, 6 triggers, 17 funções — tudo com corpo lido · confirmado que
`app_config` tem RLS sem policy (deny total) · confirmado que
`get_llm_key`/`get_scraper_key` não checam dono e tinham `EXECUTE` para
`anon` · confirmado que `set_llm_key`/`set_scraper_key`/`is_admin`/
`accept_invite` se auto-amarram a `auth.uid()` corretamente · confirmado que
os `invoke_*` não vazam a `service_role_key` de volta · DDL testado, roda
sem erro, 6 testes funcionais passaram · as 15 tabelas com 0 linhas.

---

## B. Decisões de arquitetura — bloqueiam a Fase 1

| # | Decisão | Contexto |
|---|---|---|
| **B.1** | 🔴 **Corrigir `get_llm_key`/`get_scraper_key`** antes de portar | adicionar checagem de dono (`_user_id = auth.uid() ou is_admin()`), copiando o padrão que `set_llm_key` já usa. Marcado como TODO no `DB_SCHEMA.sql`, não aplicado |
| **B.2** | **Onde a identidade mora** | `public.usuario` no `DB_SCHEMA.sql` é mínima; o shim `auth.uid()` devolve sempre `NULL`. Login próprio (com hash de senha) precisa ser escrito, e `handle_new_user`/`enforce_invite_only` (hoje triggers em `auth.users`, que não existe fora do Supabase) precisam de equivalente na rotina de cadastro |
| **B.3** | **Cofre de segredos** | `LLM_KEY_ENCRYPTION_SECRET` era secret do Supabase, lido por `current_setting()` com fallback para `app_config`. Na VPS vira `.env`, padrão do resto dos projetos |
| **B.4** | **Provedor de IA default** | `generate-swot`/`analyze-*` usam Lovable AI como fallback quando o usuário não tem BYOK — não migra. Trocar por provedor próprio (DeepSeek, já usado pelo MoviChat na VPS?) |
| **B.5** | ~~**Onde o serviço roda / subdomínio**~~ ✅ **DECIDIDO 01/09** | `concorrentes.imagohub.com.br` — registro A criado por ele e resolvendo. Ver `06_Provisionamento_VPS.md` |
| **B.6** | **As 3 tabelas sem FK declarada** (`seo_analyses`, `social_analyses`, `social_snapshots`) | decidir se corrige na migração — não é efeito da conversão, já era assim no Supabase |
| **B.7** | **O modelo de tenancy** | o PRD diz single-tenant sem roles; o código implementado tem admin/membro/convite. **Decisão: qual dos dois documentos manda daqui pra frente?** Recomendo atualizar o PRD para refletir a realidade, não o contrário |
| **B.8** | **As 5 features não documentadas na arquitetura** (SEO analysis, social analysis, ads monitoring) | migram junto ou ficam para depois? Elas já são 9 das 12 Edge Functions reais |

---

## C. Correções de segurança — antes de expor a usuário real

| # | O quê |
|---|---|
| **C.1** | 🔴 Aplicar a checagem de dono em `get_llm_key`/`get_scraper_key` (ver B.1) — é o item que mais importa |
| **C.2** | Não expor `invoke_daily_crawl_scheduler`/`invoke_daily_ads_scheduler` como rota pública — só cron interno |
| **C.3** | Preservar a checagem de admin do `invite-user` ao portar — já está certa |
| **C.4** | Preservar o padrão `uid := auth.uid()` de `set_llm_key`/`set_scraper_key` — não regredir para aceitar `_user_id` de parâmetro |

---

## D. Infraestrutura de implantação — nada disto foi feito ainda

| # | O quê | Nota |
|---|---|---|
| **D.1** | vhost nginx | padrão dos outros 4 projetos da VPS — replicar |
| **D.2** | unit systemd (`--user`), `Restart=on-failure` | idem |
| **D.3** | 🔴 **Reconstruir `vite.config.ts` sem `@lovable.dev/vite-tanstack-config`** | **achado em 31/08, muda o tamanho do item.** Não é o `lovable-tagger` solto dos outros dois — aqui o `vite.config.ts` inteiro é `export default defineConfig()` de um pacote da Lovable que empacota TanStack Start, React, Tailwind, `tsConfigPaths`, o plugin do Cloudflare e o `componentTagger`, tudo junto. É **trabalho de reconstrução testado**, não faxina: escrever os plugins um a um e confirmar que o build ainda sai igual |
| **D.4** | Deploy: este projeto usa **Cloudflare Workers**, não só build estático | diferente dos outros dois (que eram SPA puro) — TanStack Start faz SSR. Decidir se a VPS serve isso via Node/SSR próprio ou se vira SPA estático |
| **D.5** | ~~Onde roda / subdomínio~~ ✅ **DECIDIDO 01/09** | `concorrentes.imagohub.com.br` — ver B.5 |

---

## E. Comparação com os outros dois projetos

| | `lead-king` | `diagnostico-vibe` | **`concorrentes`** |
|---|---|---|---|
| Tabelas | 11 | 8 | **15** |
| Edge Functions documentadas x reais | 15 (bate) | 1 (bate) | **7 documentadas x 12 reais** |
| PRD/arquitetura formal | não | não | **sim — mas desatualizado** |
| RLS aberta para `anon` | 6 de 11 tabelas | 0 | **0 tabelas** (a melhor das três) |
| Função sem checagem de dono, EXECUTE p/ anon | `get_vault_key` (projeto-wide) | `get_session_cookies` (por sessão) | **`get_llm_key`/`get_scraper_key` (por usuário — pior escopo)** |
| Cifra de segredo | não usa Vault, chave em claro no que existe | cookies em texto puro | **cifra real (`pgp_sym_encrypt` AES-256), só a checagem de leitura falha** |
| Deploy | SPA estático | SPA estático | **SSR via Cloudflare Workers** |
| DDL testado na VPS | ✅ roda, 8 testes | ✅ roda, 8 testes | ✅ **roda, 6 testes, exigiu shim de `auth.uid()`** |

**Padrão que se repete nos três:** função `SECURITY DEFINER` com `EXECUTE`
liberado para `anon`, sem checagem de dono, em pelo menos uma função de
leitura sensível. É o achado mais consistente entre os três projetos — vale
ser o primeiro item do checklist em qualquer projeto novo.

---

## F. O que já está ligado e o que não está, na esteira da VPS

| Item | Estado |
|---|---|
| clone em `/home/claude/imagohub/concorrentes` | **feito** em 31/08 |
| banco real + `.env.db`/`.pgpass` | **feito** em 31/08 — ver `06_Provisionamento_VPS.md` |
| `.gitignore` cobrindo `.pgpass`/`.env.db` | **feito** em 31/08 — confirmado com `git check-ignore` |
| backup das 02:00 | **ligado** em 31/08 — `empacotar concorrentes` no `backup_projetos.sh`, exclusão de `.pgpass` testada |
| cópia para `C:\code\BACKUP` | segue automaticamente do item acima, na próxima rodada de 02:00→04:30 |
| autocommit das 23:30 | **ligado** em 31/08 — `concorrentes` entrou no `REPOS` |
| trava de segredo (`gate_segredos.py`) | ✅ **passa** — exceção para `PUBLISHABLE_KEY=` autorizada e aplicada em 31/08 |

✅ **Resolvido em 31/08.** A trava ganhou uma exceção restrita a
`PUBLISHABLE_KEY=` — o nome que o próprio Supabase dá à metade do par que é
segura de expor. Testada em três frentes antes de aplicar: os 3 projetos
novos passam agora; os outros 6 repositórios continuam exatamente como
estavam; e um teste negativo (uma `SECRET_KEY` de verdade ao lado de uma
`PUBLISHABLE_KEY`, num repositório descartável) confirmou que a exceção não
abre brecha — o `SECRET_KEY` continua bloqueando. Detalhe em
`/home/claude/scripts/gate_segredos.py`, comentário de 31/08.
