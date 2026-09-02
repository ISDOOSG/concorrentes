"""Coletores do Concorrentes -- Firecrawl e ScrapeCreators, sem edge function.

Porta `crawl-competitor`, `fetch-competitor-social`, `fetch-competitor-ads` e
`test-scraper-key`. Mesma regra do ia.py: `urllib` da biblioteca padrao, chave
BYOK do usuario primeiro e chave do servico como piso.

DIFERENCA DELIBERADA em relacao a edge function original:
  1. Sem screenshot. A original subia o PNG para o Storage da Supabase, que
     nao existe aqui. `snapshots.screenshot_path` fica NULL ate haver um
     lugar decidido para guardar imagem. O crawl nao falha por isso.
  2. Nao insere em `alerts`. A original inseria explicitamente, mas o gatilho
     `on_change_inserted` -> `invoke_generate_alerts()` ja faz isso dentro do
     banco -- e esse gatilho veio na migracao. Inserir dos dois lados
     duplicaria todo alerta.

⚠️ CREDITO E FINITO. Medido em 02/09: Firecrawl com 1000 creditos no periodo,
ScrapeCreators com 100. Cada perfil de Instagram custa 1; cada busca de
anuncio custa 1. Por isso o crawl tem trava de idempotencia de 60s, herdada
da original.
"""
import hashlib
import json
import re
import urllib.error
import urllib.parse
import urllib.request

import db

CHAVE_CRIPTO = db.CFG.get("CONCORRENTES_CRIPTO_CHAVE")
CHAVE_FIRECRAWL = db.CFG.get("CONCORRENTES_FIRECRAWL_CHAVE")
CHAVE_SCRAPE = db.CFG.get("CONCORRENTES_SCRAPECREATORS_CHAVE")


class ErroExterno(Exception):
    """Falha de servico de terceiro, com texto que o usuario entende."""

    def __init__(self, mensagem, status=502):
        super().__init__(mensagem)
        self.mensagem = mensagem
        self.status = status


def chave(user_id, provider):
    """BYOK do usuario para o provedor; se nao houver, a chave do servico.

    Nao usa `get_scraper_key` do banco -- ver o cabecalho de main.py: aquela
    funcao aceita qualquer _user_id. Aqui o id vem do JWT.
    """
    linha = db.um(
        "select pgp_sym_decrypt(encrypted_key, %s) as chave "
        "from public.user_scraper_keys where user_id = %s and provider = %s",
        (CHAVE_CRIPTO, user_id, provider),
    )
    if linha and linha.get("chave"):
        return linha["chave"]
    padrao = {"firecrawl": CHAVE_FIRECRAWL, "scrapecreators": CHAVE_SCRAPE}.get(provider)
    if not padrao:
        raise ErroExterno(
            "Nenhuma chave de %s disponivel -- nem a do projeto nem uma sua. "
            "Cadastre em Configuracoes." % provider,
            status=400,
        )
    return padrao


def _pedir(url, cabecalhos, corpo=None, segundos=60):
    dados = json.dumps(corpo).encode("utf-8") if corpo is not None else None
    req = urllib.request.Request(
        url, data=dados, headers=cabecalhos, method="POST" if dados else "GET"
    )
    try:
        with urllib.request.urlopen(req, timeout=segundos) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        texto = ""
        try:
            texto = e.read().decode("utf-8")[:300]
        except Exception:
            pass
        raise ErroExterno(_traduzir(e.code, texto))
    except urllib.error.URLError as e:
        raise ErroExterno("Nao consegui falar com o servico: %s" % e.reason)
    except ValueError:
        raise ErroExterno("O servico respondeu algo que nao e JSON.")


def _traduzir(codigo, detalhe):
    d = (detalhe or "").lower()
    if codigo == 401:
        return "Chave recusada pelo servico (401). Confira a chave em Configuracoes."
    if codigo == 402 or "payment" in d or "credit" in d:
        return "Sem creditos no servico (HTTP %s)." % codigo
    if codigo == 403:
        return "O site esta bloqueando a coleta (403)."
    if codigo == 429:
        return "Limite de requisicoes excedido (429). Tente daqui a pouco."
    return "O servico respondeu HTTP %s: %s" % (codigo, detalhe or "sem detalhe")


