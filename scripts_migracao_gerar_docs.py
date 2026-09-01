#!/usr/bin/env python3
"""Gera DB_CATALOGO.md e DB_FUNCOES.md do concorrentes a partir da extracao unica."""
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


def secao_por_prefixo(linhas, prefixo, ate_tambem=False):
    dentro = False
    out = []
    for l in linhas:
        if re.match(r"## \d+\. ", l):
            dentro = l.startswith(prefixo)
            continue
        if dentro:
            out.append(l)
    return out


todas = linhas_do_csv(ORIG / "extracao.csv")

sec_contagens = secao_por_prefixo(todas, "## 13. ")
sec_funcoes_corpo = secao_por_prefixo(todas, "## 12. ")

cab = [
    "# Catálogo do banco — Análise de Concorrentes",
    "",
    "> **Fonte:** exportado do Supabase `jqqcifqhkngpikhgjzig` em 2026-08-31,",
    "> pelo SQL Editor, com `PADRAO_extrair_supabase.sql` (arquivo único). O CSV",
    "> cru está em `docs/origem/extracao.csv`.",
    ">",
    "> Este documento é **o estado do banco de origem**, para consulta e",
    "> comparação futura. O que vai rodar na VPS é o `DB_SCHEMA.sql`, que",
    "> **não é igual a isto**: as policies e os papéis do Supabase ficaram de",
    "> fora, e `auth.users`/`auth.uid()` viram um shim de compatibilidade — ver",
    "> `04_Acesso_e_Seguranca.md`.",
    "",
    "---",
    "",
    "## Linhas por tabela no momento da exportação",
    "",
]
cab += sec_contagens
cab += [
    "",
    "🚨 **Tudo zero.** Nenhum usuário, nenhuma chave BYOK cadastrada. É o que dá",
    "tempo de corrigir `get_llm_key`/`get_scraper_key` antes do primeiro uso real",
    "— ver a seção de achados em `04_Acesso_e_Seguranca.md`.",
    "",
    "---",
    "",
]

(BASE / "DB_CATALOGO.md").write_text(
    "\n".join(cab) + "\n".join(todas) + "\n", encoding="utf-8"
)

# ---------- DB_FUNCOES.md --------------------------------------------------
texto = "\n".join(sec_funcoes_corpo)
blocos = re.findall(r"(### \w+\s*```sql\s*CREATE OR REPLACE FUNCTION.*?```)", texto, re.S)

notas = {
    "get_llm_key": (
        "🔴 **CRÍTICO — sem verificação de dono, `EXECUTE` para `anon`.** Recebe\n"
        "`_user_id` do chamador e nunca confere se bate com `auth.uid()`. Devolve\n"
        "a chave Anthropic/OpenAI/Gemini de **qualquer usuário**, em texto puro,\n"
        "para quem tiver só a chave pública do bundle. Testado: a função em si\n"
        "roda fora do Supabase sem erro — o defeito é lógico, não de portabilidade."
    ),
    "get_scraper_key": (
        "🔴 **CRÍTICO — mesmo defeito de `get_llm_key`.** Devolve a chave\n"
        "Firecrawl/ScrapeCreators de qualquer usuário, sem checar dono."
    ),
    "set_llm_key": (
        "✅ **Faz certo, e é o padrão a copiar nas duas de cima.** Usa\n"
        "`uid := auth.uid()` internamente — nunca aceita user_id do cliente.\n"
        "Testado na VPS: falha com `not authenticated` quando `auth.uid()` é nulo\n"
        "(o shim de compatibilidade sempre devolve nulo) — confirma que a função\n"
        "precisa de auth real antes de funcionar, mas a lógica de dono está certa."
    ),
    "set_scraper_key": (
        "✅ Mesmo padrão correto de `set_llm_key`."
    ),
    "is_admin": (
        "✅ Auto-amarrada a `auth.uid()`. `LANGUAGE sql` — por isso é validada\n"
        "contra objetos reais no momento do `CREATE`, não só no uso; precisou do\n"
        "shim `auth.uid()`/`auth.users` para sequer compilar fora do Supabase."
    ),
    "accept_invite": (
        "✅ Também auto-amarrada a `auth.uid()`. Mesma exigência de shim que\n"
        "`is_admin` para compilar."
    ),
    "enforce_invite_only": (
        "⚠️ Dispara como trigger `BEFORE INSERT` em `auth.users` — schema que não\n"
        "existe fora do Supabase. **Não aparece na extração de triggers** (o\n"
        "`PADRAO` só lê triggers de tabelas do schema `public`). Precisa de\n"
        "equivalente na rotina de cadastro do `public.usuario`."
    ),
    "handle_new_user": (
        "⚠️ Mesma situação de `enforce_invite_only` — trigger em `auth.users`,\n"
        "invisível na extração, precisa de equivalente na rotina de cadastro."
    ),
    "invoke_daily_crawl_scheduler": (
        "⚠️ Não é função de trigger (`RETURNS void`) — é **chamável direto** via\n"
        "RPC, e tinha `EXECUTE` para `anon`. Dispara crawl de todos os\n"
        "competitors de todos os usuários. Na VPS, só o cron interno deve chamar."
    ),
    "invoke_daily_ads_scheduler": (
        "⚠️ Mesma classe de `invoke_daily_crawl_scheduler` — chamável direto,\n"
        "gera custo de API de terceiro se exposta."
    ),
    "invoke_suggest_ads_links": (
        "⚠️ Mesma classe — mas esta É trigger (dispara em `snapshots`), então o\n"
        "risco de chamada direta é menor (função de trigger recusa contexto sem\n"
        "`NEW`)."
    ),
}

out = [
    "# Corpo das funções do banco — Análise de Concorrentes",
    "",
    "> **Fonte:** `pg_get_functiondef()` no Supabase `jqqcifqhkngpikhgjzig`,",
    "> 2026-08-31. CSV cru em `docs/origem/extracao.csv`.",
    "",
    "🚨 **As 17 funções tinham `EXECUTE` concedido a `anon`.** Duas são",
    "exploráveis de verdade — `get_llm_key` e `get_scraper_key` — porque não se",
    "amarram a `auth.uid()`. As demais, ou se auto-amarram corretamente, ou não",
    "devolvem nada sensível. Ver `04_Acesso_e_Seguranca.md` para o quadro",
    "completo.",
    "",
    "---",
    "",
]

vistos = set()
for b in blocos:
    nome = re.search(r"###\s+(\w+)", b)
    nome = nome.group(1) if nome else "?"
    if nome in notas and nome not in vistos:
        out.append(b.split("```")[0].rstrip())
        out.append("")
        out.append(notas[nome])
        out.append("")
        out.append("```sql" + b.split("```sql", 1)[1])
        vistos.add(nome)
    else:
        out.append(b)
    out.append("")

(BASE / "DB_FUNCOES.md").write_text("\n".join(out) + "\n", encoding="utf-8")

print("DB_CATALOGO.md:", len((BASE / "DB_CATALOGO.md").read_text().splitlines()), "linhas")
print("DB_FUNCOES.md :", len((BASE / "DB_FUNCOES.md").read_text().splitlines()), "linhas")
print("funcoes documentadas:", len(blocos), "notas aplicadas:", len(vistos))
