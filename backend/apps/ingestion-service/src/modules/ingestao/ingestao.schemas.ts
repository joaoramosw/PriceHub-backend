import Type from 'typebox'

export const ParametrosDaFarmacia = Type.Object({ farmacia: Type.String({ pattern: '^[a-z0-9-]{1,40}$' }) })

export const ResumoDaIngestao = Type.Object({
  farmaciaId: Type.String(),
  origem: Type.String(),
  coletaId: Type.String(),
  publicadas: Type.Integer(),
  descartadas: Type.Array(Type.Object({ externalId: Type.String(), motivo: Type.String() })),
  correlationId: Type.String(),
})

export const ListaDeFarmacias = Type.Array(
  Type.Object({ farmaciaId: Type.String(), nome: Type.String(), modo: Type.String() }),
)

export const ConsultaDeColetas = Type.Object({
  farmacia: Type.Optional(Type.String()),
  limite: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
})

export const ListaDeColetas = Type.Array(
  Type.Object({
    id: Type.String(),
    farmaciaId: Type.String(),
    origem: Type.String(),
    correlationId: Type.String(),
    ofertas: Type.Integer(),
    recebidoEm: Type.String({ format: 'date-time' }),
  }),
)
