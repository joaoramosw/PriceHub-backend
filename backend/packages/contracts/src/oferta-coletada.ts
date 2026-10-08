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
    precoCentavos: Type.Integer({ minimum: 0 }),
    atualizadoNaOrigemEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    coletadoEm: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
)
export type OfertaColetada = Static<typeof OfertaColetada>
