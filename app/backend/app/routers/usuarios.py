from fastapi import APIRouter

from .. import db

router = APIRouter(prefix="/api", tags=["usuarios"])


@router.get("/usuarios")
def listar_usuarios():
    return db.consultar(
        "SELECT id, nome, email, papel, unidade FROM operacao.usuarios WHERE ativo "
        "ORDER BY array_position(ARRAY['TECNICO','SUPERVISOR','SEGURANCA','PLANEJADOR'], papel), nome"
    )
