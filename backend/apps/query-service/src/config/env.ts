import { carregarAmbiente } from '@pricehub/observability'
import Type, { type Static } from 'typebox'

export const AmbienteDoQuery = Type.Object({
  PORT: Type.Integer({ default: 3000 }),
  HOST: Type.String({ default: '0.0.0.0' }),
  DATABASE_URL: Type.String({ minLength: 1 }),
  RABBITMQ_URL: Type.String({ minLength: 1 }),
  RABBITMQ_PREFETCH: Type.Integer({ minimum: 1, default: 10 }),
  RETRY_BASE_MS: Type.Integer({ minimum: 10, default: 500 }),
  CORS_ORIGINS: Type.String({ default: 'http://localhost:*,http://127.0.0.1:*' }),
  SSE_HEARTBEAT_MS: Type.Integer({ minimum: 1000, default: 15_000 }),
  LOG_LEVEL: Type.String({ default: 'info' }),
})

export type AmbienteDoQuery = Static<typeof AmbienteDoQuery>

export function carregarAmbienteDoQuery(): AmbienteDoQuery {
  return carregarAmbiente(AmbienteDoQuery)
}
