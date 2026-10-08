import { type AppPriceHub, ProblemaHttp } from '@pricehub/observability'
import Type from 'typebox'
import { FarmaciaIndisponivelError } from '../../connectors/http.js'
import { PayloadInvalidoError } from '../../connectors/pharmacy-connector.js'
import type { ColetasRepository } from '../coletas/coletas.repository.js'
import {
  ConsultaDeColetas,
  ListaDeColetas,
  ListaDeFarmacias,
  ParametrosDaFarmacia,
  ResumoDaIngestao,
} from './ingestao.schemas.js'
import type { IngestaoService } from './ingestao.service.js'

export function registrarRotasDeIngestao(
  app: AppPriceHub,
  service: IngestaoService,
  coletas: ColetasRepository,
) {
  app.post(
    '/sync/:farmacia',
    {
      schema: {
        tags: ['sync'],
        summary: 'Executa a reconciliação manual do catálogo de uma farmácia',
        params: ParametrosDaFarmacia,
        body: Type.Optional(Type.Unknown()),
        response: { 200: ResumoDaIngestao },
      },
    },
    async (request) => {
      try {
        return await service.sincronizar(request.params.farmacia, 'sync', request.id, request.log)
      } catch (erro) {
        if (erro instanceof FarmaciaIndisponivelError || erro instanceof PayloadInvalidoError) {
          throw new ProblemaHttp(502, 'Farmácia indisponível ou resposta inválida', erro.message)
        }
        throw erro
      }
    },
  )

  app.get(
    '/farmacias',
    {
      schema: {
        tags: ['sync'],
        summary: 'Lista as farmácias integradas e o modo de integração',
        response: { 200: ListaDeFarmacias },
      },
    },
    async () =>
      service.farmacias().map((connector) => ({
        farmaciaId: connector.farmaciaId,
        nome: connector.farmaciaNome,
        modo: connector.modo,
      })),
  )

  app.get(
    '/coletas',
    {
      schema: {
        tags: ['auditoria'],
        summary: 'Lista as coletas brutas mais recentes (auditoria)',
        querystring: ConsultaDeColetas,
        response: { 200: ListaDeColetas },
      },
    },
    async (request) =>
      (await coletas.listarRecentes(request.query.farmacia, request.query.limite ?? 20)).map((coleta) => ({
        ...coleta,
        recebidoEm: coleta.recebidoEm.toISOString(),
      })),
  )
}
