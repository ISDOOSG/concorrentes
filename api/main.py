"""API do Concorrentes -- a base que substitui a Supabase.

DECISAO DE PROJETO, e o motivo dela:
  A autorizacao NAO fica no banco. Toda consulta que toca dado de cliente
  carrega `where user_id = %s` explicito, vindo do JWT.
  Por que: no schema portado para a VPS, `auth.uid()` e um stub que devolve
  NULL (as policies de RLS da Supabase nao vieram junto), e as funcoes
  `get_llm_key`/`get_scraper_key` foram preservadas verbatim COM a falha de
  dono que a auditoria de 31/08 achou -- elas aceitam qualquer _user_id.
  Este servico nao chama nenhuma das duas. Ver docs/04_Acesso_e_Seguranca.md,
  secao 8: "nao e corrigir, e desenhar sem a superficie".

O QUE ESTA PRONTO: identidade, CRUD e leitura -- tudo que so depende do
Postgres local.
O QUE RESPONDE 501: as operacoes que dependem de terceiro (Firecrawl,
ScrapeCreators, LLM). Falham alto e dizem o que falta, em vez de devolver
vazio e parecer que funcionaram.
"""
import json
import re
import uuid

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field

import auth
import coletores
import db
import ia

app = FastAPI(title="Concorrentes API", version="0.1.0")

