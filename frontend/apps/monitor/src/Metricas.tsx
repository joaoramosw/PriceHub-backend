import { apiDoLog, FARMACIAS, useConsulta, type Distribuicao } from "@pricehub/api";
import { Cartao, MensagemDeErro, TituloDeSecao, Vazio, formatarHora, formatarMs, formatarPreco, temaDa } from "@pricehub/ui";

const INTERVALO_MS = 3000;

const ROTULOS_DA_ORIGEM: Record<string, string> = {
  "carga-inicial": "Carga inicial",
  manual: "Manual (tela de gestão)",
  programada: "Programada (simulação)",
  desconhecida: "Não informada",
};

const EXPLICACOES_DA_COLETA: Record<string, string> = {
  webhook: "A farmácia avisa o PriceHub no momento da alteração.",
  polling: "Inclui a espera até a próxima consulta ao arquivo da farmácia (a cada 5 s).",
  sincronizacao: "Coleta completa pedida pelo ms-ingestao (carga inicial ou pedido manual pela API).",
};

function LinhaDeMetrica({ rotulo, explicacao, distribuicao }: { rotulo: string; explicacao: string; distribuicao: Distribuicao }) {
  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="py-2 pr-3">
        <p className="font-medium text-slate-800">{rotulo}</p>
        <p className="text-xs text-slate-600">{explicacao}</p>
      </td>
      <td className="py-2 pr-3 text-right text-slate-900 tabular-nums">{formatarMs(distribuicao.medianaMs)}</td>
      <td className="py-2 pr-3 text-right text-slate-900 tabular-nums">{formatarMs(distribuicao.p95Ms)}</td>
      <td className="py-2 text-right text-slate-700 tabular-nums">{distribuicao.amostras}</td>
    </tr>
  );
}

