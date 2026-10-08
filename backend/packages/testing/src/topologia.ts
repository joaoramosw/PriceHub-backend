import type { Channel } from 'amqplib'

export type DefinicoesRabbitMq = {
  exchanges?: { name: string; type: string; durable: boolean; arguments?: Record<string, unknown> }[]
  queues?: { name: string; durable: boolean; arguments?: Record<string, unknown> }[]
  bindings?: { source: string; destination: string; destination_type: string; routing_key: string }[]
}

export async function aplicarTopologia(canal: Channel, definicoes: DefinicoesRabbitMq): Promise<void> {
  for (const exchange of definicoes.exchanges ?? []) {
    await canal.assertExchange(exchange.name, exchange.type, {
      durable: exchange.durable,
      arguments: exchange.arguments,
    })
  }
  for (const fila of definicoes.queues ?? []) {
    await canal.assertQueue(fila.name, { durable: fila.durable, arguments: fila.arguments })
  }
  for (const binding of definicoes.bindings ?? []) {
    if (binding.destination_type === 'queue') {
      await canal.bindQueue(binding.destination, binding.source, binding.routing_key)
    }
  }
}