ORIGENS = [o.strip() for o in db.CFG.get(
    "CONCORRENTES_CORS_ORIGENS",
    "http://localhost:3000,https://concorrentes.imagohub.com.br",
).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGENS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(coletores.ErroExterno)
def _falha_externa(request, exc):
    """Falha de Firecrawl/ScrapeCreators vira mensagem legivel, nao 500."""
    return JSONResponse(status_code=exc.status, content={"detail": exc.mensagem})


@app.exception_handler(ia.ErroIA)
def _falha_de_ia(request, exc):
    """Falha de IA vira mensagem que o usuario le, nao 500 generico."""
    return JSONResponse(status_code=exc.status, content={"detail": exc.mensagem})


CHAVE_CRIPTO = db.CFG.get("CONCORRENTES_CRIPTO_CHAVE")
if not CHAVE_CRIPTO:
    raise RuntimeError(
        "CONCORRENTES_CRIPTO_CHAVE ausente em api/.env -- sem ela as chaves "
        "BYOK dos clientes ficariam em texto puro. O servico nao sobe."
    )

FALTA_TERCEIRO = (
    "Operacao ainda nao portada da Supabase. Depende de servico externo "
    "({servico}), que e a segunda camada do desacoplamento."
)


# ----------------------------------------------------------------- modelos
class Credenciais(BaseModel):
    email: EmailStr
    senha: str = Field(min_length=8)
    nome: str | None = None


class NovoConcorrente(BaseModel):
    # name pode vir vazio -- criar_concorrente cai pro dominio da url nesse
    # caso (mesma regra que o front tinha antes de virar validacao server-side)
    name: str = ""
    url: str = Field(min_length=1)


class VinculoAds(BaseModel):
    facebookPageId: str | None = None
    googleAdvertiserId: str | None = None


class EscolhaProvider(BaseModel):
    provider: str


class EscolhaModelo(BaseModel):
    useCase: str
    modelId: str | None = None


class ChaveLLM(BaseModel):
    provider: str
    key: str = Field(min_length=8)


class ChaveScraper(BaseModel):
    provider: str
    key: str = Field(min_length=8)
    source: str = "manual"


# ------------------------------------------------------------------- saude
@app.get("/saude")
def saude():
    linha = db.um("select count(*) as n from public.competitors")
    return {"ok": True, "banco": "concorrentes", "competitors": linha["n"]}


# --------------------------------------------------------------- identidade
@app.post("/auth/signup", status_code=201)
def signup(c: Credenciais):
    # Cadastro direto SO para o primeiro usuario (bootstrap do admin).
    # Depois disso, o unico jeito de entrar e por convite -- mesma politica
    # que ja estava configurada na Supabase (o front trata o erro
    # 'signup_by_invite_only' desde antes desta API existir; replicado
    # aqui, nao inventado).
    total = db.um("select count(*) as n from public.profiles")["n"]
    if total > 0:
        raise HTTPException(
            403,
            "O cadastro direto esta desativado: o acesso e por convite. "
            "Peca um convite ao administrador da plataforma.",
        )
    ja = db.um("select id from public.usuario where lower(email) = lower(%s)", (c.email,))
    if ja:
        raise HTTPException(409, "Ja existe uma conta com esse e-mail.")
    novo = db.um(
        "insert into public.usuario (email, nome, senha_hash) "
        "values (%s, %s, %s) returning id, email, nome",
        (c.email, c.nome or c.email.split("@")[0], auth.hash_senha(c.senha)),
    )
    db.executar(
        "insert into public.profiles (id, full_name, email, role) "
        "values (%s, %s, %s, 'admin')",
        (novo["id"], novo["nome"], novo["email"]),
    )
    token, expira = auth.gerar_token(novo["id"], novo["email"])
    return {"token": token, "expiraEm": expira, "usuario": novo}


@app.post("/auth/login")
def login(c: Credenciais):
    u = db.um(
        "select id, email, nome, senha_hash, ativo from public.usuario "
        "where lower(email) = lower(%s)",
        (c.email,),
    )
    if not u or not auth.confere_senha(c.senha, u["senha_hash"]):
        raise HTTPException(401, "E-mail ou senha incorretos.")
    if not u["ativo"]:
        raise HTTPException(403, "Conta desativada.")
    token, expira = auth.gerar_token(u["id"], u["email"])
    return {
        "token": token,
        "expiraEm": expira,
        "usuario": {"id": u["id"], "email": u["email"], "nome": u["nome"]},
    }


@app.get("/auth/me")
def me(u=Depends(auth.usuario_atual)):
    p = db.um(
        "select plan, url_quota, role, full_name from public.profiles where id = %s",
        (u["id"],),
    )
    return {"usuario": u, "perfil": p}


# -------------------------------------------------------------- concorrentes
@app.get("/competitors")
def listar_concorrentes(u=Depends(auth.usuario_atual)):
    return db.varios(
        "select * from public.competitors where user_id = %s order by created_at desc",
        (u["id"],),
    )


@app.get("/competitors/{cid}")
def ver_concorrente(cid: uuid.UUID, u=Depends(auth.usuario_atual)):
    linha = db.um(
        "select * from public.competitors where id = %s and user_id = %s",
        (str(cid), u["id"]),
    )
    if not linha:
        raise HTTPException(404, "Concorrente nao encontrado.")
    return linha


@app.post("/competitors", status_code=201)
def criar_concorrente(c: NovoConcorrente, u=Depends(auth.usuario_atual)):
    quota = db.um("select url_quota from public.profiles where id = %s", (u["id"],))
    usados = db.um(
        "select count(*) as n from public.competitors where user_id = %s", (u["id"],)
    )["n"]
    if quota and usados >= quota["url_quota"]:
        limite = quota["url_quota"]
        raise HTTPException(
            403, "Voce atingiu o limite de " + str(limite) + " concorrentes do seu plano."
        )
    # normalizacao que antes vivia no client (providers/supabase.ts,
    # createCompetitor) -- movida pro servidor pra nao depender de cada
    # consumidor da API repetir a mesma regra.
    url = c.url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    dominio = url.split("://", 1)[-1].split("/", 1)[0]
    nome = c.name.strip() or dominio
    return db.um(
        "insert into public.competitors (user_id, name, url) "
        "values (%s, %s, %s) returning *",
        (u["id"], nome, url),
    )


@app.patch("/competitors/{cid}/status")
def alternar_status(cid: uuid.UUID, u=Depends(auth.usuario_atual)):
    linha = db.um(
        "update public.competitors "
        "set status = case when status = 'active' then 'paused' else 'active' end "
        "where id = %s and user_id = %s returning *",
        (str(cid), u["id"]),
    )
    if not linha:
        raise HTTPException(404, "Concorrente nao encontrado.")
    return linha


@app.delete("/competitors/{cid}", status_code=204)
def apagar_concorrente(cid: uuid.UUID, u=Depends(auth.usuario_atual)):
    n = db.executar(
        "delete from public.competitors where id = %s and user_id = %s",
        (str(cid), u["id"]),
    )
    if not n:
        raise HTTPException(404, "Concorrente nao encontrado.")


@app.patch("/competitors/{cid}/ads-link", status_code=204)
def vincular_ads(cid: uuid.UUID, v: VinculoAds, u=Depends(auth.usuario_atual)):
    n = db.executar(
        "update public.competitors set facebook_page_id = %s, "
        "google_advertiser_id = %s where id = %s and user_id = %s",
        (v.facebookPageId, v.googleAdvertiserId, str(cid), u["id"]),
    )
    if not n:
        raise HTTPException(404, "Concorrente nao encontrado.")


@app.post("/competitors/{cid}/crawl", status_code=201)
def disparar_crawl(cid: uuid.UUID, u=Depends(auth.usuario_atual)):
    """Porta a edge function `crawl-competitor`.

    Faz a cadeia inteira que os gatilhos do banco faziam por `pg_net`:
    raspa, grava snapshot, compara com o anterior e grava as mudancas. Os
    alertas NAO sao inseridos aqui -- o gatilho `on_change_inserted` ja o faz
    dentro do banco, e inserir dos dois lados duplicaria todo alerta.
    """
    comp = db.um(
        "select id, name, url from public.competitors where id = %s and user_id = %s",
        (str(cid), u["id"]),
    )
    if not comp:
        raise HTTPException(404, "Concorrente nao encontrado.")

    # Trava de idempotencia herdada da original: credito de Firecrawl e
    # finito, e dois cliques seguidos nao podem custar dois crawls.
    recente = db.um(
        "select id from public.snapshots where competitor_id = %s "
        "and crawled_at > now() - interval '60 seconds' limit 1",
        (str(cid),),
    )
    if recente:
        raise HTTPException(
            429, "Ja houve um crawl deste concorrente ha menos de 1 minuto."
        )

    db.executar(
        "update public.competitors set crawl_status = 'running', "
        "crawl_started_at = now(), crawl_error = null where id = %s",
        (str(cid),),
    )
    try:
        markdown, meta = coletores.raspar(u["id"], comp["url"])
    except coletores.ErroExterno as e:
        db.executar(
            "update public.competitors set crawl_status = 'failed', "
            "crawl_error = %s where id = %s",
            (e.mensagem[:500], str(cid)),
        )
        raise

    estruturado = coletores.extrair(markdown)
    impressao = coletores.impressao(markdown)

    anterior = db.um(
        "select id, content_hash, structured_data from public.snapshots "
        "where competitor_id = %s order by crawled_at desc limit 1",
        (str(cid),),
    )

    novo = db.um(
        "insert into public.snapshots (user_id, competitor_id, content_hash, "
        "raw_text, structured_data, source) values (%s, %s, %s, %s, %s, 'firecrawl') "
        "returning id",
        (u["id"], str(cid), impressao, markdown,
         json.dumps(estruturado, ensure_ascii=False)),
    )

    mudancas = []
    if anterior:
        mudancas = coletores.comparar(
            anterior["structured_data"] or {},
            estruturado,
            anterior["content_hash"] == impressao,
        )
        for m in mudancas:
            db.executar(
                "insert into public.changes (user_id, competitor_id, "
                "from_snapshot_id, to_snapshot_id, change_type, severity, "
                "summary, diff) values (%s, %s, %s, %s, %s, %s, %s, %s)",
                (u["id"], str(cid), anterior["id"], novo["id"],
                 m["change_type"], m["severity"], m["summary"][:500],
                 json.dumps(m["diff"], ensure_ascii=False)),
            )

    db.executar(
        "update public.competitors set crawl_status = 'success', "
        "crawl_error = null, last_crawled_at = now() where id = %s",
        (str(cid),),
    )
    return {
        "snapshot_id": novo["id"],
        "titulo": meta.get("title"),
        "caracteres": len(markdown),
        "precos_encontrados": len(estruturado["prices"]),
        "mudancas_detectadas": len(mudancas),
        "primeiro_crawl": anterior is None,
    }


# -------------------------------------------------------------------- alertas
@app.get("/alerts")
def listar_alertas(u=Depends(auth.usuario_atual)):
    # 'change' vem ANINHADO de proposito -- e o formato que o join do
    # supabase-js produzia (select "...,change:changes(...)"), e os
    # adaptadores do front (adaptAlert, importados de providers/supabase.ts)
    # esperam exatamente essa forma. Achatar aqui quebraria o mapeamento de
    # severity/change_type que o front ja faz.
    linhas = db.varios(
        "select a.id, a.channel, a.read_at, a.created_at, "
        "c.competitor_id, c.severity, c.summary, c.change_type "
        "from public.alerts a "
        "left join public.changes c on c.id = a.change_id "
        "where a.user_id = %s order by a.created_at desc limit 200",
        (u["id"],),
    )
    saida = []
    for l in linhas:
        tem_change = l["competitor_id"] is not None
        saida.append({
            "id": l["id"],
            "channel": l["channel"],
            "read_at": l["read_at"],
            "created_at": l["created_at"],
            "change": {
                "competitor_id": l["competitor_id"],
                "severity": l["severity"],
                "summary": l["summary"],
                "change_type": l["change_type"],
            } if tem_change else None,
        })
    return saida


@app.post("/alerts/{aid}/read", status_code=204)
def marcar_lido(aid: uuid.UUID, u=Depends(auth.usuario_atual)):
    n = db.executar(
        "update public.alerts set read_at = now() where id = %s and user_id = %s",
        (str(aid), u["id"]),
    )
    if not n:
        raise HTTPException(404, "Alerta nao encontrado.")


# ----------------------------------------------------------------------- swot
@app.get("/competitors/{cid}/swot")
def ver_swot(cid: uuid.UUID, u=Depends(auth.usuario_atual)):
    linha = db.um(
        "select * from public.swot_reports where competitor_id = %s and user_id = %s "
        "order by generated_at desc limit 1",
        (str(cid), u["id"]),
    )
    if not linha:
        raise HTTPException(404, "Nenhum SWOT gerado para este concorrente ainda.")
    return linha


SWOT_SISTEMA = """Você é um analista sênior de inteligência competitiva.
Gere uma análise SWOT em português do Brasil sobre um concorrente, usando APENAS os dados fornecidos.
Para cada quadrante (Forças, Fraquezas, Oportunidades, Ameaças), produza 3 a 4 itens.
Cada item tem:
- title: até 6 palavras, direto e específico
- evidence: 1 a 2 frases citando dado concreto extraído do contexto (preço, headline, CTA, anúncio, número de seguidores, etc.). Não invente dados que não estão no contexto.
Retorne APENAS o JSON no formato { strengths:[...], weaknesses:[...], opportunities:[...], threats:[...] }."""

QUADRANTES = ("strengths", "weaknesses", "opportunities", "threats")


def _contexto_swot(cid, user_id, comp):
    """Monta o prompt com o que o banco tem hoje. Devolve (texto, tem_dado)."""
    linhas = ["Concorrente: %s" % comp["name"], "URL: %s" % comp["url"], ""]
    tem_dado = False

    snap = db.um(
        "select raw_text, structured_data from public.snapshots "
        "where competitor_id = %s and user_id = %s order by crawled_at desc limit 1",
        (cid, user_id),
    )
    if snap:
        tem_dado = True
        linhas += [
            "=== Ultimo snapshot do site (markdown extraido) ===",
            (snap["raw_text"] or "")[:6000],
            "",
            "=== Dados estruturados do site ===",
            json.dumps(snap["structured_data"] or {}, ensure_ascii=False)[:2000],
            "",
        ]

    ads = db.varios(
        "select body_text, cta_text, active from public.ads_snapshots "
        "where competitor_id = %s and user_id = %s order by fetched_at desc limit 10",
        (cid, user_id),
    )
    if ads:
        tem_dado = True
        linhas.append("=== Anuncios recentes (%d) ===" % len(ads))
        for a in ads:
            linhas.append(
                '- [%s] CTA="%s" | %s'
                % (
                    "ativo" if a["active"] else "inativo",
                    a["cta_text"] or "",
                    (a["body_text"] or "")[:240],
                )
            )
        linhas.append("")

    ig = db.um(
        "select bio, followers, posts_count from public.social_snapshots "
        "where competitor_id = %s and user_id = %s and platform = 'instagram' "
        "order by fetched_at desc limit 1",
        (cid, user_id),
    )
    if ig:
        tem_dado = True
        linhas.append(
            '=== Instagram === bio="%s" | seguidores=%s | posts=%s'
            % (ig["bio"] or "", ig["followers"] or "?", ig["posts_count"] or "?")
        )

    return "\n".join(linhas), tem_dado


def _normalizar_swot(bruto):
    """Corta o que o modelo devolveu no formato que a tabela aceita.

    Sem isto, um quadrante a mais ou um item gigante entraria no banco como
    veio. Os limites sao os mesmos da edge function original.
    """
    saida = {q: [] for q in QUADRANTES}
    if not isinstance(bruto, dict):
        return saida
    for q in QUADRANTES:
        itens = bruto.get(q)
        if not isinstance(itens, list):
            continue
        for it in itens[:4]:
            if not isinstance(it, dict):
                continue
            titulo = it.get("title")
            if not isinstance(titulo, str) or not titulo.strip():
                continue
            prova = it.get("evidence")
            saida[q].append({
                "title": titulo[:120],
                "evidence": prova[:600] if isinstance(prova, str) else "",
            })
    return saida


@app.post("/competitors/{cid}/swot", status_code=201)
def gerar_swot(cid: uuid.UUID, u=Depends(auth.usuario_atual)):
    comp = db.um(
        "select id, name, url from public.competitors where id = %s and user_id = %s",
        (str(cid), u["id"]),
    )
    if not comp:
        raise HTTPException(404, "Concorrente nao encontrado.")

    prompt, tem_dado = _contexto_swot(str(cid), u["id"], comp)
    if not tem_dado:
        # Sem snapshot, anuncio ou Instagram o modelo so teria nome e URL --
        # e devolveria analise inventada com cara de analise real.
        raise HTTPException(
            409,
            "Nao ha dado coletado sobre este concorrente ainda. Rode um crawl "
            "antes de gerar o SWOT.",
        )

    bruto, modelo, _tokens = ia.gerar_json(u["id"], SWOT_SISTEMA, prompt, uso="swot")
    swot = _normalizar_swot(bruto)
    if not any(swot[q] for q in QUADRANTES):
        raise HTTPException(
            502, "O modelo %s respondeu, mas sem nenhum item aproveitavel." % modelo
        )

    return db.um(
        "insert into public.swot_reports "
        "(user_id, competitor_id, strengths, weaknesses, opportunities, threats, llm_model) "
        "values (%s, %s, %s, %s, %s, %s, %s) returning *",
        (
            u["id"],
            str(cid),
            json.dumps(swot["strengths"], ensure_ascii=False),
            json.dumps(swot["weaknesses"], ensure_ascii=False),
            json.dumps(swot["opportunities"], ensure_ascii=False),
            json.dumps(swot["threats"], ensure_ascii=False),
            modelo,
        ),
    )


# ------------------------------------------------------------------ snapshots
@app.get("/competitors/{cid}/snapshots/latest")
def ultimo_snapshot(cid: uuid.UUID, u=Depends(auth.usuario_atual)):
    return db.um(
        "select * from public.snapshots where competitor_id = %s and user_id = %s "
        "order by crawled_at desc limit 1",
        (str(cid), u["id"]),
    )


@app.get("/competitors/{cid}/snapshots")
def listar_snapshots(cid: uuid.UUID, limit: int = 20, u=Depends(auth.usuario_atual)):
    return db.varios(
        "select * from public.snapshots where competitor_id = %s and user_id = %s "
        "order by crawled_at desc limit %s",
        (str(cid), u["id"], min(limit, 100)),
    )


# ----------------------------------------------------------------------- ads
@app.get("/competitors/{cid}/ads")
def listar_ads(cid: uuid.UUID, u=Depends(auth.usuario_atual)):
    return db.varios(
        "select * from public.ads_snapshots where competitor_id = %s and user_id = %s "
        "order by fetched_at desc limit 200",
        (str(cid), u["id"]),
    )


@app.post("/competitors/{cid}/ads/fetch", status_code=201)
def buscar_ads(cid: uuid.UUID, u=Depends(auth.usuario_atual)):
    """Porta a edge function `fetch-competitor-ads`, os dois acervos.

    A parte Google foi recuperada do historico do git em 02/09: quando
    `supabase/functions/` foi apagada, so a Meta tinha sido portada.

    Cada lado depende do seu id no concorrente -- `facebook_page_id` e
    `google_advertiser_id` --, e quem os preenche sem digitacao e a rota de
    sugestao (`POST /competitors/{id}/ads-suggestion`).
    """
    comp = db.um(
        "select id, facebook_page_id, google_advertiser_id "
        "from public.competitors "
        "where id = %s and user_id = %s",
        (str(cid), u["id"]),
    )
    if not comp:
        raise HTTPException(404, "Concorrente nao encontrado.")
    if not comp["facebook_page_id"] and not comp["google_advertiser_id"]:
        raise HTTPException(
            409,
            "Este concorrente nao tem pagina do Facebook nem anunciante do "
            "Google vinculado. Use a sugestao de anuncios ou informe o id.",
        )

    # 🚨 UM LADO NAO DERRUBA O OUTRO. Se o Meta falhar e o Google responder, a
    # busca vale pelo Google -- e vice-versa. Falhar inteiro por causa de um
    # dos dois esconderia dado que existe. So estoura quando os DOIS falham.
    anuncios, falhas = [], []
    if comp["facebook_page_id"]:
        try:
            anuncios += [dict(a, source="meta") for a in
                         coletores.anuncios_meta(u["id"], comp["facebook_page_id"])]
        except coletores.ErroExterno as e:
            falhas.append("Meta: " + e.mensagem)
    if comp["google_advertiser_id"]:
        try:
            anuncios += [dict(a, source="google") for a in
                         coletores.anuncios_google(
                             u["id"], advertiser_id=comp["google_advertiser_id"])]
        except coletores.ErroExterno as e:
            falhas.append("Google: " + e.mensagem)
    if falhas and not anuncios:
        raise HTTPException(502, " | ".join(falhas))

    gravados = 0
    for a in anuncios:
        if not a["ad_archive_id"]:
            continue
        db.executar(
            "insert into public.ads_snapshots (user_id, competitor_id, source, "
            "ad_archive_id, fetched_date, active, body_text, cta_text, cta_url, "
            "page_name, creatives, start_date, platforms, raw) "
            "values (%s, %s, %s, %s, current_date, %s, %s, %s, %s, %s, %s, "
            "%s, %s, %s) "
            "on conflict (competitor_id, source, ad_archive_id, fetched_date) "
            "do update set active = excluded.active, "
            "body_text = excluded.body_text, cta_text = excluded.cta_text, "
            "creatives = excluded.creatives, raw = excluded.raw",
            (u["id"], str(cid), a.get("source", "meta"), a["ad_archive_id"],
             a["active"], a["body_text"],
             a["cta_text"], a["cta_url"], a["page_name"],
             json.dumps(a["creatives"], ensure_ascii=False) if a["creatives"] else None,
             a["start_date"], a["platforms"],
             json.dumps(a["raw"], ensure_ascii=False)),
        )
        gravados += 1

    db.executar(
        "update public.competitors set last_ads_fetched_at = now() where id = %s",
        (str(cid),),
    )
    return {"ok": True, "anuncios_recebidos": len(anuncios),
            "gravados": gravados,
            "meta": sum(1 for a in anuncios if a.get("source") == "meta"),
            "google": sum(1 for a in anuncios if a.get("source") == "google"),
            "falhas_parciais": falhas or None}


@app.get("/competitors/{cid}/ads-suggestion")
def ver_sugestao_ads(cid: uuid.UUID, u=Depends(auth.usuario_atual)):
    return db.um(
        "select facebook_page_suggestion, google_advertiser_suggestion, "
        "ads_link_confidence, ads_link_reasoning, ads_link_suggested_at "
        "from public.competitors where id = %s and user_id = %s",
        (str(cid), u["id"]),
    )


SUGESTAO_SISTEMA = ("Você identifica contas oficiais de marcas em plataformas "
                    "de anúncios. Não invente: sem certeza alta, devolva null e "
                    "confiança baixa.")

SUGESTAO_ESQUEMA = {
    "type": "OBJECT",
    "required": ["facebook_page_id", "google_advertiser_id", "confidence",
                 "reasoning"],
    "properties": {
        "facebook_page_id": {"type": "STRING", "nullable": True},
        "google_advertiser_id": {"type": "STRING", "nullable": True},
        "confidence": {
            "type": "OBJECT",
            "required": ["meta", "google"],
            "properties": {"meta": {"type": "NUMBER"},
                           "google": {"type": "NUMBER"}},
        },
        "reasoning": {"type": "STRING"},
    },
}

RE_GOOGLE_ID = re.compile(r"^AR\d+$")
RE_FB_ID = re.compile(r"^[\w.\-]+$")


@app.post("/competitors/{cid}/ads-suggestion", status_code=201)
def gerar_sugestao_ads(cid: uuid.UUID, u=Depends(auth.usuario_atual)):
    """Porta a edge function `suggest-ads-links`.

    Junta candidatos de duas origens -- o markdown do último crawl e a busca
    nos dois acervos de anúncios -- e deixa o modelo arbitrar. O modelo NÃO
    inventa id: o que ele devolver é conferido contra o formato esperado antes
    de virar sugestão, e id fora do formato é descartado.

    ⚠️ Custa 2 créditos de ScrapeCreators por chamada (uma busca em cada
    acervo). É a rota mais cara do serviço.
    """
    comp = db.um(
        "select id, name, url from public.competitors where id = %s and user_id = %s",
        (str(cid), u["id"]),
    )
    if not comp:
        raise HTTPException(404, "Concorrente nao encontrado.")

    snap = db.um(
        "select raw_text from public.snapshots where competitor_id = %s "
        "and user_id = %s order by crawled_at desc limit 1",
        (str(cid), u["id"]),
    )
    if not snap:
        raise HTTPException(
            409,
            "Faca um crawl antes: a sugestao parte dos links que o site do "
            "concorrente publica.",
        )

    do_site = coletores.candidatos_de_ads(snap["raw_text"] or "")
    da_busca = coletores.buscar_anunciantes(u["id"], comp["name"])
    dominio = (comp["url"] or "").split("//")[-1].split("/")[0]

    prompt = (
        "Identifique as contas oficiais deste concorrente.\n\n"
        "Concorrente:\n- Nome: %s\n- URL: %s\n- Dominio: %s\n\n"
        "Candidatos achados no site:\n"
        "- Facebook: %s\n- Instagram (so para inferir o Facebook): %s\n"
        "- Google Advertiser: %s\n\n"
        "Candidatos achados na busca dos acervos de anuncio:\n"
        "- Facebook (top 5): %s\n- Google (top 5): %s\n\n"
        "Devolva o id oficial de cada plataforma, ou null quando nao houver "
        "certeza alta. A confianca vai de 0 a 1."
        % (comp["name"], comp["url"], dominio,
           json.dumps(do_site["fb"], ensure_ascii=False),
           json.dumps(do_site["ig"], ensure_ascii=False),
           json.dumps(do_site["google"], ensure_ascii=False),
           json.dumps(da_busca["fb"], ensure_ascii=False),
           json.dumps(da_busca["google"], ensure_ascii=False))
    )

    bruto, modelo, _t = ia.gerar_json(
        u["id"], SUGESTAO_SISTEMA, prompt, uso="classification",
        esquema=SUGESTAO_ESQUEMA,
    )
    if not isinstance(bruto, dict):
        raise HTTPException(502, "O modelo %s devolveu resposta invalida." % modelo)

    # O modelo pode devolver um id plausivel e errado. O formato e o unico
    # filtro barato que existe: advertiser do Google e sempre ARnnn.
    fb = bruto.get("facebook_page_id")
    fb = fb if isinstance(fb, str) and RE_FB_ID.match(fb) else None
    gg = bruto.get("google_advertiser_id")
    gg = gg if isinstance(gg, str) and RE_GOOGLE_ID.match(gg) else None

    conf = bruto.get("confidence") if isinstance(bruto.get("confidence"), dict) else {}
    def _fatia(v):
        try:
            return max(0.0, min(1.0, float(v)))
        except (TypeError, ValueError):
            return 0.0
    confianca = {"meta": _fatia(conf.get("meta")) if fb else 0.0,
                 "google": _fatia(conf.get("google")) if gg else 0.0}
    razao = (bruto.get("reasoning") or "")[:1000]
    if not fb and not gg:
        razao = razao or "Nenhum candidato com certeza suficiente."

    return db.um(
        "update public.competitors set facebook_page_suggestion = %s, "
        "google_advertiser_suggestion = %s, ads_link_confidence = %s, "
        "ads_link_reasoning = %s, ads_link_suggested_at = now() "
        "where id = %s and user_id = %s "
        "returning facebook_page_suggestion, google_advertiser_suggestion, "
        "ads_link_confidence, ads_link_reasoning, ads_link_suggested_at",
        (fb, gg, json.dumps(confianca), razao, str(cid), u["id"]),
    )


# ------------------------------------------------------ configuracoes de LLM
def _settings_llm(user_id):
    s = db.um(
        "select provider, model_classification, model_swot "
        "from public.user_llm_settings where user_id = %s",
        (user_id,),
    )
    if not s:
        s = db.um(
            "insert into public.user_llm_settings (user_id) values (%s) "
            "returning provider, model_classification, model_swot",
            (user_id,),
        )
    chaves = db.varios(
        "select provider, key_hint, created_at from public.user_llm_keys "
        "where user_id = %s",
        (user_id,),
    )
    return {
        "provider": s["provider"],
        "modelClassification": s["model_classification"],
        "modelSwot": s["model_swot"],
        "hasKeyByProvider": {
            c["provider"]: {"keyHint": c["key_hint"], "createdAt": c["created_at"]}
            for c in chaves
        },
    }


@app.get("/llm/settings")
def ver_llm(u=Depends(auth.usuario_atual)):
    return _settings_llm(u["id"])


@app.put("/llm/provider")
def trocar_provider_llm(e: EscolhaProvider, u=Depends(auth.usuario_atual)):
    db.executar(
        "insert into public.user_llm_settings (user_id, provider) values (%s, %s) "
        "on conflict (user_id) do update set provider = excluded.provider, "
        "updated_at = now()",
        (u["id"], e.provider),
    )
    return _settings_llm(u["id"])


@app.put("/llm/model")
def trocar_modelo_llm(e: EscolhaModelo, u=Depends(auth.usuario_atual)):
    if e.useCase not in ("classification", "swot"):
        raise HTTPException(400, "useCase deve ser 'classification' ou 'swot'.")
    coluna = "model_classification" if e.useCase == "classification" else "model_swot"
    db.executar(
        "insert into public.user_llm_settings (user_id, " + coluna + ") "
        "values (%s, %s) on conflict (user_id) do update set "
        + coluna + " = excluded." + coluna + ", updated_at = now()",
        (u["id"], e.modelId),
    )
    return _settings_llm(u["id"])


@app.post("/llm/keys")
def salvar_chave_llm(c: ChaveLLM, u=Depends(auth.usuario_atual)):
    db.executar(
        "insert into public.user_llm_keys (user_id, provider, encrypted_key, key_hint) "
        "values (%s, %s, pgp_sym_encrypt(%s, %s), %s) "
        "on conflict (user_id, provider) do update set "
        "encrypted_key = excluded.encrypted_key, key_hint = excluded.key_hint",
        (u["id"], c.provider, c.key, CHAVE_CRIPTO, c.key[-4:]),
    )
    return _settings_llm(u["id"])


@app.delete("/llm/keys/{provider}")
def apagar_chave_llm(provider: str, u=Depends(auth.usuario_atual)):
    db.executar(
        "delete from public.user_llm_keys where user_id = %s and provider = %s",
        (u["id"], provider),
    )
    return _settings_llm(u["id"])


# --------------------------------------------------- chaves de scraper (BYOK)
@app.get("/scraper-keys")
def listar_chaves_scraper(u=Depends(auth.usuario_atual)):
    return db.varios(
        "select provider, key_hint, source, created_at, updated_at "
        "from public.user_scraper_keys where user_id = %s order by provider",
        (u["id"],),
    )


@app.post("/scraper-keys", status_code=201)
def salvar_chave_scraper(c: ChaveScraper, u=Depends(auth.usuario_atual)):
    return db.um(
        "insert into public.user_scraper_keys "
        "(user_id, provider, encrypted_key, key_hint, source) "
        "values (%s, %s, pgp_sym_encrypt(%s, %s), %s, %s) "
        "on conflict (user_id, provider) do update set "
        "encrypted_key = excluded.encrypted_key, key_hint = excluded.key_hint, "
        "source = excluded.source, updated_at = now() "
        "returning provider, key_hint, source, created_at, updated_at",
        (u["id"], c.provider, c.key, CHAVE_CRIPTO, c.key[-4:], c.source),
    )


@app.delete("/scraper-keys/{provider}", status_code=204)
def apagar_chave_scraper(provider: str, u=Depends(auth.usuario_atual)):
    db.executar(
        "delete from public.user_scraper_keys where user_id = %s and provider = %s",
        (u["id"], provider),
    )


@app.post("/scraper-keys/{provider}/test")
def testar_chave_scraper(provider: str, u=Depends(auth.usuario_atual)):
    """Porta a edge function `test-scraper-key`: uma chamada barata que
    prova se a chave e aceita, sem gastar coleta de verdade."""
    return coletores.testar_chave(u["id"], provider)


# --------------------------------------------------------------- equipe/convite
class NovoConvite(BaseModel):
    email: EmailStr


class AceitarConvite(BaseModel):
    senha: str = Field(min_length=8)
    nome: str | None = None


def admin_atual(u=Depends(auth.usuario_atual)):
    """Dependencia de rota: 403 se o usuario nao for admin."""
    p = db.um("select role from public.profiles where id = %s", (u["id"],))
    if not p or p["role"] != "admin":
        raise HTTPException(403, "Apenas o administrador da plataforma gerencia a equipe.")
    return u


@app.get("/team/members")
def listar_equipe(_admin=Depends(admin_atual)):
    return db.varios(
        "select id, full_name, email, role, created_at "
        "from public.profiles order by created_at asc"
    )


@app.get("/team/invites")
def listar_convites(_admin=Depends(admin_atual)):
    return db.varios(
        "select id, email, created_at, accepted_at from public.invites "
        "where accepted_at is null order by created_at desc"
    )


@app.post("/team/invites", status_code=201)
def criar_convite(c: NovoConvite, admin=Depends(admin_atual)):
    ja_usuario = db.um("select id from public.usuario where lower(email) = lower(%s)", (c.email,))
    if ja_usuario:
        raise HTTPException(409, "Esse e-mail ja tem conta na plataforma.")
    ja_convite = db.um(
        "select id from public.invites where lower(email) = lower(%s) and accepted_at is null",
        (c.email,),
    )
    if ja_convite:
        raise HTTPException(409, "Ja existe um convite pendente para esse e-mail.")
    convite = db.um(
        "insert into public.invites (email, invited_by) values (%s, %s) "
        "returning id, email, created_at",
        (c.email, admin["id"]),
    )
    return {**convite, "ok": True}


@app.delete("/team/invites/{invite_id}", status_code=204)
def apagar_convite(invite_id: uuid.UUID, _admin=Depends(admin_atual)):
    n = db.executar(
        "delete from public.invites where id = %s and accepted_at is null",
        (str(invite_id),),
    )
    if not n:
        raise HTTPException(404, "Convite nao encontrado.")


@app.get("/convite/{invite_id}")
def ver_convite(invite_id: uuid.UUID):
    """Publica, sem autenticacao -- e a tela que a pessoa convidada abre
    antes de ter conta. So confirma se o convite existe e esta pendente."""
    c = db.um(
        "select email, accepted_at from public.invites where id = %s",
        (str(invite_id),),
    )
    if not c:
        raise HTTPException(404, "Convite nao encontrado ou expirado.")
    if c["accepted_at"] is not None:
        raise HTTPException(410, "Este convite ja foi usado.")
    return {"email": c["email"]}


@app.post("/convite/{invite_id}/accept", status_code=201)
def aceitar_convite(invite_id: uuid.UUID, a: AceitarConvite):
    """Publica -- cria a conta do convidado e ja devolve o token (login
    automatico). O e-mail vem do convite, nunca do corpo da requisicao."""
    c = db.um(
        "select email, accepted_at from public.invites where id = %s",
        (str(invite_id),),
    )
    if not c:
        raise HTTPException(404, "Convite nao encontrado ou expirado.")
    if c["accepted_at"] is not None:
        raise HTTPException(410, "Este convite ja foi usado.")

    email = c["email"]
    ja = db.um("select id from public.usuario where lower(email) = lower(%s)", (email,))
    if ja:
        raise HTTPException(409, "Ja existe uma conta com esse e-mail.")

    novo = db.um(
        "insert into public.usuario (email, nome, senha_hash) "
        "values (%s, %s, %s) returning id, email, nome",
        (email, a.nome or email.split("@")[0], auth.hash_senha(a.senha)),
    )
    db.executar(
        "insert into public.profiles (id, full_name, email, role) "
        "values (%s, %s, %s, 'member')",
        (novo["id"], novo["nome"], novo["email"]),
    )
    db.executar(
        "update public.invites set accepted_at = now() where id = %s",
        (str(invite_id),),
    )
    token, expira = auth.gerar_token(novo["id"], novo["email"])
    return {"token": token, "expiraEm": expira, "usuario": novo}


# ------------------------------------------------------------------------ seo
# Porta a edge function `analyze-seo-competitor`. O tool-calling que ela usava
# para garantir a forma da resposta virou `responseSchema` do Gemini.
SEO_SISTEMA = """Você é um especialista sênior em SEO técnico e de conteúdo, analisando o site de um concorrente.
Responda SEMPRE em português do Brasil, em tom executivo, direto e acionável.
Use APENAS as informações fornecidas (não invente dados de tráfego, backlinks ou métricas externas).
Se a informação não estiver no markdown, diga claramente que não foi possível avaliar aquele aspecto."""

SEO_ESQUEMA = {
    "type": "OBJECT",
    "required": ["score", "summary", "strengths", "weaknesses",
                 "opportunities", "recommendations", "target_keywords"],
    "properties": {
        "score": {"type": "INTEGER", "description": "Nota de 0 a 100 da qualidade SEO geral."},
        "summary": {"type": "STRING", "description": "Resumo executivo, 2 a 4 frases."},
        "strengths": {"type": "ARRAY", "items": {"type": "STRING"}},
        "weaknesses": {"type": "ARRAY", "items": {"type": "STRING"}},
        "opportunities": {"type": "ARRAY", "items": {"type": "STRING"}},
        "recommendations": {"type": "ARRAY", "items": {"type": "STRING"}},
        "target_keywords": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "required": ["keyword", "intent", "rationale"],
                "properties": {
                    "keyword": {"type": "STRING"},
                    "intent": {
                        "type": "STRING",
                        "enum": ["informacional", "navegacional",
                                 "transacional", "comercial"],
                    },
                    "rationale": {"type": "STRING"},
                },
            },
        },
    },
}


