import { useState } from "react";

import { apiDoCatalogo, apiDoLog, DOCUMENTACAO_DOS_SERVICOS, FARMACIAS, urlDaLoja, urlDoAdminDaLoja, useConsulta } from "@pricehub/api";
import { Botao, Cartao, MensagemDeErro, Selo, TituloDeSecao } from "@pricehub/ui";

const INTERVALO_MS = 2000;

const DESCRICOES: Record<string, string> = {
  "ms-ingestao": "Webhooks, polling e padrão Adapter: converte o formato de cada farmácia e publica os eventos de ingestão.",
  "ms-catalogo": "Catálogo padronizado, comparação de preços, histórico, outbox e tempo real (SSE).",
  "ms-log": "Registra todos os eventos, rastreia por correlationId, calcula as métricas e consulta filas e saúde.",
  "farmacia-biofarma": "Sistema externo. Avisa por webhook; JSON em camelCase, preço em reais.",
  "farmacia-farmaazul": "Sistema externo. Avisa por webhook; JSON paginado em snake_case, preço em centavos.",
  "farmacia-drogapopular": "Sistema externo legado. Consultado por polling com ETag; texto em maiúsculas.",
};

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
          subtitulo="Pause o consumidor do ms-catalogo, altere preços na gestão das farmácias e observe a fila crescer. Ao retomar, nada se perde."
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
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
                          style={{
                            width: `${Math.max(2, (fila.mensagensProntas / maiorFila) * 100)}%`,
                          }}
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
        </div>
      </Cartao>

      <Cartao>
        <TituloDeSecao
          titulo="Serviços"
          subtitulo="Saúde consultada pelo ms-log a cada 4 s. O Swagger abre direto na porta do serviço; o comparador e o monitor usam as mesmas rotas pelo gateway (/api/...)."
        />
        <MensagemDeErro erro={servicos.erro} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(servicos.dados ?? []).map((servico) => {
            const farmacia = FARMACIAS.find((item) => `farmacia-${item.id}` === servico.nome);
            const documentacao = DOCUMENTACAO_DOS_SERVICOS[servico.nome] ?? servico.url;
            return (
              <div key={servico.nome} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">{farmacia?.nome ?? servico.nome}</p>
                  <Selo tom={servico.status === "ok" ? "sucesso" : servico.status === "degradado" ? "alerta" : "perigo"}>
                    {servico.status}
                  </Selo>
                </div>
                <p className="mt-1 text-xs text-slate-600">{DESCRICOES[servico.nome]}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {servico.latenciaMs !== null ? `${servico.latenciaMs} ms` : "sem resposta"}
                  {servico.detalhes &&
                    ` · ${Object.entries(servico.detalhes)
                      .map(([nome, ok]) => `${nome} ${ok ? "ok" : "falhou"}`)
                      .join(", ")}`}
                </p>
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {farmacia && (
                    <>
                      <a className="font-medium text-slate-900 underline" href={urlDaLoja(farmacia.id)} target="_blank" rel="noreferrer">
                        Loja
                      </a>
                      <a
                        className="font-medium text-slate-900 underline"
                        href={urlDoAdminDaLoja(farmacia.id)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Gestão de preços
                      </a>
                    </>
                  )}
                  <a className="text-slate-700 underline" href={`${documentacao}/docs`} target="_blank" rel="noreferrer">
                    Swagger
                  </a>
                  <a className="text-slate-700 underline" href={`${documentacao}/redoc`} target="_blank" rel="noreferrer">
                    ReDoc
                  </a>
                </p>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-slate-600">
          RabbitMQ: painel de gerenciamento em <code>http://localhost:15672</code> (usuário e senha definidos no <code>.env</code>).
        </p>
      </Cartao>
    </div>
  );
}
