import { apiDoCatalogo, FARMACIAS, useConsulta, type OfertaComparada, type OrigemDaAlteracao, type PontoDoHistorico } from "@pricehub/api";
import { Cartao, Carregando, MensagemDeErro, Vazio, formatarDataHora, formatarPreco, tempoRelativo, temaDa } from "@pricehub/ui";

import { PrecosDasFarmacias } from "./PrecosDasFarmacias";
import { aoClicarNoLink } from "./rotas";

const LARGURA = 720;
const ALTURA = 220;
const MARGEM_X = 56;
const MARGEM_Y = 20;
const CORES_DAS_LINHAS: Record<string, string> = {
  biofarma: "#059669",
  farmaazul: "#2563eb",
  drogapopular: "#dc2626",
};
const LIMITE_DA_TABELA = 60;

/** Gráfico em degraus: cada farmácia é uma linha; o preço vale até a próxima alteração. */
function GraficoDoHistorico({ pontos }: { pontos: PontoDoHistorico[] }) {
  const instantes = pontos.map((ponto) => new Date(ponto.registradoEm).getTime());
  const precos = pontos.map((ponto) => ponto.precoCentavos);
  const inicio = Math.min(...instantes);
  const fim = Math.max(Date.now(), ...instantes);
  const minimo = Math.min(...precos);
  const maximo = Math.max(...precos);
  const folga = Math.max(50, (maximo - minimo) * 0.1);
  const piso = minimo - folga;
  const teto = maximo + folga;
  const x = (instante: number) => MARGEM_X + ((instante - inicio) / Math.max(1, fim - inicio)) * (LARGURA - MARGEM_X - 16);
  const y = (preco: number) => ALTURA - MARGEM_Y - ((preco - piso) / Math.max(1, teto - piso)) * (ALTURA - 2 * MARGEM_Y);
  const marcas = [piso + folga, (minimo + maximo) / 2, teto - folga];

  return (
    <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} className="w-full" role="img" aria-label="Histórico de preços por farmácia">
      {marcas.map((preco) => (
        <g key={preco}>
          <line x1={MARGEM_X} x2={LARGURA - 16} y1={y(preco)} y2={y(preco)} stroke="#e2e8f0" />
          <text x={MARGEM_X - 6} y={y(preco) + 4} fontSize="11" textAnchor="end" fill="#475569">
            {formatarPreco(Math.round(preco))}
          </text>
        </g>
      ))}
      {FARMACIAS.map((farmacia) => {
        const serie = pontos.filter((ponto) => ponto.farmaciaId === farmacia.id);
        if (!serie.length) return null;
        let caminho = "";
        serie.forEach((ponto, indice) => {
          const px = x(new Date(ponto.registradoEm).getTime());
          const py = y(ponto.precoCentavos);
          caminho += indice === 0 ? `M ${px} ${py}` : ` H ${px} V ${py}`;
        });
        caminho += ` H ${x(fim)}`;
        return <path key={farmacia.id} d={caminho} fill="none" stroke={CORES_DAS_LINHAS[farmacia.id]} strokeWidth={2} />;
      })}
    </svg>
  );
}

const ROTULOS_DA_ORIGEM: Record<OrigemDaAlteracao, string> = {
  "carga-inicial": "Carga inicial",
  manual: "Manual",
  programada: "Programada",
};

interface ResumoDaFarmacia {
  farmaciaId: string;
  farmaciaNome: string;
  atualCentavos: number | null;
  menorCentavos: number;
  maiorCentavos: number;
  alteracoes: number;
}

/** Métricas calculadas a partir do histórico já carregado (nada de consulta extra ao ms-catalogo). */
function resumirHistorico(pontos: PontoDoHistorico[], ofertas: OfertaComparada[]) {
  const porFarmacia: ResumoDaFarmacia[] = FARMACIAS.flatMap((farmacia) => {
    const serie = pontos.filter((ponto) => ponto.farmaciaId === farmacia.id);
    if (!serie.length) return [];
    const precos = serie.map((ponto) => ponto.precoCentavos);
    const oferta = ofertas.find((item) => item.farmaciaId === farmacia.id && item.disponivel);
    return [
      {
        farmaciaId: farmacia.id,
        farmaciaNome: serie[0].farmaciaNome,
        atualCentavos: oferta?.precoCentavos ?? null,
        menorCentavos: Math.min(...precos),
        maiorCentavos: Math.max(...precos),
        alteracoes: serie.length - 1,
      },
    ];
  });
  const atuais = ofertas.filter((oferta) => oferta.disponivel).map((oferta) => oferta.precoCentavos);
  const menor = porFarmacia.reduce<ResumoDaFarmacia | null>(
    (melhor, item) => (!melhor || item.menorCentavos < melhor.menorCentavos ? item : melhor),
    null,
  );
  const maior = porFarmacia.reduce<ResumoDaFarmacia | null>(
    (pior, item) => (!pior || item.maiorCentavos > pior.maiorCentavos ? item : pior),
    null,
  );
  return {
    porFarmacia,
    menor,
    maior,
    alteracoes: porFarmacia.reduce((total, item) => total + item.alteracoes, 0),
    mediaAtualCentavos: atuais.length ? Math.round(atuais.reduce((soma, preco) => soma + preco, 0) / atuais.length) : null,
  };
}

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-600">{rotulo}</dt>
      <dd className="text-lg font-semibold text-slate-900 tabular-nums">{valor}</dd>
      {detalhe && <dd className="text-xs text-slate-600">{detalhe}</dd>}
    </div>
  );
}

