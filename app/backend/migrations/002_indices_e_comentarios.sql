-- =============================================================================
-- 002 · Índices para as telas do app e comentários (aparecem no Unity Catalog no Passo 3)
-- =============================================================================

CREATE INDEX os_status_idx         ON operacao.ordens_servico (status);
CREATE INDEX os_unidade_status_idx ON operacao.ordens_servico (unidade, status);
CREATE INDEX os_equipamento_idx    ON operacao.ordens_servico (equipamento_tag);
CREATE INDEX os_abertura_idx       ON operacao.ordens_servico (data_abertura DESC);
CREATE INDEX pt_ordem_idx          ON operacao.permissoes_trabalho (ordem_id);
CREATE INDEX pt_status_idx         ON operacao.permissoes_trabalho (status);
CREATE INDEX hist_entidade_idx     ON operacao.historico_status (entidade, entidade_id, criado_em);

COMMENT ON TABLE operacao.usuarios IS 'Pessoas que operam o app (técnicos, supervisores, segurança, planejamento)';
COMMENT ON TABLE operacao.ordens_servico IS 'Ordens de serviço de manutenção dos FPSOs (OLTP — escrito pelo app)';
COMMENT ON TABLE operacao.permissoes_trabalho IS 'Permissões de trabalho (PT) com fluxo de aprovação e segregação de funções';
COMMENT ON TABLE operacao.historico_status IS 'Trilha de auditoria append-only de todas as mudanças de status de OS e PT';
COMMENT ON COLUMN operacao.ordens_servico.version IS 'Lock otimista: incrementado a cada alteração';
COMMENT ON COLUMN operacao.ordens_servico.origem IS 'PREDITIVA_LAKEHOUSE = criada a partir do health score calculado no Lakehouse';
COMMENT ON COLUMN operacao.ordens_servico.horas_indisponivel IS 'Horas de indisponibilidade do equipamento (base da disponibilidade no gold)';
