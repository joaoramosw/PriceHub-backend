import type { Concentracao, FormaFarmaceutica, Quantidade } from '@pricehub/contracts'

const formasNoPlural: Record<FormaFarmaceutica, string> = {
  comprimido: 'comprimidos',
  'comprimido revestido': 'comprimidos revestidos',
  'comprimido liberacao prolongada': 'comprimidos de liberação prolongada',
  capsula: 'cápsulas',
  gotas: 'gotas',
  suspensao: 'suspensão',
  outro: 'unidades',
}

function numero(valor: number): string {
  return Number.isInteger(valor) ? String(valor) : String(valor).replace('.', ',')
}

export function descreverConcentracao(concentracao: Concentracao): string {
  return `${numero(concentracao.valor)}${concentracao.unidade}`
}

export function descreverQuantidade(quantidade: Quantidade): string {
  return quantidade.unidade === 'ml' ? `${numero(quantidade.valor)}ml` : `${numero(quantidade.valor)} un`
}

export function descreverApresentacao(forma: FormaFarmaceutica, quantidade: Quantidade): string {
  if (quantidade.unidade === 'ml') return `Frasco ${numero(quantidade.valor)}ml (${formasNoPlural[forma]})`
  return `${numero(quantidade.valor)} ${formasNoPlural[forma]}`
}

export function termosDeBusca(...partes: (string | null | undefined)[]): string {
  return normalizarBusca(partes.filter(Boolean).join(' '))
}

export function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}
