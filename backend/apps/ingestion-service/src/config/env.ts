import { carregarAmbiente } from '@pricehub/observability'
import Type, { type Static } from 'typebox'

export const AmbienteDaIngestao = Type.Object({
  PORT: Type.Integer({ default: 3001 }),
  HOST: Type.String({ default: '0.0.0.0' }),
  DATABASE_URL: Type.String({ minLength: 1 }),
  RABBITMQ_URL: Type.String({ minLength: 1 }),
  BIOFARMA_URL: Type.String({ default: 'http://farmacia-biofarma:4001' }),
  FARMAAZUL_URL: Type.String({ default: 'http://farmacia-farmaazul:4002' }),
  DROGAPOPULAR_URL: Type.String({ default: 'http://farmacia-drogapopular:4003' }),
  WEBHOOK_SECRET_BIOFARMA: Type.String({ minLength: 8 }),
  WEBHOOK_SECRET_FARMAAZUL: Type.String({ minLength: 8 }),
  SYNC_INTERVAL_MS: Type.Integer({ minimum: 1000, default: 60_000 }),
  DROGAPOPULAR_POLL_INTERVAL_MS: Type.Integer({ minimum: 500, default: 15_000 }),
  SYNC_NO_BOOT: Type.Boolean({ default: true }),
  HTTP_TIMEOUT_MS: Type.Integer({ default: 5000 }),
  LOG_LEVEL: Type.String({ default: 'info' }),
})

export type AmbienteDaIngestao = Static<typeof AmbienteDaIngestao>

export function carregarAmbienteDaIngestao(): AmbienteDaIngestao {
  return carregarAmbiente(AmbienteDaIngestao)
}
