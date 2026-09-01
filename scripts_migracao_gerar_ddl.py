#!/usr/bin/env python3
"""Gera o DDL da VPS a partir da extracao unica -- concorrentes (Analise de
Concorrentes / Viver de IA).

Le docs/origem/extracao.csv (as 13 secoes num arquivo so) e escreve
docs/DB_SCHEMA.sql, ja SEM o que e especifico do Supabase:
  - sem policies de RLS (dependem de auth.uid())
  - sem GRANT para anon/authenticated/service_role
  - com auth.users substituido por public.usuario
"""
import csv
import re
import pathlib

BASE = pathlib.Path("/home/claude/imagohub/concorrentes/docs")
ORIG = BASE / "origem"


def linhas_do_csv(caminho):
    out = []
    with open(caminho, newline="", encoding="utf-8") as f:
        for i, row in enumerate(csv.reader(f, delimiter=";")):
            if i == 0 or not row:
                continue
            out.append(row[0])
    return out


def celulas(linha):
    if not linha.startswith("|"):
        return None
    return [c.strip() for c in linha.strip().strip("|").split("|")]


def secao(linhas, titulo):
    """Extrai as linhas de uma secao '## N. titulo' ate a proxima '## '."""
    dentro = False
    out = []
    for l in linhas:
        if l.startswith("## "):
            dentro = l.startswith("## " + titulo) or (titulo in l and re.match(r"## \d+\. ", l))
            if titulo not in l and l.startswith("## "):
                dentro = False
            continue
        if dentro:
            out.append(l)
    return out


todas = linhas_do_csv(ORIG / "extracao.csv")

# --- localizar cada secao pelo prefixo numerico -----------------------------
def secao_por_prefixo(linhas, prefixo):
    dentro = False
    out = []
    for l in linhas:
        if re.match(r"## \d+\. ", l):
            dentro = l.startswith(prefixo)
            continue
        if dentro:
            out.append(l)
    return out


sec_colunas = secao_por_prefixo(todas, "## 1. ")
sec_constraints = secao_por_prefixo(todas, "## 2. ")
sec_indices = secao_por_prefixo(todas, "## 3. ")
sec_triggers = secao_por_prefixo(todas, "## 4. ")
sec_funcoes_meta = secao_por_prefixo(todas, "## 8. ")
sec_funcoes_corpo = secao_por_prefixo(todas, "## 12. ")

colunas = {}
for l in sec_colunas:
    c = celulas(l)
    if not c or len(c) < 5 or c[0] in ("tabela", "---") or set(c[0]) <= set("-"):
        continue
    colunas.setdefault(c[0], []).append(
        {"nome": c[1], "tipo": c[2], "nulo": c[3], "default": c[4]}
    )

constraints = {}
for l in sec_constraints:
    c = celulas(l)
    if not c or len(c) < 4 or c[0] in ("tabela", "---") or set(c[0]) <= set("-"):
        continue
    constraints.setdefault(c[0], []).append({"nome": c[1], "tipo": c[2], "def": c[3]})

indices = []
for l in sec_indices:
    c = celulas(l)
    if not c or len(c) < 3 or c[0] in ("tabela", "---") or set(c[0]) <= set("-"):
        continue
    indices.append({"tabela": c[0], "nome": c[1], "def": c[2]})

triggers = []
for l in sec_triggers:
    c = celulas(l)
    if not c or len(c) < 3 or c[0] in ("tabela", "---") or set(c[0]) <= set("-"):
        continue
    triggers.append({"tabela": c[0], "nome": c[1], "def": c[2]})

texto_func = "\n".join(sec_funcoes_corpo)
funcoes = re.findall(r"```sql\s*(CREATE OR REPLACE FUNCTION.*?)\s*```", texto_func, re.S)

# Tabelas SEM nenhuma FK declarada para user_id/competitor_id no Supabase --
# NAO adiciono FK aqui, so sinalizo. Sao mais tabelas do que o caso pontual
# do lead-king, e a escolha de ON DELETE cabe a quem revisar.
SEM_FK_DECLARADA = {"seo_analyses", "social_analyses", "social_snapshots"}

saida = []
A = saida.append

