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
  },
  { additionalProperties: false },
)
export type CatalogoMedicamentoCadastrado = Static<typeof CatalogoMedicamentoCadastrado>