def _lista_de_texto(valor, teto=6):
    if not isinstance(valor, list):
        return []
    return [v[:400] for v in valor if isinstance(v, str) and v.strip()][:teto]


@app.get("/competitors/{cid}/seo")
def ver_seo(cid: uuid.UUID, u=Depends(auth.usuario_atual)):
    """Devolve None quando ainda nao ha analise -- o front trata null, nao 404."""
    return db.um(
        "select * from public.seo_analyses where competitor_id = %s and user_id = %s "
        "order by analyzed_at desc limit 1",
        (str(cid), u["id"]),
    )


@app.post("/competitors/{cid}/seo", status_code=201)
def analisar_seo(cid: uuid.UUID, u=Depends(auth.usuario_atual)):
    comp = db.um(
        "select id, name, url from public.competitors where id = %s and user_id = %s",
        (str(cid), u["id"]),
    )
    if not comp:
        raise HTTPException(404, "Concorrente nao encontrado.")

    snap = db.um(
        "select id, raw_text, structured_data, crawled_at from public.snapshots "
        "where competitor_id = %s and user_id = %s order by crawled_at desc limit 1",
        (str(cid), u["id"]),
    )
    if not snap:
        raise HTTPException(
            409,
            "Faca um crawl antes de analisar o SEO -- sem o conteudo do site "
            "nao ha o que avaliar.",
        )

    dominio = (comp["url"] or "").split("//")[-1].split("/")[0]
    prompt = (
        "Analise o SEO do site do concorrente abaixo a partir do markdown extraido.\n\n"
        "# Concorrente\n- Nome: %s\n- Dominio: %s\n- URL analisada: %s\n\n"
        "# Dados estruturados extraidos\n```json\n%s\n```\n\n"
        "# Conteudo (markdown -- pode estar truncado)\n```markdown\n%s\n```\n\n"
        "Avalie:\n"
        "1. Clareza de proposta de valor / H1 / titulo\n"
        "2. Densidade e relevancia das keywords presentes\n"
        "3. Estrutura de conteudo (headings, CTAs, copy)\n"
        "4. Sinais de intencao de busca atendidos\n"
        "5. Oportunidades de SEO que o concorrente NAO esta cobrindo"
        % (
            comp["name"],
            dominio,
            comp["url"],
            json.dumps(snap["structured_data"] or {}, ensure_ascii=False, indent=2)[:2000],
            (snap["raw_text"] or "")[:12000],
        )
    )

    bruto, modelo, _t = ia.gerar_json(
        u["id"], SEO_SISTEMA, prompt, uso="swot", esquema=SEO_ESQUEMA
    )
    if not isinstance(bruto, dict):
        raise HTTPException(502, "O modelo %s devolveu resposta invalida." % modelo)

    nota = bruto.get("score")
    nota = max(0, min(100, int(nota))) if isinstance(nota, (int, float)) else None
    palavras = []
    for k in (bruto.get("target_keywords") or [])[:10]:
        if isinstance(k, dict) and isinstance(k.get("keyword"), str):
            palavras.append({
                "keyword": k["keyword"][:120],
                "intent": k.get("intent") if k.get("intent") in (
                    "informacional", "navegacional", "transacional", "comercial"
                ) else "informacional",
                "rationale": (k.get("rationale") or "")[:400],
            })

    campos = (
        u["id"], str(cid), snap["id"], modelo, nota,
        (bruto.get("summary") or "")[:2000],
        json.dumps(_lista_de_texto(bruto.get("strengths"), 5), ensure_ascii=False),
        json.dumps(_lista_de_texto(bruto.get("weaknesses"), 5), ensure_ascii=False),
        json.dumps(_lista_de_texto(bruto.get("opportunities"), 5), ensure_ascii=False),
        json.dumps(_lista_de_texto(bruto.get("recommendations"), 6), ensure_ascii=False),
        json.dumps(palavras, ensure_ascii=False),
        json.dumps({"domain": dominio, "url": comp["url"],
                    "snapshot_crawled_at": snap["crawled_at"].isoformat()},
                   ensure_ascii=False),
    )

    # Uma analise por concorrente: o front le com maybeSingle, que estoura se
    # houver duas linhas. Nao ha unique no schema portado, entao o upsert e
    # feito aqui -- update primeiro, insert so se nao existia.
    linha = db.um(
        "update public.seo_analyses set source_snapshot_id = %s, model = %s, "
        "score = %s, summary = %s, strengths = %s, weaknesses = %s, "
        "opportunities = %s, recommendations = %s, target_keywords = %s, "
        "meta = %s, analyzed_at = now(), updated_at = now() "
        "where competitor_id = %s and user_id = %s returning *",
        campos[2:] + (str(cid), u["id"]),
    )
    if linha:
        return linha
    return db.um(
        "insert into public.seo_analyses (user_id, competitor_id, source_snapshot_id, "
        "model, score, summary, strengths, weaknesses, opportunities, "
        "recommendations, target_keywords, meta) "
        "values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning *",
        campos,
    )


