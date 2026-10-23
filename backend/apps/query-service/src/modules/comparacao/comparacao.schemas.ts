import Type, { type Static } from 'typebox'

const PrecoOpcional = Type.Union([Type.Integer(), Type.Null()])

export const ConsultaDeMedicamentos = Type.Object({
  busca: Type.Optional(Type.String({ maxLength: 100 })),
  categoria: Type.Optional(Type.String({ maxLength: 100 })),
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
})

export const ItemDeMedicamento = Type.Object({
  id: Type.String({ format: 'uuid' }),
  nome: Type.String(),
  principioAtivo: Type.String(),
  concentracao: Type.String(),
  apresentacao: Type.String(),
  slug: Type.Union([Type.String(), Type.Null()]),
  dosagem: Type.Union([Type.String(), Type.Null()]),
  laboratorio: Type.Union([Type.String(), Type.Null()]),
  registroMS: Type.Union([Type.String(), Type.Null()]),
  tarja: Type.Union([Type.String(), Type.Null()]),
  tarjaTipo: Type.Union([Type.String(), Type.Null()]),
  imagem: Type.Union([Type.String(), Type.Null()]),
  descricao: Type.Union([Type.String(), Type.Null()]),
  indicacao: Type.Union([Type.String(), Type.Null()]),
  modoDeUso: Type.Union([Type.String(), Type.Null()]),
  contraindicacao: Type.Union([Type.String(), Type.Null()]),
  avaliacao: Type.Union([Type.Number(), Type.Null()]),
  avaliacoesTotal: Type.Union([Type.Integer(), Type.Null()]),
  farmaciaMaisBarata: Type.Union([Type.String(), Type.Null()]),
  categoria: Type.Union([Type.String(), Type.Null()]),
  menorPrecoCentavos: PrecoOpcional,
  maiorPrecoCentavos: PrecoOpcional,
  qtdFarmacias: Type.Integer(),
  economiaMaximaCentavos: PrecoOpcional,
  atualizadoEm: Type.String({ format: 'date-time' }),
})
export type ItemDeMedicamento = Static<typeof ItemDeMedicamento>

export const PaginaDeMedicamentos = Type.Object({
  itens: Type.Array(ItemDeMedicamento),
  page: Type.Integer(),
  pageSize: Type.Integer(),
  total: Type.Integer(),
  totalPages: Type.Integer(),
})

export const ParametrosDoMedicamento = Type.Object({ id: Type.String({ format: 'uuid' }) })

export const OfertaComparada = Type.Object({
  farmaciaId: Type.String(),
  farmacia: Type.String(),
  precoCentavos: Type.Integer(),
  atualizadoEm: Type.String({ format: 'date-time' }),
  ehMenorPreco: Type.Boolean(),
  diferencaParaMenorCentavos: Type.Integer(),
})

export const Comparacao = Type.Object({
  medicamento: ItemDeMedicamento,
  ofertas: Type.Array(OfertaComparada),
})

export const ListaDeFarmacias = Type.Array(
  Type.Object({ farmaciaId: Type.String(), nome: Type.String(), qtdOfertas: Type.Integer() }),
)

export const ListaDeCategorias = Type.Array(
  Type.Object({ categoria: Type.String(), qtdMedicamentos: Type.Integer() }),
)