A("-- ============================================================")
A("-- Analise de Concorrentes / Viver de IA -- esquema para o Postgres da VPS")
A("--")
A("-- Gerado a partir de docs/origem/extracao.csv (Supabase jqqcifqhkngpikhgjzig)")
A("-- em 2026-08-31, via PADRAO_extrair_supabase.sql.")
A("--")
A("-- O QUE FOI RETIRADO, E POR QUE")
A("--   * as policies de RLS  -> usam auth.uid(), que e do Supabase")
A("--   * os GRANT para anon/authenticated/service_role -> papeis inexistentes aqui")
A("--   * a referencia a auth.users -> trocada por public.usuario")
A("--")
A("-- 🚨 NAO REPETIR: get_llm_key(_user_id, _provider) e get_scraper_key(_user_id,")
A("--    _provider) estavam com EXECUTE para 'anon' e NAO verificavam se")
A("--    _user_id era quem chamava -- qualquer um com a chave publica do")
A("--    bundle roubava a chave Anthropic/OpenAI/Gemini ou Firecrawl/")
A("--    ScrapeCreators de QUALQUER usuario. Achado em 31/08. Ver o TODO")
A("--    marcado nas duas funcoes, secao 3 abaixo -- o corpo original foi")
A("--    preservado verbatim; a checagem de dono faltando fica marcada, nao")
A("--    aplicada por mim (decisao de quem revisar).")
A("--")
A("-- ✅ O QUE JA VEM CERTO NO ORIGINAL, E NAO E PRA MUDAR:")
A("--    set_llm_key/set_scraper_key usam uid := auth.uid() internamente, nunca")
A("--    confiam em parametro do cliente -- e o padrao a copiar nas duas de cima.")
A("--    is_admin() e accept_invite() tambem se auto-amarram a auth.uid().")
A("-- ============================================================")
A("")
A("BEGIN;")
A("")
A("CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid() e pgp_sym_*")
A("")

A("-- ------------------------------------------------------------")
A("-- 0. IDENTIDADE -- substitui auth.users do Supabase")
A("-- ------------------------------------------------------------")
A("-- TODO(decisao): tabela minima, so para as FKs fecharem. Definir login.")
A("CREATE TABLE IF NOT EXISTS public.usuario (")
A("    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),")
A("    email       text NOT NULL UNIQUE,")
A("    nome        text NOT NULL,")
A("    senha_hash  text,")
A("    ativo       boolean NOT NULL DEFAULT true,")
A("    criado_em   timestamptz NOT NULL DEFAULT now()")
A(");")
A("")

A("-- ------------------------------------------------------------")
A("-- 0.1 SHIM DE COMPATIBILIDADE -- so para o DDL original CARREGAR")
A("-- ------------------------------------------------------------")
A("-- 🚨 auth.users e auth.uid() sao do Supabase Auth. Varias funcoes deste")
A("--    projeto (accept_invite, is_admin -- as LANGUAGE sql) referenciam os")
A("--    dois DENTRO DO CORPO, nao so em FK -- e funcao LANGUAGE sql e")
A("--    validada contra objetos reais no momento do CREATE, nao so no uso.")
A("--    Sem isto, o CREATE FUNCTION falha antes mesmo de existir para editar.")
A("--")
A("--    auth.users vira VIEW sobre public.usuario (id, email) -- nunca uma")
A("--    segunda fonte de identidade. auth.uid() devolve NULL sempre: e so")
A("--    para o corpo COMPILAR, nao funciona de verdade sem sessao real.")
A("--    TODO(decisao C.8): escrever a versao real de auth.uid() (ler de uma")
A("--    variavel de sessao/JWT do servico da VPS) antes de usar em producao.")
A("CREATE SCHEMA IF NOT EXISTS auth;")
A("CREATE OR REPLACE VIEW auth.users AS SELECT id, email FROM public.usuario;")
A("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$")
A("  SELECT NULL::uuid;")
A("$$;")
A("")

ordem = ["profiles", "invites", "app_config", "competitors",
         "snapshots", "changes", "alerts", "swot_reports",
         "seo_analyses", "social_snapshots", "social_analyses", "ads_snapshots",
         "user_llm_settings", "user_llm_keys", "user_scraper_keys"]
resto = [t for t in colunas if t not in ordem]
ordem += resto

A("-- ------------------------------------------------------------")
A("-- 1. TABELAS")
A("-- ------------------------------------------------------------")
for t in ordem:
    if t not in colunas:
        continue
    A("")
    if t in SEM_FK_DECLARADA:
        A(f"-- 🚨 TODO(revisao): no Supabase, {t} NAO tinha FK declarada em")
        A("--    user_id/competitor_id -- referencia solta, sem integridade.")
        A("--    Colunas mantidas como uuid comum, igual a origem. Decidir se")
        A("--    entra FK (e qual ON DELETE) ao revisar.")
    A(f"CREATE TABLE IF NOT EXISTS public.{t} (")
    linhas_col = []
    for c in colunas[t]:
        tipo = c["tipo"]
        tipo = {"timestamp with time zone": "timestamptz",
                "character varying": "text",
                "ARRAY": "text[]",
                "USER-DEFINED": "text"}.get(tipo, tipo)
        d = "" if c["default"] == "-" else f" DEFAULT {c['default']}"
        n = "" if c["nulo"] == "YES" else " NOT NULL"
        linhas_col.append(f"    {c['nome']:<28} {tipo}{n}{d}")
    for k in constraints.get(t, []):
        d = k["def"]
        if "auth.users" in d:
            d = d.replace("auth.users", "public.usuario")
            linhas_col.append("    -- reapontada de auth.users para public.usuario")
            linhas_col.append(f"    CONSTRAINT {k['nome']} {d}")
        else:
            linhas_col.append(f"    CONSTRAINT {k['nome']} {d}")
    A(",\n".join(linhas_col))
    A(");")

