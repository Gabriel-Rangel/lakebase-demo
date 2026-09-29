import { useEffect } from "react";
import { ChevronDown, UserRound } from "lucide-react";

import { useUsuarios } from "@/api/hooks";
import type { Papel } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { PAPEL_LABEL, rotulo } from "@/lib/dominio";
import { cn, iniciais } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

const COR_PAPEL: Record<Papel, string> = {
  TECNICO: "bg-sky-100 text-sky-800",
  SUPERVISOR: "bg-indigo-100 text-indigo-800",
  SEGURANCA: "bg-amber-100 text-amber-800",
  PLANEJADOR: "bg-teal-100 text-teal-800",
};

export function PersonaSelector() {
  const { data: usuarios, isLoading, isError } = useUsuarios();
  const personaId = useAppStore((s) => s.personaId);
  const setPersonaId = useAppStore((s) => s.setPersonaId);

  // Padrão: primeiro TECNICO (ou o primeiro usuário) quando nada válido está salvo.
  useEffect(() => {
    if (!usuarios || usuarios.length === 0) return;
    if (personaId !== null && usuarios.some((u) => u.id === personaId)) return;
    const padrao = usuarios.find((u) => u.papel === "TECNICO") ?? usuarios[0];
    setPersonaId(padrao.id);
  }, [usuarios, personaId, setPersonaId]);

  if (isLoading) return <Skeleton className="h-10 w-52" />;

  const persona = usuarios?.find((u) => u.id === personaId) ?? null;

  if (isError || !usuarios || usuarios.length === 0) {
    return (
      <Button variant="outline" disabled className="h-10 gap-2" title="Personas indisponíveis">
        <UserRound /> <span className="hidden sm:inline">Personas indisponíveis</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-10 gap-2.5 pl-1.5 pr-2.5" aria-label="Trocar persona">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white">
            {iniciais(persona?.nome)}
          </span>
          <span className="hidden flex-col items-start leading-tight sm:flex">
            <span className="max-w-[160px] truncate text-sm font-medium">{persona?.nome ?? "Selecione"}</span>
            <span className="text-[11px] text-muted-foreground">
              {persona ? `${rotulo(PAPEL_LABEL, persona.papel)}${persona.unidade ? ` · ${persona.unidade}` : ""}` : "persona"}
            </span>
          </span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Atuar como (persona)</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={personaId !== null ? String(personaId) : ""} onValueChange={(v) => setPersonaId(Number(v))}>
          {usuarios.map((u) => (
            <DropdownMenuRadioItem key={u.id} value={String(u.id)} className="py-2">
              <div className="flex w-full items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{u.nome}</div>
                  <div className="truncate text-xs text-muted-foreground">{u.unidade ?? u.email}</div>
                </div>
                <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium", COR_PAPEL[u.papel] ?? "bg-slate-100")}>
                  {rotulo(PAPEL_LABEL, u.papel)}
                </span>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
