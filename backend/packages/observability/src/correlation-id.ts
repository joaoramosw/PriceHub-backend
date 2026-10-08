import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

export const cabecalhoCorrelationId = 'x-correlation-id'

export function gerarCorrelationId(): string {
  return randomUUID()
}

export function lerCorrelationId(requisicao: IncomingMessage): string {
  const valor = requisicao.headers[cabecalhoCorrelationId]
  const texto = Array.isArray(valor) ? valor[0] : valor
  return texto && /^[\w.:-]{1,128}$/.test(texto) ? texto : gerarCorrelationId()
}
