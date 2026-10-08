import Type, { type Static } from 'typebox'
import { UniaoDeLiterais } from '../literais.js'
import { OfertaColetada } from '../oferta-coletada.js'

export const origensDeColeta = ['webhook', 'sync', 'polling'] as const
export const OrigemDeColeta = UniaoDeLiterais(origensDeColeta)
export type OrigemDeColeta = Static<typeof OrigemDeColeta>

export const IngestaoOfertaRecebida = Type.Object(
  {
    origem: OrigemDeColeta,
    oferta: OfertaColetada,
  },
  { additionalProperties: false },
)
export type IngestaoOfertaRecebida = Static<typeof IngestaoOfertaRecebida>
