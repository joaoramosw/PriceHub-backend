import Type, { type Static } from 'typebox'
import { UniaoDeLiterais } from './literais.js'

export const unidadesDeConcentracao = ['mg', 'mg/ml', 'g', 'ml', 'mcg'] as const
export const formasFarmaceuticas = [
  'comprimido',
  'comprimido revestido',
  'comprimido liberacao prolongada',
  'capsula',
  'gotas',
  'suspensao',
  'outro',
] as const
export const unidadesDeQuantidade = ['unidade', 'ml'] as const

export const Concentracao = Type.Object(
  {
    valor: Type.Number({ exclusiveMinimum: 0 }),
    unidade: UniaoDeLiterais(unidadesDeConcentracao),
  },
  { additionalProperties: false },
)
export type Concentracao = Static<typeof Concentracao>

export const FormaFarmaceutica = UniaoDeLiterais(formasFarmaceuticas)
export type FormaFarmaceutica = Static<typeof FormaFarmaceutica>

export const Quantidade = Type.Object(
  {
    valor: Type.Number({ exclusiveMinimum: 0 }),
    unidade: UniaoDeLiterais(unidadesDeQuantidade),
  },
  { additionalProperties: false },
)
export type Quantidade = Static<typeof Quantidade>

const TextoObrigatorio = Type.String({ minLength: 1 })
const TextoOpcional = Type.Union([TextoObrigatorio, Type.Null()])

export const OfertaColetada = Type.Object(
  {
    farmaciaId: TextoObrigatorio,
    farmaciaNome: TextoObrigatorio,
    externalId: TextoObrigatorio,
    nome: TextoObrigatorio,
    principioAtivo: TextoObrigatorio,
    concentracao: Concentracao,
    forma: FormaFarmaceutica,
    quantidade: Quantidade,
    fabricante: TextoOpcional,
    registroMs: Type.Union([Type.String({ pattern: '^[0-9]{9,13}$' }), Type.Null()]),
    ean: Type.Union([Type.String({ pattern: '^[0-9]{8,14}$' }), Type.Null()]),
    categoria: TextoOpcional,
    slug: Type.Optional(TextoOpcional),
    nomeExibicao: Type.Optional(TextoOpcional),
    dosagem: Type.Optional(TextoOpcional),
    principioAtivoExibicao: Type.Optional(TextoOpcional),
    apresentacaoExibicao: Type.Optional(TextoOpcional),
    laboratorio: Type.Optional(TextoOpcional),
    tarja: Type.Optional(TextoOpcional),
    tarjaTipo: Type.Optional(TextoOpcional),
    imagem: Type.Optional(TextoOpcional),
    descricao: Type.Optional(TextoOpcional),
    indicacao: Type.Optional(TextoOpcional),
    modoDeUso: Type.Optional(TextoOpcional),
    contraindicacao: Type.Optional(TextoOpcional),
    avaliacao: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
    avaliacoesTotal: Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
    precoCentavos: Type.Integer({ minimum: 0 }),
    atualizadoNaOrigemEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    coletadoEm: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
)
export type OfertaColetada = Static<typeof OfertaColetada>
