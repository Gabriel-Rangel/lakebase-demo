"""Gerador de carga LOCAL (opcional — o Passo 9 roda a carga no Databricks) — N workers com SQL direto no Lakebase.

    docker compose run --rm carga --workers 16 --duracao 300 --modo misto
    docker compose run --rm carga --limpar            # remove as OS criadas pela carga

Modos:  leitura (agregações pesadas + busca textual) · oltp (inserts/updates curtos) · misto (70/30)
Dica: rode antes  `docker compose run --rm seed --volume grande`  para ter volume nas agregações.
"""
import argparse
import random
import statistics
import sys
import threading
import time

from psycopg_pool import ConnectionPool

from .db import LakebaseConnection, montar_conninfo

LEITURAS = [
    ("agregacao_backlog",
     "SELECT unidade, status, count(*), avg(horas_indisponivel) FROM operacao.ordens_servico "
     "WHERE data_abertura > now() - interval '3 years' GROUP BY 1, 2", None),
    ("mttr_por_equipamento",
     "SELECT equipamento_tag, avg(extract(epoch FROM data_conclusao - data_inicio) / 3600) AS mttr "
     "FROM operacao.ordens_servico WHERE status = 'CONCLUIDA' GROUP BY 1 ORDER BY 2 DESC LIMIT 10", None),
    ("busca_textual",
     "SELECT id, numero, titulo FROM operacao.ordens_servico WHERE titulo ILIKE %s ORDER BY data_abertura DESC LIMIT 50",
     lambda: (f"%{random.choice(['vibração', 'vazamento', 'inspeção', 'rolamento', 'filtro', 'trip'])}%",)),
    ("lookup_por_id",
     "SELECT * FROM operacao.ordens_servico WHERE id = %s", lambda: (random.randint(1, 5000),)),
]
TAGS = ["ATL-B-1101A", "GUA-K-2101B", "TUP-TG-3101A", "ATL-V-4101", "GUA-E-5201"]


class Metricas:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.latencias: list[float] = []
        self.erros = 0
        self.total = 0

    def registrar(self, ms: float) -> None:
        with self.lock:
            self.latencias.append(ms)
            self.total += 1

    def erro(self) -> None:
        with self.lock:
            self.erros += 1

    def coletar(self) -> tuple[list[float], int]:
        with self.lock:
            lat, err = self.latencias, self.erros
            self.latencias, self.erros = [], 0
            return lat, err


def operacao_oltp(conn, solicitante_id: int) -> None:
    with conn.transaction():
        os_id = conn.execute(
            "INSERT INTO operacao.ordens_servico (equipamento_tag, unidade, tipo, prioridade, titulo, solicitante_id) "
            "VALUES (%s, 'FPSO Atlântico', 'PREVENTIVA', 'P4', '[carga] inspeção sintética', %s) RETURNING id",
            (random.choice(TAGS), solicitante_id),
        ).fetchone()["id"]
        conn.execute(
            "INSERT INTO operacao.historico_status (entidade, entidade_id, para_status, usuario_id, comentario) "
            "VALUES ('OS', %s, 'ABERTA', %s, 'gerador de carga')",
            (os_id, solicitante_id),
        )
        conn.execute(
            "UPDATE operacao.ordens_servico SET status = 'PLANEJADA', version = version + 1, atualizado_em = now() "
            "WHERE id = %s",
            (os_id,),
        )


def worker(pool: ConnectionPool, modo: str, fim: float, metricas: Metricas, solicitante_id: int) -> None:
    while time.time() < fim:
        escrita = modo == "oltp" or (modo == "misto" and random.random() < 0.3)
        inicio = time.perf_counter()
        try:
            with pool.connection() as conn:
                if escrita:
                    operacao_oltp(conn, solicitante_id)
                else:
                    _, sql, params = random.choice(LEITURAS)
                    conn.execute(sql, params() if params else None).fetchall()
            metricas.registrar((time.perf_counter() - inicio) * 1000)
        except Exception as e:  # noqa: BLE001 — carga não pode parar por um erro isolado
            metricas.erro()
            print(f"   ⚠️ {type(e).__name__}: {str(e)[:120]}", file=sys.stderr)
            time.sleep(0.5)


def percentil(valores: list[float], p: float) -> float:
    if not valores:
        return 0.0
    valores = sorted(valores)
    return valores[min(len(valores) - 1, int(len(valores) * p))]


def main() -> int:
    parser = argparse.ArgumentParser(description="Gerador de carga no Lakebase")
    parser.add_argument("--workers", type=int, default=16)
    parser.add_argument("--duracao", type=int, default=300, help="segundos")
    parser.add_argument("--modo", choices=["leitura", "oltp", "misto"], default="misto")
    parser.add_argument("--limpar", action="store_true", help="apaga as OS criadas pela carga e sai")
    args = parser.parse_args()

    conninfo, kwargs = montar_conninfo("brickhouse-energia-carga")
    pool = ConnectionPool(conninfo, kwargs={**kwargs, "autocommit": True}, connection_class=LakebaseConnection,
                          min_size=1, max_size=max(args.workers, 1), open=True, name="carga")
    with pool.connection() as conn:
        if args.limpar:
            with conn.transaction():
                n = conn.execute("DELETE FROM operacao.ordens_servico WHERE titulo LIKE '[carga]%'").rowcount
                conn.execute("DELETE FROM operacao.historico_status WHERE comentario = 'gerador de carga'")
            print(f"🧹 {n} OS de carga removidas")
            pool.close()
            return 0
        solicitante_id = conn.execute("SELECT min(id) AS id FROM operacao.usuarios").fetchone()["id"]

    print(f"🚀 carga: {args.workers} workers · modo {args.modo} · {args.duracao}s  (Ctrl+C para parar)")
    print(f"{'t(s)':>6} {'ops/s':>8} {'p50 ms':>8} {'p95 ms':>8} {'erros':>6} {'conexões':>9}")
    metricas = Metricas()
    fim = time.time() + args.duracao
    threads = [threading.Thread(target=worker, args=(pool, args.modo, fim, metricas, solicitante_id), daemon=True)
               for _ in range(args.workers)]
    for t in threads:
        t.start()
    inicio = time.time()
    todas: list[float] = []
    try:
        while time.time() < fim:
            time.sleep(5)
            lat, err = metricas.coletar()
            todas += lat
            print(f"{time.time() - inicio:6.0f} {len(lat) / 5:8.1f} {percentil(lat, .5):8.0f} {percentil(lat, .95):8.0f} "
                  f"{err:6d} {pool.get_stats().get('pool_size', 0):9d}", flush=True)
    except KeyboardInterrupt:
        print("\n⏹ interrompido")
    duracao = time.time() - inicio
    print(f"\n✅ {metricas.total} operações em {duracao:.0f}s = {metricas.total / duracao:.1f} ops/s · "
          f"p50 {statistics.median(todas) if todas else 0:.0f} ms · p95 {percentil(todas, .95):.0f} ms")
    pool.close(timeout=5)
    return 0


if __name__ == "__main__":
    sys.exit(main())
