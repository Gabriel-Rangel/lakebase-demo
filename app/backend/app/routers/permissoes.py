"""Permissões de Trabalho (PT) — fluxo de aprovação + bloqueios LOTO (após a migração 003)."""
from typing import Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..services import ordens as srv

router = APIRouter(prefix="/api/permissoes", tags=["permissoes"])

TipoPT = Literal["TRABALHO_A_QUENTE", "ESPACO_CONFINADO", "ELETRICA", "ALTURA", "GERAL"]


class NovaPT(BaseModel):
    ordem_id: int
    tipo: TipoPT
    riscos: list[str] = []
    medidas_controle: Optional[str] = None
    validade_horas: int = Field(8, ge=1, le=24)
    solicitante_id: int
    requer_loto: bool = False


class Decisao(BaseModel):
    usuario_id: int
    version: int
    comentario: Optional[str] = None
    horas_indisponivel: Optional[float] = Field(None, ge=0)


class NovoBloqueio(BaseModel):
    usuario_id: int
    ponto_isolamento: str = Field(min_length=2)
    tipo_energia: Literal["ELETRICA", "HIDRAULICA", "PNEUMATICA", "MECANICA", "QUIMICA"]
    cadeado_numero: str = Field(min_length=1)


class Usuario(BaseModel):
    usuario_id: int


@router.get("")
def listar(status: Optional[str] = None, unidade: Optional[str] = None):
    return srv.listar_pts(status, unidade)


@router.post("", status_code=201)
def criar(corpo: NovaPT):
    return srv.criar_pt(corpo.model_dump())


@router.post("/{pt_id}/bloqueios", status_code=201)
def aplicar_bloqueio(pt_id: int, corpo: NovoBloqueio):
    return srv.aplicar_bloqueio(pt_id, corpo.model_dump())


@router.post("/{pt_id}/bloqueios/{bloqueio_id}/remover")
def remover_bloqueio(pt_id: int, bloqueio_id: int, corpo: Usuario):
    return srv.remover_bloqueio(pt_id, bloqueio_id, corpo.usuario_id)


# registrada por último: "/{pt_id}/{acao}" casaria com "/{pt_id}/bloqueios"
@router.post("/{pt_id}/{acao}")
def decidir(pt_id: int, acao: Literal["aprovar", "rejeitar", "iniciar", "encerrar"], corpo: Decisao):
    return srv.decidir_pt(pt_id, acao, corpo.usuario_id, corpo.version, corpo.comentario, corpo.horas_indisponivel)
