import type { OrigemDeColeta } from '@pricehub/contracts'
import { ProblemaHttp, RecursoNaoEncontrado } from '@pricehub/observability'
import type { FastifyBaseLogger } from 'fastify'
import type { PharmacyConnector, ResultadoDaConversao } from '../../connectors/pharmacy-connector.js'
import type { PublicarOfertaRecebida } from '../../events/publishers/oferta-recebida.publisher.js'
import type { ColetasRepository } from '../coletas/coletas.repository.js'

export type ResumoDaIngestao = {
  farmaciaId: string
  origem: OrigemDeColeta
  coletaId: string
  publicadas: number
  descartadas: { externalId: string; motivo: string }[]
  correlationId: string
}

export class BrokerIndisponivel extends ProblemaHttp {
  constructor(detalhe: string) {
    super(503, 'Broker indisponível', detalhe, 'https://pricehub.dev/problemas/broker-indisponivel')
  }
}

export class IngestaoService {
  constructor(
    private readonly connectors: Map<string, PharmacyConnector>,
    private readonly coletas: ColetasRepository,
    private readonly publicar: PublicarOfertaRecebida,
  ) {}

  connector(farmaciaId: string): PharmacyConnector {
    const connector = this.connectors.get(farmaciaId)
    if (!connector) throw new RecursoNaoEncontrado(`farmácia ${farmaciaId} não está integrada`)
    return connector
  }

  farmacias(): PharmacyConnector[] {
    return [...this.connectors.values()]
  }

  async receberWebhook(
    farmaciaId: string,
    payload: unknown,
    correlationId: string,
    logger: FastifyBaseLogger,
  ): Promise<ResumoDaIngestao> {
    const connector = this.connector(farmaciaId)
    const coletaId = await this.coletas.registrar({ farmaciaId, origem: 'webhook', payload, correlationId })
    const resultado = connector.converterWebhookDetalhado(payload)
    return this.publicarResultado(connector, 'webhook', coletaId, resultado, correlationId, logger)
  }

  async sincronizar(
    farmaciaId: string,
    origem: Exclude<OrigemDeColeta, 'webhook'>,
    correlationId: string,
    logger: FastifyBaseLogger,
  ): Promise<ResumoDaIngestao> {
    const connector = this.connector(farmaciaId)
    const paginas = await connector.baixarCatalogo()
    const coletaId = await this.coletas.registrar({ farmaciaId, origem, payload: paginas, correlationId })
    const resultado = connector.converterCatalogo(paginas)
    return this.publicarResultado(connector, origem, coletaId, resultado, correlationId, logger)
  }

  private async publicarResultado(
    connector: PharmacyConnector,
    origem: OrigemDeColeta,
    coletaId: string,
    resultado: ResultadoDaConversao,
    correlationId: string,
    logger: FastifyBaseLogger,
  ): Promise<ResumoDaIngestao> {
    for (const descartado of resultado.descartados) {
      logger.warn(
        { farmaciaId: connector.farmaciaId, ...descartado },
        'item descartado: fora do modelo canônico',
      )
    }
    let publicadas = 0
    try {
      for (const oferta of resultado.ofertas) {
        const evento = await this.publicar(oferta, origem, correlationId)
        publicadas += 1
        logger.debug(
          { eventId: evento.eventId, externalId: oferta.externalId, precoCentavos: oferta.precoCentavos },
          'ingestao.oferta.recebida publicada',
        )
      }
    } catch (erro) {
      logger.error({ err: erro, publicadas }, 'falha ao publicar ofertas')
      throw new BrokerIndisponivel(erro instanceof Error ? erro.message : String(erro))
    } finally {
      await this.coletas.registrarQuantidadeDeOfertas(coletaId, publicadas)
    }
    logger.info(
      {
        farmaciaId: connector.farmaciaId,
        origem,
        publicadas,
        descartadas: resultado.descartados.length,
        coletaId,
      },
      'ofertas publicadas',
    )
    return {
      farmaciaId: connector.farmaciaId,
      origem,
      coletaId,
      publicadas,
      descartadas: resultado.descartados,
      correlationId,
    }
  }
}
