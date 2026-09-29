import { Link } from "react-router-dom";
import { Compass } from "lucide-react";

import { EmptyState } from "@/components/common/estados";
import { Button } from "@/components/ui/button";

export default function NaoEncontrada() {
  return (
    <EmptyState
      className="mt-10"
      icone={<Compass />}
      titulo="Página não encontrada"
      descricao="O endereço acessado não existe nesta demo."
      acao={
        <Button asChild>
          <Link to="/">Voltar ao Painel</Link>
        </Button>
      }
    />
  );
}
