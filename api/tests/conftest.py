# -*- coding: utf-8 -*-
"""Base da suite da API do Concorrentes.

DUAS REGRAS QUE VALEM PARA TODO TESTE DESTE DIRETORIO:

1. **Nada de credito de terceiro.** Firecrawl, ScrapeCreators e Gemini sao
   substituidos por dublo em `sem_terceiros`, que e autouse. Um teste que
   gaste credito de verdade nao pode existir aqui: a suite roda muitas vezes
   por dia e o saldo do Firecrawl e mensal.

2. **Nada encosta no dado do dono.** Todo teste roda sob um usuario proprio,
   criado no `setup` e apagado no `teardown`. As chaves estrangeiras sao
   todas `ON DELETE CASCADE`, entao apagar o usuario leva junto concorrente,
   snapshot, mudanca, alerta e chave. O `usuario_de_teste` confere que levou.

O banco e o mesmo de producao porque o papel `concorrentes` nao tem
`CREATEDB` -- por isso o isolamento e por usuario, nao por base.
"""
import os
import sys
import uuid

import pytest

AQUI = os.path.dirname(os.path.abspath(__file__))
API = os.path.dirname(AQUI)
sys.path.insert(0, API)

import auth  # noqa: E402
import coletores  # noqa: E402
import db  # noqa: E402
import ia  # noqa: E402
import main  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

EMAIL_TESTE = "pytest@teste.local"


@pytest.fixture(scope="session")
def cliente():
    return TestClient(main.app)


@pytest.fixture()
def usuario_de_teste():
    """Cria um usuario so deste teste e o apaga no fim, com conferencia."""
    _apagar_por_email(EMAIL_TESTE)
    linha = db.um(
        "insert into public.usuario (email, nome, senha_hash) "
        "values (%s, %s, %s) returning id, email",
        (EMAIL_TESTE, "Usuario de teste", auth.hash_senha("senha-de-teste-123")),
    )
    db.executar(
        "insert into public.profiles (id, full_name, email, role, plan, url_quota) "
        "values (%s, %s, %s, 'admin', 'free', 50) on conflict (id) do nothing",
        (linha["id"], "Usuario de teste", EMAIL_TESTE),
    )
    yield linha

    sobrou = _apagar_por_email(EMAIL_TESTE)
    assert sobrou == 0, (
        "o teste deixou %d linha(s) para tras -- o CASCADE nao levou tudo" % sobrou
    )


def _apagar_por_email(email):
    """Apaga o usuario e devolve quantas linhas ficaram penduradas nele."""
    u = db.um("select id from public.usuario where email = %s", (email,))
    if not u:
        return 0
    db.executar("delete from public.usuario where id = %s", (u["id"],))
    restos = 0
    for tabela in (
        "competitors", "snapshots", "changes", "alerts", "swot_reports",
        "user_llm_keys", "user_llm_settings", "user_scraper_keys", "profiles",
    ):
        coluna = "id" if tabela == "profiles" else "user_id"
        restos += db.um(
            "select count(*) c from public.%s where %s = %%s" % (tabela, coluna),
            (u["id"],),
        )["c"]
    return restos


@pytest.fixture()
def cabecalho(usuario_de_teste):
    token = auth.gerar_token(usuario_de_teste["id"], usuario_de_teste["email"])[0]
    return {"Authorization": "Bearer " + token}


@pytest.fixture()
def concorrente(cliente, cabecalho):
    r = cliente.post(
        "/competitors",
        json={"name": "Pastelaria Velasco", "url": "pastelaria-velasco.teste"},
        headers=cabecalho,
    )
    assert r.status_code == 201, r.text
    return r.json()


# --------------------------------------------------------------- dublos
@pytest.fixture(autouse=True)
def sem_terceiros(monkeypatch):
    """Nenhum teste fala com Firecrawl, ScrapeCreators ou Gemini.

    Os dublos devolvem a MESMA forma que o real devolve -- foi o formato,
    nao a rede, que quebrou o produto antes (o `creativeId` do Google Ads e
    os modelos mortos do Gemini). Um dublo com forma errada esconderia
    exatamente a classe de defeito que a suite existe para pegar.
    """
    conteudo = [
        "# Pastelaria Velasco\n\nPastel de feira desde 1998.\n\n"
        "Combo familia por R$ 49,90. [Agendar reuniao](/contato)\n",
    ]

    def raspar_falso(user_id, url):
        return conteudo[0], {"title": "Pastelaria Velasco"}

    def gerar_falso(*a, **k):
        return {
            "strengths": [{"title": "Marca conhecida", "evidence": "site"}],
            "weaknesses": [], "opportunities": [], "threats": [],
        }

    monkeypatch.setattr(coletores, "raspar", raspar_falso)
    monkeypatch.setattr(ia, "gerar_json", gerar_falso, raising=False)
    return conteudo
