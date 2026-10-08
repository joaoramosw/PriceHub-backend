import { createHmac } from 'node:crypto'
import type { FastifyBaseLogger } from 'fastify'

export const cabecalhoDeAssinatura = 'x-pricehub-signature'

export function assinarCorpo(corpo: string, segredo: string): string {
  return `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`
}

export type EnvioDeWebhook = {
  url: string
  segredo: string
  payload: unknown
  correlationId: string
  timeoutMs: number
}

export type EnviarWebhook = (envio: EnvioDeWebhook, logger: FastifyBaseLogger) => Promise<boolean>

export const enviarWebhook: EnviarWebhook = async (envio, logger) => {
  const corpo = JSON.stringify(envio.payload)
  const inicio = performance.now()
  try {
    const resposta = await fetch(envio.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [cabecalhoDeAssinatura]: assinarCorpo(corpo, envio.segredo),
        'x-correlation-id': envio.correlationId,
      },
      body: corpo,
      signal: AbortSignal.timeout(envio.timeoutMs),
    })
    const duracaoMs = Math.round(performance.now() - inicio)
    if (!resposta.ok) {
      logger.warn({ url: envio.url, status: resposta.status, duracaoMs }, 'webhook recusado pelo destino')
      return false
    }
    logger.info({ url: envio.url, status: resposta.status, duracaoMs }, 'webhook entregue')
    return true
  } catch (erro) {
    logger.warn({ err: erro, url: envio.url }, 'falha ao entregar webhook; a reconciliação cobrirá a perda')
    return false
  }
}
