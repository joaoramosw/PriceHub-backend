import { useState } from "react";

import { apiDoCatalogo, apiDoLog, useConsulta } from "@pricehub/api";
import { Botao, Cartao, MensagemDeErro, Selo, TituloDeSecao } from "@pricehub/ui";

const INTERVALO_MS = 2000;

export function FilasEServicos() {
  const filas = useConsulta(() => apiDoLog.filas(), [], INTERVALO_MS);
  const servicos = useConsulta(() => apiDoLog.servicos(), [], INTERVALO_MS * 2);
  const consumo = useConsulta(() => apiDoCatalogo.situacaoDoConsumo(), [], INTERVALO_MS);
  const [erroDaAcao, setErroDaAcao] = useState<Error>();

  const maiorFila = Math.max(1, ...(filas.dados ?? []).map((fila) => fila.mensagensProntas));

  const alternarConsumo = async () => {
    setErroDaAcao(undefined);
    try {
      if (consumo.dados?.pausado) await apiDoCatalogo.retomarConsumo();
      else await apiDoCatalogo.pausarConsumo();
      consumo.recarregar();
    } catch (erro) {
      setErroDaAcao(erro as Error);
    }
  };

  return (
    <div className="space-y-6">
      <Cartao>
        <TituloDeSecao
          titulo="Experimento: o catálogo sai do ar"
          subtitulo="Pause o consumidor do ms-catalogo, altere preços na gestão das lojas e observe a fila crescer. Ao retomar, nada se perde."
          acoes={
            <Botao variante={consumo.dados?.pausado ? "primario" : "perigo"} onClick={alternarConsumo} disabled={!consumo.dados}>
              {consumo.dados?.pausado ? "Retomar consumo" : "Pausar consumo do ms-catalogo"}
            </Botao>
          }
        />
        <MensagemDeErro erro={erroDaAcao ?? consumo.erro} />
        {consumo.dados && (
          <p className="text-sm">
            <Selo tom={consumo.dados.pausado ? "alerta" : "sucesso"}>{consumo.dados.pausado ? "pausado" : "consumindo"}</Selo>{" "}
            <span className="text-slate-600">{consumo.dados.explicacao}</span>
          </p>
        )}
      </Cartao>

      <Cartao>
        <TituloDeSecao titulo="Filas do RabbitMQ" subtitulo="Lidas da API de gerenciamento do broker pelo ms-log, a cada 2 s." />
        <MensagemDeErro erro={filas.erro} />
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="py-2">Fila</th>
              <th className="py-2">Retidas</th>
              <th className="py-2 text-right">Sem ACK</th>
              <th className="py-2 text-right">Consumidores</th>
              <th className="py-2 text-right">Entrada/s</th>
              <th className="py-2 text-right">Entrega/s</th>
            </tr>
          </thead>
          <tbody>
            {(filas.dados ?? []).map((fila) => (
              <tr key={fila.nome} className="border-b border-slate-100">
                <td className="py-2 font-mono text-xs">
                  {fila.nome} {fila.temporaria && <Selo>temporária (SSE)</Selo>}
                  {fila.nome.endsWith(".dlq") && <Selo tom="perigo">mensagens mortas</Selo>}
                  {fila.nome.endsWith(".retry") && <Selo tom="alerta">retentativas</Selo>}
                </td>
                <td className="w-1/3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded bg-slate-100">
                      <div
                        className={`h-2 rounded ${fila.mensagensProntas > 0 ? "bg-amber-500" : "bg-emerald-400"}`}
                        style={{ width: `${Math.max(2, (fila.mensagensProntas / maiorFila) * 100)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right font-mono text-xs">{fila.mensagensProntas}</span>
                  </div>
                </td>
                <td className="py-2 text-right font-mono text-xs">{fila.mensagensSemAck}</td>
                <td className="py-2 text-right font-mono text-xs">{fila.consumidores}</td>
                <td className="py-2 text-right font-mono text-xs">{fila.taxaDePublicacao.toFixed(1)}</td>
                <td className="py-2 text-right font-mono text-xs">{fila.taxaDeEntrega.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Cartao>

      <Cartao>
        <TituloDeSecao titulo="Microsserviços" subtitulo="Cada um com processo, banco e implantação próprios." />
        <MensagemDeErro erro={servicos.erro} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(servicos.dados ?? []).map((servico) => (
            <div key={servico.nome} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900">{servico.nome}</p>
                <Selo tom={servico.status === "ok" ? "sucesso" : servico.status === "degradado" ? "alerta" : "perigo"}>{servico.status}</Selo>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {servico.latenciaMs !== null ? `${servico.latenciaMs} ms` : "sem resposta"} ·{" "}
                {servico.detalhes ? Object.entries(servico.detalhes).map(([nome, ok]) => `${nome} ${ok ? "ok" : "falhou"}`).join(", ") : servico.url}
              </p>
              <a href={servico.documentacao} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-slate-600 underline">
                documentação (Swagger)
              </a>
            </div>
          ))}
        </div>
      </Cartao>
    </div>
  );
}
