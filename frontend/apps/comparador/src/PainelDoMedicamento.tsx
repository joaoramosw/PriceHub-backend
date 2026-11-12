import { apiDoCatalogo, useConsulta, type PontoDoHistorico } from "@pricehub/api";
import { Carregando, MensagemDeErro, Selo, formatarDataHora, formatarPreco, tempoRelativo, temaDa } from "@pricehub/ui";

const LARGURA = 520;
const ALTURA = 160;
const MARGEM = 28;
const CORES_DAS_LINHAS: Record<string, string> = { biofarma: "#059669", farmaazul: "#2563eb", drogapopular: "#dc2626" };

/** Gráfico em degraus do histórico de preços: cada farmácia é uma linha. */
function GraficoDoHistorico({ pontos }: { pontos: PontoDoHistorico[] }) {
  if (pontos.length === 0) return <p className="text-sm text-slate-500">Sem histórico ainda.</p>;
  const instantes = pontos.map((ponto) => new Date(ponto.registradoEm).getTime());
  const precos = pontos.map((ponto) => ponto.precoCentavos);
  const inicio = Math.min(...instantes);
  const fim = Math.max(Date.now(), ...instantes);
  const minimo = Math.min(...precos) * 0.9;
  const maximo = Math.max(...precos) * 1.05;
  const x = (instante: number) => MARGEM + ((instante - inicio) / Math.max(1, fim - inicio)) * (LARGURA - 2 * MARGEM);
  const y = (preco: number) => ALTURA - MARGEM - ((preco - minimo) / Math.max(1, maximo - minimo)) * (ALTURA - 2 * MARGEM);

  const porFarmacia = new Map<string, PontoDoHistorico[]>();
  pontos.forEach((ponto) => porFarmacia.set(ponto.farmaciaId, [...(porFarmacia.get(ponto.farmaciaId) ?? []), ponto]));

  return (
    <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} className="w-full" role="img" aria-label="Histórico de preços por farmácia">
      <line x1={MARGEM} x2={LARGURA - MARGEM} y1={ALTURA - MARGEM} y2={ALTURA - MARGEM} stroke="#e2e8f0" />
      {[...porFarmacia.entries()].map(([farmaciaId, serie]) => {
        let caminho = "";
        serie.forEach((ponto, indice) => {
          const px = x(new Date(ponto.registradoEm).getTime());
          const py = y(ponto.precoCentavos);
          caminho += indice === 0 ? `M ${px} ${py}` : ` H ${px} V ${py}`;
        });
        const ultimo = serie[serie.length - 1];
        caminho += ` H ${x(fim)}`;
        return (
          <g key={farmaciaId}>
            <path d={caminho} fill="none" stroke={CORES_DAS_LINHAS[farmaciaId] ?? "#64748b"} strokeWidth={2} />
            <text x={LARGURA - MARGEM + 2} y={y(ultimo.precoCentavos) + 4} fontSize="10" fill={CORES_DAS_LINHAS[farmaciaId] ?? "#64748b"}>
              {(ultimo.precoCentavos / 100).toFixed(2)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function PainelDoMedicamento({ medicamentoId, versao, aoFechar }: { medicamentoId: string; versao: number; aoFechar: () => void }) {
  const detalhe = useConsulta(() => apiDoCatalogo.detalharMedicamento(medicamentoId), [medicamentoId, versao]);
  const historico = useConsulta(() => apiDoCatalogo.historico(medicamentoId), [medicamentoId, versao]);
  const medicamento = detalhe.dados;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onClick={aoFechar}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl" onClick={(evento) => evento.stopPropagation()}>
        <button onClick={aoFechar} className="float-right rounded-md px-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar">
          ✕
        </button>
        <MensagemDeErro erro={detalhe.erro} />
        {!medicamento && <Carregando />}
        {medicamento && (
          <>
            <p className="text-xs text-slate-500 uppercase">{medicamento.categoria ?? "Medicamento"}</p>
            <h2 className="text-xl font-semibold text-slate-900">{medicamento.nome}</h2>
            <p className="text-sm text-slate-500">
              {medicamento.principioAtivo} · {medicamento.apresentacao}
              {medicamento.fabricante && ` · ${medicamento.fabricante}`}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              registro MS {medicamento.registroMs ?? "não informado"} · chave canônica <code>{medicamento.chaveCanonica}</code>
            </p>

            <h3 className="mt-6 mb-2 text-sm font-semibold text-slate-700">Ofertas (menor preço primeiro)</h3>
            <ol className="space-y-2">
              {medicamento.ofertas.map((oferta) => {
                const tema = temaDa(oferta.farmaciaId);
                return (
                  <li
                    key={oferta.ofertaId}
                    className={`flex items-center gap-3 rounded-lg border p-3 ${oferta.disponivel ? tema.borda : "border-slate-200 opacity-50"} ${
                      oferta.posicao === 1 ? tema.fundoClaro : "bg-white"
                    }`}
                  >
                    <span className="w-6 text-center text-sm font-bold text-slate-400">{oferta.posicao ?? "-"}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`flex items-center gap-1.5 text-sm font-medium ${tema.texto}`}>
                        <span className={`h-2 w-2 rounded-full ${tema.ponto}`} />
                        {oferta.farmaciaNome}
                        {oferta.posicao === 1 && <Selo tom="sucesso">mais barato</Selo>}
                        {!oferta.disponivel && <Selo tom="alerta">indisponível</Selo>}
                      </p>
                      <p className="truncate text-xs text-slate-500" title={oferta.nomeNaFarmacia}>
                        "{oferta.nomeNaFarmacia}" · atualizado {tempoRelativo(oferta.atualizadoEm)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">{formatarPreco(oferta.precoCentavos)}</p>
                      {!!oferta.diferencaParaOMenorCentavos && (
                        <p className="text-xs text-red-600">+{formatarPreco(oferta.diferencaParaOMenorCentavos)}</p>
                      )}
                      {oferta.urlDoProduto && oferta.disponivel && (
                        <a href={oferta.urlDoProduto} target="_blank" rel="noreferrer" className="text-xs text-slate-600 underline">
                          ver na loja
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>

            <h3 className="mt-6 mb-2 text-sm font-semibold text-slate-700">Histórico de preços</h3>
            <GraficoDoHistorico pontos={historico.dados ?? []} />
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs text-slate-500">
              {[...(historico.dados ?? [])].reverse().map((ponto, indice) => (
                <li key={`${ponto.registradoEm}-${indice}`} className="flex justify-between gap-2">
                  <span>{formatarDataHora(ponto.registradoEm)}</span>
                  <span className={temaDa(ponto.farmaciaId).texto}>{ponto.farmaciaNome}</span>
                  <span className="font-medium text-slate-700">{formatarPreco(ponto.precoCentavos)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}
