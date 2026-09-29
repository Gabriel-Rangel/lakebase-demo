import { Link } from "react-router-dom";
import {
  BarChart3,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Hourglass,
  Radio,
  ShieldCheck,
  Siren,
  Sparkles,
  Wrench,
} from "lucide-react";

import { useKpis, useSeries } from "@/api/hooks";
import { RiscoBadge, SourceBadge } from "@/components/common/badges";
import { EmptyState, ErrorState } from "@/components/common/estados";
import { HealthBar } from "@/components/common/HealthBar";
import { PageHeader, SectionTitle } from "@/components/common/PageHeader";
import { OsPorDiaChart, OsPorStatusChart, OsPorUnidadeChart } from "@/components/painel/Graficos";
import { KpiCard, KpiCardSkeleton } from "@/components/painel/KpiCard";
import { LakehouseUnidadeCard } from "@/components/painel/LakehouseUnidadeCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDataHora, formatHora, formatRelativo } from "@/lib/format";
import { useAppStore } from "@/store/app-store";

const DIAS_SERIE = 30;

function SecaoOltp() {
  const { data, isLoading, isError, error, refetch, isFetching } = useKpis();
  const polling = useAppStore((s) => s.polling);
  const k = data?.oltp;

  return (
    <section>
      <SectionTitle
        titulo="Operação ao vivo — Lakebase (OLTP)"
        badge={<SourceBadge fonte="OLTP" />}
        direita={
          k ? (
            <span className="flex items-center gap-1.5">
              <Radio className={polling ? "h-3.5 w-3.5 text-emerald-600" : "h-3.5 w-3.5 text-slate-400"} />
              consultado em <span className="font-semibold text-slate-700 tabular">{formatHora(k.consultado_em)}</span>{" "}
              direto do Lakebase
              {isFetching && <span className="ml-1 text-slate-400">· atualizando…</span>}
            </span>
          ) : null
        }
      />
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <KpiCardSkeleton key={i} />
          ))}
        </div>
      ) : isError || !k ? (
        <ErrorState erro={error} onRetry={() => void refetch()} compacto />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard rotulo="OS abertas" valor={k.os_abertas} icone={<ClipboardList />} dica="não finalizadas" href="/ordens" />
          <KpiCard
            rotulo="Em execução"
            valor={k.os_em_execucao}
            icone={<Wrench />}
            dica="com PT ativa"
            href="/ordens?status=EM_EXECUCAO"
          />
          <KpiCard
            rotulo="P1 abertas"
            valor={k.os_p1_abertas}
            icone={<Siren />}
            dica="emergenciais"
            tom={k.os_p1_abertas > 0 ? "critico" : "neutro"}
            href="/ordens?prioridade=P1"
          />
          <KpiCard
            rotulo="PTs aguardando aprovação"
            valor={k.pts_aguardando_aprovacao}
            icone={<Hourglass />}
            dica="Supervisor / Segurança"
            tom={k.pts_aguardando_aprovacao > 0 ? "alerta" : "neutro"}
            href="/permissoes"
          />
          <KpiCard rotulo="PTs ativas" valor={k.pts_ativas} icone={<ShieldCheck />} dica="aprovadas ou em execução" href="/permissoes" />
          <KpiCard
            rotulo="Concluídas 7 dias"
            valor={k.os_concluidas_7d}
            icone={<CheckCircle2 />}
            dica="últimos 7 dias"
            tom="positivo"
            href="/ordens?status=CONCLUIDA"
          />
        </div>
      )}
    </section>
  );
}

function SecaoLakehouse() {
  const { data, isLoading, isError, error, refetch } = useKpis();
  const lh = data?.lakehouse ?? null;
  const disponivel = !!lh && lh.fonte === "LAKEHOUSE_SYNCED" && lh.por_unidade.length > 0;

  return (
    <section>
      <SectionTitle
        titulo="Indicadores do Lakehouse (synced table)"
        badge={<SourceBadge fonte={disponivel ? "LAKEHOUSE_SYNCED" : (lh?.fonte ?? "CSV_LOCAL")} />}
        direita={
          disponivel && lh?.atualizado_em ? (
            <span>
              atualizado em <span className="font-semibold text-slate-700">{formatDataHora(lh.atualizado_em)}</span> (
              {formatRelativo(lh.atualizado_em)})
            </span>
          ) : null
        }
      />
      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-3">
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
        </div>
      ) : isError ? (
        <ErrorState erro={error} onRetry={() => void refetch()} compacto />
      ) : !disponivel ? (
        <EmptyState
          icone={<Sparkles className="text-purple-400" />}
          titulo="Os indicadores do Lakehouse aparecem aqui depois do Passo 5 (synced tables)"
          descricao={
            <>
              Disponibilidade, MTTR, backlog e health score por FPSO são calculados no Lakehouse (tabela gold{" "}
              <code className="rounded bg-white px-1 text-xs">gold_kpis_manutencao</code>) e sincronizados de volta para o
              Lakebase.
            </>
          }
          className="border-purple-200 bg-purple-50/40"
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lh!.por_unidade.map((u) => (
            <LakehouseUnidadeCard key={`${u.unidade}-${u.data_referencia}`} kpi={u} />
          ))}
        </div>
      )}
    </section>
  );
}

