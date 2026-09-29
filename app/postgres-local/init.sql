-- Postgres LOCAL (profile "local") — mesmo bootstrap do Passo 2, para o momento "antes / depois"
CREATE ROLE energia_app NOLOGIN;
CREATE ROLE app_energia LOGIN PASSWORD 'energia-local-123';
GRANT energia_app TO app_energia;
CREATE SCHEMA operacao AUTHORIZATION energia_app;
