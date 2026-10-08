import type { Concentracao, OfertaColetada, Quantidade } from '@pricehub/contracts'
import { sinonimos, termosIgnorados } from './sinonimos.js'

export type OfertaNormalizada = OfertaColetada & {
  principioNormalizado: string
  chaveCanonica: string | null
}

function semAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const padroesIgnorados = [...termosIgnorados]
  .sort((a, b) => b.length - a.length)
  .map((termo) => new RegExp(`(^|\\s)${escaparRegex(termo)}(?=\\s|$)`, 'g'))

const padraoDeDose = /\d+(?:[.,]\d+)?\s*(?:mg\/ml|mcg|mg|g|ml)(?![a-z])/g

export function normalizarPrincipioAtivo(texto: string): string {
  let normalizado = semAcentos(texto)
    .toLowerCase()
    .split('/')[0]!
    .replace(padraoDeDose, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  for (const padrao of padroesIgnorados) normalizado = normalizado.replace(padrao, ' ')
  normalizado = normalizado.replace(/\s+/g, ' ').trim()
  normalizado = sinonimos[normalizado] ?? normalizado
  return normalizado
    .split(' ')
    .map((palavra) => sinonimos[palavra] ?? palavra)
    .join(' ')
    .trim()
}

export function slug(texto: string): string {
  return semAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function numero(valor: number): string {
  return Number.isInteger(valor) ? String(valor) : String(Number(valor.toFixed(4)))
}

export function descreverConcentracao(concentracao: Concentracao): string {
  return `${numero(concentracao.valor)}${concentracao.unidade}`
}

export function descreverQuantidade(quantidade: Quantidade): string {
  return quantidade.unidade === 'ml' ? `${numero(quantidade.valor)}ml` : `${numero(quantidade.valor)}un`
}

export function gerarChaveCanonica(
  principioNormalizado: string,
  concentracao: Concentracao,
  forma: OfertaColetada['forma'],
  quantidade: Quantidade,
): string | null {
  if (!principioNormalizado || forma === 'outro') return null
  return [
    slug(principioNormalizado),
    descreverConcentracao(concentracao),
    slug(forma),
    descreverQuantidade(quantidade),
  ].join('|')
}

export function normalizarOferta(oferta: OfertaColetada): OfertaNormalizada {
  const principioNormalizado = normalizarPrincipioAtivo(oferta.principioAtivo)
  return {
    ...oferta,
    principioNormalizado,
    chaveCanonica: gerarChaveCanonica(
      principioNormalizado,
      oferta.concentracao,
      oferta.forma,
      oferta.quantidade,
    ),
  }
}

function emTituloSeTodoMaiusculo(texto: string): string {
  if (texto !== texto.toUpperCase()) return texto
  return texto
    .toLowerCase()
    .split(' ')
    .map((palavra) =>
      ['de', 'da', 'do', 'e'].includes(palavra)
        ? palavra
        : palavra.charAt(0).toUpperCase() + palavra.slice(1),
    )
    .join(' ')
}

export function nomeDeExibicao(oferta: OfertaColetada): { nome: string; principioAtivo: string } {
  const principioAtivo = emTituloSeTodoMaiusculo(oferta.principioAtivo.trim())
  return { principioAtivo, nome: `${principioAtivo} ${descreverConcentracao(oferta.concentracao)}` }
}
