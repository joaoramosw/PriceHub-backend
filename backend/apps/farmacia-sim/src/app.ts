import { type AppPriceHub, criarApp, registrarHealth } from '@pricehub/observability'
import type { AmbienteDaFarmacia } from './config/env.js'
import { CatalogoRepository } from './modules/catalogo/catalogo.repository.js'
import { registrarRotasAdmin } from './modules/catalogo/catalogo.routes.js'
import { CatalogoService } from './modules/catalogo/catalogo.service.js'
import { formatosPorFarmacia } from './modules/catalogo/formatos/index.js'
import { type EnviarWebhook, enviarWebhook } from './modules/catalogo/webhook.js'
import type { PrismaClient } from './plugins/prisma.js'

export type DependenciasDaFarmacia = {
  ambiente: AmbienteDaFarmacia
  prisma: PrismaClient
  enviarWebhook?: EnviarWebhook
  logger?: boolean
}

export async function buildApp(dependencias: DependenciasDaFarmacia): Promise<{
  app: AppPriceHub
  service: CatalogoService
}> {
  const { ambiente } = dependencias
  const formato = formatosPorFarmacia[ambiente.PHARMACY_ID]
  const app = await criarApp({
    servico: `farmacia-${ambiente.PHARMACY_ID}`,
    titulo: `${formato.nome} (farmácia simulada)`,
    descricao: `API própria da ${formato.nome}. Sistema externo ao PriceHub, usado para simular a integração.`,
    nivelDeLog: ambiente.LOG_LEVEL,
    logger: dependencias.logger,
  })
  const repository = new CatalogoRepository(dependencias.prisma)
  const service = new CatalogoService(
    repository,
    formato,
    ambiente,
    dependencias.enviarWebhook ?? enviarWebhook,
  )

  registrarHealth(app, `farmacia-${ambiente.PHARMACY_ID}`, { database: () => repository.verificarConexao() })
  formato.registrarRotas(app, repository)
  registrarRotasAdmin(app, service)

  return { app, service }
}