# --------------------------------------------------------------------- social
SOCIAL_ESQUEMA = {
    "type": "OBJECT",
    "required": ["summary", "cadence", "format_mix", "themes",
                 "engagement", "top_posts", "insights"],
    "properties": {
        "summary": {"type": "STRING", "description": "1 a 2 frases resumindo a estrategia."},
        "cadence": {
            "type": "OBJECT",
            "required": ["posts_per_week", "best_weekday", "notes"],
            "properties": {
                "posts_per_week": {"type": "NUMBER"},
                "best_weekday": {"type": "STRING"},
                "notes": {"type": "STRING"},
            },
        },
        "format_mix": {
            "type": "OBJECT",
            "required": ["reel_pct", "image_pct", "carousel_pct"],
            "properties": {
                "reel_pct": {"type": "NUMBER"},
                "image_pct": {"type": "NUMBER"},
                "carousel_pct": {"type": "NUMBER"},
            },
        },
        "themes": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "required": ["label", "weight"],
                "properties": {
                    "label": {"type": "STRING"},
                    "weight": {"type": "NUMBER", "description": "0 a 1"},
                },
            },
        },
        "engagement": {
            "type": "OBJECT",
            "required": ["avg_likes", "avg_comments", "engagement_rate_pct"],
            "properties": {
                "avg_likes": {"type": "NUMBER"},
                "avg_comments": {"type": "NUMBER"},
                "engagement_rate_pct": {"type": "NUMBER"},
            },
        },
        "top_posts": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "required": ["shortcode", "permalink", "reason"],
                "properties": {
                    "shortcode": {"type": "STRING"},
                    "permalink": {"type": "STRING"},
                    "reason": {"type": "STRING"},
                },
            },
        },
        "insights": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
}


