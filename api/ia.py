"""Chamador de IA do Concorrentes -- substitui o gateway da Lovable.

POR QUE GEMINI DIRETO, e nao o gateway:
  `ai.gateway.lovable.dev` autentica com uma chave da Lovable e vive dentro
  do laboratorio que vai ser apagado. A chave Gemini do dono do projeto fala
  com o Google sem intermediario nenhum.

MEDIDO em 2026-09-02, contra a chave deste projeto -- nao presumido:
  - `gemini-2.5-flash`, `-flash-lite` e `-pro`, que as edge functions pediam,
    respondem "no longer available to new users". As constantes vieram do
    gateway, que tinha acesso legado.
  - `gemini-pro-latest` responde "exceeded your current quota": no tier
    gratuito, Pro nao e opcao.
  - `gemini-3.6-flash`, `-3.7-flash` e `gemini-flash-latest` respondem
    "high demand" -- o gratuito nao alcanca o flash mais novo.
  Os dois abaixo responderam. Se um dia pararem, a mensagem de erro diz
  exatamente isso, em vez de devolver vazio.

Sem dependencia nova: `urllib` da biblioteca padrao. O venv nao tem httpx
nem requests, e um POST com JSON nao justifica instalar um.
"""
import json
import urllib.error
import urllib.request

import db

BASE = "https://generativelanguage.googleapis.com/v1beta/models"

MODELO_ANALISE = "gemini-3.5-flash"
MODELO_LEVE = "gemini-flash-lite-latest"

CHAVE_SERVICO = db.CFG.get("CONCORRENTES_GEMINI_CHAVE")
CHAVE_CRIPTO = db.CFG.get("CONCORRENTES_CRIPTO_CHAVE")


class ErroIA(Exception):
    """Falha que o usuario precisa ler, nao um stack trace de 500."""

    def __init__(self, mensagem, status=502):
        super().__init__(mensagem)
        self.mensagem = mensagem
        self.status = status


def chave_do_usuario(user_id, provider):
    """Chave BYOK do usuario, decifrada. None quando ele nao cadastrou nenhuma.

    NAO usa a funcao `get_llm_key` do banco, de proposito -- ver o cabecalho
    de main.py: aquela aceita qualquer _user_id vindo de fora. Aqui o id vem
    do JWT e nunca do cliente.
    """
    linha = db.um(
        "select pgp_sym_decrypt(encrypted_key, %s) as chave "
        "from public.user_llm_keys where user_id = %s and provider = %s",
        (CHAVE_CRIPTO, user_id, provider),
    )
    return linha["chave"] if linha and linha.get("chave") else None


def resolver(user_id, uso="swot"):
    """Devolve (provider, modelo, chave) para este usuario e este uso."""
    s = db.um(
        "select provider, model_classification, model_swot "
        "from public.user_llm_settings where user_id = %s",
        (user_id,),
    )
    s = s or {}
    provider = s.get("provider") or "gemini"
    coluna = "model_swot" if uso == "swot" else "model_classification"
    escolhido = s.get(coluna)

    # `lovable` era o gateway do laboratorio. Em vez de falhar para quem
    # ficou com esse valor gravado, cai no Gemini do projeto. Trocar o
    # provedor continua sendo escolha do usuario, em /llm/provider.
    if provider in ("lovable", "gemini"):
        chave = chave_do_usuario(user_id, "gemini") or CHAVE_SERVICO
        if not chave:
            raise ErroIA(
                "Nenhuma chave de IA disponivel -- nem a do projeto nem uma "
                "sua. Cadastre em Configuracoes, chaves de LLM.",
                status=400,
            )
        return "gemini", escolhido or MODELO_ANALISE, chave

    raise ErroIA(
        "O provedor '%s' ainda nao foi portado. Hoje o servico fala com o "
        "Gemini -- troque o provedor em Configuracoes." % provider,
        status=501,
    )


def _traduzir(codigo, detalhe, modelo):
    d = (detalhe or "").lower()
    if "no longer available" in d:
        return (
            "O modelo %s nao esta mais disponivel para esta chave. Escolha "
            "outro em Configuracoes -- os testados neste projeto sao %s e %s."
            % (modelo, MODELO_ANALISE, MODELO_LEVE)
        )
    if "high demand" in d or codigo == 503:
        return (
            "O modelo %s esta congestionado agora. Tente de novo em alguns "
            "minutos ou escolha %s, que tem fila menor." % (modelo, MODELO_LEVE)
        )
    if codigo == 429 or "quota" in d:
        return (
            "Cota do Gemini estourada para %s. No tier gratuito isso zera "
            "sozinho; para nao esbarrar, habilite cobranca no projeto do "
            "Google ou use %s." % (modelo, MODELO_LEVE)
        )
    if codigo in (401, 403):
        return "A chave do Gemini foi recusada pelo Google (HTTP %s)." % codigo
    return "A API do Gemini respondeu HTTP %s: %s" % (codigo, detalhe or "sem detalhe")


