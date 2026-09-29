"""Brickhouse Energia — API (FastAPI) rodando FORA do Databricks e conectada ao Lakebase."""
import logging
from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from . import db
from .erros import CONSTRAINTS
from .routers import equipamentos, meta, ordens, painel, permissoes, usuarios

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.abrir_pool()
    yield
    db.fechar_pool()


app = FastAPI(title="Brickhouse Energia API", version="1.0.0", lifespan=lifespan,
              description="OLTP no Lakebase + analytics do Lakehouse via synced tables")

for r in (meta, usuarios, equipamentos, ordens, permissoes, painel):
    app.include_router(r.router)


@app.exception_handler(db.LakebaseIndisponivel)
def lakebase_indisponivel(_: Request, exc: db.LakebaseIndisponivel):
    logging.getLogger("energia").warning("Lakebase indisponível: %s", exc)
    return JSONResponse(status_code=503, content={"detail": {
        "mensagem": "Lakebase indisponível no momento (compute acordando do scale-to-zero ou rede). Tente novamente."}})


@app.exception_handler(psycopg.errors.IntegrityError)
def violacao_integridade(_: Request, exc: psycopg.errors.IntegrityError):
    status, mensagem = CONSTRAINTS.get(exc.diag.constraint_name or "", (409, f"Violação de integridade: {exc.diag.message_primary}"))
    return JSONResponse(status_code=status, content={"detail": {"mensagem": mensagem, "versao_atual": None}})
