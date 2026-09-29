import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { CampoForm } from "@/components/common/Campo";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** Diálogo de confirmação com comentário (opcional ou obrigatório) e conteúdo extra. */
export function ConfirmarDialog({
  open,
  onOpenChange,
  titulo,
  descricao,
  rotuloConfirmar,
  variante = "default",
  comentario = "opcional",
  placeholderComentario = "Comentário",
  carregando,
  onConfirmar,
  children,
  podeConfirmar = true,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  titulo: string;
  descricao?: ReactNode;
  rotuloConfirmar: string;
  variante?: ButtonProps["variant"];
  comentario?: "oculto" | "opcional" | "obrigatorio";
  placeholderComentario?: string;
  carregando?: boolean;
  onConfirmar: (comentario: string | undefined) => void;
  children?: ReactNode;
  podeConfirmar?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [tentou, setTentou] = useState(false);

  useEffect(() => {
    if (open) {
      setTexto("");
      setTentou(false);
    }
  }, [open]);

  const faltaComentario = comentario === "obrigatorio" && texto.trim().length === 0;

  const confirmar = (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (faltaComentario || !podeConfirmar) return;
    onConfirmar(texto.trim() || undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent {...(descricao ? {} : { "aria-describedby": undefined })}>
        <form onSubmit={confirmar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            {descricao && <DialogDescription>{descricao}</DialogDescription>}
          </DialogHeader>
          {children}
          {comentario !== "oculto" && (
            <CampoForm
              id="confirmar-comentario"
              rotulo={comentario === "obrigatorio" ? "Comentário" : "Comentário (opcional)"}
              obrigatorio={comentario === "obrigatorio"}
              erro={tentou && faltaComentario ? "O comentário é obrigatório." : null}
            >
              <Textarea
                id="confirmar-comentario"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={placeholderComentario}
                rows={3}
                autoFocus
              />
            </CampoForm>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Voltar
            </Button>
            <Button type="submit" variant={variante} disabled={carregando || !podeConfirmar}>
              {carregando && <Loader2 className="animate-spin" />}
              {rotuloConfirmar}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
