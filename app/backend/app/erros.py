"""Erros HTTP padronizados: detail = {"mensagem": ...} (ver app/API.md)."""
from typing import Optional

from fastapi import HTTPException


def conflito(mensagem: str, versao_atual: Optional[int] = None) -> HTTPException:
    return HTTPException(status_code=409, detail={"mensagem": mensagem, "versao_atual": versao_atual})


def invalido(mensagem: str) -> HTTPException:
    return HTTPException(status_code=422, detail={"mensagem": mensagem})


def nao_encontrado(mensagem: str) -> HTTPException:
    return HTTPException(status_code=404, detail={"mensagem": mensagem})


# Violações de constraint do Postgres → mensagem de negócio. As regras vivem no banco.
CONSTRAINTS = {
    "pt_uma_ativa_por_os": (409, "Já existe uma permissão de trabalho ativa para esta OS"),
    "pt_segregacao_funcoes": (422, "Segregação de funções: quem solicita a PT não pode aprová-la"),
    "loto_cadeado_em_uso": (409, "Este cadeado já está aplicado em outro ponto de isolamento"),
}
