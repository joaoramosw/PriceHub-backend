import type { AtualizacaoOferta, Medicamento } from '../types'
import { formatarBRL } from './formatacao'

export type Estado = {
  itens: Medicamento[]
  alterado: string | null
  anuncio: string
}

export type Acao =
  | { type: 'substituir'; itens: Medicamento[] }
  | { type: 'oferta'; dados: AtualizacaoOferta }
  | { type: 'limpar-alteracao' }

export const estadoInicial: Estado = { itens: [], alterado: null, anuncio: '' }

export function reduzirEstado(estado: Estado, acao: Acao): Estado {
  if (acao.type === 'limpar-alteracao') return { ...estado, alterado: null }
  if (acao.type === 'substituir') return { ...estado, itens: acao.itens }
  const { dados } = acao
  return {
    ...estado,
    alterado: dados.medicamentoId,
    anuncio: `${dados.nome}: ${dados.farmaciaMaisBarata ?? 'menor preço atualizado'} por ${formatarBRL(dados.menorPrecoCentavos)}.`,
    itens: estado.itens.map((item) =>
      item.id === dados.medicamentoId
        ? {
            ...item,
            menorPrecoCentavos: dados.menorPrecoCentavos,
            maiorPrecoCentavos: dados.maiorPrecoCentavos,
            qtdFarmacias: dados.qtdFarmacias,
            farmaciaMaisBarata: dados.farmaciaMaisBarata,
            atualizadoEm: dados.atualizadoEm,
          }
        : item,
    ),
  }
}
