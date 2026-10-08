import { RecursoNaoEncontrado } from '@pricehub/observability'
import Type, { type Static } from 'typebox'
import { centavosParaReais } from '../datas.js'
import type { Produto } from '../produto.js'
import type { FormatoDaFarmacia } from './formato.js'

export const ProdutoBioFarma = Type.Object({
  id: Type.Integer(),
  sku: Type.String(),
  nome: Type.String(),
  dosagem: Type.String(),
  apresentacao: Type.String(),
  principioAtivo: Type.String(),
  laboratorio: Type.String(),
  registroMS: Type.String(),
  categoria: Type.String(),
  preco: Type.Number({ description: 'Preço em reais' }),
  atualizadoEm: Type.String({ format: 'date-time' }),
})
export type ProdutoBioFarma = Static<typeof ProdutoBioFarma>

export function serializarBioFarma(produto: Produto): ProdutoBioFarma {
  return {
    ...(produto.dados as Omit<ProdutoBioFarma, 'preco' | 'atualizadoEm'>),
    preco: centavosParaReais(produto.precoCentavos),
    atualizadoEm: produto.atualizadoEm.toISOString(),
  }
}

export const formatoBioFarma: FormatoDaFarmacia = {
  farmaciaId: 'biofarma',
  nome: 'BioFarma Verde',
  payloadDeWebhook: (produto) => ({ evento: 'preco_alterado', produto: serializarBioFarma(produto) }),
  registrarRotas(app, repository) {
    app.get(
      '/api/produtos',
      {
        schema: {
          tags: ['catalogo'],
          summary: 'Lista o catálogo da BioFarma (camelCase, preço em reais)',
          response: { 200: Type.Array(ProdutoBioFarma) },
        },
      },
      async () => (await repository.listar()).map(serializarBioFarma),
    )
    app.get(
      '/api/produtos/:id',
      {
        schema: {
          tags: ['catalogo'],
          summary: 'Detalha um produto da BioFarma',
          params: Type.Object({ id: Type.Integer({ minimum: 1 }) }),
          response: { 200: ProdutoBioFarma },
        },
      },
      async (request) => {
        const produto = await repository.buscar(request.params.id)
        if (!produto) throw new RecursoNaoEncontrado(`produto ${request.params.id} não existe`)
        return serializarBioFarma(produto)
      },
    )
  },
}
