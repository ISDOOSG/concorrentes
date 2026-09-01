"""Autenticacao propria -- substitui o GoTrue da Supabase.

Senha em bcrypt na coluna usuario.senha_hash; sessao em JWT HS256.
O segredo vem do .env; se faltar, o servico NAO sobe (falha fechado,
em vez de assinar token com valor previsivel).
"""
import datetime as dt
import os
import uuid

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request

import db

SEGREDO = db.CFG.get("CONCORRENTES_JWT_SECRET")
if not SEGREDO:
    raise RuntimeError(
        "CONCORRENTES_JWT_SECRET ausente em api/.env -- o servico nao sobe sem ele"
    )

ALGO = "HS256"
HORAS_VALIDADE = 24


def hash_senha(senha: str) -> str:
    return bcrypt.hashpw(senha.encode(), bcrypt.gensalt()).decode()


def confere_senha(senha: str, hash_guardado: str) -> bool:
    if not hash_guardado:
        return False
    try:
        return bcrypt.checkpw(senha.encode(), hash_guardado.encode())
    except ValueError:
        return False


def gerar_token(user_id: uuid.UUID, email: str) -> tuple[str, str]:
    expira = dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=HORAS_VALIDADE)
    payload = {"sub": str(user_id), "email": email, "exp": expira}
    return jwt.encode(payload, SEGREDO, algorithm=ALGO), expira.isoformat()


def ler_token(token: str) -> dict:
    try:
        return jwt.decode(token, SEGREDO, algorithms=[ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Sessao expirada. Entre de novo.")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Sessao invalida. Entre de novo.")


async def usuario_atual(request: Request) -> dict:
    """Dependencia de rota: devolve o usuario do bearer token, ou 401."""
    cabecalho = request.headers.get("authorization", "")
    if not cabecalho.lower().startswith("bearer "):
        raise HTTPException(401, "Faltou o token de acesso.")
    dados = ler_token(cabecalho[7:].strip())
    u = db.um(
        "select id, email, nome, ativo from public.usuario where id = %s",
        (dados["sub"],),
    )
    if not u:
        raise HTTPException(401, "Usuario nao existe mais.")
    if not u["ativo"]:
        raise HTTPException(403, "Conta desativada.")
    return u
