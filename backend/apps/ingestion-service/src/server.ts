import { randomUUID } from 'node:crypto'
import { ConexaoRabbitMq } from '@pricehub/messaging'
import { criarLogger, encerrarComGraca } from '@pricehub/observability'
import { buildApp } from './app.js'
import { carregarAmbienteDaIngestao } from './config/env.js'
import { Agendador } from './modules/agendamento/agendador.js'
import { criarPrisma } from './plugins/prisma.js'

const ambiente = carregarAmbienteDaIngestao()
const prisma = criarPrisma(ambiente.DATABASE_URL)
const conexao = new ConexaoRabbitMq({
  url: ambiente.RABBITMQ_URL,
  nome: 'ingestion-service',
  logger: criarLogger({ servico: 'ingestion-service', nivel: ambiente.LOG_LEVEL }),
})
const { app, service } = await buildApp({ ambiente, prisma, conexao })

await conexao.conectar()
await app.listen({ port: ambiente.PORT, host: ambiente.HOST })

const agendador = new Agendador(app.log)
const sincronizar = (farmaciaId: string, origem: 'sync' | 'polling') => () =>
  service.sincronizar(farmaciaId, origem, `${origem}-${farmaciaId}-${randomUUID()}`, app.log)

for (const connector of service.farmacias()) {
  agendador.agendar(
    `sync:${connector.farmaciaId}`,
    ambiente.SYNC_INTERVAL_MS,
    sincronizar(connector.farmaciaId, 'sync'),
    ambiente.SYNC_NO_BOOT,
  )
  if (connector.modo === 'polling') {
    agendador.agendar(
      `polling:${connector.farmaciaId}`,
      ambiente.DROGAPOPULAR_POLL_INTERVAL_MS,
      sincronizar(connector.farmaciaId, 'polling'),
    )
  }
}

encerrarComGraca(app.log, [
  () => agendador.parar(),
  () => app.close(),
  () => conexao.fechar(),
  () => prisma.$disconnect(),
])
