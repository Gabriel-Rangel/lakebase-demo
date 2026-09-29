import { useUsuarios } from "@/api/hooks";
import type { Usuario } from "@/api/types";
import { useAppStore } from "@/store/app-store";

/** Persona atualmente selecionada no header (ou null enquanto carrega/indisponível). */
export function usePersona(): Usuario | null {
  const personaId = useAppStore((s) => s.personaId);
  const { data } = useUsuarios();
  if (!data || personaId === null) return null;
  return data.find((u) => u.id === personaId) ?? null;
}
