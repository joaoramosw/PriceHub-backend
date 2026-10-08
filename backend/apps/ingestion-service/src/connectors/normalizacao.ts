import type { Concentracao, FormaFarmaceutica, Quantidade } from '@pricehub/contracts'

export function semAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function normalizarEspacos(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim()
}

function numeroBrasileiro(texto: string): number {
  return Number(texto.replace(',', '.'))
}

const padraoDeConcentracao = /(\d+(?:[.,]\d+)?)\s*(mg\/ml|mcg|mg|g|ml)(?![a-z])/i

export function interpretarConcentracao(texto: string): Concentracao | null {
  const encontrado = semAcentos(texto).match(padraoDeConcentracao)
  if (!encontrado) return null
  const valor = numeroBrasileiro(encontrado[1]!)
  if (!(valor > 0)) return null
  return { valor, unidade: encontrado[2]!.toLowerCase() as Concentracao['unidade'] }
}

const regrasDeForma: [RegExp, FormaFarmaceutica][] = [
  [/lib(eracao)?\.?\s*prol(ongada)?/, 'comprimido liberacao prolongada'],
  [/comp(rimidos?)?\.?\s*rev(estidos?)?/, 'comprimido revestido'],
  [/\bcaps(ulas?)?\b/, 'capsula'],
  [/\b(gts|gotas|conta-gotas)\b/, 'gotas'],
  [/\bsusp(ensao)?\b/, 'suspensao'],
  [/\bcomp(rimidos?)?\b/, 'comprimido'],
]

export function interpretarForma(texto: string): FormaFarmaceutica {
  const normalizado = semAcentos(texto).toLowerCase()
  return regrasDeForma.find(([padrao]) => padrao.test(normalizado))?.[1] ?? 'outro'
}

export function unidadeDeQuantidadePara(forma: FormaFarmaceutica): Quantidade['unidade'] {
  return forma === 'gotas' || forma === 'suspensao' ? 'ml' : 'unidade'
}

export function interpretarApresentacao(texto: string): {
  forma: FormaFarmaceutica
  quantidade: Quantidade | null
} {
  const normalizado = semAcentos(texto).toLowerCase()
  const forma = interpretarForma(normalizado)
  const unidade = unidadeDeQuantidadePara(forma)
  const valor =
    unidade === 'ml'
      ? Number(normalizado.match(/(\d+(?:[.,]\d+)?)\s*ml\b/)?.[1]?.replace(',', '.'))
      : Number(normalizado.match(/^(\d+)\s/)?.[1] ?? normalizado.match(/c\/\s*(\d+)/)?.[1])
  return { forma, quantidade: valor > 0 ? { valor, unidade } : null }
}

export function normalizarRegistroMs(texto: string | null | undefined): string | null {
  const digitos = (texto ?? '').replace(/\D/g, '')
  return digitos.length >= 9 && digitos.length <= 13 ? digitos : null
}

export function principioSemDose(texto: string): string {
  return normalizarEspacos(texto.replace(padraoDeConcentracao, ''))
}

export function reaisParaCentavos(valor: number): number {
  return Math.round(valor * 100)
}

export function textoDeReaisParaCentavos(texto: string): number {
  const limpo = texto
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const valor = Number(limpo)
  if (!Number.isFinite(valor) || limpo === '') throw new Error(`preço inválido: ${texto}`)
  return Math.round(valor * 100)
}

export function dataBrasileiraParaIso(texto: string): string | null {
  const partes = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/)
  if (!partes) return null
  const [, dia, mes, ano, hora, minuto] = partes
  return new Date(`${ano}-${mes}-${dia}T${hora}:${minuto}:00-03:00`).toISOString()
}

export function dataIsoOuNula(texto: string | null | undefined): string | null {
  if (!texto) return null
  const data = new Date(texto)
  return Number.isNaN(data.getTime()) ? null : data.toISOString()
}
