import type { Concentracao, FormaFarmaceutica, Quantidade } from '@pricehub/contracts'
import { interpretarApresentacao, interpretarConcentracao, normalizarEspacos } from '../normalizacao.js'

export type DescricaoInterpretada = {
  principioAtivo: string
  concentracao: Concentracao
  forma: FormaFarmaceutica
  quantidade: Quantidade
}

const padraoDaDescricao =
  /^(?<nome>.+?)\s+(?<dose>\d+(?:[.,]\d+)?\s*(?:MG\/ML|MCG|MG|G|ML))(?![A-Z])\s*(?<resto>.*)$/i

export class DescricaoNaoInterpretadaError extends Error {
  constructor(descricao: string, motivo: string) {
    super(`descrição "${descricao}" não interpretada: ${motivo}`)
    this.name = 'DescricaoNaoInterpretadaError'
  }
}

export function interpretarDescricaoDrogaPopular(descricao: string): DescricaoInterpretada {
  const texto = normalizarEspacos(descricao)
  const partes = texto.match(padraoDaDescricao)?.groups
  if (!partes) throw new DescricaoNaoInterpretadaError(descricao, 'concentração ausente')
  const concentracao = interpretarConcentracao(partes.dose!)
  if (!concentracao) throw new DescricaoNaoInterpretadaError(descricao, 'concentração inválida')
  const { forma, quantidade } = interpretarApresentacao(partes.resto ?? '')
  if (!quantidade) throw new DescricaoNaoInterpretadaError(descricao, 'quantidade ausente')
  return { principioAtivo: partes.nome!, concentracao, forma, quantidade }
}
