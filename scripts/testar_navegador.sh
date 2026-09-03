#!/usr/bin/env bash
# Roda a suite de navegador contra o site no ar.
#
# O usuario de teste nasce aqui com senha aleatoria, vive o tempo do teste e
# e apagado no fim -- inclusive se o teste falhar ou for interrompido, pelo
# `trap`. Uma conta de teste esquecida num site publico e uma porta aberta.
#
# A senha nunca toca disco: sai do script Python pelo stdout e vai direto
# para a variavel de ambiente do Playwright.
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

export PATH="/home/claude/.local/node22/bin:$PATH"
PY="$RAIZ/api/venv/bin/python"

limpar() {
  "$PY" scripts/usuario_de_teste.py apagar || true
}
trap limpar EXIT INT TERM

SENHA_TESTE="$("$PY" scripts/usuario_de_teste.py criar)"
if [ -z "$SENHA_TESTE" ]; then
  echo "nao consegui criar o usuario de teste" >&2
  exit 1
fi
export SENHA_TESTE

npx playwright test "$@"
codigo=$?

exit $codigo