# --------------------------------------------------------------- Firecrawl
def raspar(user_id, url):
    """Devolve (markdown, url_do_screenshot). Levanta ErroExterno se falhar."""
    resp = _pedir(
        "https://api.firecrawl.dev/v2/scrape",
        {"Authorization": "Bearer " + chave(user_id, "firecrawl"),
         "Content-Type": "application/json"},
        {"url": url, "formats": ["markdown"], "onlyMainContent": True},
        segundos=90,
    )
    if not resp.get("success"):
        erro = (resp.get("error") or "resposta sem sucesso")
        raise ErroExterno("Firecrawl falhou: %s" % str(erro)[:200])
    dados = resp.get("data") or {}
    markdown = dados.get("markdown") or ""
    if not markdown.strip():
        raise ErroExterno("O Firecrawl nao devolveu conteudo para esta URL.")
    return markdown, (dados.get("metadata") or {})


# ------------------------------------------------- extracao e comparacao
PRECO = re.compile(r"(R\$\s?\d+(?:[.,]\d+)?|US\$\s?\d+(?:[.,]\d+)?|"
                   r"€\s?\d+(?:[.,]\d+)?|\$\s?\d+(?:[.,]\d+)?)")
LINK = re.compile(r"\[([^\]]+)\]\([^)]+\)")
CTA = re.compile(r"\b(começar|comece|agendar|demo|teste grátis|experimente|"
                 r"cadastre|assine|comprar|fale com)\b", re.I)


def extrair(markdown):
    """Os tres sinais que o produto compara entre um crawl e o seguinte."""
    precos = [m.group(1).strip() for m in PRECO.finditer(markdown)][:20]
    h1 = None
    for linha in markdown.split("\n"):
        if linha.strip().startswith("# "):
            h1 = linha.strip()[2:].strip()
            break
    ctas, vistos = [], set()
    for m in LINK.finditer(markdown):
        t = m.group(1).strip()
        if CTA.search(t) and t not in vistos:
            vistos.add(t)
            ctas.append(t)
        if len(ctas) >= 20:
            break
    return {"prices": precos, "h1": h1, "ctas": ctas}


def _diferenca(a, b):
    sa, sb = set(a or []), set(b or [])
    return {"added": [x for x in sb if x not in sa],
            "removed": [x for x in sa if x not in sb]}


def comparar(antes, depois, mesmo_hash):
    """Diff deterministico -- nada de LLM aqui.

    🚨 CORRECAO DE DEFEITO HERDADO, medida em 02/09: a edge function
    `crawl-competitor` gravava change_type "pricing"/"content" e severity
    "high"/"medium"/"low", e a tabela `changes` so aceita
    price|copy|feature|design|traffic e info|warning|critical. Toda insercao
    de mudanca falhava -- ninguem viu porque o banco de origem estava vazio e
    um segundo crawl nunca aconteceu.

    O vocabulario abaixo e o que o front ja le (SEVERITY_FROM_DB e
    CHANGE_TYPE_FROM_DB em providers/adapters.ts). `traffic` e o valor que o
    front mapeia para "content". `info` nao gera alerta: o gatilho
    `invoke_generate_alerts` pula essa severidade de proposito.
    """
    mudancas = []
    if (antes.get("h1") or "") != (depois.get("h1") or ""):
        mudancas.append({
            "change_type": "copy", "severity": "info",
            "summary": 'H1 mudou: "%s" -> "%s"' % (
                (antes.get("h1") or "")[:80], (depois.get("h1") or "")[:80]),
            "diff": {"field": "h1", "from": antes.get("h1"), "to": depois.get("h1")},
        })
    p = _diferenca(antes.get("prices"), depois.get("prices"))
    if p["added"] or p["removed"]:
        resumo = "Precos mudaram"
        if p["added"]:
            resumo += " -- novos: " + ", ".join(p["added"][:3])
        if p["removed"]:
            resumo += " -- removidos: " + ", ".join(p["removed"][:3])
        mudancas.append({"change_type": "price", "severity": "critical",
                         "summary": resumo,
                         "diff": dict({"field": "prices"}, **p)})
    c = _diferenca(antes.get("ctas"), depois.get("ctas"))
    if c["added"] or c["removed"]:
        resumo = "CTAs mudaram"
        if c["added"]:
            resumo += " -- novos: " + ", ".join(c["added"][:3])
        if c["removed"]:
            resumo += " -- removidos: " + ", ".join(c["removed"][:3])
        mudancas.append({"change_type": "copy", "severity": "warning",
                         "summary": resumo,
                         "diff": dict({"field": "ctas"}, **c)})
    if not mudancas and not mesmo_hash:
        mudancas.append({
            "change_type": "traffic", "severity": "info",
            "summary": "Conteudo da pagina foi atualizado (sem mudancas "
                       "estruturadas detectadas)",
            "diff": {"field": "content_hash"},
        })
    return mudancas


