import { apiDoLog, useConsulta } from "@pricehub/api";
import { Cartao, MensagemDeErro, corDoEvento, formatarHora, formatarMs } from "@pricehub/ui";

const RAIAS = ["ms-ingestao", "ms-catalogo"];

/** Reconstitui uma operação inteira a partir do correlationId, como no rastreamento distribuído. */
export function LinhaDoTempo({ correlationId, versao }: { correlationId?: string; versao: number }) {
  const rastreamento = useConsulta(
    () => (correlationId ? apiDoLog.rastrear(correlationId) : Promise.resolve(undefined)),
    [correlationId, Math.floor(versao / 5)],
  );
  const dados = rastreamento.dados;

  return (
    <Cartao className="h-fit lg:sticky lg:top-20">
      <h3 className="font-semibold text-slate-900">Linha do tempo da operação</h3>
      {!correlationId && <p className="mt-2 text-sm text-slate-500">Clique em um evento para ver todos os eventos da mesma operação.</p>}
      {correlationId && <MensagemDeErro erro={rastreamento.erro} />}
      {dados && (
        <>
          <p className="mt-1 text-xs break-all text-slate-500">correlationId {dados.correlationId}</p>
          <div className="my-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-lg font-semibold text-slate-900">{dados.totalDeEventos}</p>eventos
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-lg font-semibold text-slate-900">{formatarMs(dados.duracaoTotalMs)}</p>do 1º ao último
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-lg font-semibold text-slate-900">{dados.servicosEnvolvidos.length}</p>serviços
            </div>
          </div>
          <div className="mb-1 grid grid-cols-2 gap-2 text-center text-[11px] font-medium text-slate-500 uppercase">
            {RAIAS.map((raia) => (
              <span key={raia}>{raia}</span>
            ))}
          </div>
          <ol className="max-h-[60vh] space-y-1.5 overflow-y-auto">
            {dados.eventos.map((evento, indice) => {
              const coluna = RAIAS.indexOf(evento.servicoDeOrigem);
              return (
                <li key={`${evento.ocorridoEm}-${indice}`} className={`grid grid-cols-2 gap-2`}>
                  <div className={`rounded-md border px-2 py-1.5 text-xs ${corDoEvento(evento.tipo)} ${coluna === 1 ? "col-start-2" : "col-start-1"}`}>
                    <p className="font-mono">
                      +{formatarMs(evento.desdeOInicioMs)} <span className="opacity-60">(Δ {formatarMs(evento.desdeOAnteriorMs)})</span>
                    </p>
                    <p className="font-medium">{evento.tipo}</p>
                    <p className="opacity-70">{formatarHora(evento.ocorridoEm)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </Cartao>
  );
}
