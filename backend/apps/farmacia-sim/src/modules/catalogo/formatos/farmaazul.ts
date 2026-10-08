import Type, { type Static } from 'typebox'
import { isoComFusoDeBrasilia } from '../datas.js'
import type { Produto } from '../produto.js'
import type { FormatoDaFarmacia } from './formato.js'

export const ItemFarmaAzul = Type.Object({
  codigo: Type.String(),
  descricao: Type.String(),
  principio_ativo: Type.String(),
  concentracao: Type.String(),
  forma_farmaceutica: Type.String(),
  quantidade_embalagem: Type.Integer(),
  fabricante: Type.String(),
  registro_anvisa: Type.String({ description: 'Registro na Anvisa, somente dígitos' }),
  preco_centavos: Type.Integer(),
  ultima_atualizacao: Type.String({ description: 'ISO 8601 com fuso -03:00' }),
})
export type ItemFarmaAzul = Static<typeof ItemFarmaAzul>

export const PaginaFarmaAzul = Type.Object({
  items: Type.Array(ItemFarmaAzul),
  page: Type.Integer(),
  total_pages: Type.Integer(),
})

export function serializarFarmaAzul(produto: Produto): ItemFarmaAzul {
  return {
    ...(produto.dados as Omit<ItemFarmaAzul, 'preco_centavos' | 'ultima_atualizacao'>),
    preco_centavos: produto.precoCentavos,
    ultima_atualizacao: isoComFusoDeBrasilia(produto.atualizadoEm),
  }
}

export const formatoFarmaAzul: FormatoDaFarmacia = {
  farmaciaId: 'farmaazul',
  nome: 'FarmaAzul Confiança',
  payloadDeWebhook: (produto) => ({ type: 'price.updated', data: serializarFarmaAzul(produto) }),
  registrarRotas(app, repository) {
    app.get(
      '/v1/catalogo',
      {
        schema: {
          tags: ['catalogo'],
          summary: 'Catálogo paginado da FarmaAzul (snake_case, preço em centavos)',
          querystring: Type.Object({
            page: Type.Optional(Type.Integer({ minimum: 1 })),
            page_size: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
          }),
          response: { 200: PaginaFarmaAzul },
        },
      },
      async (request) => {
        const page = request.query.page ?? 1
        const pageSize = request.query.page_size ?? 5
        const { produtos, total } = await repository.listarPagina(page, pageSize)
        return {
          items: produtos.map(serializarFarmaAzul),
          page,
          total_pages: Math.max(1, Math.ceil(total / pageSize)),
        }
      },
    )
  },
}
