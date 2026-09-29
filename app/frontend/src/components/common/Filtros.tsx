import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { useDebounce } from "./useDebounce";

export const TODOS = "__todos__";

/** Select de filtro com opção "Todos" (Radix não aceita value vazio). */
export function FiltroSelect({
  rotulo,
  valor,
  opcoes,
  onChange,
  className,
}: {
  rotulo: string;
  valor: string | undefined;
  opcoes: { valor: string; rotulo: string }[];
  onChange: (v: string | undefined) => void;
  className?: string;
}) {
  return (
    <Select value={valor ?? TODOS} onValueChange={(v) => onChange(v === TODOS ? undefined : v)}>
      <SelectTrigger className={cn("w-[180px] bg-white", className)} aria-label={rotulo}>
        <SelectValue placeholder={rotulo} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>{rotulo}: todos</SelectItem>
        {opcoes.map((o) => (
          <SelectItem key={o.valor} value={o.valor}>
            {o.rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Campo de busca com debounce (300 ms). */
export function FiltroBusca({
  valor,
  onChange,
  placeholder = "Buscar…",
  className,
}: {
  valor: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  className?: string;
}) {
  const [texto, setTexto] = useState(valor ?? "");
  const atrasado = useDebounce(texto, 300);

  // Sincroniza quando o valor externo muda (ex.: "Limpar filtros").
  useEffect(() => {
    setTexto((t) => (t.trim() === (valor ?? "") ? t : (valor ?? "")));
  }, [valor]);

  useEffect(() => {
    const normalizado = atrasado.trim() || undefined;
    if (normalizado !== (valor ?? undefined)) onChange(normalizado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atrasado]);

  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={placeholder}
        className="bg-white pl-8 pr-8"
        aria-label="Buscar"
      />
      {texto && (
        <button
          type="button"
          onClick={() => setTexto("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-slate-100"
          aria-label="Limpar busca"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
