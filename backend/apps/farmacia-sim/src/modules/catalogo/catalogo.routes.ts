import type { AppPriceHub } from '@pricehub/observability'
import {
  CorpoDeAlteracaoDePreco,
  ParametrosDoProduto,
  RespostaDeAlteracaoDePreco,
  RespostaDeReset,
} from './catalogo.schemas.js'
import type { CatalogoService } from './catalogo.service.js'

export function registrarRotasAdmin(app: AppPriceHub, service: CatalogoService): void {
  app.patch(
    '/admin/produtos/:id/preco',
    {
      schema: {
        tags: ['admin'],
        summary: 'Altera o preço de um produto e dispara o webhook (se a farmácia tiver)',
        params: ParametrosDoProduto,
        body: CorpoDeAlteracaoDePreco,
        response: { 200: RespostaDeAlteracaoDePreco },
      },
    },
    async (request) => {
      const { anterior, atual, webhook } = await service.alterarPreco(
        request.params.id,
        request.body.precoCentavos,
        request.id,
        request.log,
      )
      return {
        id: atual.id,
        codigo: atual.codigo,
        precoAnteriorCentavos: anterior.precoCentavos,
        precoCentavos: atual.precoCentavos,
        atualizadoEm: atual.atualizadoEm.toISOString(),
        webhook,
        correlationId: request.id,
      }
    },
  )

  app.post(
    '/admin/reset',
    {
      schema: {
        tags: ['admin'],
        summary: 'Restaura os preços do seed e notifica os produtos alterados',
        response: { 200: RespostaDeReset },
      },
    },
    async (request) => ({ ...(await service.resetar(request.id, request.log)), correlationId: request.id }),
  )
}
