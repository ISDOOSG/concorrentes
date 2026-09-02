#!/usr/bin/env python3
"""Backup do banco `concorrentes`.

🚨 EXISTE PORQUE NÃO EXISTIA. Em 02/09 o cron salvava hub-fotos (03:00),
MoviChat (03:30) e MoviZap (02:40); o `backup_projetos.sh` (02:00) empacota o
DIRETÓRIO `imagohub/concorrentes` -- código, docs e migrações --, e o banco não
tinha uma linha de backup em lugar nenhum. Código se reconstrói do git; o que
está no banco, não.

🚨 O QUE ESTE BACKUP SOZINHO NÃO RESTAURA. As chaves BYOK dos clientes estão
cifradas com `pgp_sym_encrypt` e a chave mestra vive em `api/.env`
(`CONCORRENTES_CRIPTO_CHAVE`), que NÃO entra aqui nem no `backup_projetos.sh`
-- decisão do dono em 28/08 de não empacotar `.env`. Restaurar o dump sem a
chave devolve `user_llm_keys` e `user_scraper_keys` como texto cifrado
indecifrável. A cópia da chave é responsabilidade humana, fora da VPS.

🚨 A SENHA NÃO PASSA POR `argv` NEM FICA DE ENFEITE NO AMBIENTE. Mesma regra do
`backup_db.py` do MoviZap: sai do `.env.db` dentro do processo e vai para um
`.pgpass` temporário 0600, apagado no `finally` -- inclusive quando o `pg_dump`
falha.

⚠️ VERIFICA O QUE GRAVOU. Backup que não abre é pior que backup nenhum, porque
dá confiança. O arquivo só vira definitivo depois de o gzip abrir e as tabelas
esperadas aparecerem dentro dele.

Uso:  api/venv/bin/python scripts/backup_db.py [--reter DIAS]
"""
import argparse
import gzip
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

RAIZ = Path("/home/claude/imagohub/concorrentes")
ENV = RAIZ / ".env.db"
DESTINO = Path("/home/claude/backups/db")

# As tabelas que PRECISAM estar no dump para ele valer. Não é a lista inteira
# de propósito: são as que carregam o que não se reconstrói de outra fonte.
# `competitors` e `snapshots` são o produto; as duas de chave são o que o
# cliente cadastrou e ninguém mais tem.
ESSENCIAIS = ("usuario", "profiles", "competitors", "snapshots", "changes",
              "alerts", "seo_analyses", "social_snapshots", "social_analyses",
              "swot_reports", "ads_snapshots", "user_llm_keys",
              "user_llm_settings", "user_scraper_keys")


def config() -> dict:
    cfg = {}
    for linha in ENV.read_text(encoding="utf-8").splitlines():
        if "=" in linha and not linha.strip().startswith("#"):
            chave, _, valor = linha.partition("=")
            cfg[chave.strip()] = valor.strip()
    return cfg


def dump(cfg: dict, alvo: Path) -> None:
    """Roda o pg_dump com a senha num PGPASSFILE 0600, nunca em argv."""
    pasta = Path(tempfile.mkdtemp(prefix="concorrentes_bkp_"))
    senha = pasta / "pgpass"
    try:
        senha.write_text(
            "{host}:{porta}:{db}:{usuario}:{senha}\n".format(
                host=cfg["CONCORRENTES_DB_HOST"], porta=cfg["CONCORRENTES_DB_PORTA"],
                db=cfg["CONCORRENTES_DB_NOME"], usuario=cfg["CONCORRENTES_DB_USUARIO"],
                senha=cfg["CONCORRENTES_DB_SENHA"]),
            encoding="utf-8")
        senha.chmod(0o600)

        ambiente = dict(os.environ, PGPASSFILE=str(senha))
        # 🚨 O `pg_dump` VAI PARA UM CANO, e a compressão é feita aqui. Passar
        # o `gzip.GzipFile` como `stdout=` falha CALADO: o subprocess usa o
        # `fileno()`, que é o do arquivo de baixo, e o SQL cru entra dentro do
        # `.gz`. Aconteceu no MoviZap em 28/08, e quem pegou foi a conferência
        # -- o `pg_dump` devolveu 0, satisfeito.
        proc = subprocess.Popen(
            ["pg_dump", "-h", cfg["CONCORRENTES_DB_HOST"],
             "-p", cfg["CONCORRENTES_DB_PORTA"], "-U", cfg["CONCORRENTES_DB_USUARIO"],
             "--no-password", cfg["CONCORRENTES_DB_NOME"]],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=ambiente)
        with gzip.open(alvo, "wb") as saida:
            for pedaco in iter(lambda: proc.stdout.read(1 << 20), b""):
                saida.write(pedaco)
        proc.stdout.close()
        erro = proc.stderr.read()
        if proc.wait() != 0:
            raise SystemExit(f"pg_dump falhou: {erro.decode()[:400]}")
    finally:
        senha.unlink(missing_ok=True)
        pasta.rmdir()