A("")
A("-- ------------------------------------------------------------")
A("-- 2. INDICES")
A("-- ------------------------------------------------------------")
for i in indices:
    if "_pkey" in i["nome"] or i["nome"].endswith("_key"):
        continue
    d = i["def"]
    if not d.upper().startswith("CREATE"):
        continue
    d = d.replace("CREATE INDEX", "CREATE INDEX IF NOT EXISTS", 1)
    d = d.replace("CREATE UNIQUE INDEX", "CREATE UNIQUE INDEX IF NOT EXISTS", 1)
    A(d + ";")

A("")
A("-- ------------------------------------------------------------")
A("-- 3. FUNCOES")
A("-- ------------------------------------------------------------")
A("-- 🚨 As 17 funcoes tinham EXECUTE para 'anon' no Supabase. As duas abaixo")
A("--    sao as unicas onde isso e realmente exploravel (as outras, ou se")
A("--    auto-amarram a auth.uid(), ou nao devolvem nada sensivel).")
A("")
for f in funcoes:
    nome_m = re.search(r"FUNCTION\s+public\.(\w+)", f)
    nome = nome_m.group(1) if nome_m else "?"
    A(f"-- ---------- {nome}")
    if nome in ("get_llm_key", "get_scraper_key"):
        tabela = "user_llm_keys" if nome == "get_llm_key" else "user_scraper_keys"
        A(f"-- 🚨 TODO(seguranca): {nome} recebe _user_id do CHAMADOR e nunca")
        A("--    verifica se bate com quem esta autenticado. Corpo original")
        A("--    preservado abaixo -- ANTES de expor isto de novo, adicionar:")
        A("--      if _user_id <> auth.uid() and not public.is_admin() then")
        A("--        raise exception 'not authorized';")
        A("--      end if;")
        A(f"--    (mesmo padrao que set_{'llm' if nome=='get_llm_key' else 'scraper'}_key ja usa,")
        A("--    so que na leitura em vez da escrita.)")
    if nome in ("invoke_daily_crawl_scheduler", "invoke_daily_ads_scheduler", "invoke_suggest_ads_links"):
        A(f"-- ⚠️ TODO(revisao): {nome} nao e funcao de trigger (RETURNS void),")
        A("--    entao e chamavel direto. Na VPS, so o cron interno deve chamar --")
        A("--    nao expor como rota comum.")
    A(f + ";")
    A("")

A("-- ------------------------------------------------------------")
A("-- 4. TRIGGERS")
A("-- ------------------------------------------------------------")
A("-- ⚠️ handle_new_user e enforce_invite_only disparam em auth.users, que nao")
A("--    existe fora do Supabase -- portanto os triggers deles TAMBEM nao vem")
A("--    (nao aparecem nem na extracao: o PADRAO so le triggers do schema")
A("--    public). Equivalente precisa ser escrito na rotina de cadastro do")
A("--    novo public.usuario, chamando a logica de handle_new_user manualmente.")
A("")
for tg in triggers:
    d = tg["def"]
    A(f"DROP TRIGGER IF EXISTS {tg['nome']} ON public.{tg['tabela']};")
    A(d + ";")

A("")
A("-- ------------------------------------------------------------")
A("-- 5. O QUE NAO FOI TRAZIDO -- decisoes em aberto")
A("-- ------------------------------------------------------------")
A("-- 5.1 As policies de RLS do Supabase -- todas 'auth.uid() = user_id'.")
A("--     TODO(decisao): filtro na aplicacao ou RLS proprio.")
A("--")
A("-- 5.2 handle_new_user (promove 1o usuario a admin) e enforce_invite_only")
A("--     (bloqueia cadastro direto) rodavam como trigger em auth.users.")
A("--     Precisam de equivalente na rotina de cadastro do public.usuario.")
A("--")
A("-- 5.3 app_config guarda functions_base_url e service_role_key -- no")
A("--     Supabase, RLS ligada e ZERO policies = ninguem de fora le. Na VPS,")
A("--     esses dois valores viram .env do servico, a tabela pode nem existir.")
A("--")
A("-- 5.4 seo_analyses, social_analyses, social_snapshots sem FK declarada")
A("--     (ver TODOs na secao 1) -- decidir se corrige na migracao.")
A("")
A("COMMIT;")
A("")

destino = BASE / "DB_SCHEMA.sql"
destino.write_text("\n".join(saida) + "\n", encoding="utf-8")

print(f"gravado {destino}")
print(f"  tabelas : {len([t for t in ordem if t in colunas])}")
print(f"  colunas : {sum(len(v) for v in colunas.values())}")
print(f"  constraints: {sum(len(v) for v in constraints.values())}")
print(f"  indices : {len(indices)}")
print(f"  triggers: {len(triggers)}")
print(f"  funcoes : {len(funcoes)}")
print(f"  linhas  : {len(saida)}")
