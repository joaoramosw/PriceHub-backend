import { createHmac, timingSafeEqual } from 'node:crypto'

export const cabecalhoDeAssinatura = 'x-pricehub-signature'

export function assinar(corpo: Buffer | string, segredo: string): string {
  return `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`
}

export function assinaturaValida(corpo: Buffer, assinatura: string | undefined, segredo: string): boolean {
  if (!assinatura) return false
  const esperada = Buffer.from(assinar(corpo, segredo))
  const recebida = Buffer.from(assinatura)
  return esperada.length === recebida.length && timingSafeEqual(esperada, recebida)
}
