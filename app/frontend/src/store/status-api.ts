import { create } from "zustand";

/**
 * Estado global da conectividade com a API (não persistido).
 * - "acordando": a API respondeu 503 (Lakebase saindo do scale-to-zero, rede).
 * - "offline": o backend não respondeu (container parado, 502/504 do proxy).
 */
export type EstadoApi = "ok" | "acordando" | "offline";

interface StatusApiState {
  estado: EstadoApi;
  desde: number | null;
  mensagem: string | null;
  marcarOk: () => void;
  marcarAcordando: (mensagem: string) => void;
  marcarOffline: (mensagem: string) => void;
}

export const useStatusApi = create<StatusApiState>()((set, get) => ({
  estado: "ok",
  desde: null,
  mensagem: null,
  marcarOk: () => {
    if (get().estado !== "ok") set({ estado: "ok", desde: null, mensagem: null });
  },
  marcarAcordando: (mensagem) => {
    const atual = get();
    if (atual.estado === "acordando") {
      if (atual.mensagem !== mensagem) set({ mensagem });
      return;
    }
    set({ estado: "acordando", desde: Date.now(), mensagem });
  },
  marcarOffline: (mensagem) => {
    const atual = get();
    if (atual.estado === "offline") return;
    set({ estado: "offline", desde: Date.now(), mensagem });
  },
}));
