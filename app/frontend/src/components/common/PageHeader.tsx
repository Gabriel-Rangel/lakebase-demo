import type { ReactNode } from "react";

export function PageHeader({
  titulo,
  descricao,
  acoes,
  extra,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-navy">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>}
        {extra && <div className="mt-2 flex flex-wrap items-center gap-2">{extra}</div>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

export function SectionTitle({ titulo, badge, direita }: { titulo: ReactNode; badge?: ReactNode; direita?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-navy">{titulo}</h2>
        {badge}
      </div>
      {direita && <div className="flex items-center gap-2 text-xs text-muted-foreground">{direita}</div>}
    </div>
  );
}
