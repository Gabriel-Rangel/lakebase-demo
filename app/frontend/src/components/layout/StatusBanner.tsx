import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, PlugZap, RotateCw } from "lucide-react";

import { getHealth, getHealthDb } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import { useStatusApi } from "@/store/status-api";

const INTERVALO_RETRY_MS = 4000;

/**
 * Banner global: aparece quando a API devolve 503 (Lakebase acordando do scale-to-zero)
 * ou quando o backend não responde. Faz ping periódico e, quando volta, recarrega as telas.
 */
export function StatusBanner() {
  const estado = useStatusApi((s) => s.estado);
  const desde = useStatusApi((s) => s.desde);
  const mensagem = useStatusApi((s) => s.mensagem);
  const qc = useQueryClient();
  const [agora, setAgora] = useState(Date.now());
  const [tentando, setTentando] = useState(false);

  const tentar = async () => {
    const atual = useStatusApi.getState().estado;
    if (atual === "ok") return;
    setTentando(true);
    try {
      if (atual === "acordando") await getHealthDb();
      else await getHealth();
      // Sucesso: o interceptor já marcou "ok"; recarrega o que está na tela.
      await qc.refetchQueries({ type: "active" });
    } catch {
      // continua no mesmo estado; próxima tentativa no intervalo
    } finally {
      setTentando(false);
    }
  };

  useEffect(() => {
    if (estado === "ok") return;
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    const retry = setInterval(() => void tentar(), INTERVALO_RETRY_MS);
    return () => {
      clearInterval(relogio);
      clearInterval(retry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  if (estado === "ok") return null;

  const segundos = desde ? Math.max(0, Math.round((agora - desde) / 1000)) : 0;

  if (estado === "acordando") {
    return (
      <div role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-2.5 lg:px-6">
        <div className="flex flex-wrap items-center gap-3 text-sm text-amber-900">
          <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
          <span className="font-semibold">Lakebase acordando (scale-to-zero)… tentando novamente</span>
          <span className="text-amber-800/80 tabular">há {segundos}s</span>
          {mensagem && <span className="hidden text-amber-800/70 xl:inline">· {mensagem}</span>}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7 border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
            onClick={() => void tentar()}
            disabled={tentando}
          >
            <RotateCw className={tentando ? "animate-spin" : ""} /> Tentar agora
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div role="status" className="border-b border-red-200 bg-red-50 px-4 py-2.5 lg:px-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-red-900">
        <PlugZap className="h-4 w-4 text-red-600" />
        <span className="font-semibold">API indisponível — tentando reconectar</span>
        <span className="text-red-800/80 tabular">há {segundos}s</span>
        <span className="hidden text-red-800/70 xl:inline">· {mensagem}</span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-7 border-red-200 bg-white text-red-900 hover:bg-red-100"
          onClick={() => void tentar()}
          disabled={tentando}
        >
          <RotateCw className={tentando ? "animate-spin" : ""} /> Tentar agora
        </Button>
      </div>
    </div>
  );
}
