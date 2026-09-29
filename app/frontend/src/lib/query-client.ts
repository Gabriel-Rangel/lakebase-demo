import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/api/client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // retry: 1 — mas não insiste em 4xx (404/409/422 não melhoram com retry).
      retry: (falhas, erro) => {
        if (erro instanceof ApiError && erro.status !== null && erro.status >= 400 && erro.status < 500) return false;
        return falhas < 1;
      },
      retryDelay: (tentativa, erro) =>
        erro instanceof ApiError && erro.status === 503 ? 3000 : Math.min(1000 * 2 ** tentativa, 5000),
      // Sem refetch ao focar a aba: a demo de lock otimista usa duas abas com versões diferentes.
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
    mutations: {
      retry: false,
    },
  },
});