function ResumoDoHistorico({
  pontos,
  ofertas,
  economiaCentavos,
}: {
  pontos: PontoDoHistorico[];
  ofertas: OfertaComparada[];
  economiaCentavos: number | null;
}) {
  const resumo = resumirHistorico(pontos, ofertas);
  return (
    <Cartao>
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Resumo dos preços</h2>
      <dl className="grid grid-cols-2 gap-4 border-b border-slate-200 pb-4 sm:grid-cols-5">
        <Indicador
          rotulo="Menor preço já cobrado"
          valor={formatarPreco(resumo.menor?.menorCentavos)}
          detalhe={resumo.menor?.farmaciaNome}
        />
        <Indicador
          rotulo="Maior preço já cobrado"
          valor={formatarPreco(resumo.maior?.maiorCentavos)}
          detalhe={resumo.maior?.farmaciaNome}
        />
        <Indicador rotulo="Preço médio atual" valor={formatarPreco(resumo.mediaAtualCentavos)} detalhe="entre as farmácias com estoque" />
        <Indicador rotulo="Economia hoje" valor={formatarPreco(economiaCentavos)} detalhe="mais cara menos a mais barata" />
        <Indicador rotulo="Alterações de preço" valor={resumo.alteracoes.toLocaleString("pt-BR")} detalhe="desde a carga inicial" />
      </dl>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-600">
            <tr>
              <th className="py-2 pr-3 font-medium">Farmácia</th>
              <th className="py-2 pr-3 text-right font-medium">Atual</th>
              <th className="py-2 pr-3 text-right font-medium">Menor</th>
              <th className="py-2 pr-3 text-right font-medium">Maior</th>
              <th className="py-2 text-right font-medium">Alterações</th>
            </tr>
          </thead>
          <tbody>
            {resumo.porFarmacia.map((item) => (
              <tr key={item.farmaciaId} className="border-t border-slate-100">
                <td className={`py-1.5 pr-3 whitespace-nowrap ${temaDa(item.farmaciaId).texto}`}>{item.farmaciaNome}</td>
                <td className="py-1.5 pr-3 text-right font-medium text-slate-900 tabular-nums">
                  {item.atualCentavos === null ? "sem estoque" : formatarPreco(item.atualCentavos)}
                </td>
                <td className="py-1.5 pr-3 text-right text-slate-700 tabular-nums">{formatarPreco(item.menorCentavos)}</td>
                <td className="py-1.5 pr-3 text-right text-slate-700 tabular-nums">{formatarPreco(item.maiorCentavos)}</td>
                <td className="py-1.5 text-right text-slate-700 tabular-nums">{item.alteracoes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Cartao>
  );
}

interface Alteracao extends PontoDoHistorico {
  anteriorCentavos: number | null;
}

function comVariacao(pontos: PontoDoHistorico[]): Alteracao[] {
  const ultimoPorFarmacia = new Map<string, number>();
  return pontos.map((ponto) => {
    const anteriorCentavos = ultimoPorFarmacia.get(ponto.farmaciaId) ?? null;
    ultimoPorFarmacia.set(ponto.farmaciaId, ponto.precoCentavos);
    return { ...ponto, anteriorCentavos };
  });
}

function Variacao({ de, para }: { de: number | null; para: number }) {
  if (de === null) return <span className="text-slate-500">preço inicial</span>;
  const percentual = ((para - de) / de) * 100;
  const subiu = para > de;
  return (
    <span className={subiu ? "text-red-700" : "text-emerald-700"}>
      {subiu ? "+" : "−"}
      {Math.abs(percentual).toLocaleString("pt-BR", {
        maximumFractionDigits: 1,
      })}
      %
    </span>
  );
}

export function PaginaDoMedicamento({ id, versao }: { id: string; versao: number }) {
  const detalhe = useConsulta(() => apiDoCatalogo.detalharMedicamento(id), [id, versao]);
  const historico = useConsulta(() => apiDoCatalogo.historico(id), [id, versao]);
  const medicamento = detalhe.dados;
  const pontos = historico.dados ?? [];
  const alteracoes = comVariacao(pontos).reverse();

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <a
        href="/"
        onClick={aoClicarNoLink("/")}
        className="inline-flex min-h-10 items-center text-sm text-slate-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        Voltar para todos os medicamentos
      </a>
      <MensagemDeErro erro={detalhe.erro} />
      {!medicamento && !detalhe.erro && <Carregando />}

      {medicamento && (
        <>
          <header>
            <p className="text-sm text-slate-600">{medicamento.categoria ?? "Medicamento"}</p>
            <h1 className="text-2xl font-semibold text-slate-900">{medicamento.nome}</h1>
            <p className="text-sm text-slate-600">
              {medicamento.principioAtivo} · {medicamento.apresentacao}
              {medicamento.fabricante && ` · ${medicamento.fabricante}`} · registro MS {medicamento.registroMs ?? "não informado"}
            </p>
          </header>

          <section aria-label="Preço em cada farmácia">
            <PrecosDasFarmacias ofertas={medicamento.ofertas} tamanho="grande" />
            <p className="mt-2 text-xs text-slate-600">
              Atualizado {tempoRelativo(medicamento.atualizadoEm)}. O link abre a página do produto no site da farmácia.
            </p>
          </section>

          {pontos.length > 0 && (
            <ResumoDoHistorico pontos={pontos} ofertas={medicamento.ofertas} economiaCentavos={medicamento.economiaMaximaCentavos} />
          )}

          <Cartao>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Histórico de preços</h2>
              <ul className="flex flex-wrap gap-4 text-sm">
                {FARMACIAS.map((farmacia) => (
                  <li key={farmacia.id} className="flex items-center gap-1.5 text-slate-700">
                    <span aria-hidden className="h-0.5 w-4" style={{ background: CORES_DAS_LINHAS[farmacia.id] }} />
                    {farmacia.nome}
                  </li>
                ))}
              </ul>
            </div>
            <MensagemDeErro erro={historico.erro} />
            {pontos.length === 0 ? (
              <Vazio titulo="Sem histórico ainda">Cada alteração de preço recebida de uma farmácia vira um ponto aqui.</Vazio>
            ) : (
              <GraficoDoHistorico pontos={pontos} />
            )}
          </Cartao>

          {alteracoes.length > 0 && (
            <Cartao>
              <h2 className="mb-1 text-lg font-semibold text-slate-900">Alterações registradas</h2>
              <p className="mb-3 text-sm text-slate-600">
                {pontos.length} registros, do mais recente para o mais antigo. Origem: carga inicial da loja, edição manual na tela de
                gestão da farmácia ou reajuste programado. O código de rastreio abre a alteração no monitor de eventos.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-xs text-slate-600">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Quando</th>
                      <th className="py-2 pr-3 font-medium">Farmácia</th>
                      <th className="py-2 pr-3 text-right font-medium">Preço</th>
                      <th className="py-2 pr-3 text-right font-medium">Variação</th>
                      <th className="py-2 pr-3 font-medium">Origem</th>
                      <th className="py-2 font-medium">Rastreio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alteracoes.slice(0, LIMITE_DA_TABELA).map((alteracao, indice) => (
                      <tr key={`${alteracao.registradoEm}-${indice}`} className="border-b border-slate-100">
                        <td className="py-1.5 pr-3 whitespace-nowrap text-slate-700 tabular-nums">
                          {formatarDataHora(alteracao.registradoEm)}
                        </td>
                        <td className={`py-1.5 pr-3 whitespace-nowrap ${temaDa(alteracao.farmaciaId).texto}`}>{alteracao.farmaciaNome}</td>
                        <td className="py-1.5 pr-3 text-right font-medium text-slate-900 tabular-nums">
                          {formatarPreco(alteracao.precoCentavos)}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          <Variacao de={alteracao.anteriorCentavos} para={alteracao.precoCentavos} />
                        </td>
                        <td className="py-1.5 pr-3 whitespace-nowrap text-slate-700">
                          {alteracao.origem ? ROTULOS_DA_ORIGEM[alteracao.origem] : <span className="text-slate-500">não informada</span>}
                        </td>
                        <td className="py-1.5">
                          <a
                            className="font-mono text-xs text-slate-700 underline"
                            href={`/monitor/eventos?correlationId=${encodeURIComponent(alteracao.correlationId)}`}
                          >
                            {alteracao.correlationId.slice(0, 8)}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Cartao>
          )}
        </>
      )}
    </main>
  );
}