def impressao(markdown):
    """Hash do texto normalizado -- e o que diz se a pagina mudou."""
    normal = re.sub(r"\s+", " ", markdown.lower()).strip()
    return hashlib.sha256(normal.encode("utf-8")).hexdigest()


# ----------------------------------------------------------- ScrapeCreators
def _n(valor, padrao=0):
    try:
        return int(valor)
    except (TypeError, ValueError):
        return padrao


def perfil_instagram(user_id, handle):
    url = ("https://api.scrapecreators.com/v1/instagram/profile?handle=%s&trim=true"
           % urllib.parse.quote(handle))
    bruto = _pedir(url, {"x-api-key": chave(user_id, "scrapecreators")}, segundos=60)
    return _normalizar_ig(bruto, handle)


def _normalizar_ig(bruto, handle):
    """A resposta vem em tres formatos possiveis -- igual a edge function."""
    u = ((bruto or {}).get("data") or {}).get("user") or (bruto or {}).get("user") or bruto or {}

    def contagem(*caminhos):
        for c in caminhos:
            v = u.get(c)
            if isinstance(v, dict) and "count" in v:
                return _n(v["count"])
            if isinstance(v, (int, float, str)):
                return _n(v)
        return 0

    arestas = ((u.get("edge_owner_to_timeline_media") or {}).get("edges")) or []
    posts = []
    for a in arestas[:12]:
        n = (a or {}).get("node") or {}
        tipo = "image"
        if n.get("__typename") == "GraphVideo" or n.get("is_video") is True \
                or n.get("product_type") == "clips":
            tipo = "video"
        if n.get("__typename") == "GraphSidecar":
            tipo = "carousel"
        legendas = ((n.get("edge_media_to_caption") or {}).get("edges")) or []
        legenda = ((legendas[0] or {}).get("node") or {}).get("text", "") if legendas else ""
        codigo = str(n.get("shortcode") or n.get("code") or "")
        ts = _n(n.get("taken_at_timestamp") or n.get("taken_at"))
        import datetime as _dt
        posts.append({
            "shortcode": codigo,
            "type": tipo,
            "caption": legenda,
            "taken_at": (_dt.datetime.fromtimestamp(ts, _dt.timezone.utc).isoformat()
                         if ts else None),
            "like_count": _n((n.get("edge_liked_by") or n.get("edge_media_preview_like")
                              or {}).get("count")),
            "comment_count": _n((n.get("edge_media_to_comment") or {}).get("count")),
            "video_view_count": (_n(n.get("video_view_count") or n.get("video_play_count"))
                                 if tipo == "video" else None),
            "thumbnail_url": n.get("display_url") or n.get("thumbnail_src"),
            "permalink": ("https://www.instagram.com/p/%s/" % codigo) if codigo else "",
        })

    return {
        "handle": handle,
        "followers": contagem("edge_followed_by", "follower_count"),
        "following": contagem("edge_follow", "following_count"),
        "posts_count": contagem("edge_owner_to_timeline_media", "media_count"),
        "is_verified": bool(u.get("is_verified")),
        "is_business": bool(u.get("is_business_account") or u.get("is_business")),
        "bio": u.get("biography") if isinstance(u.get("biography"), str) else None,
        "external_url": u.get("external_url") if isinstance(u.get("external_url"), str) else None,
        "category": u.get("category_name") or u.get("category"),
        "profile_pic_url": u.get("profile_pic_url_hd") or u.get("profile_pic_url"),
        "recent_posts": posts,
    }


