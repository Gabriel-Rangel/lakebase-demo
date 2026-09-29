import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface AppState {
  /** Persona selecionada no header (id de /api/usuarios). */
  personaId: number | null;
  /** Atualização automática (refetchInterval 10s) de listas e KPIs. */
  polling: boolean;
  setPersonaId: (id: number | null) => void;
  setPolling: (ligado: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      personaId: null,
      polling: true,
      setPersonaId: (id) => set({ personaId: id }),
      setPolling: (ligado) => set({ polling: ligado }),
    }),
    {
      name: "brickhouse-energia:preferencias",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({ personaId: s.personaId, polling: s.polling }),
    },
  ),
);

export const INTERVALO_POLLING_MS = 10_000;

/** refetchInterval para listas e KPIs (false quando o polling está desligado). */
export function usePollingInterval(ms: number = INTERVALO_POLLING_MS): number | false {
  const polling = useAppStore((s) => s.polling);
  return polling ? ms : false;
}
