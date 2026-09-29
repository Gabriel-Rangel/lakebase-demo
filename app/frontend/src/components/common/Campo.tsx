import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Label + controle + mensagem de erro/ajuda, com espaçamento consistente. */
export function CampoForm({
  id,
  rotulo,
  obrigatorio,
  erro,
  ajuda,
  children,
  className,
}: {
  id?: string;
  rotulo: string;
  obrigatorio?: boolean;
  erro?: string | null;
  ajuda?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-semibold text-slate-700">
        {rotulo}
        {obrigatorio && <span className="ml-0.5 text-primary">*</span>}
      </Label>
      {children}
      {erro ? (
        <p className="text-xs text-red-600">{erro}</p>
      ) : ajuda ? (
        <p className="text-xs text-muted-foreground">{ajuda}</p>
      ) : null}
    </div>
  );
}