def anuncios_meta(user_id, page_id):
    url = ("https://api.scrapecreators.com/v1/facebook/adLibrary/company/ads?company_id=%s"
           % urllib.parse.quote(str(page_id)))
    bruto = _pedir(url, {"x-api-key": chave(user_id, "scrapecreators")}, segundos=90)
    itens = bruto.get("results") or bruto.get("ads") or bruto.get("data") or []
    return [_normalizar_anuncio_meta(a) for a in itens if isinstance(a, dict)]


def _texto(*valores):
    for v in valores:
        if isinstance(v, str) and v.strip():
            return v.strip()
        if isinstance(v, dict) and isinstance(v.get("text"), str):
            return v["text"].strip()
    return None


def _normalizar_anuncio_meta(bruto):
    cartao = ((bruto.get("snapshot") or {}))
    criativos = []
    for img in (cartao.get("images") or []):
        if isinstance(img, dict):
            criativos.append({"type": "image",
                              "url": img.get("original_image_url") or img.get("url"),
                              "thumbnail": img.get("resized_image_url")})
    for v in (cartao.get("videos") or []):
        if isinstance(v, dict):
            criativos.append({"type": "video",
                              "url": v.get("video_hd_url") or v.get("video_sd_url"),
                              "thumbnail": v.get("video_preview_image_url")})
    return {
        "ad_archive_id": str(bruto.get("ad_archive_id") or bruto.get("adArchiveID")
                             or bruto.get("id") or ""),
        "active": bruto.get("is_active"),
        "body_text": _texto(cartao.get("body"), (bruto.get("ad_creative_bodies") or [None])[0]),
        "cta_text": _texto(cartao.get("cta_text"), cartao.get("cta")),
        "cta_url": _texto(cartao.get("link_url")),
        "page_name": _texto(cartao.get("page_name"), bruto.get("page_name")),
        "creatives": criativos or None,
        "start_date": bruto.get("start_date_string") or bruto.get("startDate"),
        "platforms": (bruto.get("publisher_platform")
                      if isinstance(bruto.get("publisher_platform"), list) else None),
        "raw": bruto,
    }


def testar_chave(user_id, provider):
    """O que a edge function `test-scraper-key` fazia: uma chamada barata."""
    if provider == "firecrawl":
        resp = _pedir(
            "https://api.firecrawl.dev/v2/team/credit-usage",
            {"Authorization": "Bearer " + chave(user_id, "firecrawl")},
            segundos=30,
        )
        d = resp.get("data") or {}
        return {"ok": True, "provider": provider,
                "detalhe": "creditos restantes: %s de %s" % (
                    d.get("remainingCredits"), d.get("planCredits"))}
    if provider == "scrapecreators":
        resp = _pedir(
            "https://api.scrapecreators.com/v1/facebook/adLibrary/search/companies"
            "?query=test&limit=1",
            {"x-api-key": chave(user_id, "scrapecreators")},
            segundos=30,
        )
        return {"ok": True, "provider": provider,
                "detalhe": "creditos restantes: %s" % resp.get("credits_remaining")}
    raise ErroExterno("Provedor '%s' nao reconhecido." % provider, status=400)


