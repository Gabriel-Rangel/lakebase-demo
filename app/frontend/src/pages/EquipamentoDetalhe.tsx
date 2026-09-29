import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ClipboardList, Lightbulb, LineChart, Loader2, Sparkles, TriangleAlert } from "lucide-react";

import { ApiError } from "@/api/client";
import { useCriarOsPreditiva, useEquipamento } from "@/api/hooks";
import { RiscoBadge, SourceBadge } from "@/components/common/badges";
import { EmptyState, ErrorState } from "@/components/common/estados";
import { usePersona } from "@/components/common/usePersona";
import { HealthGauge } from "@/components/equipamentos/HealthGauge";
import { TendenciaChart } from "@/components/equipamentos/TendenciaChart";
import { OrdensTabela } from "@/components/ordens/OrdensTabela";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CRITICIDADE_LABEL, PRIORIDADE_LABEL, rotulo } from "@/lib/dominio";
import { formatData, formatDataHora, formatFracaoPct, formatNumero, formatNumeroFlex, formatRelativo } from "@/lib/format";

function Campo({ rotulo: r, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{r}</dt>
      <dd className="truncate text-sm font-medium text-slate-800">{valor ?? "—"}</dd>
    </div>
  );
}

function Carregando() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-9 w-96" />
      <Skeleton className="h-16" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80" />
        <Skeleton className="h-80 lg:col-span-2" />
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}

export default function EquipamentoDetalhe() {
  const { tag: tagParam } = useParams();
  const tag = tagParam ? decodeURIComponent(tagParam) : undefined;
  const navigate = useNavigate();
  const persona = usePersona();
  const { data, isLoading, isError, error, refetch } = useEquipamento(tag);
  const criar = useCriarOsPreditiva();

  if (isLoading) return <Carregando />;
  if (isError || !data) {
    const naoEncontrado = error instanceof ApiError && error.status === 404;
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/equipamentos">
            <ArrowLeft /> Equipamentos
          </Link>
        </Button>
        {naoEncontrado ? (
          <EmptyState titulo={`Equipamento ${tag ?? ""} não encontrado`} descricao="Verifique a tag ou volte para a lista." />
        ) : (
          <ErrorState erro={error} onRetry={() => void refetch()} />
        )}
      </div>
    );
  }

  const { equipamento: e, tendencia, ordens, fonte } = data;

  const criarOs = () => {
    if (!persona) return;
    criar.mutate(
      { tag: e.tag, solicitanteId: persona.id },
      {
        onSuccess: (ordem) => {
          toast.success(`OS ${ordem.numero} criada`, {
            description: `${rotulo(PRIORIDADE_LABEL, ordem.prioridade)} · origem: predição do Lakehouse`,
            action: { label: "Abrir OS", onClick: () => navigate(`/ordens/${ordem.id}`) },
            duration: 10_000,
          });
        },
      },
    );
  };

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/equipamentos">
          <ArrowLeft /> Equipamentos
        </Link>
      </Button>

      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-navy px-2 py-0.5 font-mono text-sm font-semibold text-white">{e.tag}</span>
            <Badge variant="outline" className="bg-white">
              {e.unidade}
            </Badge>
            <Badge variant="outline" className="bg-white">
              Criticidade {rotulo(CRITICIDADE_LABEL, e.criticidade)}
            </Badge>
            <SourceBadge fonte={fonte} />
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-navy">{e.nome}</h1>
          <p className="text-sm text-muted-foreground">{[e.tipo, e.sistema].filter(Boolean).join(" · ")}</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button size="lg" onClick={criarOs} disabled={!persona || criar.isPending}>
                {criar.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                Criar OS preditiva
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-[280px]">
            {persona
              ? `Cria uma OS PREDITIVA no Lakebase em nome de ${persona.nome}, com prioridade derivada do risco calculado no Lakehouse.`
              : "Selecione uma persona no topo da tela."}
          </TooltipContent>
        </Tooltip>
      </div>

      <Card>
        <CardContent className="p-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Campo rotulo="Fabricante" valor={e.fabricante || "—"} />
            <Campo rotulo="Modelo" valor={e.modelo || "—"} />
            <Campo rotulo="Potência" valor={e.potencia_kw === null ? "—" : `${formatNumeroFlex(e.potencia_kw, 1)} kW`} />
            <Campo rotulo="Instalação" valor={formatData(e.data_instalacao)} />
            <Campo rotulo="OS abertas" valor={formatNumero(e.os_abertas)} />
            <Campo
              rotulo="Saúde atualizada em"
              valor={e.atualizado_em ? `${formatDataHora(e.atualizado_em)}` : "—"}
            />
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Saúde */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Saúde do ativo</CardTitle>
            <SourceBadge fonte={fonte} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center">
              <HealthGauge score={e.health_score} risco={e.risco} />
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Risco</span>
                <RiscoBadge risco={e.risco} />
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 rounded-md bg-slate-50 p-3">
              <Campo rotulo="Prob. de falha (30 dias)" valor={formatFracaoPct(e.prob_falha_30d, 0)} />
              <Campo rotulo="Atualizado" valor={e.atualizado_em ? formatRelativo(e.atualizado_em) : "—"} />
            </dl>
            {e.principal_sinal && (
              <div className="flex gap-2 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-orange-700">Principal sinal</div>
                  {e.principal_sinal}
                </div>
              </div>
            )}
            {e.recomendacao ? (
              <div className="flex gap-2 rounded-md border border-purple-200 bg-purple-50 p-3 text-sm text-purple-950">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" />
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-purple-700">Recomendação</div>
                  {e.recomendacao}
                </div>
              </div>
            ) : (
              fonte === "CSV_LOCAL" && (
                <p className="text-xs text-muted-foreground">
                  Health score, risco e recomendação chegam com as synced tables (Passo 5).
                </p>
              )
            )}
          </CardContent>
        </Card>

        {/* Tendência */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Tendência de telemetria</CardTitle>
            <SourceBadge fonte={fonte} />
          </CardHeader>
          <CardContent>
            {tendencia.length === 0 ? (
              <EmptyState
                icone={<LineChart />}
                titulo="Sem telemetria para este equipamento"
                descricao="As séries de vibração, temperatura, pressão e corrente vêm do Lakehouse."
                className="h-[330px]"
              />
            ) : (
              <TendenciaChart dados={tendencia} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ordens deste equipamento */}
      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Ordens de serviço deste equipamento</CardTitle>
          <SourceBadge fonte="OLTP" />
        </CardHeader>
        <CardContent className="p-0">
          {ordens.length === 0 ? (
            <EmptyState
              className="m-5 mt-0"
              compacto
              icone={<ClipboardList />}
              titulo="Nenhuma OS para este equipamento"
              descricao='Use "Criar OS preditiva" para abrir uma OS a partir da predição do Lakehouse.'
            />
          ) : (
            <OrdensTabela itens={ordens} mostrarEquipamento={false} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
