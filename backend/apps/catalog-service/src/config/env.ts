import { carregarAmbiente } from '@pricehub/observability'
import Type, { type Static } from 'typebox'

export const AmbienteDoCatalogo = Type.Object({
  PORT: Type.Integer({ default: 3002 }),
  HOST: Type.String({ default: '0.0.0.0' }),
  DATABASE_URL: Type.String({ minLength: 1 }),
  RABBITMQ_URL: Type.String({ minLength: 1 }),
  RABBITMQ_PREFETCH: Type.Integer({ minimum: 1, default: 10 }),
  OUTBOX_POLL_INTERVAL_MS: Type.Integer({ minimum: 50, default: 500 }),
  OUTBOX_LOTE: Type.Integer({ minimum: 1, maximum: 500, default: 50 }),
  LOG_LEVEL: Type.String({ default: 'info' }),
})

export type AmbienteDoCatalogo = Static<typeof AmbienteDoCatalogo>

export function carregarAmbienteDoCatalogo(): AmbienteDoCatalogo {
  return carregarAmbiente(AmbienteDoCatalogo)
}
