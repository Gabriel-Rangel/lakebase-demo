-- =============================================================================
-- Passo 6b · Camada 3 — privilégios do Service Principal no Postgres
-- Onde: SQL Editor do Lakebase · branch "production" · database "energia"
-- Antes: camadas 1 (CAN USE no projeto) e 2 (Add role › OAuth) feitas na UI.
-- =============================================================================

-- 👉 ALTERE: troque o UUID abaixo pelo Client ID do energia-app-sp (mantenha as aspas duplas)
GRANT energia_app TO "00000000-0000-0000-0000-000000000000";

-- ✅ Conferência: quem é membro de energia_app e o que consegue fazer
SELECT DISTINCT m.rolname AS membro_de_energia_app,
       has_table_privilege(m.rolname, 'operacao.ordens_servico', 'INSERT') AS insere_os,
       CASE WHEN to_regclass('lakebase_workshop.saude_equipamentos') IS NULL THEN NULL
            ELSE has_table_privilege(m.rolname, 'lakebase_workshop.saude_equipamentos', 'SELECT') END AS le_saude
FROM pg_auth_members am
JOIN pg_roles r ON r.oid = am.roleid
JOIN pg_roles m ON m.oid = am.member
WHERE r.rolname = 'energia_app'
ORDER BY 1;
