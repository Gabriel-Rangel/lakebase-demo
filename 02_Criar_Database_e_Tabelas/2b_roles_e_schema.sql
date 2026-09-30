-- =============================================================================
-- Passo 2b · Roles e schema do app
-- Onde: SQL Editor do Lakebase · branch "production" · database "energia"
-- Rode como você (dono do projeto). Não precisa editar nada: usa current_user.
-- =============================================================================

-- energia_app = "role de aplicação": dona de todos os objetos do app, não faz login.
-- Quem precisa usar o app (você agora, o Service Principal no Passo 6) vira MEMBRO dela.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'energia_app') THEN
    CREATE ROLE energia_app NOLOGIN;
  END IF;
  EXECUTE format('GRANT energia_app TO %I', current_user);
  EXECUTE format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO energia_app', current_database());
END $$;

CREATE SCHEMA IF NOT EXISTS operacao AUTHORIZATION energia_app;
COMMENT ON SCHEMA operacao IS 'OLTP do app Brickhouse Energia (escrito pelo app)';

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;   -- observabilidade (Passo 9)

-- ✅ Conferência: energia_app existe e você é membro dela
SELECT r.rolname AS role, r.rolcanlogin AS faz_login,
       coalesce(string_agg(m.rolname, ', '), '') AS membro_de
FROM pg_roles r
LEFT JOIN pg_auth_members am ON am.member = r.oid
LEFT JOIN pg_roles m ON m.oid = am.roleid
WHERE r.rolname = 'energia_app' OR r.rolname = current_user
GROUP BY r.rolname, r.rolcanlogin
ORDER BY 1;
