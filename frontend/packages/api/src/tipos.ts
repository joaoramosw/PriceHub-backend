/** Contratos das APIs (espelham os modelos Pydantic dos microsserviços, em camelCase). */
import type { IdDaFarmacia } from "./config";

// ----- ms-catalogo -------------------------------------------------------------
export interface ResumoDoMedicamento {
  id: string;
  nome: string;
  principioAtivo: string;
  apresentacao: string;
  categoria: string | null;
  fabricante: string | null;
  totalDeOfertas: number;
  menorPrecoCentavos: number | null;
  maiorPrecoCentavos: number | null;
  farmaciaMaisBarata: string | null;
  farmaciaMaisBarataId: IdDaFarmacia | null;
  economiaMaximaCentavos: number | null;
  atualizadoEm: string;
  /** Uma oferta por farmácia, da mais barata para a mais cara (indisponíveis no fim). */
  ofertas: OfertaComparada[];
}

export interface OfertaComparada {
  ofertaId: string;
  farmaciaId: IdDaFarmacia;
  farmaciaNome: string;
  codigoExterno: string;
  nomeNaFarmacia: string;
  precoCentavos: number;
  disponivel: boolean;
  posicao: number | null;
  diferencaParaOMenorCentavos: number | null;
  urlDoProduto: string | null;
  atualizadoNaOrigemEm: string | null;
  atualizadoEm: string;
}

export interface DetalheDoMedicamento extends ResumoDoMedicamento {
  registroMs: string | null;
  chaveCanonica: string | null;
}

export interface PontoDoHistorico {
  farmaciaId: IdDaFarmacia;
  farmaciaNome: string;
  precoCentavos: number;
  registradoEm: string;
  correlationId: string;
  /** Como o preço mudou na farmácia; null quando a farmácia não informou. */
  origem: OrigemDaAlteracao | null;
}

export type OrigemDaAlteracao = "carga-inicial" | "manual" | "programada";

export interface EstatisticasDoCatalogo {
  medicamentos: number;
  farmacias: number;
  ofertas: number;
  ofertasDisponiveis: number;
  registrosDeHistorico: number;
  eventosProcessados: number;
  eventosNaOutboxPendentes: number;
}

export interface SituacaoDoConsumo {
  fila: string;
  pausado: boolean;
  explicacao: string;
}

// ----- ms-ingestao -------------------------------------------------------------
export interface EstadoDaIntegracao {
  farmaciaId: IdDaFarmacia;
  farmaciaNome: string;
  modo: "webhook" | "polling";
  urlBase: string;
  situacao: "desconhecida" | "disponivel" | "indisponivel";
  ultimaColetaEm: string | null;
  ultimaVerificacaoEm: string | null;
  ultimoErro: string | null;
  coletasRealizadas: number;
  falhasConsecutivas: number;
}

export interface ResumoDaColeta {
  coletaId: string | null;
  farmaciaId: string;
  origem: string;
  ofertasPublicadas: number;
  ofertasSemAlteracao: number;
  removidas: number;
  duracaoMs: number;
  naoModificado: boolean;
  correlationId: string;
}

// ----- ms-log --------------------------------------------------------------------
export interface RegistroDeEvento {
  id: number;
  idDoEvento: string;
  tipo: string;
  servicoDeOrigem: string;
  correlationId: string;
  farmaciaId: string | null;
  ocorridoEm: string;
  recebidoEm: string | null;
  dados: Record<string, unknown>;
}

export interface EventoNaLinhaDoTempo {
  tipo: string;
  servicoDeOrigem: string;
  farmaciaId: string | null;
  ocorridoEm: string;
  desdeOInicioMs: number;
  desdeOAnteriorMs: number;
  dados: Record<string, unknown>;
}

export interface Rastreamento {
  correlationId: string;
  totalDeEventos: number;
  duracaoTotalMs: number;
  servicosEnvolvidos: string[];
  eventos: EventoNaLinhaDoTempo[];
}

export interface Distribuicao {
  amostras: number;
  mediaMs: number | null;
  medianaMs: number | null;
  p95Ms: number | null;
  maximoMs: number | null;
}

export interface AmostraDePropagacao {
  correlationId: string;
  tipo: "preco";
  farmaciaId: string | null;
  origem: string | null;
  aceiteMs: number | null;
  convergenciaMs: number;
  ofertasAtualizadas: number;
  ocorridoEm: string;
}

export interface Metricas {
  totalDeEventos: number;
  porTipo: Record<string, number>;
  porServico: Record<string, number>;
  aceite: Distribuicao;
  convergencia: Distribuicao;
  equivalenteSincrono: Distribuicao;
  /** Convergência separada por origem da coleta (webhook x polling). */
  convergenciaPorOrigem: Record<string, Distribuicao>;
  ultimasPropagacoes: AmostraDePropagacao[];
  alteracoesPorFarmacia: Record<string, number>;
  alteracoesPorOrigem: Record<string, number>;
  trocasDaMaisBarata: number;
  ultimasTrocasDaMaisBarata: TrocaDaMaisBarata[];
}

/** Dados do evento catalogo.menor-preco.alterado. */
export interface TrocaDaMaisBarata {
  medicamentoId: string;
  medicamentoNome: string;
  farmaciaAnteriorId: string;
  farmaciaAnteriorNome: string;
  precoAnteriorCentavos: number;
  farmaciaAtualId: string;
  farmaciaAtualNome: string;
  precoAtualCentavos: number;
  ocorridoEm: string;
}

export interface SituacaoDaFila {
  nome: string;
  mensagensProntas: number;
  mensagensSemAck: number;
  consumidores: number;
  taxaDePublicacao: number;
  taxaDeEntrega: number;
  temporaria: boolean;
}

export interface SituacaoDoServico {
  nome: string;
  url: string;
  documentacao: string;
  status: "ok" | "degradado" | "fora-do-ar" | "erro" | string;
  latenciaMs: number | null;
  detalhes: Record<string, boolean> | null;
}
