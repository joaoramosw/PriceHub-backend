import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import {
  type AppPriceHub,
  NaoAutorizado,
  RecursoNaoEncontrado,
  RequisicaoInvalida,
} from '@pricehub/observability'
import Type from 'typebox'
import { PayloadInvalidoError } from '../../connectors/pharmacy-connector.js'
import { ParametrosDaFarmacia, ResumoDaIngestao } from '../ingestao/ingestao.schemas.js'
import type { IngestaoService } from '../ingestao/ingestao.service.js'
import { assinaturaValida, cabecalhoDeAssinatura } from './assinatura.js'

declare module 'fastify' {
  interface FastifyRequest {
    corpoBruto?: Buffer
  }
}

export async function registrarRotasDeWebhook(
  app: AppPriceHub,
  service: IngestaoService,
  segredos: Map<string, string>,
): Promise<void> {
  await app.register(async (instancia) => {
    const escopo = instancia.withTypeProvider<TypeBoxTypeProvider>()
    escopo.removeContentTypeParser('application/json')
    escopo.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, corpo, concluir) => {
      request.corpoBruto = corpo as Buffer
      try {
        concluir(null, JSON.parse((corpo as Buffer).toString('utf8')))
      } catch {
        concluir(new RequisicaoInvalida('corpo não é JSON válido'), undefined)
      }
    })

    escopo.post(
      '/webhooks/:farmacia',
      {
        schema: {
          tags: ['webhooks'],
          summary: 'Recebe notificação de preço de uma farmácia (assinada com HMAC-SHA256)',
          params: ParametrosDaFarmacia,
          headers: Type.Object({
            [cabecalhoDeAssinatura]: Type.Optional(
              Type.String({ description: 'sha256=<HMAC hex do corpo>' }),
            ),
            'x-correlation-id': Type.Optional(Type.String()),
          }),
          response: { 202: ResumoDaIngestao },
        },
      },
      async (request, reply) => {
        const { farmacia } = request.params
        const connector = service.connector(farmacia)
        const segredo = segredos.get(farmacia)
        if (connector.modo !== 'webhook' || !segredo) {
          throw new RecursoNaoEncontrado(`a farmácia ${farmacia} não envia webhooks`)
        }
        const assinatura = request.headers[cabecalhoDeAssinatura]
        if (!request.corpoBruto || !assinaturaValida(request.corpoBruto, assinatura, segredo)) {
          request.log.warn({ farmacia }, 'webhook com assinatura inválida')
          throw new NaoAutorizado('assinatura do webhook inválida')
        }
        request.log.info({ farmacia }, 'webhook recebido')
        try {
          const resumo = await service.receberWebhook(farmacia, request.body, request.id, request.log)
          return reply.code(202).send(resumo)
        } catch (erro) {
          if (erro instanceof PayloadInvalidoError) throw new RequisicaoInvalida(erro.message)
          throw erro
        }
      },
    )
  })
}
