import Type from 'typebox'

export const ParametrosDoProduto = Type.Object({ id: Type.Integer({ minimum: 1 }) })

export const CorpoDeAlteracaoDePreco = Type.Object(
  { precoCentavos: Type.Integer({ minimum: 1, maximum: 10_000_000 }) },
  { additionalProperties: false },
)

export const RespostaDeAlteracaoDePreco = Type.Object({
  id: Type.Integer(),
  codigo: Type.String(),
  precoAnteriorCentavos: Type.Integer(),
  precoCentavos: Type.Integer(),
  atualizadoEm: Type.String({ format: 'date-time' }),
  webhook: Type.Union([Type.Literal('agendado'), Type.Literal('nao-suportado'), Type.Literal('sem-segredo')]),
  correlationId: Type.String(),
})

export const RespostaDeReset = Type.Object({
  produtos: Type.Integer(),
  alterados: Type.Integer(),
  correlationId: Type.String(),
})
