export type Medicamento = {
  id: string
  nome: string
  principioAtivo: string
  concentracao: string
  dosagem: string | null
  apresentacao: string
  slug: string | null
  categoria: string | null
  laboratorio: string | null
  registroMS: string | null
  tarja: string | null
  tarjaTipo: string | null
  imagem: string | null
  descricao: string | null
  indicacao: string | null
  modoDeUso: string | null
  contraindicacao: string | null
  avaliacao: number | null
  avaliacoesTotal: number | null
  farmaciaMaisBarata: string | null
  menorPrecoCentavos: number | null
  maiorPrecoCentavos: number | null
  qtdFarmacias: number
  economiaMaximaCentavos: number | null
  atualizadoEm: string
}

export type Oferta = {
  farmaciaId: string
  farmacia: string
  precoCentavos: number
  atualizadoEm: string
  ehMenorPreco: boolean
  diferencaParaMenorCentavos: number
}

export type Comparacao = { medicamento: Medicamento; ofertas: Oferta[] }

export type Pagina = {
  itens: Medicamento[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type AtualizacaoOferta = {
  medicamentoId: string
  nome: string
  farmaciaId: string
  farmaciaNome: string
  precoAnteriorCentavos: number | null
  precoAtualCentavos: number
  menorPrecoCentavos: number | null
  maiorPrecoCentavos: number | null
  qtdFarmacias: number
  farmaciaMaisBarata: string | null
  ofertas: Oferta[]
  atualizadoEm: string
  correlationId: string
  eventId: string
}