def conferir(alvo: Path) -> dict:
    """Abre o arquivo e prova que ele tem o que precisa ter.

    ⚠️ Tabela VAZIA também aparece: o `pg_dump` emite o bloco `COPY` mesmo sem
    linhas. É de propósito que a conferência olhe presença de tabela e não
    contagem de linhas -- em 02/09 o banco tinha 1 usuário e mais nada, e um
    backup correto de um banco vazio continua sendo um backup correto.
    """
    achadas, linhas = set(), 0
    with gzip.open(alvo, "rt", encoding="utf-8", errors="replace") as f:
        for linha in f:
            linhas += 1
            if linha.startswith("COPY public."):
                achadas.add(linha.split("COPY public.", 1)[1].split(" ", 1)[0])
    faltando = [t for t in ESSENCIAIS if t not in achadas]
    return {"linhas": linhas, "tabelas": len(achadas), "faltando": faltando}


def expurgar(dias: int) -> int:
    corte = datetime.now() - timedelta(days=dias)
    saiu = 0
    for velho in DESTINO.glob("concorrentes_*.sql.gz"):
        if datetime.fromtimestamp(velho.stat().st_mtime) < corte:
            velho.unlink()
            saiu += 1
    return saiu


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--reter", type=int, default=14,
                   help="dias de retenção (padrão 14)")
    args = p.parse_args()

    DESTINO.mkdir(parents=True, exist_ok=True)
    agora = datetime.now()
    print(f"{agora:%Y-%m-%d %H:%M:%S}  backup do banco concorrentes")

    cfg = config()
    parcial = DESTINO / f"concorrentes_{agora:%Y-%m-%d_%H%M}.sql.gz.parcial"
    final = parcial.with_suffix("")

    try:
        dump(cfg, parcial)
    except SystemExit as exc:
        parcial.unlink(missing_ok=True)
        print(f"  FALHOU: {exc}")
        return 1

    try:
        conf = conferir(parcial)
    except Exception as exc:
        parcial.unlink(missing_ok=True)
        print(f"  FALHOU ao conferir: o arquivo não abriu ({exc})")
        return 1

    if conf["faltando"]:
        parcial.unlink(missing_ok=True)
        print(f"  FALHOU: faltam tabelas no dump: {', '.join(conf['faltando'])}")
        return 1

    parcial.rename(final)
    tamanho = final.stat().st_size
    print(f"  ok: {final.name} — {tamanho/1024:.0f} KB, "
          f"{conf['tabelas']} tabelas, {conf['linhas']} linhas")
    apagados = expurgar(args.reter)
    if apagados:
        print(f"  expurgo: {apagados} arquivo(s) com mais de {args.reter} dias")
    print("  ⚠️ a CONCORRENTES_CRIPTO_CHAVE não está neste arquivo — sem ela as "
          "chaves BYOK não se decifram")
    return 0


if __name__ == "__main__":
    sys.exit(main())
