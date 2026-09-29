"""Configuração do backend — tudo via variáveis de ambiente (arquivo app/.env no docker compose).

As variáveis de conexão seguem o padrão libpq (PGHOST, PGUSER, ...): o mesmo app conecta num
Postgres local, num Postgres em container ou no Lakebase — muda só a configuração.
"""
from typing import Literal, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", case_sensitive=False)

    # oauth    = Service Principal (OAuth M2M) — token do Lakebase gerado e renovado pelo backend
    # password = role Postgres nativa com senha (PGUSER/PGPASSWORD) — "só troque a connection string"
    # profile  = seu usuário via perfil do Databricks CLI (somente com o backend rodando no host, fora do Docker)
    lakebase_auth_mode: Literal["oauth", "password", "profile"] = "oauth"
    # projects/<projeto>/branches/<branch>/endpoints/<endpoint> — usado para gerar o token e descobrir o host
    lakebase_endpoint: Optional[str] = None

    pghost: Optional[str] = None
    pgport: int = 5432
    pgdatabase: str = "energia"
    pguser: Optional[str] = None
    pgpassword: Optional[str] = None
    pgsslmode: str = "require"

    # Pool: 1 conexão sempre pronta (evita ~1s de TLS+token). Com DB_POOL_MIN=0 + max_idle o pool
    # esvazia quando ninguém usa o app — e o compute pode fazer scale-to-zero (Extra 2)
    db_pool_min: int = 1
    db_pool_max: int = 10
    db_pool_max_lifetime: int = 2700  # 45 min — recicla antes do token OAuth (1h) expirar
    db_pool_max_idle: int = 300
    db_statement_timeout_ms: int = 15000

    # Role dona dos objetos do app (as migrações rodam com SET ROLE)
    db_owner_role: str = "energia_app"
    migrate_target: int = 2

    app_ambiente: str = "produção"
    dados_equipamentos_csv: str = "/app/dados/equipamentos.csv"


settings = Settings()