def _chamar(modelo, chave, prompt_sistema, prompt_usuario, json_estrito, esquema=None):
    corpo = {
        "contents": [{"parts": [{"text": prompt_usuario}]}],
        "systemInstruction": {"parts": [{"text": prompt_sistema}]},
        "generationConfig": {"temperature": 0.3},
    }
    if json_estrito:
        corpo["generationConfig"]["responseMimeType"] = "application/json"
    if esquema:
        # `responseSchema` faz o Google validar a forma antes de devolver --
        # e a substituicao do tool-calling que as edge functions usavam para
        # garantir os campos. Sem ele, campo faltando so aparece no parse.
        corpo["generationConfig"]["responseSchema"] = esquema

    req = urllib.request.Request(
        "%s/%s:generateContent" % (BASE, modelo),
        data=json.dumps(corpo).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": chave},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            resposta = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detalhe = ""
        try:
            detalhe = json.loads(e.read().decode("utf-8"))["error"]["message"]
        except Exception:
            pass
        raise ErroIA(_traduzir(e.code, detalhe, modelo))
    except urllib.error.URLError as e:
        raise ErroIA("Nao consegui falar com a API do Gemini: %s" % e.reason)

    candidatos = resposta.get("candidates") or []
    if not candidatos:
        motivo = (resposta.get("promptFeedback") or {}).get("blockReason")
        raise ErroIA(
            "O modelo nao devolveu resposta%s."
            % (" (bloqueio: %s)" % motivo if motivo else "")
        )

    # Modelos com raciocinio devolvem partes marcadas `thought` -- essas nao
    # sao a resposta e entrariam no meio do JSON se fossem concatenadas.
    partes = (candidatos[0].get("content") or {}).get("parts") or []
    texto = "".join(
        p["text"] for p in partes if "text" in p and not p.get("thought")
    )
    if not texto.strip():
        raise ErroIA(
            "O modelo %s terminou sem texto (finishReason=%s)."
            % (modelo, candidatos[0].get("finishReason"))
        )
    return texto, resposta.get("usageMetadata") or {}


def _com_queda(modelo, chave, prompt_sistema, prompt_usuario, json_estrito, esquema=None):
    """Tenta o modelo escolhido; se ele estiver congestionado, cai no leve.

    O tier gratuito derruba o flash mais novo em horario de pico -- MEDIDO em
    02/09, o mesmo modelo respondeu numa chamada e recusou na seguinte. A
    queda NAO e silenciosa: quem chama recebe o modelo que rodou de fato, e
    e esse nome que vai para a coluna `llm_model`.
    """
    try:
        texto, tokens = _chamar(
            modelo, chave, prompt_sistema, prompt_usuario, json_estrito, esquema
        )
        return texto, tokens, modelo
    except ErroIA as e:
        if "congestionado" not in e.mensagem or modelo == MODELO_LEVE:
            raise
        texto, tokens = _chamar(
            MODELO_LEVE, chave, prompt_sistema, prompt_usuario, json_estrito, esquema
        )
        return texto, tokens, MODELO_LEVE


def gerar_json(user_id, prompt_sistema, prompt_usuario, uso="swot", esquema=None):
    """Chama o modelo e devolve (dado, modelo_que_rodou, uso_de_tokens)."""
    _provider, modelo, chave = resolver(user_id, uso)
    texto, tokens, modelo = _com_queda(
        modelo, chave, prompt_sistema, prompt_usuario, True, esquema
    )

    limpo = texto.strip()
    if limpo.startswith("```"):
        limpo = limpo.split("\n", 1)[-1].rsplit("```", 1)[0]
    try:
        return json.loads(limpo), modelo, tokens
    except json.JSONDecodeError:
        raise ErroIA(
            "O modelo %s devolveu resposta fora do JSON esperado." % modelo
        )


def gerar_texto(user_id, prompt_sistema, prompt_usuario, uso="classification"):
    """Mesma coisa, sem exigir JSON. Devolve (texto, modelo, tokens)."""
    _provider, modelo, chave = resolver(user_id, uso)
    texto, tokens, modelo = _com_queda(modelo, chave, prompt_sistema, prompt_usuario, False)
    return texto, modelo, tokens
