import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarCheck,
  ExternalLink,
  Info,
  Loader2,
  Send,
  ShieldCheck,
  ShieldPlus,
  XCircle,
} from "lucide-react";

import { ApiError } from "@/api/client";
import { useOrdem, useTransicionarOrdem } from "@/api/hooks";
import type { Ordem, Permissao, StatusOS } from "@/api/types";
import { PrioridadeBadge, SourceBadge, StatusOsBadge, StatusPtBadge } from "@/components/common/badges";
import { ConfirmarDialog } from "@/components/common/ConfirmarDialog";
import { EmptyState, ErrorState } from "@/components/common/estados";
import { usePersona } from "@/components/common/usePersona";
import { OrdemForm } from "@/components/ordens/OrdemForm";
import { OrigemIcone } from "@/components/ordens/OrdensTabela";
import { SolicitarPtDialog } from "@/components/ordens/SolicitarPtDialog";
import { Timeline } from "@/components/ordens/Timeline";
import { RiscoChips } from "@/components/permissoes/RiscoChips";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_OS_FINAIS, STATUS_OS_LABEL, TIPO_OS_LABEL, TIPO_PT_LABEL, rotulo } from "@/lib/dominio";
import { formatData, formatDataHora, formatNumeroFlex } from "@/lib/format";

function Linha({ rotulo: r, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{r}</dt>
      <dd className="text-right font-medium text-slate-800">{children}</dd>
    </div>
  );
}

function Acoes({ ordem, onSolicitarPt }: { ordem: Ordem; onSolicitarPt: () => void }) {
  const persona = usePersona();
  const transicao = useTransicionarOrdem(ordem.id);
  const [cancelarAberto, setCancelarAberto] = useState(false);
  const [destino, setDestino] = useState<StatusOS | null>(null);

  const mover = (para: StatusOS, comentario?: string) => {
    if (!persona) return;
    setDestino(para);
    transicao.mutate(
      { para_status: para, usuario_id: persona.id, version: ordem.version, comentario },
      {
        onSuccess: (o) => {
          setCancelarAberto(false);
          toast.success(`OS ${o.numero}: ${rotulo(STATUS_OS_LABEL, o.status)}`);
        },
        onSettled: () => setDestino(null),
      },
    );
  };

  const ocupado = (para: StatusOS) => transicao.isPending && destino === para;
  const final = STATUS_OS_FINAIS.includes(ordem.status);
  const podeSolicitarPt = ordem.status === "PLANEJADA" || ordem.status === "AGUARDANDO_PT";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ações</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {!persona && <p className="text-xs text-muted-foreground">Selecione uma persona no topo para agir.</p>}

        {ordem.status === "ABERTA" && (
          <Button className="w-full justify-start" onClick={() => mover("PLANEJADA")} disabled={!persona || transicao.isPending}>
            {ocupado("PLANEJADA") ? <Loader2 className="animate-spin" /> : <CalendarCheck />}
            Planejar
          </Button>
        )}
        {ordem.status === "PLANEJADA" && (
          <Button
            className="w-full justify-start"
            onClick={() => mover("AGUARDANDO_PT")}
            disabled={!persona || transicao.isPending}
          >
            {ocupado("AGUARDANDO_PT") ? <Loader2 className="animate-spin" /> : <Send />}
            Enviar para PT
          </Button>
        )}
        {podeSolicitarPt && (
          <Button
            variant={ordem.status === "AGUARDANDO_PT" ? "default" : "outline"}
            className="w-full justify-start"
            onClick={onSolicitarPt}
            disabled={!persona}
          >
            <ShieldPlus /> Solicitar PT
          </Button>
        )}

        {ordem.status === "AGUARDANDO_PT" && (
          <p className="flex gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            A OS passa para <b>Em execução</b> quando a PT for aprovada e iniciada em Permissões de Trabalho.
          </p>
        )}
        {ordem.status === "EM_EXECUCAO" && (
          <p className="flex gap-1.5 rounded-md bg-teal-50 px-3 py-2 text-xs text-teal-900">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Em execução — a OS é concluída ao <b>encerrar a PT</b>.
            {ordem.pt_ativa && (
              <Link to={`/permissoes?pt=${ordem.pt_ativa.id}`} className="ml-1 font-semibold underline">
                Abrir {ordem.pt_ativa.numero}
              </Link>
            )}
          </p>
        )}

        {!final && (
          <Button
            variant="outline"
            className="w-full justify-start border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
            onClick={() => setCancelarAberto(true)}
            disabled={!persona || transicao.isPending}
          >
            <XCircle /> Cancelar OS
          </Button>
        )}
        {final && (
          <p className="text-sm text-muted-foreground">
            OS {rotulo(STATUS_OS_LABEL, ordem.status).toLowerCase()} — sem ações disponíveis.
          </p>
        )}
      </CardContent>

      <ConfirmarDialog
        open={cancelarAberto}
        onOpenChange={setCancelarAberto}
        titulo={`Cancelar a OS ${ordem.numero}?`}
        descricao="A OS vai para o status Cancelada. Esta ação não pode ser desfeita."
        rotuloConfirmar="Cancelar OS"
        variante="destructive"
        placeholderComentario="Motivo do cancelamento"
        carregando={ocupado("CANCELADA")}
        onConfirmar={(c) => mover("CANCELADA", c)}
      />
    </Card>
  );
}

