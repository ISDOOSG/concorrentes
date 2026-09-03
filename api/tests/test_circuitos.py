# -*- coding: utf-8 -*-
"""Testes dos circuitos que estavam ABERTOS ate 03/09/2026.

Cada teste aqui existe por causa de um defeito real, encontrado na varredura
de 03/09, e o nome diz qual. Nao sao testes de cobertura: sao a rede que
impede a volta de um defeito que ja aconteceu.
"""
import db


def _dois_snapshots(concorrente):
    """Uma mudanca exige DE e PARA: `changes.from_snapshot_id` e NOT NULL.

    Descoberto pela propria suite na primeira execucao. E coerente com o
    produto: a primeira coleta nunca gera timeline, porque nao ha com o que
    comparar -- o esquema so nao deixava isso implicito em lugar nenhum.
    """
    ids = []
    for i, h in enumerate(("hash-antes", "hash-depois")):
        ids.append(
            db.um(
                "insert into public.snapshots (user_id, competitor_id, "
                "content_hash, raw_text, source) "
                "values (%s, %s, %s, %s, 'direct') returning id",
                (concorrente["user_id"], concorrente["id"], h, "texto %d" % i),
            )["id"]
        )
    return ids


# ------------------------------------------------------- mudancas (Timeline)
def test_mudancas_tem_rota_de_leitura(cliente, cabecalho, concorrente):
    """A tabela `changes` era escrita pelo crawl e NUNCA lida.

    Nao havia rota, metodo de contrato nem hook. A aba Timeline mostrava
    vitrine fixa ou "aguardando proximo crawl" para sempre.
    """
    r = cliente.get("/competitors/%s/changes" % concorrente["id"], headers=cabecalho)
    assert r.status_code == 200
    assert r.json() == []


def test_mudanca_gravada_aparece_na_rota(cliente, cabecalho, concorrente):
    antes, depois = _dois_snapshots(concorrente)
    db.executar(
        "insert into public.changes (user_id, competitor_id, from_snapshot_id, "
        "to_snapshot_id, change_type, severity, summary, diff) "
        "values (%s, %s, %s, %s, 'price', 'critical', 'Preco subiu', %s)",
        (concorrente["user_id"], concorrente["id"], antes, depois,
         '{"field": "prices", "added": ["R$ 59,90"], "removed": ["R$ 49,90"]}'),
    )
    r = cliente.get("/competitors/%s/changes" % concorrente["id"], headers=cabecalho)
    assert r.status_code == 200
    corpo = r.json()
    assert len(corpo) == 1
    assert corpo[0]["change_type"] == "price"
    assert corpo[0]["severity"] == "critical"
    assert corpo[0]["diff"]["added"] == ["R$ 59,90"]


def test_mudanca_de_outro_usuario_nao_vaza(cliente, cabecalho, concorrente):
    """A rota nova precisa do mesmo `where user_id` que o resto da API."""
    r = cliente.get(
        "/competitors/00000000-0000-0000-0000-000000000000/changes",
        headers=cabecalho,
    )
    assert r.status_code == 404


# --------------------------------------------------- vocabulario do banco
def test_comparador_so_gera_valores_que_o_banco_aceita():
    """O defeito de tres meses: as edge functions gravavam `pricing`/`high`,
    e o CHECK so aceita `price|copy|feature|design|traffic` e
    `info|warning|critical`. TODA insercao violava, em silencio, e ninguem
    viu porque um segundo crawl nunca aconteceu."""
    import coletores

    antes = {"h1": "Antes", "ctas": ["Comprar"], "prices": ["R$ 10"]}
    depois = {"h1": "Depois", "ctas": ["Assinar"], "prices": ["R$ 20"]}
    mudancas = coletores.comparar(antes, depois, False)
    assert mudancas, "o comparador nao gerou mudanca nenhuma"

    tipos_ok = {"price", "copy", "feature", "design", "traffic"}
    graus_ok = {"info", "warning", "critical"}
    for m in mudancas:
        assert m["change_type"] in tipos_ok, m["change_type"]
        assert m["severity"] in graus_ok, m["severity"]


def test_check_do_banco_continua_o_que_o_comparador_espera():
    """Se alguem afrouxar ou mudar o CHECK, o teste acima vira teatro."""
    defs = [
        r["d"]
        for r in db.varios(
            "select pg_get_constraintdef(oid) d from pg_constraint "
            "where conrelid = 'public.changes'::regclass and contype = 'c'"
        )
    ]
    texto = " ".join(defs)
    for v in ("price", "copy", "feature", "design", "traffic"):
        assert "'%s'" % v in texto
    for v in ("info", "warning", "critical"):
        assert "'%s'" % v in texto


