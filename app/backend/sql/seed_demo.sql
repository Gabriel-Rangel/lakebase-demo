-- =============================================================================
-- Dados de demonstração do OLTP — ~90 dias de operação da Brickhouse Energia
--   • 12 usuários · 300 ordens de serviço · permissões de trabalho · histórico de status
--   • idempotente: se já houver OS, só os usuários são garantidos
-- Executado pelo Passo 2 (notebook) ou colado no SQL Editor do Lakebase (database "energia").
-- =============================================================================

SELECT setseed(0.2026);   -- dados reproduzíveis

INSERT INTO operacao.usuarios (nome, email, papel, unidade) VALUES
  ('Ana Souza',       'ana.souza@brickhouse-energia.example',       'TECNICO',    'FPSO Atlântico'),
  ('Diego Rocha',     'diego.rocha@brickhouse-energia.example',     'TECNICO',    'FPSO Atlântico'),
  ('Bruno Lima',      'bruno.lima@brickhouse-energia.example',      'TECNICO',    'FPSO Guanabara'),
  ('Paula Nunes',     'paula.nunes@brickhouse-energia.example',     'TECNICO',    'FPSO Guanabara'),
  ('Carla Mendes',    'carla.mendes@brickhouse-energia.example',    'TECNICO',    'FPSO Tupinambá'),
  ('Rafael Dias',     'rafael.dias@brickhouse-energia.example',     'TECNICO',    'FPSO Tupinambá'),
  ('Eduardo Martins', 'eduardo.martins@brickhouse-energia.example', 'SUPERVISOR', 'FPSO Atlântico'),
  ('Fernanda Alves',  'fernanda.alves@brickhouse-energia.example',  'SUPERVISOR', 'FPSO Guanabara'),
  ('Gustavo Pereira', 'gustavo.pereira@brickhouse-energia.example', 'SUPERVISOR', 'FPSO Tupinambá'),
  ('Helena Costa',    'helena.costa@brickhouse-energia.example',    'SEGURANCA',  NULL),
  ('Igor Santos',     'igor.santos@brickhouse-energia.example',     'SEGURANCA',  NULL),
  ('Juliana Ribeiro', 'juliana.ribeiro@brickhouse-energia.example', 'PLANEJADOR', NULL)
ON CONFLICT (email) DO NOTHING;

DO $seed$
DECLARE
  agora constant timestamptz := now();
  n_os integer;
  n_pt integer;
  n_hist integer;
