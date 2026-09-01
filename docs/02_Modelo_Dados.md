# Modelo de dados — o que migra e o que muda

**Fonte:** `docs/DB_CATALOGO.md` (esquema completo, exportado do Supabase por
SQL, 2026-08-31). O detalhe coluna a coluna está lá; aqui fica o que muda na
migração.

🚨 **`docs/DB_SCHEMA.sql` já é o DDL para a VPS**, testado: roda sem erro, 6
testes funcionais passaram (inserção, trigger de crawl auto-degradando sem
`app_config`, `CHECK` de status, `CASCADE`, cifra `pgp_sym_encrypt/decrypt`
funcionando fora do Supabase, e a prova de que funções dependentes de
`auth.uid()` real recusam funcionar sem ele).

---

## As 15 tabelas, por grupo

| Grupo | Tabelas |
|---|---|
| Fluxo original (site) | `competitors`, `snapshots`, `changes`, `alerts`, `swot_reports` |
| Identidade e acesso | `profiles`, `invites` |
| Configuração da plataforma | `app_config` |
| Análise por IA | `seo_analyses`, `social_analyses` |
| Coleta de anúncios e social | `ads_snapshots`, `social_snapshots` |
| Chaves do usuário (BYOK) | `user_llm_settings`, `user_llm_keys`, `user_scraper_keys` |

**162 colunas no total** — bem mais que os outros dois projetos (104 e 80).

---

## Domínios com CHECK — 12 constraints

| Tabela.coluna | Valores |
|---|---|
| `competitors.status` | active, paused |
| `competitors.crawl_status` | never, queued, running, success, failed |
| `changes.change_type` | price, copy, feature, design, traffic |
| `changes.severity` | info, warning, critical |
| `snapshots.source` | firecrawl, scrapfly, direct |
| `ads_snapshots.source` | meta, google |
| `profiles.plan` | free, pro |
| `profiles.role` | admin, member |
| `user_llm_keys.provider` | anthropic, openai, gemini |
| `user_llm_settings.provider` | lovable, anthropic, openai, gemini |
| `user_scraper_keys.provider` | firecrawl, scrapecreators |
| `user_scraper_keys.source` | manual, lovable_connector |

**Zero enums** — todo domínio é `text` + `CHECK`, ao contrário do `lead-king`
(que tem `app_role` como enum de verdade).

---

## FOREIGN KEY — 11 apontam para `auth.users`, todas `ON DELETE CASCADE`

```
ads_snapshots.user_id · alerts.user_id · changes.user_id ·
competitors.user_id · invites.invited_by (ON DELETE SET NULL) ·
profiles.id · snapshots.user_id · swot_reports.user_id ·
user_llm_keys.user_id · user_llm_settings.user_id ·
user_scraper_keys.user_id
```

Todas reapontadas para `public.usuario` no `DB_SCHEMA.sql`.

## 🚨 Três tabelas sem FK declarada — gap real do banco de origem

`seo_analyses`, `social_analyses` e `social_snapshots` têm colunas
`user_id`/`competitor_id`, mas **nenhuma FK as amarra**. Não é um efeito da
migração — é assim no Supabase também. Confirmado nas seções 2 e 3 do
`DB_CATALOGO.md`: as outras 12 tabelas têm FK completa; essas 3, não.

**Não adicionei a FK no `DB_SCHEMA.sql`** — ao contrário do que fiz no
`lead-king` para um caso pontual, aqui são 3 tabelas e a escolha de
`ON DELETE` (CASCADE, SET NULL) é decisão de quem revisar. Ficou marcado
como `TODO(revisao)` no próprio arquivo.

---

## O shim de `auth.users`/`auth.uid()` — por que existe

Diferente dos outros dois projetos, aqui **duas funções em `LANGUAGE sql`**
(`is_admin`, `accept_invite`) referenciam `auth.users`/`auth.uid()` **dentro
do corpo**, não só em constraint. Funções `LANGUAGE sql` são validadas
contra objetos reais no momento do `CREATE` — sem algo chamado `auth.users`
existindo, o `DB_SCHEMA.sql` inteiro falhava antes mesmo de terminar de
carregar.

**A solução, já aplicada no arquivo:**

```sql
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE VIEW auth.users AS SELECT id, email FROM public.usuario;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULL::uuid;
$$;
```

`auth.users` é uma **view** sobre `public.usuario` — nunca uma segunda fonte
de identidade. `auth.uid()` devolve `NULL` sempre — é só para o corpo
**compilar**, não funciona de verdade sem sessão real.

**Testado na VPS:** com o shim, `set_llm_key` falha com `not authenticated`
— confirma que a função precisa de auth de verdade antes de funcionar, mas
prova que a lógica de dono dela está certa (ela não confia em parâmetro do
cliente, só em `auth.uid()`).

---

## Onde o corpo das funções mora

`DB_FUNCOES.md` — as 17, cada uma com nota sobre segurança quando aplicável.
O achado central (`get_llm_key`/`get_scraper_key` sem checagem de dono) está
detalhado em `04_Acesso_e_Seguranca.md`.
