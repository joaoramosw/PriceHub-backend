import { ConexaoRabbitMq } from '@pricehub/messaging'
import { criarLogger, encerrarComGraca } from '@pricehub/observability'
import { buildApp } from './app.js'
import { carregarAmbienteDoCatalogo } from './config/env.js'
import { criarPrisma } from './plugins/prisma.js'
import { iniciarProcessamento } from './processamento.js'

const ambiente = carregarAmbienteDoCatalogo()
const logger = criarLogger({ servico: 'catalog-service', nivel: ambiente.LOG_LEVEL })
const prisma = criarPrisma(ambiente.DATABASE_URL)
const conexao = new ConexaoRabbitMq({ url: ambiente.RABBITMQ_URL, nome: 'catalog-service', logger })
const app = await buildApp({ ambiente, prisma, conexao })

await conexao.conectar()
const relay = await iniciarProcessamento({
  prisma,
  conexao,
  logger,
  prefetch: ambiente.RABBITMQ_PREFETCH,
  intervaloDoOutboxMs: ambiente.OUTBOX_POLL_INTERVAL_MS,
  loteDoOutbox: ambiente.OUTBOX_LOTE,
})
await app.listen({ port: ambiente.PORT, host: ambiente.HOST })

encerrarComGraca(app.log, [
  () => app.close(),
  () => conexao.fechar(),
  () => relay.parar(),
  () => prisma.$disconnect(),
])
