import type { ConexaoRabbitMq } from '@pricehub/messaging'
import type { Logger } from 'pino'
import { iniciarConsumidorDeOfertasRecebidas } from './events/consumers/ingestao-oferta-recebida.consumer.js'
import { ProcessadorDeOfertas } from './modules/catalogo/processador-de-ofertas.service.js'
import { OutboxRelay } from './modules/outbox/outbox.relay.js'
import type { PrismaClient } from './plugins/prisma.js'

export type OpcoesDeProcessamento = {
  prisma: PrismaClient
  conexao: ConexaoRabbitMq
  logger: Logger
  prefetch: number
  intervaloDoOutboxMs: number
  loteDoOutbox: number
}

export async function iniciarProcessamento(opcoes: OpcoesDeProcessamento): Promise<OutboxRelay> {
  const relay = OutboxRelay.paraRabbitMq(
    opcoes.prisma,
    opcoes.conexao,
    opcoes.logger.child({ componente: 'outbox-relay' }),
    opcoes.loteDoOutbox,
  )
  relay.iniciar(opcoes.intervaloDoOutboxMs)
  await iniciarConsumidorDeOfertasRecebidas(
    opcoes.conexao,
    new ProcessadorDeOfertas(opcoes.prisma),
    relay,
    opcoes.prefetch,
  )
  return relay
}
