-- =============================================================================
-- Passo 5.2 · A role do app (energia_app) pode ler as synced tables
-- Onde: SQL Editor do Lakebase · branch "production" · database "energia"
-- 👉 ALTERE "lakebase_workshop" se o schema UC das synced tables for outro (ex.: sufixo por participante)
-- =============================================================================

GRANT USAGE ON SCHEMA lakebase_workshop TO energia_app;
GRANT SELECT ON ALL TABLES IN SCHEMA lakebase_workshop TO energia_app;

-- ✅ Conferência: dono de cada synced table e se energia_app consegue ler
SELECT tablename AS synced_table, tableowner AS dono,
       has_table_privilege('energia_app', schemaname || '.' || tablename, 'SELECT') AS energia_app_le
FROM pg_tables
WHERE schemaname = 'lakebase_workshop'
ORDER BY 1;