function Contagem({ titulo, linhas }: { titulo: string; linhas: { chave: string; rotulo: string; total: number; classe?: string }[] }) {
  const maior = Math.max(1, ...linhas.map((linha) => linha.total));
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-800">{titulo}</h3>
      {linhas.length === 0 ? (
        <p className="text-sm text-slate-600">Nenhuma alteração registrada ainda.</p>
      ) : (
        <ul className="space-y-2">
          {linhas.map((linha) => (
            <li key={linha.chave} className="grid grid-cols-[10rem_1fr_3rem] items-center gap-3 text-sm">
              <span className={linha.classe ?? "text-slate-700"}>{linha.rotulo}</span>
              <span className="h-2 rounded bg-slate-100">
                <span className="block h-2 rounded bg-slate-500" style={{ width: `${(linha.total / maior) * 100}%` }} />
              </span>
              <span className="text-right text-slate-900 tabular-nums">{linha.total}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Metricas() {
  const metricas = useConsulta(() => apiDoLog.metricas(), [], INTERVALO_MS);
  const dados = metricas.dados;

  const porFarmacia = FARMACIAS.filter((farmacia) => dados?.alteracoesPorFarmacia[farmacia.id]).map((farmacia) => ({
    chave: farmacia.id,
    rotulo: farmacia.nome,
    total: dados?.alteracoesPorFarmacia[farmacia.id] ?? 0,
    classe: temaDa(farmacia.id).texto,
  }));
  const porOrigem = Object.entries(dados?.alteracoesPorOrigem ?? {})
    .sort(([, a], [, b]) => b - a)
    .map(([origem, total]) => ({
      chave: origem,
      rotulo: ROTULOS_DA_ORIGEM[origem] ?? origem,
      total,
    }));

  return (
    <div className="space-y-6">
      <MensagemDeErro erro={metricas.erro} />

      <Cartao>
        <TituloDeSecao
          titulo="Tempo de propagação"
          subtitulo="Medido pelo ms-log a partir dos eventos do RabbitMQ, agrupados por correlationId. Cada amostra é uma alteração de preço feita numa farmácia."
        />
        {dados && dados.convergencia.amostras === 0 && (
          <Vazio titulo="Sem amostras ainda">
            Altere um preço na tela de gestão de uma farmácia ou espere o próximo reajuste programado.
          </Vazio>
        )}
        {dados && dados.convergencia.amostras > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs text-slate-600">
                <tr>
                  <th className="py-2 pr-3 font-medium">Medida</th>
                  <th className="py-2 pr-3 text-right font-medium">Mediana</th>
                  <th className="py-2 pr-3 text-right font-medium">p95</th>
                  <th className="py-2 text-right font-medium">Amostras</th>
                </tr>
              </thead>
              <tbody>
                <LinhaDeMetrica
                  rotulo="Aceite"
                  explicacao="Quanto a farmácia esperou o ms-ingestao responder; ele responde assim que publica no RabbitMQ."
                  distribuicao={dados.aceite}
                />
                <LinhaDeMetrica
                  rotulo="Convergência"
                  explicacao="Do primeiro evento da alteração até o preço novo gravado no catálogo."
                  distribuicao={dados.convergencia}
                />
                {Object.entries(dados.convergenciaPorOrigem).map(([origem, distribuicao]) => (
                  <LinhaDeMetrica
                    key={origem}
                    rotulo={`Convergência via ${origem}`}
                    explicacao={EXPLICACOES_DA_COLETA[origem] ?? ""}
                    distribuicao={distribuicao}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      <Cartao>
        <TituloDeSecao
          titulo="Alterações de preço"
          subtitulo="Preços que mudaram no catálogo, entre os últimos eventos registrados pelo ms-log."
        />
        <div className="grid gap-6 md:grid-cols-2">
          <Contagem titulo="Por farmácia" linhas={porFarmacia} />
          <Contagem titulo="Por origem" linhas={porOrigem} />
        </div>
      </Cartao>

      <Cartao>
        <TituloDeSecao
          titulo="Trocas da farmácia mais barata"
          subtitulo="Evento catalogo.menor-preco.alterado: publicado pelo ms-catalogo quando outra farmácia passa a ter o menor preço de um medicamento."
        />
        {dados && (
          <p className="mb-3 text-sm text-slate-700">
            <span className="text-2xl font-semibold text-slate-900 tabular-nums">{dados.trocasDaMaisBarata}</span> trocas registradas
          </p>
        )}
        {dados && dados.ultimasTrocasDaMaisBarata.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs text-slate-600">
                <tr>
                  <th className="py-2 pr-3 font-medium">Quando</th>
                  <th className="py-2 pr-3 font-medium">Medicamento</th>
                  <th className="py-2 pr-3 font-medium">Antes</th>
                  <th className="py-2 font-medium">Agora</th>
                </tr>
              </thead>
              <tbody>
                {dados.ultimasTrocasDaMaisBarata.map((troca) => (
                  <tr key={`${troca.ocorridoEm}-${troca.medicamentoId}`} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3 text-xs whitespace-nowrap tabular-nums">{formatarHora(troca.ocorridoEm)}</td>
                    <td className="py-1.5 pr-3">
                      <a className="text-slate-900 underline" href={`/medicamento/${troca.medicamentoId}`}>
                        {troca.medicamentoNome}
                      </a>
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      <span className={temaDa(troca.farmaciaAnteriorId).texto}>{troca.farmaciaAnteriorNome}</span>{" "}
                      <span className="text-slate-600 tabular-nums">{formatarPreco(troca.precoAnteriorCentavos)}</span>
                    </td>
                    <td className="py-1.5 whitespace-nowrap">
                      <span className={temaDa(troca.farmaciaAtualId).texto}>{troca.farmaciaAtualNome}</span>{" "}
                      <span className="font-medium text-slate-900 tabular-nums">{formatarPreco(troca.precoAtualCentavos)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      <Cartao>
        <TituloDeSecao
          titulo="Últimas propagações"
          subtitulo="Cada linha é uma alteração de preço acompanhada da farmácia até o catálogo."
        />
        {dados && dados.ultimasPropagacoes.length === 0 && <p className="text-sm text-slate-600">Nenhuma ainda.</p>}
        {dados && dados.ultimasPropagacoes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs text-slate-600">
                <tr>
                  <th className="py-2 pr-2 font-medium">Quando</th>
                  <th className="py-2 pr-2 font-medium">Farmácia</th>
                  <th className="py-2 pr-2 font-medium">Coleta</th>
                  <th className="py-2 pr-2 text-right font-medium">Preços</th>
                  <th className="py-2 pr-2 text-right font-medium">Aceite</th>
                  <th className="py-2 text-right font-medium">Convergência</th>
                </tr>
              </thead>
              <tbody>
                {dados.ultimasPropagacoes.map((amostra) => (
                  <tr key={amostra.correlationId} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2 text-xs tabular-nums">
                      <a className="underline" href={`/monitor/eventos?correlationId=${encodeURIComponent(amostra.correlationId)}`}>
                        {formatarHora(amostra.ocorridoEm)}
                      </a>
                    </td>
                    <td className={`py-1.5 pr-2 text-xs ${temaDa(amostra.farmaciaId).texto}`}>{amostra.farmaciaId}</td>
                    <td className="py-1.5 pr-2 text-xs">{amostra.origem}</td>
                    <td className="py-1.5 pr-2 text-right text-xs tabular-nums">{amostra.ofertasAtualizadas}</td>
                    <td className="py-1.5 pr-2 text-right text-xs tabular-nums">{formatarMs(amostra.aceiteMs)}</td>
                    <td className="py-1.5 text-right text-xs tabular-nums">{formatarMs(amostra.convergenciaMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {dados && (
          <p className="mt-4 text-xs text-slate-600 tabular-nums">
            Eventos registrados: {dados.totalDeEventos} · por serviço:{" "}
            {Object.entries(dados.porServico)
              .map(([servico, total]) => `${servico} ${total}`)
              .join(" · ")}
          </p>
        )}
      </Cartao>
    </div>
  );
}
