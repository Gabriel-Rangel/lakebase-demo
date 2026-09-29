-- =============================================================================
-- 001 · Schema OLTP da Brickhouse Energia (Lakebase = Postgres 17)
-- Executado pelo serviço "migrate" com SET ROLE energia_app (dona de todos os objetos).
-- As regras críticas ficam NO BANCO (CHECK, UNIQUE parcial, FK): o app não consegue burlá-las.
-- =============================================================================

CREATE TABLE operacao.usuarios (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome        text NOT NULL,
  email       text NOT NULL UNIQUE,
  papel       text NOT NULL CHECK (papel IN ('TECNICO', 'SUPERVISOR', 'SEGURANCA', 'PLANEJADOR')),
  unidade     text,
  ativo       boolean NOT NULL DEFAULT true,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE operacao.os_numero_seq;

CREATE TABLE operacao.ordens_servico (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero              text NOT NULL UNIQUE
                      DEFAULT ('OS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('operacao.os_numero_seq')::text, 6, '0')),
  equipamento_tag     text NOT NULL,          -- cadastro mestre vem do Lakehouse (synced table)
  unidade             text NOT NULL,          -- FPSO
  tipo                text NOT NULL CHECK (tipo IN ('CORRETIVA', 'PREVENTIVA', 'PREDITIVA')),
  prioridade          text NOT NULL CHECK (prioridade IN ('P1', 'P2', 'P3', 'P4')),
  status              text NOT NULL DEFAULT 'ABERTA'
                      CHECK (status IN ('ABERTA', 'PLANEJADA', 'AGUARDANDO_PT', 'EM_EXECUCAO', 'CONCLUIDA', 'CANCELADA')),
  origem              text NOT NULL DEFAULT 'MANUAL' CHECK (origem IN ('MANUAL', 'PREDITIVA_LAKEHOUSE')),
  titulo              text NOT NULL,
  descricao           text,
  solicitante_id      integer NOT NULL REFERENCES operacao.usuarios (id),
  responsavel_id      integer REFERENCES operacao.usuarios (id),
  data_abertura       timestamptz NOT NULL DEFAULT now(),
  data_prevista       date,
  data_inicio         timestamptz,
  data_conclusao      timestamptz,
  horas_indisponivel  numeric(8, 2),
  version             integer NOT NULL DEFAULT 1,   -- lock otimista
  atualizado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE operacao.pt_numero_seq;

CREATE TABLE operacao.permissoes_trabalho (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero              text NOT NULL UNIQUE
                      DEFAULT ('PT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('operacao.pt_numero_seq')::text, 5, '0')),
  ordem_id            bigint NOT NULL REFERENCES operacao.ordens_servico (id),
  tipo                text NOT NULL CHECK (tipo IN ('TRABALHO_A_QUENTE', 'ESPACO_CONFINADO', 'ELETRICA', 'ALTURA', 'GERAL')),
  status              text NOT NULL DEFAULT 'SOLICITADA'
                      CHECK (status IN ('SOLICITADA', 'APROVADA', 'REJEITADA', 'EM_EXECUCAO', 'ENCERRADA', 'CANCELADA')),
  riscos              jsonb NOT NULL DEFAULT '[]'::jsonb,
  medidas_controle    text,
  validade_horas      integer NOT NULL DEFAULT 8 CHECK (validade_horas BETWEEN 1 AND 24),
  solicitante_id      integer NOT NULL REFERENCES operacao.usuarios (id),
  aprovador_id        integer REFERENCES operacao.usuarios (id),
  comentario_decisao  text,
  validade_inicio     timestamptz,
  validade_fim        timestamptz,
  criada_em           timestamptz NOT NULL DEFAULT now(),
  decidida_em         timestamptz,
  version             integer NOT NULL DEFAULT 1,
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  -- segregação de funções: quem solicita não aprova
  CONSTRAINT pt_segregacao_funcoes CHECK (aprovador_id IS NULL OR aprovador_id <> solicitante_id)
);

-- no máximo UMA permissão ativa por ordem de serviço
CREATE UNIQUE INDEX pt_uma_ativa_por_os ON operacao.permissoes_trabalho (ordem_id)
  WHERE status IN ('APROVADA', 'EM_EXECUCAO');

CREATE TABLE operacao.historico_status (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entidade     text NOT NULL CHECK (entidade IN ('OS', 'PT')),
  entidade_id  bigint NOT NULL,
  de_status    text,
  para_status  text NOT NULL,
  usuario_id   integer REFERENCES operacao.usuarios (id),
  comentario   text,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
