/**
 * Um cliente por microsserviço. Cada micro-frontend usa só os clientes de que precisa,
 * e nenhum deles fala com banco de dados: tudo passa pelas APIs.
 */
import { URLS_DAS_FARMACIAS, URLS_DOS_SERVICOS, type IdDaFarmacia } from "./config";
import { buscar, enviar } from "./http";
import type {
  DetalheDoMedicamento,
  EstadoDaIntegracao,
  EstatisticasDoCatalogo,
  InformacoesDaLoja,
  Metricas,
  PontoDoHistorico,
  ProdutoDaLoja,
  ProdutoEntrada,
  Rastreamento,
  RegistroDeEvento,
  ResultadoDaOperacao,
  ResumoDaColeta,
  ResumoDoMedicamento,
  SituacaoDaFila,
  SituacaoDoConsumo,
  SituacaoDoServico,
} from "./tipos";

const catalogoUrl = URLS_DOS_SERVICOS.catalogo;
const ingestaoUrl = URLS_DOS_SERVICOS.ingestao;
const logUrl = URLS_DOS_SERVICOS.log;

function parametros(valores: Record<string, string | number | undefined | null>): string {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(valores)) {
    if (valor !== undefined && valor !== null && valor !== "") busca.set(chave, String(valor));
  }
  const texto = busca.toString();
  return texto ? `?${texto}` : "";
}

export const apiDoCatalogo = {
  listarMedicamentos: (busca?: string, categoria?: string) =>
    buscar<ResumoDoMedicamento[]>(`${catalogoUrl}/medicamentos${parametros({ busca: busca && busca.length >= 2 ? busca : undefined, categoria })}`),
  detalharMedicamento: (id: string) => buscar<DetalheDoMedicamento>(`${catalogoUrl}/medicamentos/${id}`),
  historico: (id: string) => buscar<PontoDoHistorico[]>(`${catalogoUrl}/medicamentos/${id}/historico`),
  categorias: () => buscar<string[]>(`${catalogoUrl}/categorias`),
  estatisticas: () => buscar<EstatisticasDoCatalogo>(`${catalogoUrl}/estatisticas`),
  situacaoDoConsumo: () => buscar<SituacaoDoConsumo>(`${catalogoUrl}/admin/consumo`),
  pausarConsumo: () => enviar<SituacaoDoConsumo>(`${catalogoUrl}/admin/consumo/pausar`, "POST"),
  retomarConsumo: () => enviar<SituacaoDoConsumo>(`${catalogoUrl}/admin/consumo/retomar`, "POST"),
  urlDoTempoReal: `${catalogoUrl}/tempo-real`,
};

export function apiDaFarmacia(farmaciaId: IdDaFarmacia) {
  const base = `${URLS_DAS_FARMACIAS[farmaciaId]}/admin`;
  return {
    informacoes: () => buscar<InformacoesDaLoja>(`${base}/loja`),
    listarProdutos: () => buscar<ProdutoDaLoja[]>(`${base}/produtos`),
    cadastrar: (produto: ProdutoEntrada) => enviar<ResultadoDaOperacao>(`${base}/produtos`, "POST", produto),
    atualizar: (id: number, produto: ProdutoEntrada) => enviar<ResultadoDaOperacao>(`${base}/produtos/${id}`, "PUT", produto),
    alterarPreco: (id: number, precoCentavos: number) =>
      enviar<ResultadoDaOperacao>(`${base}/produtos/${id}/preco`, "PATCH", { precoCentavos }),
    remover: (id: number) => enviar<ResultadoDaOperacao>(`${base}/produtos/${id}`, "DELETE"),
    restaurar: () => enviar<{ produtos: number; correlationId: string }>(`${base}/restaurar`, "POST"),
  };
}

export const apiDaIngestao = {
  farmacias: () => buscar<EstadoDaIntegracao[]>(`${ingestaoUrl}/farmacias`),
  sincronizar: (farmaciaId: IdDaFarmacia, forcar = false) =>
    enviar<ResumoDaColeta>(`${ingestaoUrl}/sincronizacoes/${farmaciaId}${parametros({ forcar: forcar ? "true" : undefined })}`, "POST"),
};

export const apiDoLog = {
  registros: (filtros: { tipo?: string; correlationId?: string; farmaciaId?: string; limite?: number } = {}) =>
    buscar<RegistroDeEvento[]>(`${logUrl}/registros${parametros(filtros)}`),
  rastrear: (correlationId: string) => buscar<Rastreamento>(`${logUrl}/registros/rastreamento/${correlationId}`),
  metricas: () => buscar<Metricas>(`${logUrl}/metricas`),
  filas: () => buscar<SituacaoDaFila[]>(`${logUrl}/filas`),
  servicos: () => buscar<SituacaoDoServico[]>(`${logUrl}/servicos`),
  limpar: () => enviar<{ removidos: number }>(`${logUrl}/registros`, "DELETE"),
  urlDoTempoReal: `${logUrl}/registros/tempo-real`,
};
