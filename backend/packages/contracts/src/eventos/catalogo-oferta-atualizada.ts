import Type, { type Static } from 'typebox'

export const CatalogoOfertaAtualizada = Type.Object(
  {
    ofertaId: Type.String({ format: 'uuid' }),
    medicamentoId: Type.String({ format: 'uuid' }),
    farmaciaId: Type.String({ minLength: 1 }),
    farmaciaNome: Type.String({ minLength: 1 }),
    precoAnteriorCentavos: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    precoAtualCentavos: Type.Integer({ minimum: 0 }),
    atualizadoEm: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
)
export type CatalogoOfertaAtualizada = Static<typeof CatalogoOfertaAtualizada>