function PermissaoItem({ pt }: { pt: Permissao }) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-slate-500" />
          <span className="font-mono text-sm font-semibold text-navy">{pt.numero}</span>
          <StatusPtBadge status={pt.status} />
          <span className="text-sm text-slate-600">{rotulo(TIPO_PT_LABEL, pt.tipo)}</span>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/permissoes?pt=${pt.id}`}>
            Abrir <ExternalLink />
          </Link>
        </Button>
      </div>
      <div className="mt-2">
        <RiscoChips riscos={pt.riscos} />
      </div>
      <div className="mt-2 grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
        <span>
          Solicitante: <b className="text-slate-700">{pt.solicitante_nome}</b> · {formatDataHora(pt.criada_em)}
        </span>
        <span>
          Aprovador: <b className="text-slate-700">{pt.aprovador_nome ?? "—"}</b>
          {pt.decidida_em ? ` · ${formatDataHora(pt.decidida_em)}` : ""}
        </span>
        <span>
          Validade: <b className="text-slate-700">{pt.validade_horas} h</b>
          {pt.validade_fim ? ` · até ${formatDataHora(pt.validade_fim)}` : ""}
        </span>
        {pt.comentario_decisao && <span className="italic">“{pt.comentario_decisao}”</span>}
      </div>
    </div>
  );
}

export default function OrdemDetalhe() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const idValido = Number.isInteger(id) && id > 0;
  const { data, isLoading, isError, error, refetch, isFetching } = useOrdem(idValido ? id : null);
  const [ptAberto, setPtAberto] = useState(false);

  const voltar = (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link to="/ordens">
        <ArrowLeft /> Ordens de Serviço
      </Link>
    </Button>
  );

  if (!idValido) {
    return (
      <div className="space-y-4">
        {voltar}
        <EmptyState titulo="Identificador de OS inválido" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-[28rem]" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    const naoEncontrada = error instanceof ApiError && error.status === 404;
    return (
      <div className="space-y-4">
        {voltar}
        {naoEncontrada ? (
          <EmptyState titulo={`OS #${id} não encontrada`} descricao="Ela pode ter sido criada em outra branch do Lakebase." />
        ) : (
          <ErrorState erro={error} onRetry={() => void refetch()} />
        )}
      </div>
    );
  }

  const { ordem, historico, permissoes } = data;

  return (
    <div className="space-y-5">
      {voltar}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-navy px-2 py-0.5 font-mono text-sm font-semibold text-white">{ordem.numero}</span>
            <StatusOsBadge status={ordem.status} />
            <PrioridadeBadge prioridade={ordem.prioridade} />
            <Badge variant="outline" className="bg-white">
              {rotulo(TIPO_OS_LABEL, ordem.tipo)}
            </Badge>
            <OrigemIcone origem={ordem.origem} />
            <SourceBadge fonte="OLTP" />
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-navy">{ordem.titulo}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <Link
              to={`/equipamentos/${encodeURIComponent(ordem.equipamento_tag)}`}
              className="font-mono font-semibold text-slate-700 hover:text-primary hover:underline"
            >
              {ordem.equipamento_tag}
            </Link>
            {ordem.equipamento_nome ? ` · ${ordem.equipamento_nome}` : ""} · {ordem.unidade}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <span className="rounded-md border bg-white px-2 py-1 font-mono">versão {ordem.version}</span>
          <span>atualizada {formatDataHora(ordem.atualizado_em)}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Dados da OS</CardTitle>
            </CardHeader>
            <CardContent>
              {/* key = versão: 409 ou salvamento recarregam o formulário com os dados do servidor */}
              <OrdemForm key={`${ordem.id}-${ordem.version}`} ordem={ordem} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Permissões de trabalho</CardTitle>
              <span className="text-xs text-muted-foreground">{permissoes.length} PT(s)</span>
            </CardHeader>
            <CardContent className="space-y-2">
              {permissoes.length === 0 ? (
                <EmptyState
                  compacto
                  icone={<ShieldCheck />}
                  titulo="Nenhuma PT para esta OS"
                  descricao={
                    ordem.status === "PLANEJADA" || ordem.status === "AGUARDANDO_PT"
                      ? 'Use "Solicitar PT" para pedir a permissão de trabalho.'
                      : "Planeje a OS para poder solicitar a permissão de trabalho."
                  }
                />
              ) : (
                permissoes.map((pt) => <PermissaoItem key={pt.id} pt={pt} />)
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Acoes ordem={ordem} onSolicitarPt={() => setPtAberto(true)} />

          <Card>
            <CardHeader>
              <CardTitle>Informações</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <Linha rotulo="Solicitante">{ordem.solicitante_nome ?? "—"}</Linha>
                <Linha rotulo="Responsável">{ordem.responsavel_nome ?? "—"}</Linha>
                <Linha rotulo="Abertura">{formatDataHora(ordem.data_abertura)}</Linha>
                <Linha rotulo="Prevista">{formatData(ordem.data_prevista)}</Linha>
                <Linha rotulo="Início">{formatDataHora(ordem.data_inicio)}</Linha>
                <Linha rotulo="Conclusão">{formatDataHora(ordem.data_conclusao)}</Linha>
                <Linha rotulo="Horas indisponível">
                  {ordem.horas_indisponivel === null ? "—" : `${formatNumeroFlex(ordem.horas_indisponivel, 1)} h`}
                </Linha>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Histórico</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline itens={historico} permissoes={permissoes} />
            </CardContent>
          </Card>
        </div>
      </div>

      <SolicitarPtDialog ordem={ordem} open={ptAberto} onOpenChange={setPtAberto} />
    </div>
  );
}