class HandleInstagram(BaseModel):
    handle: str | None = None


@app.get("/competitors/{cid}/social/snapshots")
def listar_social(
    cid: uuid.UUID,
    platform: str = "instagram",
    limit: int = 30,
    u=Depends(auth.usuario_atual),
):
    return db.varios(
        "select * from public.social_snapshots where competitor_id = %s "
        "and user_id = %s and platform = %s order by fetched_at desc limit %s",
        (str(cid), u["id"], platform, min(limit, 100)),
    )


@app.get("/competitors/{cid}/social/analysis")
def ver_social(cid: uuid.UUID, platform: str = "instagram",
               u=Depends(auth.usuario_atual)):
    return db.um(
        "select * from public.social_analyses where competitor_id = %s "
        "and user_id = %s and platform = %s order by analyzed_at desc limit 1",
        (str(cid), u["id"], platform),
    )


@app.post("/competitors/{cid}/social/fetch", status_code=201)
def buscar_social(cid: uuid.UUID, platform: str = "instagram",
                  u=Depends(auth.usuario_atual)):
    """Porta a edge function `fetch-competitor-social`."""
    if platform != "instagram":
        raise HTTPException(400, "So o Instagram esta portado por enquanto.")
    comp = db.um(
        "select id, instagram_handle from public.competitors "
        "where id = %s and user_id = %s",
        (str(cid), u["id"]),
    )
    if not comp:
        raise HTTPException(404, "Concorrente nao encontrado.")
    if not comp["instagram_handle"]:
        raise HTTPException(
            409, "Este concorrente ainda nao tem handle de Instagram definido."
        )

    perfil = coletores.perfil_instagram(u["id"], comp["instagram_handle"])

    antes = db.um(
        "select followers from public.social_snapshots where competitor_id = %s "
        "and platform = %s order by fetched_at desc limit 1",
        (str(cid), platform),
    )
    delta = (perfil["followers"] - antes["followers"]
             if antes and antes["followers"] is not None else None)

    # A unique e (competitor_id, platform, fetched_date): duas coletas no
    # mesmo dia atualizam a linha do dia, nao criam uma segunda.
    linha = db.um(
        "insert into public.social_snapshots (user_id, competitor_id, platform, "
        "handle, followers, following, posts_count, is_verified, is_business, "
        "bio, external_url, category, profile_pic_url, recent_posts) "
        "values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
        "on conflict (competitor_id, platform, fetched_date) do update set "
        "fetched_at = now(), handle = excluded.handle, "
        "followers = excluded.followers, following = excluded.following, "
        "posts_count = excluded.posts_count, is_verified = excluded.is_verified, "
        "is_business = excluded.is_business, bio = excluded.bio, "
        "external_url = excluded.external_url, category = excluded.category, "
        "profile_pic_url = excluded.profile_pic_url, "
        "recent_posts = excluded.recent_posts returning id",
        (u["id"], str(cid), platform, perfil["handle"], perfil["followers"],
         perfil["following"], perfil["posts_count"], perfil["is_verified"],
         perfil["is_business"], perfil["bio"], perfil["external_url"],
         perfil["category"], perfil["profile_pic_url"],
         json.dumps(perfil["recent_posts"], ensure_ascii=False)),
    )
    db.executar(
        "update public.competitors set last_instagram_fetched_at = now() "
        "where id = %s",
        (str(cid),),
    )
    return {
        "ok": True,
        "snapshot_id": linha["id"],
        "handle": perfil["handle"],
        "source": "scrapecreators",
        "followers": perfil["followers"],
        "followers_delta": delta,
        "posts_returned": len(perfil["recent_posts"]),
    }


