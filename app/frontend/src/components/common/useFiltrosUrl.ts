import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Filtros guardados na query string (sobrevivem a voltar do detalhe e podem ser compartilhados).
 * Alterar qualquer filtro (exceto "pagina") volta para a página 1.
 */
export function useFiltrosUrl<K extends string>(chaves: readonly K[]) {
  const [params, setParams] = useSearchParams();

  const valores = useMemo(() => {
    const v = {} as Record<K, string | undefined>;
    for (const k of chaves) v[k] = params.get(k) ?? undefined;
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const definir = useCallback(
    (chave: K | "pagina", valor: string | undefined) => {
      setParams(
        (atual) => {
          const novo = new URLSearchParams(atual);
          if (valor === undefined || valor === "") novo.delete(chave);
          else novo.set(chave, valor);
          if (chave !== "pagina") novo.delete("pagina");
          return novo;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const limpar = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  const pagina = Math.max(1, Number(params.get("pagina") ?? "1") || 1);
  const temFiltro = chaves.some((k) => !!params.get(k));

  return { valores, definir, limpar, pagina, temFiltro, params };
}
