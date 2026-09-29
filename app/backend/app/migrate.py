"""Aplica as migrações SQL (migrations/NNN_nome.sql) até MIGRATE_TARGET — idempotente.

    python -m app.migrate                    # até MIGRATE_TARGET (padrão 2)
    MIGRATE_TARGET=3 python -m app.migrate   # Extra 1: LOTO (aplicar primeiro no branch dev!)

Roda com SET ROLE energia_app: todos os objetos pertencem à role do app, não a uma pessoa/SP.
Use o host direto do endpoint (não o -pooler): SET ROLE é estado de sessão.
"""
import logging
import pathlib
import sys

from psycopg import sql

from .config import settings
from .db import LakebaseConnection, montar_conninfo

DIR_MIGRACOES = pathlib.Path(__file__).resolve().parent.parent / "migrations"
log = logging.getLogger("energia.migrate")


def main() -> int:
    conninfo, kwargs = montar_conninfo("brickhouse-energia-migrate")
    alvo = settings.migrate_target
    with LakebaseConnection.connect(conninfo, autocommit=True, **kwargs) as conn:
        info = conn.execute("SELECT current_user AS u, current_database() AS d").fetchone()
        print(f"🐘 conectado como {info['u']} em {info['d']} — alvo: versão {alvo}")
        conn.execute(sql.SQL("SET ROLE {}").format(sql.Identifier(settings.db_owner_role)))
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS operacao.schema_migrations (
              versao      integer PRIMARY KEY,
              nome        text NOT NULL,
              aplicada_em timestamptz NOT NULL DEFAULT now(),
              aplicada_por text NOT NULL DEFAULT session_user
            )
            """
        )
        aplicadas = {r["versao"] for r in conn.execute("SELECT versao FROM operacao.schema_migrations")}

        for arquivo in sorted(DIR_MIGRACOES.glob("[0-9][0-9][0-9]_*.sql")):
            versao = int(arquivo.name[:3])
            if versao in aplicadas:
                print(f"   ✔ {arquivo.name} (já aplicada)")
                continue
            if versao > alvo:
                print(f"   ⏭ {arquivo.name} (acima do alvo {alvo})")
                continue
            with conn.transaction():
                conn.execute(arquivo.read_text(encoding="utf-8"))
                conn.execute(
                    "INSERT INTO operacao.schema_migrations (versao, nome) VALUES (%s, %s)",
                    (versao, arquivo.stem),
                )
            print(f"   ✅ {arquivo.name} aplicada")

        versao_atual = conn.execute("SELECT coalesce(max(versao), 0) AS v FROM operacao.schema_migrations").fetchone()["v"]
        print(f"🏁 schema_version = {versao_atual}")
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    sys.exit(main())