@app.post("/competitors/{cid}/social/analyze", status_code=201)
def analisar_social(cid: uuid.UUID, platform: str = "instagram",
                    u=Depends(auth.usuario_atual)):
    comp = db.um(
        "select id, name, url from public.competitors where id = %s and user_id = %s",
        (str(cid), u["id"]),
    )
    if not comp:
        raise HTTPException(404, "Concorrente nao encontrado.")

    snap = db.um(
        "select * from public.social_snapshots where competitor_id = %s "
        "and user_id = %s and platform = %s order by fetched_at desc limit 1",
        (str(cid), u["id"], platform),
    )
    if not snap:
        raise HTTPException(
            409,
            "Nenhum perfil coletado ainda para este concorrente. Busque o "
            "perfil antes de analisar.",
        )

    posts = snap["recent_posts"] if isinstance(snap["recent_posts"], list) else []
    compactos = [
        {
            "shortcode": p.get("shortcode"),
            "type": p.get("type"),
            "taken_at": p.get("taken_at"),
            "likes": p.get("like_count"),
            "comments": p.get("comment_count"),
            "views": p.get("video_view_count"),
            "caption": (p.get("caption") or "")[:400],
            "permalink": p.get("permalink"),
        }
        for p in posts
        if isinstance(p, dict)
    ]
    seguidores = snap["followers"] or 0

    prompt = (
        "Voce analisa a estrategia publica de Instagram de um concorrente.\n\n"
        "Concorrente: %s (%s)\nHandle: @%s\nFollowers: %s\n"
        "Posts no perfil: %s\nBio: %s\n\n"
        "Ultimos %d posts (JSON):\n%s\n\n"
        "Tarefa: produza analise objetiva e acionavel em pt-BR. Use base de "
        "followers=%s para calcular taxas. Inclua frequencia semanal (estime "
        "pelos timestamps), mix de formatos (Reel/Foto/Carrossel %%), 3 a 5 "
        "temas dominantes, engajamento medio ((likes+comments)/followers), "
        "top 3 posts com permalink, e 3 insights acionaveis para nossa marca "
        "competir."
        % (
            comp["name"], comp["url"], snap["handle"], seguidores,
            snap["posts_count"] if snap["posts_count"] is not None else "n/a",
            snap["bio"] or "(vazia)",
            len(compactos),
            json.dumps(compactos, ensure_ascii=False, indent=2)[:12000],
            seguidores,
        )
    )

    bruto, modelo, _t = ia.gerar_json(
        u["id"],
        "Voce e um analista de redes sociais. Responda sempre em portugues do Brasil.",
        prompt,
        uso="swot",
        esquema=SOCIAL_ESQUEMA,
    )
    if not isinstance(bruto, dict):
        raise HTTPException(502, "O modelo %s devolveu resposta invalida." % modelo)

    return db.um(
        "insert into public.social_analyses (user_id, competitor_id, platform, "
        "source_snapshot_id, model, summary, cadence, format_mix, themes, "
        "engagement, top_posts, insights) "
        "values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning *",
        (
            u["id"], str(cid), platform, snap["id"], modelo,
            (bruto.get("summary") or "")[:2000],
            json.dumps(bruto.get("cadence") or {}, ensure_ascii=False),
            json.dumps(bruto.get("format_mix") or {}, ensure_ascii=False),
            json.dumps(bruto.get("themes") or [], ensure_ascii=False),
            json.dumps(bruto.get("engagement") or {}, ensure_ascii=False),
            json.dumps(bruto.get("top_posts") or [], ensure_ascii=False),
            json.dumps(_lista_de_texto(bruto.get("insights"), 5), ensure_ascii=False),
        ),
    )


