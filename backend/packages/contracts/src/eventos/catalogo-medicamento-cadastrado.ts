import Type, { type Static } from 'typebox'
import { Concentracao, FormaFarmaceutica, Quantidade } from '../oferta-coletada.js'

export const CatalogoMedicamentoCadastrado = Type.Object(
  {
    medicamentoId: Type.String({ format: 'uuid' }),
    nome: Type.String({ minLength: 1 }),
    principioAtivo: Type.String({ minLength: 1 }),
    concentracao: Concentracao,
    forma: FormaFarmaceutica,
    quantidade: Quantidade,
    categoria: Type.Union([Type.String(), Type.Null()]),
    slug: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    nomeExibicao: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    dosagem: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    principioAtivoExibicao: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    apresentacaoExibicao: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    registroMs: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    laboratorio: Type.Optional(Type.Union([Type.String(), Type.Null()])),
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
export type CatalogoMedicamentoCadastrado = Static<typeof CatalogoMedicamentoCadastrado>
