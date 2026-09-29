import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RotateCw } from "lucide-react";

import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  icone,
  titulo,
  descricao,
  acao,
  className,
  compacto = false,
}: {
  icone?: ReactNode;
  titulo: string;
  descricao?: ReactNode;
  acao?: ReactNode;
  className?: string;
  compacto?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed bg-slate-50/60 text-center",
        compacto ? "gap-1.5 px-4 py-6" : "gap-2 px-6 py-10",
        className,
      )}
    >
      <div className="text-slate-400 [&_svg]:h-8 [&_svg]:w-8">{icone ?? <Inbox />}</div>
      <p className="text-sm font-semibold text-slate-700">{titulo}</p>
      {descricao && <div className="max-w-md text-sm text-muted-foreground">{descricao}</div>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

function descreverErro(erro: unknown): { titulo: string; detalhe: string } {
  if (erro instanceof ApiError) {
    if (erro.status === 404) return { titulo: "Não encontrado", detalhe: erro.mensagem };
    if (erro.status === 503)
      return {
        titulo: "Lakebase acordando",
        detalhe: "O compute está saindo do scale-to-zero. Tentando novamente em instantes…",
      };
    if (erro.semBackend) return { titulo: "API indisponível", detalhe: erro.mensagem };
    return { titulo: "Não foi possível carregar", detalhe: erro.mensagem };
  }
  return { titulo: "Não foi possível carregar", detalhe: erro instanceof Error ? erro.message : "Erro inesperado." };
}

export function ErrorState({
  erro,
  onRetry,
  className,
  compacto = false,
}: {
  erro: unknown;
  onRetry?: () => void;
  className?: string;
  compacto?: boolean;
}) {
  const { titulo, detalhe } = descreverErro(erro);
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50/60 text-center",
        compacto ? "px-4 py-5" : "px-6 py-10",
        className,
      )}
    >
      <AlertTriangle className="h-7 w-7 text-red-500" />
      <p className="text-sm font-semibold text-red-900">{titulo}</p>
      <p className="max-w-md text-sm text-red-800/80">{detalhe}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          <RotateCw /> Tentar novamente
        </Button>
      )}
    </div>
  );
}
