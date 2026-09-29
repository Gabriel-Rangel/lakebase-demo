"""Popula o OLTP com usuários e ~90 dias de histórico de OS/PT (idempotente) — executa sql/seed_demo.sql.

    python -m app.seed                                   # base: usuários + ~300 OS
    python -m app.seed --volume grande --quantidade 200000   # +200 mil OS históricas via COPY (carga local)
    python -m app.seed --reset                               # zera o OLTP e popula de novo (antes da demo)
"""
import argparse
import csv
import pathlib
import random
import sys
from datetime import datetime, timedelta, timezone

from .config import settings
from .db import LakebaseConnection, montar_conninfo

# Dados base: o MESMO SQL do Passo 2 (notebook / SQL Editor do Lakebase) — fonte única
SEED_SQL = pathlib.Path(__file__).resolve().parent.parent / "sql" / "seed_demo.sql"
TITULOS_HISTORICO = ["Troca de óleo e inspeção", "Inspeção de rotina", "Reparo de vazamento",
                     "Análise de vibração", "Calibração de instrumentos", "Troca de filtros"]


def carregar_equipamentos() -> list[dict]:
    with open(settings.dados_equipamentos_csv, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def conectar():
    conninfo, kwargs = montar_conninfo("brickhouse-energia-seed")
    return LakebaseConnection.connect(conninfo, **kwargs)


def seed_base(conn) -> None:
    conn.add_notice_handler(lambda aviso: print(f"📣 {aviso.message_primary}"))
    conn.execute(SEED_SQL.read_text(encoding="utf-8"))
    conn.commit()


def seed_grande(conn, rnd: random.Random, quantidade: int) -> None:
    """Histórico antigo (3 anos) via COPY — volume para consultas pesadas."""
    equipamentos = carregar_equipamentos()
    solicitantes = [r["id"] for r in conn.execute("SELECT id FROM operacao.usuarios WHERE papel = 'TECNICO'")]
    agora = datetime.now(timezone.utc)
    colunas = ("equipamento_tag, unidade, tipo, prioridade, status, origem, titulo, solicitante_id, "
               "data_abertura, data_inicio, data_conclusao, horas_indisponivel, atualizado_em")
    with conn.cursor().copy(f"COPY operacao.ordens_servico ({colunas}) FROM STDIN") as copy:
        for i in range(quantidade):
            eq = rnd.choice(equipamentos)
            abertura = agora - timedelta(days=rnd.uniform(91, 3 * 365))
            inicio = abertura + timedelta(hours=rnd.uniform(4, 72))
            conclusao = inicio + timedelta(hours=rnd.uniform(2, 30))
            tipo = rnd.choice(["CORRETIVA", "PREVENTIVA", "PREDITIVA"])
            copy.write_row((
                eq["tag"], eq["unidade"], tipo, rnd.choice(["P1", "P2", "P3", "P4"]),
                "CONCLUIDA" if rnd.random() < 0.95 else "CANCELADA", "MANUAL",
                f"[histórico] {rnd.choice(TITULOS_HISTORICO)} — {eq['nome']}", rnd.choice(solicitantes),
                abertura, inicio, conclusao, round((conclusao - inicio).total_seconds() / 3600, 2), conclusao,
            ))
            if i and i % 50000 == 0:
                print(f"   … {i:,} linhas")
    conn.commit()
    conn.execute("ANALYZE operacao.ordens_servico")
    print(f"✅ +{quantidade:,} OS históricas (COPY)")


def resetar(conn) -> None:
    """Zera o OLTP (mantém o schema) — para recomeçar a demo do zero."""
    loto = conn.execute("SELECT to_regclass('operacao.bloqueios_loto') IS NOT NULL AS v").fetchone()["v"]
    tabelas = ["operacao.historico_status", "operacao.permissoes_trabalho", "operacao.ordens_servico", "operacao.usuarios"]
    if loto:
        tabelas.insert(0, "operacao.bloqueios_loto")
    conn.execute(f"TRUNCATE {', '.join(tabelas)} RESTART IDENTITY")
    conn.execute("ALTER SEQUENCE operacao.os_numero_seq RESTART")
    conn.execute("ALTER SEQUENCE operacao.pt_numero_seq RESTART")
    conn.commit()
    print("🧹 OLTP zerado")


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed do OLTP Brickhouse Energia")
    parser.add_argument("--volume", choices=["base", "grande"], default="base")
    parser.add_argument("--quantidade", type=int, default=200_000)
    parser.add_argument("--reset", action="store_true", help="apaga os dados do OLTP antes de popular")
    args = parser.parse_args()
    rnd = random.Random(2026)
    with conectar() as conn:
        if args.reset:
            resetar(conn)
        seed_base(conn)
        if args.volume == "grande":
            seed_grande(conn, rnd, args.quantidade)
    return 0


if __name__ == "__main__":
    sys.exit(main())
