"""Equipamentos: cadastro + health score vindos do Lakehouse (synced tables)."""
from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

from ..erros import nao_encontrado
from ..services import equipamentos as srv
from ..services import ordens as ordens_srv

router = APIRouter(prefix="/api/equipamentos", tags=["equipamentos"])

PRIORIDADE_POR_RISCO = {"CRITICO": "P1", "ALTO": "P2", "MEDIO": "P3", "BAIXO": "P4"}


@router.get("")
def listar(unidade: Optional[str] = None, risco: Optional[str] = None, busca: Optional[str] = Query(None)):
    fonte, atualizado_em, itens = srv.listar()
    if unidade:
        itens = [i for i in itens if i["unidade"] == unidade]
    if risco:
        itens = [i for i in itens if i["risco"] == risco]
    if busca:
        b = busca.lower()
        itens = [i for i in itens if b in i["tag"].lower() or b in i["nome"].lower()]
    return {"fonte": fonte, "atualizado_em": atualizado_em, "itens": itens}


def _buscar(tag: str) -> tuple[str, dict]:
    fonte, _, itens = srv.listar()
    eq = next((i for i in itens if i["tag"] == tag), None)
    if not eq:
        raise nao_encontrado(f"Equipamento {tag} não encontrado")
    return fonte, eq


@router.get("/{tag}")
def detalhe(tag: str):
    fonte, eq = _buscar(tag)
    return {
        "fonte": fonte,
        "equipamento": eq,
        "tendencia": srv.tendencia(tag),
        "ordens": ordens_srv.listar_os(equipamento_tag=tag, limite=20)["itens"],
    }


class OsPreditiva(BaseModel):
    solicitante_id: int


@router.post("/{tag}/os-preditiva", status_code=201)
def criar_os_preditiva(tag: str, corpo: OsPreditiva):
    """O insight do Lakehouse vira ação no transacional: 1 clique → OS preditiva no Lakebase."""
    _, eq = _buscar(tag)
    risco = eq.get("risco") or "MEDIO"
    sinal = eq.get("principal_sinal") or "desvio de comportamento"
    return ordens_srv.criar_os({
        "equipamento_tag": tag,
        "tipo": "PREDITIVA",
        "prioridade": PRIORIDADE_POR_RISCO.get(risco, "P3"),
        "origem": "PREDITIVA_LAKEHOUSE",
        "titulo": f"Manutenção preditiva — {sinal}",
        "descricao": (
            f"OS gerada a partir do health score calculado no Lakehouse "
            f"(score {eq.get('health_score') if eq.get('health_score') is not None else '—'}, risco {risco}). "
            f"Recomendação: {eq.get('recomendacao') or 'inspecionar o equipamento'}."
        ),
        "solicitante_id": corpo.solicitante_id,
        "comentario": "Criada a partir do insight do Lakehouse (synced table)",
    })
