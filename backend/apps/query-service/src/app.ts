import type { ConexaoRabbitMq } from '@pricehub/messaging'
import { type AppPriceHub, criarApp, registrarHealth } from '@pricehub/observability'
import type { AmbienteDoQuery } from './config/env.js'
import { ComparacaoRepository } from './modules/comparacao/comparacao.repository.js'
import { registrarRotasDeComparacao } from './modules/comparacao/comparacao.routes.js'
import { registrarCors } from './plugins/cors.js'
import type { PrismaClient } from './plugins/prisma.js'
import { type HubDeEventos, registrarRotaSse } from './plugins/sse.js'

export type DependenciasDoQuery = {
  ambiente: AmbienteDoQuery
  prisma: PrismaClient
  conexao: ConexaoRabbitMq
  hub: HubDeEventos
  logger?: boolean
}

export async function buildApp(dependencias: DependenciasDoQuery): Promise<AppPriceHub> {
  const { ambiente, prisma, conexao, hub } = dependencias
  const app = await criarApp({
    servico: 'query-service',
    titulo: 'PriceHub — API pública de comparação',
    descricao:
      'Read model de comparação de preços (CQRS) atualizado pelos eventos do catálogo. REST + Server-Sent Events. Valores monetários em centavos.',
    nivelDeLog: ambiente.LOG_LEVEL,
    logger: dependencias.logger,
  })
  await registrarCors(app, ambiente.CORS_ORIGINS)
  const repository = new ComparacaoRepository(prisma)
  registrarHealth(app, 'query-service', {
    database: () => repository.verificarConexao(),
    broker: () => conexao.verificar(),
  })
  registrarRotasDeComparacao(app, repository)
  registrarRotaSse(app, hub)
  return app
}