BEGIN
  IF EXISTS (SELECT 1 FROM operacao.ordens_servico) THEN
    RAISE NOTICE 'operacao.ordens_servico já tem dados — histórico não foi recriado';
    RETURN;
  END IF;

  -- mesmas tags do cadastro mestre do Lakehouse (dados/equipamentos.csv)
  CREATE TEMP TABLE seed_eq ON COMMIT DROP AS
  SELECT u.cod || '-' || m.suf AS tag, m.nome, m.tipo, u.unidade,
         (u.cod || '-' || m.suf) = ANY (ARRAY['ATL-K-2101A', 'GUA-B-1101A', 'TUP-TG-3101B',
                                              'ATL-B-1201B', 'GUA-E-5101', 'TUP-K-2201']) AS degradando
  FROM (VALUES
      ('B-1101A', 'Bomba de Injeção de Água A', 'BOMBA'), ('B-1101B', 'Bomba de Injeção de Água B', 'BOMBA'),
      ('B-1201A', 'Bomba de Transferência de Óleo A', 'BOMBA'), ('B-1201B', 'Bomba de Transferência de Óleo B', 'BOMBA'),
      ('B-1301', 'Bomba de Água Produzida', 'BOMBA'),
      ('K-2101A', 'Compressor Principal de Gás A', 'COMPRESSOR'), ('K-2101B', 'Compressor Principal de Gás B', 'COMPRESSOR'),
      ('K-2201', 'Compressor de Exportação de Gás', 'COMPRESSOR'),
      ('TG-3101A', 'Turbogerador A', 'TURBOGERADOR'), ('TG-3101B', 'Turbogerador B', 'TURBOGERADOR'),
      ('TG-3101C', 'Turbogerador C', 'TURBOGERADOR'),
      ('V-4101', 'Separador de Produção', 'SEPARADOR'), ('V-4201', 'Separador de Teste', 'SEPARADOR'),
      ('E-5101', 'Resfriador de Gás', 'TROCADOR'), ('E-5201', 'Aquecedor de Óleo', 'TROCADOR')
    ) AS m(suf, nome, tipo)
  CROSS JOIN (VALUES ('ATL', 'FPSO Atlântico'), ('GUA', 'FPSO Guanabara'), ('TUP', 'FPSO Tupinambá')) AS u(cod, unidade);

  CREATE TEMP TABLE seed_titulo ON COMMIT DROP AS
  SELECT * FROM (VALUES
      ('CORRETIVA', 'BOMBA', 'Vazamento no selo mecânico'), ('CORRETIVA', 'BOMBA', 'Ruído anormal no rolamento'),
      ('CORRETIVA', 'BOMBA', 'Queda de vazão de descarga'),
      ('CORRETIVA', 'COMPRESSOR', 'Alarme de alta vibração'), ('CORRETIVA', 'COMPRESSOR', 'Temperatura elevada no mancal'),
      ('CORRETIVA', 'COMPRESSOR', 'Falha na válvula de sucção'),
      ('CORRETIVA', 'TURBOGERADOR', 'Trip por alta temperatura de exaustão'),
      ('CORRETIVA', 'TURBOGERADOR', 'Falha no sistema de lubrificação'), ('CORRETIVA', 'TURBOGERADOR', 'Oscilação de frequência'),
      ('CORRETIVA', 'SEPARADOR', 'Falha no controle de nível'), ('CORRETIVA', 'SEPARADOR', 'Vazamento em flange'),
      ('CORRETIVA', 'SEPARADOR', 'Instrumento de pressão com leitura errática'),
      ('CORRETIVA', 'TROCADOR', 'Perda de eficiência térmica'), ('CORRETIVA', 'TROCADOR', 'Vazamento no casco'),
      ('CORRETIVA', 'TROCADOR', 'Incrustação nos tubos'),
      ('PREVENTIVA', 'BOMBA', 'Troca de óleo e inspeção de acoplamento'), ('PREVENTIVA', 'BOMBA', 'Inspeção de alinhamento a laser'),
      ('PREVENTIVA', 'COMPRESSOR', 'Inspeção boroscópica'), ('PREVENTIVA', 'COMPRESSOR', 'Troca de filtros de ar e óleo'),
      ('PREVENTIVA', 'TURBOGERADOR', 'Inspeção de 4.000 horas'), ('PREVENTIVA', 'TURBOGERADOR', 'Lavagem do compressor axial'),
      ('PREVENTIVA', 'SEPARADOR', 'Inspeção interna (NR-13)'), ('PREVENTIVA', 'SEPARADOR', 'Calibração de transmissores'),
      ('PREVENTIVA', 'TROCADOR', 'Limpeza química programada'), ('PREVENTIVA', 'TROCADOR', 'Teste hidrostático'),
      ('PREDITIVA', 'BOMBA', 'Análise de vibração indicou desbalanceamento'),
      ('PREDITIVA', 'COMPRESSOR', 'Análise de vibração indicou desgaste de mancal'),
      ('PREDITIVA', 'TURBOGERADOR', 'Termografia indicou ponto quente'),
      ('PREDITIVA', 'SEPARADOR', 'Ultrassom indicou perda de espessura'),
      ('PREDITIVA', 'TROCADOR', 'Tendência de aumento de ΔT')
    ) AS t(tipo_os, tipo_eq, titulo);

  -- 300 OS nos últimos 90 dias; equipamentos degradando recebem mais OS
  CREATE TEMP TABLE seed_os ON COMMIT DROP AS
  WITH base AS (
    SELECT g, agora - make_interval(secs => (0.2 + random() * 89.8) * 86400) AS abertura,
           random() AS r_tipo, random() AS r_prio, random() AS r_status, random() AS r_origem,
           random() AS r1, random() AS r2, random() AS r3
    FROM generate_series(1, 300) AS g
  ), classificada AS (
    SELECT b.*, e.tag, e.nome AS nome_eq, e.tipo AS tipo_eq, e.unidade,
      CASE WHEN b.r_tipo < 0.45 THEN 'CORRETIVA' WHEN b.r_tipo < 0.90 THEN 'PREVENTIVA' ELSE 'PREDITIVA' END AS tipo,
      CASE WHEN b.r_prio < 0.05 THEN 'P1' WHEN b.r_prio < 0.25 THEN 'P2' WHEN b.r_prio < 0.70 THEN 'P3' ELSE 'P4' END AS prioridade,
      CASE WHEN agora - b.abertura < interval '10 days' THEN
             CASE WHEN b.r_status < 0.20 THEN 'ABERTA' WHEN b.r_status < 0.40 THEN 'PLANEJADA'
                  WHEN b.r_status < 0.55 THEN 'AGUARDANDO_PT' WHEN b.r_status < 0.70 THEN 'EM_EXECUCAO' ELSE 'CONCLUIDA' END
           ELSE CASE WHEN b.r_status < 0.92 THEN 'CONCLUIDA' ELSE 'CANCELADA' END
      END AS status
    FROM base b
    CROSS JOIN LATERAL (
      SELECT * FROM seed_eq WHERE b.g > 0
      ORDER BY random() * CASE WHEN degradando THEN 0.25 ELSE 1 END LIMIT 1
    ) e
  ), com_inicio AS (
    SELECT c.*,
      CASE c.status
        WHEN 'EM_EXECUCAO' THEN greatest(c.abertura + interval '1 hour', agora - make_interval(secs => (0.5 + c.r1 * 2.5) * 3600))
        WHEN 'CONCLUIDA'   THEN least(c.abertura + make_interval(secs => (4 + c.r1 * 68) * 3600), agora - interval '3 hours')
      END AS inicio
    FROM classificada c
  )
  SELECT ci.*,
    CASE WHEN ci.status = 'CONCLUIDA'
         THEN least(ci.inicio + make_interval(secs => (2 + ci.r2 * 28) * 3600), agora - interval '5 minutes') END AS conclusao
  FROM com_inicio ci;

  CREATE TEMP TABLE seed_ids (
    id bigint, tag text, unidade text, status text, abertura timestamptz,
    inicio timestamptz, conclusao timestamptz, solicitante integer
  ) ON COMMIT DROP;

  WITH inseridas AS (
    INSERT INTO operacao.ordens_servico
      (equipamento_tag, unidade, tipo, prioridade, status, origem, titulo, descricao, solicitante_id, responsavel_id,
       data_abertura, data_prevista, data_inicio, data_conclusao, horas_indisponivel, atualizado_em)
    SELECT s.tag, s.unidade, s.tipo, s.prioridade, s.status,
           CASE WHEN s.tipo = 'PREDITIVA' AND s.r_origem < 0.5 THEN 'PREDITIVA_LAKEHOUSE' ELSE 'MANUAL' END,
           t.titulo || ' — ' || s.nome_eq,
           'Registrado em campo pela equipe de manutenção do ' || s.unidade || '.',
           sol.id, CASE WHEN s.status <> 'ABERTA' THEN resp.id END,
           s.abertura, (s.abertura + make_interval(days => 3 + floor(s.r3 * 18)::int))::date,
           s.inicio, s.conclusao,
           CASE WHEN s.conclusao IS NOT NULL THEN round((extract(epoch FROM s.conclusao - s.inicio) / 3600
                * CASE WHEN s.tipo = 'CORRETIVA' THEN 1 ELSE 0.5 END)::numeric, 2) END,
           coalesce(s.conclusao, s.inicio, s.abertura)
    FROM seed_os s
    CROSS JOIN LATERAL (SELECT titulo FROM seed_titulo WHERE tipo_os = s.tipo AND tipo_eq = s.tipo_eq
                        ORDER BY random() LIMIT 1) t
    CROSS JOIN LATERAL (SELECT id FROM operacao.usuarios WHERE papel = 'TECNICO' AND unidade = s.unidade
                        ORDER BY random() LIMIT 1) sol
    CROSS JOIN LATERAL (SELECT id FROM operacao.usuarios WHERE papel = 'TECNICO' AND unidade = s.unidade
                        ORDER BY random() LIMIT 1) resp
    ORDER BY s.abertura
    RETURNING id, equipamento_tag, unidade, status, data_abertura, data_inicio, data_conclusao, solicitante_id
  )
  INSERT INTO seed_ids SELECT * FROM inseridas;

  -- permissões de trabalho das OS que chegaram à etapa de PT
  INSERT INTO operacao.permissoes_trabalho
    (ordem_id, tipo, status, riscos, medidas_controle, validade_horas, solicitante_id, aprovador_id,
     validade_inicio, validade_fim, criada_em, decidida_em)
  SELECT i.id,
         CASE e.tipo WHEN 'BOMBA' THEN 'GERAL' WHEN 'COMPRESSOR' THEN 'TRABALHO_A_QUENTE' WHEN 'TURBOGERADOR' THEN 'ELETRICA'
                     WHEN 'SEPARADOR' THEN 'ESPACO_CONFINADO' ELSE 'ALTURA' END,
         p.status_pt,
         (SELECT jsonb_agg(r) FROM (
             SELECT r FROM unnest(ARRAY['Gás inflamável', 'Pressão residual', 'Energia elétrica', 'Trabalho em altura',
                                        'Espaço confinado', 'Produtos químicos', 'Superfície quente']) AS r
             WHERE i.id > 0 ORDER BY random() LIMIT 2) z),
         'Isolamento de energia, teste de atmosfera e liberação pela sala de controle.',
         p.validade, i.solicitante,
         CASE WHEN p.status_pt <> 'SOLICITADA' THEN sup.id END,
         p.decidida, p.decidida + make_interval(hours => p.validade),
         least(i.abertura + interval '1 hour', coalesce(p.decidida, agora)), p.decidida
  FROM seed_ids i
  JOIN seed_eq e ON e.tag = i.tag
  JOIN operacao.usuarios sup ON sup.papel = 'SUPERVISOR' AND sup.unidade = i.unidade
  CROSS JOIN LATERAL (
    SELECT CASE i.status WHEN 'AGUARDANDO_PT' THEN 'SOLICITADA' WHEN 'EM_EXECUCAO' THEN 'EM_EXECUCAO' ELSE 'ENCERRADA' END AS status_pt,
           CASE WHEN i.status = 'EM_EXECUCAO' THEN 12 ELSE 8 END AS validade,
           CASE WHEN i.inicio IS NOT NULL THEN i.inicio - make_interval(secs => (0.2 + random() * 0.3) * 3600) END AS decidida
  ) p
  WHERE i.status IN ('AGUARDANDO_PT', 'EM_EXECUCAO', 'CONCLUIDA')
  ORDER BY least(i.abertura + interval '1 hour', coalesce(p.decidida, agora));

  -- trilha de auditoria das OS (passos interpolados entre abertura e fim)
  INSERT INTO operacao.historico_status (entidade, entidade_id, de_status, para_status, usuario_id, criado_em)
  SELECT 'OS', i.id, lag(p.passo) OVER (PARTITION BY i.id ORDER BY p.ordem), p.passo, i.solicitante,
         i.abertura + (least(coalesce(i.conclusao, i.inicio, i.abertura + interval '6 hours'), agora) - i.abertura)
                      * ((p.ordem - 1)::double precision / greatest(cardinality(s.passos) - 1, 1))
  FROM seed_ids i
  CROSS JOIN LATERAL (SELECT CASE i.status
      WHEN 'ABERTA'        THEN ARRAY['ABERTA']
      WHEN 'PLANEJADA'     THEN ARRAY['ABERTA', 'PLANEJADA']
      WHEN 'AGUARDANDO_PT' THEN ARRAY['ABERTA', 'PLANEJADA', 'AGUARDANDO_PT']
      WHEN 'EM_EXECUCAO'   THEN ARRAY['ABERTA', 'PLANEJADA', 'AGUARDANDO_PT', 'EM_EXECUCAO']
      WHEN 'CONCLUIDA'     THEN ARRAY['ABERTA', 'PLANEJADA', 'AGUARDANDO_PT', 'EM_EXECUCAO', 'CONCLUIDA']
      ELSE                      ARRAY['ABERTA', 'CANCELADA'] END AS passos) s
  CROSS JOIN LATERAL unnest(s.passos) WITH ORDINALITY AS p(passo, ordem);

  -- trilha de auditoria das PTs
  INSERT INTO operacao.historico_status (entidade, entidade_id, de_status, para_status, usuario_id, criado_em)
  SELECT 'PT', pt.id, ev.de, ev.para, ev.usuario, ev.quando
  FROM operacao.permissoes_trabalho pt
  JOIN operacao.ordens_servico o ON o.id = pt.ordem_id
  CROSS JOIN LATERAL (VALUES
      (NULL::text,    'SOLICITADA',  pt.solicitante_id, pt.criada_em),
      ('SOLICITADA',  'APROVADA',    pt.aprovador_id,   pt.decidida_em),
      ('APROVADA',    'EM_EXECUCAO', pt.solicitante_id, CASE WHEN pt.status IN ('EM_EXECUCAO', 'ENCERRADA') THEN o.data_inicio END),
      ('EM_EXECUCAO', 'ENCERRADA',   pt.solicitante_id, CASE WHEN pt.status = 'ENCERRADA' THEN o.data_conclusao END)
  ) AS ev(de, para, usuario, quando)
  WHERE ev.quando IS NOT NULL;

  SELECT count(*) INTO n_os FROM operacao.ordens_servico;
  SELECT count(*) INTO n_pt FROM operacao.permissoes_trabalho;
  SELECT count(*) INTO n_hist FROM operacao.historico_status;
  RAISE NOTICE 'seed concluído: % OS, % PTs, % eventos de histórico', n_os, n_pt, n_hist;
END
$seed$;
