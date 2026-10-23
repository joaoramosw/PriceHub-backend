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
    slug: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    nomeExibicao: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    dosagem: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    principioAtivoExibicao: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    apresentacaoExibicao: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    laboratorio: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    registroMs: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    tarja: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    tarjaTipo: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    imagem: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    descricao: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    indicacao: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    modoDeUso: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    contraindicacao: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    avaliacao: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
    avaliacoesTotal: Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
  },
  { additionalProperties: false },
)
export type CatalogoOfertaAtualizada = Static<typeof CatalogoOfertaAtualizada>
