import Type, { type Static } from 'typebox'

export const CatalogoOfertaNaoCorrespondida = Type.Object(
  {
    farmaciaId: Type.String({ minLength: 1 }),
    externalId: Type.String({ minLength: 1 }),
    motivo: Type.String({ minLength: 1 }),
    oferta: Type.Unknown(),
  },
  { additionalProperties: false },
)
export type CatalogoOfertaNaoCorrespondida = Static<typeof CatalogoOfertaNaoCorrespondida>
