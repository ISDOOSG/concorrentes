#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Confere se o painel esta INTEIRO, sem abrir o navegador.

Nasceu da varredura de 03/09/2026, que achou quatro circuitos abertos ao
mesmo tempo -- codigo escrito, funcionando, e sem ninguem do outro lado:

  - `changes` era escrita a cada crawl e nao existia rota que a lesse
  - `POST /alerts/{id}/read` existia e nenhuma tela chamava
  - `GET /competitors/{id}/snapshots` existia e nenhuma tela chamava
  - o campo de busca do topo estava em 11 telas sem handler

Nada disso quebra teste, nao aparece no `npm run build` e nao derruba o
site. Aparece so quando alguem abre a tela e repara. Este script procura a
mesma classe de defeito em segundos.

Uso:
    python3 scripts/validar_integridade.py           # 0 = inteiro
    python3 scripts/validar_integridade.py --lista   # mostra tudo que achou
"""
import argparse
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(RAIZ, "src")
MAIN = os.path.join(RAIZ, "api", "main.py")

# O que e esperado ficar sem consumidor, com o motivo.
TOLERADOS_ENDPOINT = {
    "get /saude": "healthcheck: e chamado pelo systemd e pelo cron, nao pelo front",
    "get /competitors/{cid}/social/snapshots":
        "historico social: existe no servidor, a aba mostra so o ultimo. "
        "Entra em uso quando Social passar pelo DataProvider (Fase 2).",
}
TOLERADOS_TABELA = {
    "app_config": "herdada da Lovable, vazia; sai quando a limpeza for decidida",
}


def ler(caminho):
    with open(caminho, encoding="utf-8", errors="replace") as f:
        return f.read()


def arquivos_do_front():
    for dp, _dn, fn in os.walk(SRC):
        for n in fn:
            if n.endswith((".ts", ".tsx")):
                yield os.path.join(dp, n)


def texto_do_front(excluir=()):
    partes = []
    for p in arquivos_do_front():
        rel = os.path.relpath(p, SRC).replace("\\", "/")
        if any(rel.startswith(e) for e in excluir):
            continue
        partes.append(ler(p))
    return "\n".join(partes)


# --------------------------------------------------------------- verificacoes
def metodos_do_contrato():
    tipos = ler(os.path.join(SRC, "lib/data/types.ts"))
    m = re.search(r"export type DataProvider = \{(.*?)\n\};", tipos, re.S)
    if not m:
        return []
    return re.findall(r"^  ([a-zA-Z0-9_]+)\s*[(<]", m.group(1), re.M)


def verificar_contrato(problemas):
    """Todo provider implementa todo metodo, e todo metodo tem hook."""
    contrato = metodos_do_contrato()
    if not contrato:
        problemas.append(("contrato", "nao consegui ler o tipo DataProvider"))
        return contrato

    for nome in ("api", "mock"):
        p = os.path.join(SRC, "lib/data/providers/%s.ts" % nome)
        if not os.path.exists(p):
            problemas.append(("provider", "providers/%s.ts nao existe" % nome))
            continue
        impl = set(re.findall(r"^  (?:async )?([a-zA-Z0-9_]+)\s*[(:]", ler(p), re.M))
        for metodo in contrato:
            if metodo not in impl:
                problemas.append(
                    ("provider", "providers/%s.ts nao implementa %s()" % (nome, metodo))
                )

    hooks = texto_do_front(excluir=("lib/data/providers", "lib/data/types.ts"))
    for metodo in contrato:
        if not re.search(r"\bdata\.%s\s*\(" % re.escape(metodo), hooks):
            problemas.append(
                ("contrato", "%s() esta no contrato e nenhum hook o chama" % metodo)
            )
    return contrato


def verificar_hooks(problemas):
    """Hook exportado que nenhuma tela usa e circuito aberto."""
    dir_hooks = os.path.join(SRC, "lib/data/hooks")
    if not os.path.isdir(dir_hooks):
        return
    exportados = {}
    for n in sorted(os.listdir(dir_hooks)):
        if not n.endswith(".ts"):
            continue
        for h in re.findall(r"export function (use[A-Za-z0-9_]+)", ler(os.path.join(dir_hooks, n))):
            exportados[h] = n

    consumidores = texto_do_front(excluir=("lib/data/hooks",))
    for hook, arquivo in exportados.items():
        if not re.search(r"\b%s\b" % hook, consumidores):
            problemas.append(("hook", "%s (%s) nao e usado por nenhuma tela" % (hook, arquivo)))


def verificar_endpoints(problemas):
    """Endpoint sem consumidor no front e trabalho que ninguem alcanca."""
    main = ler(MAIN)
    eps = re.findall(r'@app\.(get|post|put|patch|delete)\("([^"]+)"', main)
    front = texto_do_front()
    for metodo, caminho in eps:
        chave = "%s %s" % (metodo, caminho)
        if chave in TOLERADOS_ENDPOINT:
            continue
        # O front monta os caminhos com template literal --
        # `/competitors/${id}/seo`. Comparar so o ultimo pedaco dava falso
        # positivo em caminho curto ("ads", "seo"); o certo e montar o
        # padrao inteiro, trocando cada {parametro} por "qualquer coisa".
        padrao = re.escape(caminho)
        padrao = re.sub(r"\\{[a-zA-Z_]+\\}", r"[^\"'`/]+", padrao)
        if not re.search(padrao, front):
            problemas.append(("endpoint", "%s nao tem consumidor no front" % chave))


def verificar_tabelas(problemas):
    """Tabela escrita e nunca lida e dado que ninguem ve -- foi o caso da
    `changes` desde o inicio do produto."""
    sys.path.insert(0, os.path.join(RAIZ, "api"))
    try:
        import db
    except Exception as e:  # noqa: BLE001
        problemas.append(("banco", "nao consegui abrir o banco: %s" % e))
        return

    codigo = ""
    for n in ("main.py", "coletores.py", "ia.py", "auth.py"):
        p = os.path.join(RAIZ, "api", n)
        if os.path.exists(p):
            codigo += ler(p)

    tabelas = [
        r["table_name"]
        for r in db.varios(
            "select table_name from information_schema.tables "
            "where table_schema = 'public' and table_type = 'BASE TABLE' order by 1"
        )
    ]
    for t in tabelas:
        if t in TOLERADOS_TABELA:
            continue
        le = re.search(r"from public\.%s\b|join public\.%s\b" % (t, t), codigo)
        grava = re.search(
            r"insert into public\.%s\b|update public\.%s\b|delete from public\.%s\b" % (t, t, t),
            codigo,
        )
        if grava and not le:
            problemas.append(("tabela", "%s e escrita e nunca lida" % t))
        elif not grava and not le:
            problemas.append(("tabela", "%s nao e tocada por ninguem" % t))


def verificar_controles_inertes(problemas):
    """Botao sem `onClick` e campo sem handler: o usuario clica e nada
    acontece, e nenhum teste ou build percebe."""
    for p in arquivos_do_front():
        if not p.endswith(".tsx"):
            continue
        rel = os.path.relpath(p, SRC).replace("\\", "/")
        # O proprio teste monta <button> sem handler de proposito, para
        # afirmar que o botao inerte SUMIU. Varrer o teste e se morder.
        if rel.startswith("testes/") or ".test." in rel:
            continue
        texto = ler(p)
        for m in re.finditer(r"<button\b((?:[^>]|\n)*?)>", texto):
            atributos = m.group(1)
            if "onClick" in atributos or "type=\"submit\"" in atributos:
                continue
            linha = texto[: m.start()].count("\n") + 1
            problemas.append(
                ("inerte", "%s:%d botao sem onClick nem submit" % (rel, linha))
            )


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--lista", action="store_true", help="mostra tudo que achou")
    a = ap.parse_args()

    problemas = []
    verificar_contrato(problemas)
    verificar_hooks(problemas)
    verificar_endpoints(problemas)
    verificar_tabelas(problemas)
    verificar_controles_inertes(problemas)

    if not problemas:
        print("painel inteiro: contrato, hooks, endpoints, tabelas e controles conferidos")
        return 0

    por_tipo = {}
    for tipo, msg in problemas:
        por_tipo.setdefault(tipo, []).append(msg)

    print("ACHADOS: %d" % len(problemas))
    for tipo in sorted(por_tipo):
        itens = por_tipo[tipo]
        print("\n[%s] %d" % (tipo, len(itens)))
        for msg in (itens if a.lista else itens[:8]):
            print("  - %s" % msg)
        if not a.lista and len(itens) > 8:
            print("  ... mais %d (use --lista)" % (len(itens) - 8))
    return 1


if __name__ == "__main__":
    sys.exit(main())
