import type { ConexaoRabbitMq } from '@pricehub/messaging'
import { type AppPriceHub, criarApp, registrarHealth } from '@pricehub/observability'
import type { AmbienteDaIngestao } from './config/env.js'
import type { BuscarJson } from './connectors/http.js'
import { criarRegistroDeConnectors } from './connectors/registry.js'
import { criarPublicadorDeOfertaRecebida } from './events/publishers/oferta-recebida.publisher.js'
import { ColetasRepository } from './modules/coletas/coletas.repository.js'
import { registrarRotasDeIngestao } from './modules/ingestao/ingestao.routes.js'
import { IngestaoService } from './modules/ingestao/ingestao.service.js'
import { registrarRotasDeWebhook } from './modules/webhooks/webhooks.routes.js'
import type { PrismaClient } from './plugins/prisma.js'

export type DependenciasDaIngestao = {
  ambiente: AmbienteDaIngestao
  prisma: PrismaClient
  conexao: ConexaoRabbitMq
  buscarJson?: BuscarJson
  logger?: boolean
}

export async function buildApp(
  dependencias: DependenciasDaIngestao,
): Promise<{ app: AppPriceHub; service: IngestaoService }> {
  const { ambiente, prisma, conexao } = dependencias
  const app = await criarApp({
    servico: 'ingestion-service',
    titulo: 'PriceHub — ingestion-service',
    descricao:
      'Integração com as farmácias: recebe webhooks assinados, faz sync e polling, aplica o adapter de cada farmácia e publica ingestao.oferta.recebida.',
    nivelDeLog: ambiente.LOG_LEVEL,
    logger: dependencias.logger,
  })
  const registro = criarRegistroDeConnectors(ambiente, dependencias.buscarJson)
  const coletas = new ColetasRepository(prisma)
  const service = new IngestaoService(registro.connectors, coletas, criarPublicadorDeOfertaRecebida(conexao))

  registrarHealth(app, 'ingestion-service', {
    database: () => coletas.verificarConexao(),
    broker: () => conexao.verificar(),
  })
  await registrarRotasDeWebhook(app, service, registro.segredosDeWebhook)
  registrarRotasDeIngestao(app, service, coletas)

  return { app, service }
}
