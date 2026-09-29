"""Ordens de Serviço (OLTP)."""
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from ..services import ordens as srv

router = APIRouter(prefix="/api/ordens", tags=["ordens"])

TipoOS = Literal["CORRETIVA", "PREVENTIVA", "PREDITIVA"]
Prioridade = Literal["P1", "P2", "P3", "P4"]
StatusOS = Literal["ABERTA", "PLANEJADA", "AGUARDANDO_PT", "EM_EXECUCAO", "CONCLUIDA", "CANCELADA"]


class NovaOS(BaseModel):
    equipamento_tag: str
    tipo: TipoOS
    prioridade: Prioridade
    titulo: str = Field(min_length=3, max_length=200)
    descricao: Optional[str] = None
    solicitante_id: int
    data_prevista: Optional[date] = None


class EdicaoOS(BaseModel):
    version: int
    usuario_id: int
    titulo: Optional[str] = Field(None, min_length=3, max_length=200)
    descricao: Optional[str] = None
    prioridade: Optional[Prioridade] = None
    responsavel_id: Optional[int] = None
    data_prevista: Optional[date] = None


class Transicao(BaseModel):
    para_status: StatusOS
    usuario_id: int
    version: int
    comentario: Optional[str] = None


@router.get("")
def listar(status: Optional[str] = None, unidade: Optional[str] = None, prioridade: Optional[str] = None,
           busca: Optional[str] = None, limite: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
    return srv.listar_os(status, unidade, prioridade, busca, None, limite, offset)


@router.post("", status_code=201)
def criar(corpo: NovaOS):
    return srv.criar_os(corpo.model_dump())


@router.get("/{os_id}")
def detalhe(os_id: int):
    return srv.detalhe_os(os_id)


@router.patch("/{os_id}")
def editar(os_id: int, corpo: EdicaoOS):
    campos = corpo.model_dump(exclude={"version", "usuario_id"}, exclude_unset=True)
    return srv.atualizar_os(os_id, corpo.version, corpo.usuario_id, campos)


@router.post("/{os_id}/transicao")
def transicao(os_id: int, corpo: Transicao):
    return srv.transicionar_os(os_id, corpo.para_status, corpo.usuario_id, corpo.version, corpo.comentario)
