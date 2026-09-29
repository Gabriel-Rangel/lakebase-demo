-- =============================================================================
-- 003 · Bloqueios LOTO (Lockout/Tagout)  —  migração do Extra 1 (Branching)
--
-- Aplique PRIMEIRO no branch "dev":   MIGRATE_TARGET=3 docker compose -p energia-dev ... run --rm migrate
-- O app detecta schema_version >= 3 e habilita a seção "Bloqueios LOTO" nas permissões de trabalho.
-- Produção continua na versão 2 até você decidir promover a mudança.
-- =============================================================================

ALTER TABLE operacao.permissoes_trabalho
  ADD COLUMN requer_loto boolean NOT NULL DEFAULT false;

CREATE TABLE operacao.bloqueios_loto (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  permissao_id      bigint NOT NULL REFERENCES operacao.permissoes_trabalho (id),
  ponto_isolamento  text NOT NULL,
  tipo_energia      text NOT NULL CHECK (tipo_energia IN ('ELETRICA', 'HIDRAULICA', 'PNEUMATICA', 'MECANICA', 'QUIMICA')),
  cadeado_numero    text NOT NULL,
  aplicado_por      integer NOT NULL REFERENCES operacao.usuarios (id),
  aplicado_em       timestamptz NOT NULL DEFAULT now(),
  removido_por      integer REFERENCES operacao.usuarios (id),
  removido_em       timestamptz
);

-- um cadeado físico não pode estar aplicado em dois pontos ao mesmo tempo
CREATE UNIQUE INDEX loto_cadeado_em_uso ON operacao.bloqueios_loto (cadeado_numero) WHERE removido_em IS NULL;
CREATE INDEX loto_permissao_idx ON operacao.bloqueios_loto (permissao_id);

COMMENT ON TABLE operacao.bloqueios_loto IS 'Bloqueios de energia (LOTO) aplicados durante a execução de uma PT';
