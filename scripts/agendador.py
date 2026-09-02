#!/usr/bin/env python3
"""Agendador do Concorrentes -- substitui `daily-crawl-scheduler` e
`daily-ads-scheduler`, que eram cron da Supabase.

POR QUE CHAMA A PROPRIA API, e nao o banco direto:
  a rota `/crawl` ja faz a cadeia inteira -- trava de idempotencia, snapshot,
  diff, gravacao das mudancas (e o gatilho que gera alerta), e o estado do
  concorrente em caso de falha. Duplicar isso aqui criaria dois lugares para
  a mesma regra, e um deles envelheceria. O token de cada dono e emitido pelo
  mesmo `auth` do servico.

SEQUENCIAL DE PROPOSITO. A original rodava 5 por usuario em paralelo, contra
uma infra elastica. Aqui o credito e finito (Firecrawl 1000/mes,
ScrapeCreators 100) e a VPS e compartilhada com outros seis projetos: uma
rajada de crawls competiria com eles por nada. Um de cada vez, com pausa.

Uso:
    venv/bin/python scripts/agendador.py crawl
    venv/bin/python scripts/agendador.py ads
    venv/bin/python scripts/agendador.py crawl --seco     (nao chama nada)
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "api"))

import auth  # noqa: E402
import db  # noqa: E402

BASE = "http://127.0.0.1:8012"
PAUSA_SEG = 3


def agora():
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S")


def log(msg):
    print("%s  %s" % (agora(), msg), flush=True)


def elegiveis(tipo):
    """Mesma regra das edge functions originais.

    crawl: todo concorrente ativo.
    ads:   ativo E com pagina do Facebook ou anunciante do Google vinculado --
           sem id, `/ads/fetch` responderia 409 e gastaria uma chamada a toa.
    """
    if tipo == "crawl":
        return db.varios(
            "select c.id, c.user_id, c.name, u.email "
            "from public.competitors c join public.usuario u on u.id = c.user_id "
            "where c.status = 'active' order by c.created_at"
        )
    return db.varios(
        "select c.id, c.user_id, c.name, u.email "
        "from public.competitors c join public.usuario u on u.id = c.user_id "
        "where c.status = 'active' "
        "and (c.facebook_page_id is not null or c.google_advertiser_id is not null) "
        "order by c.created_at"
    )


def chamar(caminho, token):
    req = urllib.request.Request(
        BASE + caminho, method="POST",
        headers={"Authorization": "Bearer " + token,
                 "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            corpo = r.read().decode("utf-8")
            return r.status, (json.loads(corpo) if corpo else None)
    except urllib.error.HTTPError as e:
        corpo = e.read().decode("utf-8")
        try:
            return e.code, json.loads(corpo)
        except ValueError:
            return e.code, {"detail": corpo[:200]}
    except urllib.error.URLError as e:
        return 0, {"detail": "servico fora do ar: %s" % e.reason}


def principal():
    p = argparse.ArgumentParser(description="Agendador do Concorrentes")
    p.add_argument("tipo", choices=["crawl", "ads"])
    p.add_argument("--seco", action="store_true",
                   help="lista o que faria e nao chama nada")
    a = p.parse_args()

    alvos = elegiveis(a.tipo)
    log("agendador %s: %d concorrente(s) elegivel(is)" % (a.tipo, len(alvos)))
    if not alvos:
        log("nada a fazer")
        return 0

    if a.seco:
        for c in alvos:
            log("  [seco] %s (%s)" % (c["name"], c["id"]))
        return 0

    rota = "/crawl" if a.tipo == "crawl" else "/ads/fetch"
    ok = falhou = pulou = 0
    tokens = {}

    for c in alvos:
        uid = str(c["user_id"])
        if uid not in tokens:
            tokens[uid] = auth.gerar_token(c["user_id"], c["email"])[0]
        codigo, corpo = chamar("/competitors/%s%s" % (c["id"], rota), tokens[uid])
        if codigo in (200, 201):
            ok += 1
            log("  ok    %-28s %s" % (c["name"][:28],
                                      json.dumps(corpo, ensure_ascii=False)[:110]))
        elif codigo == 429:
            # a trava de idempotencia de 60s: outro disparo acabou de rodar.
            pulou += 1
            log("  pulou %-28s %s" % (c["name"][:28], (corpo or {}).get("detail")))
        else:
            falhou += 1
            log("  FALHA %-28s HTTP %s %s" % (c["name"][:28], codigo,
                                              (corpo or {}).get("detail")))
        time.sleep(PAUSA_SEG)

    log("fim: %d ok, %d pulado(s), %d falha(s), de %d" % (ok, pulou, falhou, len(alvos)))
    # Codigo de saida diferente de zero so quando TUDO falhou -- o cron nao
    # deve gritar por um concorrente que bloqueou scraping.
    return 1 if (falhou and not ok) else 0


if __name__ == "__main__":
    sys.exit(principal())
