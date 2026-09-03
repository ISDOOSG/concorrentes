#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cria e apaga o usuario efemero do teste de navegador.

POR QUE ELE E EFEMERO: o teste roda contra o site PUBLICO. Uma conta de
teste esquecida no banco e uma porta aberta para qualquer um que descubra a
senha. Entao ela nasce com senha aleatoria a cada execucao, vive o tempo do
teste e e apagada no fim -- e o `apagar` confere que o CASCADE levou tudo.

Uso:
    python3 scripts/usuario_de_teste.py criar    # imprime a senha, so isso
    python3 scripts/usuario_de_teste.py apagar
"""
import os
import secrets
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(AQUI), "api"))

import auth  # noqa: E402
import db  # noqa: E402

# NAO usar TLD reservado (.local, .test, .invalid, .example): o EmailStr
# do Pydantic bloqueia por design, e o login falha antes de conferir a
# senha -- achado rodando esta propria suite em 03/09.
EMAIL = "playwright-teste@imagohub.com.br"


def apagar():
    u = db.um("select id from public.usuario where email = %s", (EMAIL,))
    if not u:
        return 0
    db.executar("delete from public.usuario where id = %s", (u["id"],))
    restos = 0
    for tabela, coluna in (
        ("competitors", "user_id"), ("snapshots", "user_id"),
        ("changes", "user_id"), ("alerts", "user_id"),
        ("swot_reports", "user_id"), ("user_llm_keys", "user_id"),
        ("user_llm_settings", "user_id"), ("user_scraper_keys", "user_id"),
        ("profiles", "id"),
    ):
        restos += db.um(
            "select count(*) c from public.%s where %s = %%s" % (tabela, coluna),
            (u["id"],),
        )["c"]
    return restos


def criar():
    apagar()
    senha = secrets.token_urlsafe(18)
    linha = db.um(
        "insert into public.usuario (email, nome, senha_hash) "
        "values (%s, %s, %s) returning id",
        (EMAIL, "Teste de navegador", auth.hash_senha(senha)),
    )
    db.executar(
        "insert into public.profiles (id, full_name, email, role, plan, url_quota) "
        "values (%s, %s, %s, 'admin', 'free', 5) on conflict (id) do nothing",
        (linha["id"], "Teste de navegador", EMAIL),
    )
    # A senha vai para o stdout porque o invocador a captura para o ambiente
    # do Playwright. Nunca e gravada em arquivo nem em log.
    print(senha)


if __name__ == "__main__":
    acao = sys.argv[1] if len(sys.argv) > 1 else ""
    if acao == "criar":
        criar()
    elif acao == "apagar":
        restos = apagar()
        if restos:
            print("ATENCAO: %d linha(s) sobraram do usuario de teste" % restos,
                  file=sys.stderr)
            sys.exit(1)
        print("usuario de teste apagado")
    else:
        print(__doc__)
        sys.exit(2)
