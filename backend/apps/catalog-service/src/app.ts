import type { ConexaoRabbitMq } from '@pricehub/messaging'
import { type AppPriceHub, criarApp, registrarHealth } from '@pricehub/observability'
import type { AmbienteDoCatalogo } from './config/env.js'
import { registrarRotasDoCatalogo } from './modules/catalogo/catalogo.routes.js'
import type { PrismaClient } from './plugins/prisma.js'

export type DependenciasDoCatalogo = {
  ambiente: AmbienteDoCatalogo
  prisma: PrismaClient
  conexao: ConexaoRabbitMq
  logger?: boolean
}

export async function buildApp(dependencias: DependenciasDoCatalogo): Promise<AppPriceHub> {
  const { ambiente, prisma, conexao } = dependencias
  const app = await criarApp({
    servico: 'catalog-service',
    titulo: 'PriceHub — catalog-service (interno)',
    descricao:
      'Fonte da verdade: matching para o medicamento canônico, ofertas, histórico de preços, outbox e publicação dos eventos catalogo.*. Rotas apenas para inspeção interna.',
    nivelDeLog: ambiente.LOG_LEVEL,
    logger: dependencias.logger,
  })
  registrarHealth(app, 'catalog-service', {
    database: () => prisma.$queryRaw`SELECT 1`,
    broker: () => conexao.verificar(),
  })
  registrarRotasDoCatalogo(app, prisma)
  return app
}
