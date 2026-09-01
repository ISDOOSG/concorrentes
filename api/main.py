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
import uuid

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

import auth
import db

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


@app.post("/competitors/{cid}/crawl", status_code=501)
def disparar_crawl(cid: uuid.UUID, u=Depends(auth.usuario_atual)):
    raise HTTPException(501, FALTA_TERCEIRO.format(servico="Firecrawl"))


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


@app.post("/competitors/{cid}/swot", status_code=501)
def gerar_swot(cid: uuid.UUID, u=Depends(auth.usuario_atual)):
    raise HTTPException(501, FALTA_TERCEIRO.format(servico="provedor de LLM"))


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


@app.post("/competitors/{cid}/ads/fetch", status_code=501)
def buscar_ads(cid: uuid.UUID, u=Depends(auth.usuario_atual)):
    raise HTTPException(501, FALTA_TERCEIRO.format(servico="ScrapeCreators"))


@app.get("/competitors/{cid}/ads-suggestion")
def ver_sugestao_ads(cid: uuid.UUID, u=Depends(auth.usuario_atual)):
    return db.um(
        "select facebook_page_suggestion, google_advertiser_suggestion, "
        "ads_link_confidence, ads_link_reasoning, ads_link_suggested_at "
        "from public.competitors where id = %s and user_id = %s",
        (str(cid), u["id"]),
    )


@app.post("/competitors/{cid}/ads-suggestion", status_code=501)
def gerar_sugestao_ads(cid: uuid.UUID, u=Depends(auth.usuario_atual)):
    raise HTTPException(
        501, FALTA_TERCEIRO.format(servico="ScrapeCreators + provedor de LLM")
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


@app.post("/scraper-keys/{provider}/test", status_code=501)
def testar_chave_scraper(provider: str, u=Depends(auth.usuario_atual)):
    raise HTTPException(
        501, FALTA_TERCEIRO.format(servico="Firecrawl / ScrapeCreators")
    )


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
