import { useEffect, useState } from "react";

import { apiDoLog, URLS_DOS_APPS, useFluxoDeEventos, type IdDaFarmacia, type RegistroDeEvento } from "@pricehub/api";
import { Cartao, IndicadorDeConexao, corDoEvento, formatarHora, formatarMs } from "@pricehub/ui";

export interface Acompanhamento {
  descricao: string;
  farmaciaId: IdDaFarmacia;
  correlationId: string;
  modo: "webhook" | "polling";
  iniciadoEm: string;
}

const LIMITE_DE_EVENTOS = 40;
const LIMITE_DO_BUFFER = 300;
const ATRASO_DA_CONSULTA_MS = 400;

/**
 * Mostra, em tempo real, a alteração feita na loja atravessando os microsserviços.
 * Webhook: a operação carrega o mesmo correlationId da farmácia até o catálogo.
 * Polling: a farmácia não avisa ninguém; o evento aparece quando o ms-ingestao fizer a próxima consulta.
 */
export function PropagacaoAoVivo({ acompanhamento }: { acompanhamento?: Acompanhamento }) {
  // O fluxo fica sempre aberto: no webhook o evento chega em poucos milissegundos, antes até de a tela reagir.
  const [recebidos, setRecebidos] = useState<RegistroDeEvento[]>([]);

  const conexao = useFluxoDeEventos<RegistroDeEvento>(apiDoLog.urlDoTempoReal, (_tipo, registro) =>
    setRecebidos((atuais) => [...atuais, registro].slice(-LIMITE_DO_BUFFER)),
  );

  // Complementa com o que já estava gravado (caso algum evento tenha chegado antes da conexão).
  useEffect(() => {
    if (!acompanhamento) return undefined;
    const temporizador = window.setTimeout(() => {
      apiDoLog
        .registros({ correlationId: acompanhamento.correlationId, limite: LIMITE_DE_EVENTOS })
        .then((gravados) => setRecebidos((atuais) => [...gravados, ...atuais].slice(-LIMITE_DO_BUFFER)))
        .catch(() => undefined);
    }, ATRASO_DA_CONSULTA_MS);
    return () => window.clearTimeout(temporizador);
  }, [acompanhamento]);

  const pertence = (registro: RegistroDeEvento) => {
    if (!acompanhamento) return false;
    if (registro.correlationId === acompanhamento.correlationId) return true;
    const depoisDaAlteracao = new Date(registro.ocorridoEm) >= new Date(acompanhamento.iniciadoEm);
    return acompanhamento.modo === "polling" && depoisDaAlteracao && registro.farmaciaId === acompanhamento.farmaciaId;
  };

  const vistos = new Set<string>();
  const eventos = recebidos
    .filter(pertence)
    .filter((registro) => !vistos.has(registro.idDoEvento) && Boolean(vistos.add(registro.idDoEvento)))
    .sort((a, b) => a.ocorridoEm.localeCompare(b.ocorridoEm))
    .slice(-LIMITE_DE_EVENTOS);

  const inicio = acompanhamento ? new Date(acompanhamento.iniciadoEm).getTime() : 0;
  const catalogoAtualizado = eventos.some((evento) => evento.tipo.startsWith("catalogo."));

  return (
    <Cartao className="h-fit lg:sticky lg:top-20">
      <h3 className="font-semibold text-slate-900">Propagação ao vivo</h3>
      <p className="mb-3 text-xs text-slate-500">
        Eventos lidos do <strong>ms-log</strong> (que assina tudo o que passa pelo RabbitMQ).
      </p>
      {!acompanhamento && <p className="text-sm text-slate-500">Altere um preço ao lado para ver o caminho do evento.</p>}
      {acompanhamento && (
        <>
          <div className="mb-3 rounded-lg bg-slate-50 p-3 text-xs">
            <p className="font-medium text-slate-800">{acompanhamento.descricao}</p>
            <p className="mt-1 text-slate-500">
              correlationId <code className="break-all">{acompanhamento.correlationId}</code>
            </p>
            <p className="mt-1">
              <IndicadorDeConexao situacao={conexao} rotulo="ms-log" />
            </p>
            {acompanhamento.modo === "polling" && !catalogoAtualizado && (
              <p className="mt-2 text-amber-700">Loja sem webhook: aguardando a próxima consulta do ms-ingestao (polling, até ~15 s).</p>
            )}
          </div>
          <ol className="space-y-1.5">
            <li className="rounded-md border border-slate-200 px-2 py-1.5 text-xs">
              <span className="font-mono text-slate-400">+0 ms</span> farmácia respondeu ao painel ({formatarHora(acompanhamento.iniciadoEm)})
            </li>
            {eventos.map((evento) => (
              <li key={evento.idDoEvento} className={`rounded-md border px-2 py-1.5 text-xs ${corDoEvento(evento.tipo)}`}>
                <span className="font-mono">+{formatarMs(Math.max(0, new Date(evento.ocorridoEm).getTime() - inicio))}</span>{" "}
                <strong>{evento.tipo}</strong>
                <span className="block opacity-75">{evento.servicoDeOrigem}</span>
              </li>
            ))}
          </ol>
          {catalogoAtualizado && <p className="mt-3 text-xs font-medium text-emerald-700">Catálogo atualizado: o comparador já mostra o novo valor.</p>}
          <a
            className="mt-3 block text-xs text-slate-600 underline"
            href={`${URLS_DOS_APPS.monitor}?correlationId=${acompanhamento.correlationId}`}
            target="_blank"
            rel="noreferrer"
          >
            Ver linha do tempo completa no monitor
          </a>
        </>
      )}
    </Cartao>
  );
}
