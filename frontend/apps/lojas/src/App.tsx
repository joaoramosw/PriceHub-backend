import { useState } from "react";

import { apiDaIngestao, FARMACIAS, useConsulta, type IdDaFarmacia } from "@pricehub/api";
import { BarraDeNavegacao, PilhaDeAvisos, Selo, tempoRelativo, temaDa, useAvisos } from "@pricehub/ui";

import { PainelDaLoja } from "./PainelDaLoja";

const INTERVALO_DE_ATUALIZACAO_MS = 5000;

export function App() {
  const [lojaAtual, setLojaAtual] = useState<IdDaFarmacia>("biofarma");
  const integracoes = useConsulta(() => apiDaIngestao.farmacias(), [], INTERVALO_DE_ATUALIZACAO_MS);
  const { avisos, avisar } = useAvisos();

  return (
    <div className="min-h-screen">
      <BarraDeNavegacao atual="lojas" />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <h1 className="text-2xl font-semibold text-slate-900">Gestão das lojas</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Cada farmácia simulada é um sistema externo, com API e formato próprios. Aqui você gere os produtos de cada uma. Toda alteração
          dispara o padrão Observer na farmácia, que avisa o PriceHub (webhook) ou espera a próxima consulta (polling).
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {FARMACIAS.map((farmacia) => {
            const tema = temaDa(farmacia.id);
            const integracao = integracoes.dados?.find((item) => item.farmaciaId === farmacia.id);
            const ativa = farmacia.id === lojaAtual;
            return (
              <button
                key={farmacia.id}
                onClick={() => setLojaAtual(farmacia.id)}
                className={`rounded-xl border p-4 text-left transition ${ativa ? `${tema.borda} ${tema.fundoClaro} ring-2 ring-offset-1` : "border-slate-200 bg-white hover:bg-slate-50"}`}
              >
                <p className={`flex items-center gap-2 font-semibold ${tema.texto}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${tema.ponto}`} />
                  {farmacia.nome}
                </p>
                <p className="mt-1 text-xs text-slate-500">perfil de preço {farmacia.perfil}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {integracao ? (
                    <>
                      <Selo tom={integracao.situacao === "disponivel" ? "sucesso" : integracao.situacao === "indisponivel" ? "perigo" : "neutro"}>
                        {integracao.situacao}
                      </Selo>
                      <Selo tom="info">{integracao.modo}</Selo>
                      <span className="text-[11px] text-slate-500">última coleta {tempoRelativo(integracao.ultimaColetaEm)}</span>
                    </>
                  ) : (
                    <Selo tom="alerta">ms-ingestao sem resposta</Selo>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <PainelDaLoja key={lojaAtual} farmaciaId={lojaAtual} avisar={avisar} aoMudarIntegracao={integracoes.recarregar} />
      </main>
      <PilhaDeAvisos avisos={avisos} />
    </div>
  );
}