# ------------------------------------------------------------- alertas
def test_alerta_pode_ser_marcado_como_lido(cliente, cabecalho, concorrente):
    """Existia a rota e existia o hook -- e nenhuma tela chamava.

    O contador da barra lateral somava o TOTAL, entao so crescia.
    """
    antes, depois = _dois_snapshots(concorrente)
    mud = db.um(
        "insert into public.changes (user_id, competitor_id, from_snapshot_id, "
        "to_snapshot_id, change_type, severity, summary, diff) "
        "values (%s, %s, %s, %s, 'copy', 'warning', 'CTA mudou', %s) returning id",
        (concorrente["user_id"], concorrente["id"], antes, depois,
         '{"field": "ctas"}'),
    )
    # o gatilho on_change_inserted cria o alerta sozinho
    alerta = db.um(
        "select id, read_at from public.alerts where change_id = %s", (mud["id"],)
    )
    assert alerta is not None, "o gatilho on_change_inserted nao criou o alerta"
    assert alerta["read_at"] is None

    r = cliente.post("/alerts/%s/read" % alerta["id"], headers=cabecalho)
    assert r.status_code == 204

    depois = db.um("select read_at from public.alerts where id = %s", (alerta["id"],))
    assert depois["read_at"] is not None


def test_filtro_de_nao_lidos(cliente, cabecalho, concorrente):
    antes, depois = _dois_snapshots(concorrente)
    for i in range(2):
        db.executar(
            "insert into public.changes (user_id, competitor_id, from_snapshot_id, "
            "to_snapshot_id, change_type, severity, summary, diff) "
            "values (%s, %s, %s, %s, 'copy', 'warning', %s, %s)",
            (concorrente["user_id"], concorrente["id"], antes, depois,
             "mudanca %d" % i, '{"field": "ctas"}'),
        )

    todos = cliente.get("/alerts", headers=cabecalho).json()
    assert len(todos) == 2

    cliente.post("/alerts/%s/read" % todos[0]["id"], headers=cabecalho)
    nao_lidos = cliente.get("/alerts?apenas_nao_lidos=true", headers=cabecalho).json()
    assert len(nao_lidos) == 1


# --------------------------------------------------- piso de chave do projeto
def test_scraper_keys_mostra_a_chave_do_projeto(cliente, cabecalho):
    """A tela dizia "nao configurado" com o servico funcionando.

    `coletores.chave()` usa a chave do `.env` quando o usuario nao tem BYOK,
    e a rota nao contava isso para ninguem.
    """
    linhas = cliente.get("/scraper-keys", headers=cabecalho).json()
    por_provedor = {l["provider"]: l for l in linhas}
    import coletores

    if coletores.CHAVE_FIRECRAWL:
        assert por_provedor["firecrawl"]["source"] == "projeto"
        assert por_provedor["firecrawl"]["key_hint"]
        assert por_provedor["firecrawl"]["created_at"] is None


def test_chave_do_usuario_tem_precedencia_sobre_a_do_projeto(cliente, cabecalho):
    cliente.post(
        "/scraper-keys",
        json={"provider": "firecrawl", "key": "fc-chave-de-teste-1234", "source": "manual"},
        headers=cabecalho,
    )
    linhas = cliente.get("/scraper-keys", headers=cabecalho).json()
    fire = [l for l in linhas if l["provider"] == "firecrawl"]
    assert len(fire) == 1, "a chave do projeto duplicou a linha do usuario"
    assert fire[0]["source"] == "manual"
    assert fire[0]["key_hint"] == "1234"


def test_llm_settings_mostra_o_piso_do_projeto(cliente, cabecalho):
    corpo = cliente.get("/llm/settings", headers=cabecalho).json()
    import ia

    if ia.CHAVE_SERVICO:
        assert corpo["hasKeyByProvider"]["gemini"]["source"] == "projeto"
        assert corpo["hasKeyByProvider"]["gemini"]["createdAt"] is None


# ------------------------------------------------------- primeiro crawl
def test_cadastro_nasce_enfileirado(cliente, cabecalho):
    """Nascia 'never' e ficava parado ate a madrugada, sem a tela dizer.

    O gatilho da Lovable que fazia isso foi derrubado em 02/09 (chamava
    `bootstrap-app-config`, que nao existe mais) e nada ocupou o lugar.
    """
    r = cliente.post(
        "/competitors",
        json={"name": "Teste Fila", "url": "fila.teste"},
        headers=cabecalho,
    )
    assert r.status_code == 201
    assert r.json()["crawl_status"] == "queued"


def test_url_ganha_esquema(cliente, cabecalho):
    r = cliente.post(
        "/competitors", json={"name": "", "url": "semesquema.teste"}, headers=cabecalho
    )
    assert r.status_code == 201
    assert r.json()["url"] == "https://semesquema.teste"
    assert r.json()["name"] == "semesquema.teste"


def test_severidade_info_nao_vira_alerta(cliente, cabecalho, concorrente):
    """O gatilho `on_change_inserted` ignora `info` DE PROPOSITO.

    Descoberto pela propria suite: um teste que gravava mudanca `info`
    esperava alerta e recebeu zero. Nao e defeito, e o desenho -- e agora
    esta escrito em algum lugar que quebra se alguem mudar.
    """
    antes, depois = _dois_snapshots(concorrente)
    db.executar(
        "insert into public.changes (user_id, competitor_id, from_snapshot_id, "
        "to_snapshot_id, change_type, severity, summary, diff) "
        "values (%s, %s, %s, %s, 'copy', 'info', 'ruido', %s)",
        (concorrente["user_id"], concorrente["id"], antes, depois,
         '{"field": "ctas"}'),
    )
    assert cliente.get("/alerts", headers=cabecalho).json() == []
