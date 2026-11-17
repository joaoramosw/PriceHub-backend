import { useState } from "react";

import { apiDoCatalogo, useFluxoDeEventos } from "@pricehub/api";
import { BarraDeNavegacao, IndicadorDeConexao, PilhaDeAvisos, Vazio, formatarPreco, useAvisos } from "@pricehub/ui";

import { ListaDeMedicamentos } from "./ListaDeMedicamentos";
import { PaginaDasParceiras } from "./PaginaDasParceiras";
import { PaginaDoMedicamento } from "./PaginaDoMedicamento";
import { aoClicarNoLink, useRota } from "./rotas";

export interface EventoDoCatalogo {
  tipo: string;
  correlationId: string;
  dados: {
    medicamentoId?: string;
    medicamentoNome?: string;
    farmaciaNome?: string;
    situacao?: string;
    precoAnteriorCentavos?: number | null;
    precoAtualCentavos?: number;
    farmaciaAnteriorNome?: string;
    farmaciaAtualNome?: string;
  };
}

export function App() {
  const rota = useRota();
  const { avisos, avisar } = useAvisos();
  // Cada evento do ms-catalogo incrementa a versão; as páginas recarregam os dados quando ela muda.
  const [versao, setVersao] = useState(0);
  const [ultimoEvento, setUltimoEvento] = useState<EventoDoCatalogo>();

  // O comparador não consulta as farmácias: ele reage aos eventos publicados pelo ms-catalogo.
  const conexao = useFluxoDeEventos<EventoDoCatalogo>(apiDoCatalogo.urlDoTempoReal, (tipo, evento) => {
    setVersao((atual) => atual + 1);
    setUltimoEvento({ ...evento, tipo });
    if (tipo === "catalogo.oferta.atualizada" && evento.dados.situacao === "preco-alterado") {
      avisar({
        tom: "info",
        titulo: evento.dados.medicamentoNome ?? "Preço alterado",
        texto: `${evento.dados.farmaciaNome}: ${formatarPreco(evento.dados.precoAnteriorCentavos)} → ${formatarPreco(evento.dados.precoAtualCentavos)}`,
      });
    }
    if (tipo === "catalogo.menor-preco.alterado") {
      avisar({
        tom: "sucesso",
        titulo: `Menor preço agora na ${evento.dados.farmaciaAtualNome}`,
        texto: `${evento.dados.medicamentoNome}: ${formatarPreco(evento.dados.precoAtualCentavos)} (antes ${evento.dados.farmaciaAnteriorNome}, ${formatarPreco(evento.dados.precoAnteriorCentavos)})`,
      });
    }
  });

  const atual = rota.pagina === "parceiras" ? "parceiras" : "comparador";

  return (
    <div className="min-h-screen">
      <BarraDeNavegacao atual={atual} extra={<IndicadorDeConexao situacao={conexao} />} />
      {rota.pagina === "lista" && <ListaDeMedicamentos versao={versao} ultimoEvento={ultimoEvento} />}
      {rota.pagina === "medicamento" && <PaginaDoMedicamento id={rota.id} versao={versao} />}
      {rota.pagina === "parceiras" && <PaginaDasParceiras versao={versao} />}
      {rota.pagina === "nao-encontrada" && (
        <main className="mx-auto max-w-7xl px-4 py-10">
          <Vazio titulo="Página não encontrada">
            O endereço {window.location.pathname} não existe no comparador.{" "}
            <a href="/" onClick={aoClicarNoLink("/")} className="underline">
              Voltar para a lista de medicamentos
            </a>
            .
          </Vazio>
        </main>
      )}
      <PilhaDeAvisos avisos={avisos} />
    </div>
  );
}
