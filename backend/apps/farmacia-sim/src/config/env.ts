import { carregarAmbiente } from '@pricehub/observability'
import Type, { type Static } from 'typebox'

export const identificadoresDeFarmacia = ['biofarma', 'farmaazul', 'drogapopular'] as const
export type FarmaciaId = (typeof identificadoresDeFarmacia)[number]

export const AmbienteDaFarmacia = Type.Object({
  PHARMACY_ID: Type.Union(identificadoresDeFarmacia.map((id) => Type.Literal(id))),
  PORT: Type.Integer({ default: 4000 }),
  HOST: Type.String({ default: '0.0.0.0' }),
  DATABASE_URL: Type.String({ minLength: 1 }),
  INGESTION_URL: Type.String({ default: 'http://ingestion-service:3001' }),
  WEBHOOK_SECRET: Type.Optional(Type.String({ minLength: 8 })),
  WEBHOOK_TIMEOUT_MS: Type.Integer({ default: 3000 }),
  LOG_LEVEL: Type.String({ default: 'info' }),
})

export type AmbienteDaFarmacia = Omit<Static<typeof AmbienteDaFarmacia>, 'PHARMACY_ID'> & {
  PHARMACY_ID: FarmaciaId
}

export function carregarAmbienteDaFarmacia(): AmbienteDaFarmacia {
  return carregarAmbiente(AmbienteDaFarmacia) as AmbienteDaFarmacia
}