function TopRisco() {
  const { data, isLoading, isError, error, refetch } = useKpis();
  const itens = data?.equipamentos_risco ?? [];
  const fonte = data?.lakehouse?.fonte ?? "CSV_LOCAL";
  const semScore = itens.length > 0 && itens.every((e) => e.health_score === null);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle>Top 5 equipamentos em risco</CardTitle>
        <div>
          <SourceBadge fonte={fonte} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState erro={error} onRetry={() => void refetch()} compacto />
        ) : itens.length === 0 ? (
          <EmptyState
            compacto
            titulo="Nenhum equipamento em risco"
            descricao="O ranking de risco é calculado no Lakehouse e chega pelas synced tables (Passo 5)."
          />
        ) : (
          <>
            {semScore && (
              <p className="mb-2 text-xs text-muted-foreground">
                Health score ainda não disponível — chega com as synced tables (Passo 5).
              </p>
            )}
            <ul className="divide-y">
              {itens.slice(0, 5).map((e, i) => (
                <li key={e.tag}>
                  <Link
                    to={`/equipamentos/${encodeURIComponent(e.tag)}`}
                    className="group -mx-2 flex items-start gap-3 rounded-md px-2 py-2.5 hover:bg-slate-50"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      {/* Linha 1: tag + risco à esquerda, health score compacto à direita */}
                      <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap font-mono text-xs font-semibold text-navy">{e.tag}</span>
                        <RiscoBadge risco={e.risco} />
                        <div className="ml-auto w-24 shrink-0">
                          <HealthBar score={e.health_score} risco={e.risco} className="min-w-0" />
                        </div>
                      </div>
                      {/* Linhas seguintes: nome e sinal em largura total */}
                      <div className="mt-0.5 line-clamp-2 text-sm text-slate-700">
                        {e.nome} <span className="whitespace-nowrap text-muted-foreground">· {e.unidade}</span>
                      </div>
                      {e.principal_sinal && (
                        <div className="line-clamp-2 text-xs text-muted-foreground">{e.principal_sinal}</div>
                      )}
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-500" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CardGrafico({
  titulo,
  children,
  vazio,
  carregando,
  erro,
  onRetry,
}: {
  titulo: string;
  children: React.ReactNode;
  vazio: boolean;
  carregando: boolean;
  erro: unknown;
  onRetry: () => void;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{titulo}</CardTitle>
        <SourceBadge fonte="OLTP" />
      </CardHeader>
      <CardContent>
        {carregando ? (
          <Skeleton className="h-[260px]" />
        ) : erro ? (
          <ErrorState erro={erro} onRetry={onRetry} compacto className="h-[260px]" />
        ) : vazio ? (
          <EmptyState
            compacto
            icone={<BarChart3 />}
            titulo="Sem dados no período"
            descricao="Crie ordens de serviço para ver o gráfico ganhar vida."
            className="h-[260px]"
          />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export default function Painel() {
  const series = useSeries(DIAS_SERIE);
  const s = series.data;
  const erro = series.isError ? series.error : null;
  const retry = () => void series.refetch();

  return (
    <div className="space-y-7">
      <PageHeader
        titulo="Painel de manutenção"
        descricao="Ordens de serviço e permissões de trabalho ao vivo no Lakebase, com indicadores calculados no Lakehouse."
      />

      <SecaoOltp />
      <SecaoLakehouse />

      <section className="grid items-start gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <CardGrafico
            titulo={`OS por dia — últimos ${DIAS_SERIE} dias`}
            carregando={series.isLoading}
            erro={erro}
            onRetry={retry}
            vazio={!s || s.os_por_dia.length === 0}
          >
            <OsPorDiaChart dados={s?.os_por_dia ?? []} />
          </CardGrafico>
        </div>
        <div className="lg:col-span-2">
          <TopRisco />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <CardGrafico
          titulo="OS por status"
          carregando={series.isLoading}
          erro={erro}
          onRetry={retry}
          vazio={!s || s.os_por_status.length === 0}
        >
          <OsPorStatusChart dados={s?.os_por_status ?? []} />
        </CardGrafico>
        <CardGrafico
          titulo="OS por unidade"
          carregando={series.isLoading}
          erro={erro}
          onRetry={retry}
          vazio={!s || s.os_por_unidade.length === 0}
        >
          <OsPorUnidadeChart dados={s?.os_por_unidade ?? []} />
        </CardGrafico>
      </section>
    </div>
  );
}