# ------------------------------------------------- candidatos de anuncio
# Porta a parte determinista de `suggest-ads-links`: varrer o markdown do site
# atras de perfis oficiais. As listas de bloqueio existem porque um site
# qualquer linka facebook.com/sharer e instagram.com/p o tempo todo -- sem
# elas, o "candidato" mais frequente seria o botao de compartilhar.
FB_BLOQUEADOS = {
    "sharer", "tr", "plugins", "dialog", "share", "intent", "watch", "events",
    "groups", "marketplace", "help", "policies", "business", "policy.php",
    "login", "login.php", "privacy", "terms", "ads",
}
IG_BLOQUEADOS = {
    "p", "reel", "reels", "explore", "stories", "tv", "accounts", "about",
    "developer", "directory", "legal", "privacy", "terms", "help", "press",
    "api",
}
RE_FB = re.compile(r"facebook\.com/([\w.\-]+)", re.I)
RE_IG = re.compile(r"instagram\.com/([\w.\-]+)", re.I)
RE_GOOGLE = re.compile(r"adstransparency\.google\.com/advertiser/(AR\d+)", re.I)


def _limpar(bruto):
    return (bruto or "").rstrip("/").split("?")[0]


def _unicos(seq, teto=5):
    vistos, saida = set(), []
    for x in seq:
        if x and x not in vistos:
            vistos.add(x)
            saida.append(x)
        if len(saida) >= teto:
            break
    return saida


def candidatos_de_ads(markdown):
    """{fb, ig, google} a partir do markdown do site do concorrente."""
    fb, ig, google = [], [], []
    for m in RE_FB.finditer(markdown or ""):
        u = _limpar(m.group(1))
        if u and not u.endswith(".php") and u.lower() not in FB_BLOQUEADOS:
            fb.append(u)
    for m in RE_IG.finditer(markdown or ""):
        u = _limpar(m.group(1))
        if u and u.lower() not in IG_BLOQUEADOS:
            ig.append(u)
    for m in RE_GOOGLE.finditer(markdown or ""):
        google.append(m.group(1))
    return {"fb": _unicos(fb), "ig": _unicos(ig), "google": _unicos(google)}


def buscar_anunciantes(user_id, nome):
    """Top 5 de cada acervo para o nome do concorrente. 2 creditos por chamada.

    Falha de um lado nao derruba o outro: a sugestao ainda vale com metade dos
    candidatos, e o modelo recebe listas vazias sabendo que estao vazias.
    """
    k = chave(user_id, "scrapecreators")
    q = urllib.parse.quote(nome or "")
    saida = {"fb": [], "google": []}
    try:
        r = _pedir("https://api.scrapecreators.com/v1/facebook/adLibrary/"
                   "search/companies?query=%s&limit=5" % q,
                   {"x-api-key": k}, segundos=30)
        itens = r.get("searchResults") or r.get("results") or r.get("companies") or []
        saida["fb"] = [
            {"name": i.get("name"), "id": str(i.get("page_id") or i.get("id") or ""),
             "followers_count": i.get("likes") or i.get("followers_count")}
            for i in itens[:5] if isinstance(i, dict)
        ]
    except ErroExterno:
        pass
    try:
        r = _pedir("https://api.scrapecreators.com/v1/google/adLibrary/"
                   "advertisers/search?query=%s&limit=5" % q,
                   {"x-api-key": k}, segundos=30)
        itens = r.get("results") or r.get("advertisers") or r.get("data") or []
        saida["google"] = [
            {"advertiser_name": i.get("advertiser_name") or i.get("name"),
             "advertiser_id": i.get("advertiser_id") or i.get("id"),
             "country": i.get("country")}
            for i in itens[:5] if isinstance(i, dict)
        ]
    except ErroExterno:
        pass
    return saida


