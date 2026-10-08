import { ConexaoRabbitMq } from '@pricehub/messaging'
import { criarLogger, encerrarComGraca } from '@pricehub/observability'
import { buildApp } from './app.js'
import { carregarAmbienteDoQuery } from './config/env.js'
import { iniciarConsumidorDoCatalogo } from './events/consumers/catalogo-eventos.consumer.js'
import { ProjecaoDeComparacao } from './modules/comparacao/projecao.service.js'
import { criarPrisma } from './plugins/prisma.js'
import { HubDeEventos } from './plugins/sse.js'

const ambiente = carregarAmbienteDoQuery()
const logger = criarLogger({ servico: 'query-service', nivel: ambiente.LOG_LEVEL })
const prisma = criarPrisma(ambiente.DATABASE_URL)
const conexao = new ConexaoRabbitMq({ url: ambiente.RABBITMQ_URL, nome: 'query-service', logger })
const hub = new HubDeEventos(ambiente.SSE_HEARTBEAT_MS)
const app = await buildApp({ ambiente, prisma, conexao, hub })

await conexao.conectar()
hub.iniciar()
await iniciarConsumidorDoCatalogo(conexao, new ProjecaoDeComparacao(prisma), hub, {
  prefetch: ambiente.RABBITMQ_PREFETCH,
  atrasoBaseMs: ambiente.RETRY_BASE_MS,
})
await app.listen({ port: ambiente.PORT, host: ambiente.HOST })

encerrarComGraca(app.log, [
  () => hub.encerrar(),
  () => app.close(),
  () => conexao.fechar(),
  () => prisma.$disconnect(),
])