@app.get("/competitors/{cid}/instagram-handle")
def ver_handle_instagram(cid: uuid.UUID, u=Depends(auth.usuario_atual)):
    linha = db.um(
        "select instagram_handle, instagram_handle_suggestion, "
        "last_instagram_fetched_at from public.competitors "
        "where id = %s and user_id = %s",
        (str(cid), u["id"]),
    )
    if not linha:
        raise HTTPException(404, "Concorrente nao encontrado.")
    return linha


@app.patch("/competitors/{cid}/instagram-handle", status_code=204)
def trocar_handle_instagram(cid: uuid.UUID, h: HandleInstagram,
                            u=Depends(auth.usuario_atual)):
    """A limpeza do handle mora aqui, nao no front.

    O client fazia trim, tirava o @, cortava querystring e barra final. Um
    consumidor futuro da API nao pode depender de cada front repetir isso --
    mesmo motivo da normalizacao de URL no commit de 01/09.
    """
    limpo = h.handle
    if limpo:
        limpo = limpo.strip().lstrip("@").split("?")[0].rstrip("/").lower() or None
    n = db.executar(
        "update public.competitors set instagram_handle = %s "
        "where id = %s and user_id = %s",
        (limpo, str(cid), u["id"]),
    )
    if not n:
        raise HTTPException(404, "Concorrente nao encontrado.")