def anuncios_google(user_id, advertiser_id=None, dominio=None, com_detalhe=False):
    """Anuncios no acervo do Google, por anunciante ou por dominio.

    Recuperada do historico do git em 02/09: quando `supabase/functions/` foi
    apagada, so a parte Meta tinha sido portada, e esta ficou para tras.

    ⚠️ `get_ad_details=true` custa mais credito e traz o texto do anuncio. Sem
    ele a resposta e o basico -- por isso o rotulo cai para "Criativo <formato>
    · <anunciante>" em vez de ficar vazio: uma linha sem texto nenhum parece
    defeito na tela, e nao e.
    """
    if advertiser_id:
        qs = "advertiser_id=" + urllib.parse.quote(str(advertiser_id))
    elif dominio:
        qs = "domain=" + urllib.parse.quote(str(dominio))
    else:
        return []
    if com_detalhe:
        qs += "&get_ad_details=true"
    bruto = _pedir("https://api.scrapecreators.com/v1/google/company/ads?" + qs,
                   {"x-api-key": chave(user_id, "scrapecreators")}, segundos=90)
    itens = (bruto if isinstance(bruto, list)
             else bruto.get("ads") or bruto.get("results") or bruto.get("data") or [])
    return [_normalizar_anuncio_google(a) for a in itens if isinstance(a, dict)]


def _primeiro(*valores):
    for v in valores:
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def _normalizar_anuncio_google(bruto):
    # 🚨 O ID E . Medido em 02/09 contra a resposta real do
    # ScrapeCreators: o item traz advertiserId, creativeId, format, adUrl,
    # advertiserName, imageUrl, firstShown e lastShown -- e mais nada. Sem o
    #  na lista, os 40 anuncios do Magalu vieram e ZERO foram
    # gravados, porque a insercao pula quem nao tem identificador.
    ident = _primeiro(bruto.get("creativeId"), bruto.get("creative_id"),
                      bruto.get("adId"), bruto.get("ad_id"), bruto.get("id"))
    if not ident:
        return {"ad_archive_id": "", "raw": bruto}

    anunciante_id = _primeiro(bruto.get("advertiserId"), bruto.get("advertiser_id"))
    anunciante = _primeiro(bruto.get("advertiserName"), bruto.get("advertiser_name"),
                           bruto.get("advertiser"))
    formato = str(bruto.get("format") or bruto.get("creative_format") or "").lower()

    midia = _primeiro(bruto.get("imageUrl"), bruto.get("image_url"),
                      bruto.get("videoUrl"), bruto.get("video_url"),
                      bruto.get("preview_url"), bruto.get("creative_url"))
    criativos = []
    if midia:
        criativos.append({
            "type": "video" if "video" in formato else "image",
            "url": midia,
            "thumbnail": _primeiro(bruto.get("thumbnail_url"), bruto.get("imageUrl")),
        })

    # Sem URL do anuncio, monta a da Transparencia -- o id do anunciante basta.
    url_anuncio = _primeiro(bruto.get("adUrl"), bruto.get("ad_url"))
    if not url_anuncio and anunciante_id:
        url_anuncio = ("https://adstransparency.google.com/advertiser/%s/creative/%s"
                       "?region=anywhere" % (anunciante_id, ident))

    texto = _primeiro(bruto.get("text"), bruto.get("body"), bruto.get("description"),
                      bruto.get("ad_text"))
    if not texto:
        if formato and anunciante:
            texto = "Criativo %s - %s" % (formato, anunciante)
        elif formato:
            texto = "Criativo %s" % formato
        elif anunciante:
            texto = "Anuncio - %s" % anunciante

    ativo = bruto.get("is_active")
    if ativo is None:
        ativo = bruto.get("active")

    return {
        "ad_archive_id": str(ident),
        # 🚨 O acervo do Google NAO devolve sinal de ativo no plano basico.
        # Fica None de proposito: `False` diria "esta parado", que e diferente
        # de "nao sei", e a tela mostra "Veiculando" para o desconhecido.
        "active": ativo if isinstance(ativo, bool) else None,
        "body_text": texto,
        "cta_text": _primeiro(bruto.get("cta"), bruto.get("cta_text")),
        "cta_url": _primeiro(bruto.get("destination_url"), bruto.get("url"),
                             bruto.get("click_url")) or url_anuncio,
        "page_name": anunciante,
        "creatives": criativos or None,
        "start_date": _primeiro(bruto.get("firstShown"), bruto.get("first_shown"),
                                bruto.get("start_date")),
        "platforms": ["google"],
        "raw": bruto,
    }
