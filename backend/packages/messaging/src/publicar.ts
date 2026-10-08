import type { Evento } from '@pricehub/contracts'
import type { ConfirmChannel, Options } from 'amqplib'
import type { ConexaoRabbitMq } from './conexao.js'
import { exchangeDeEventos } from './nomes.js'

export function publicarComConfirmacao(
  canal: ConfirmChannel,
  exchange: string,
  routingKey: string,
  conteudo: Buffer,
  opcoes: Options.Publish,
): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    canal.publish(exchange, routingKey, conteudo, opcoes, (erro) => {
      if (erro) rejeitar(erro instanceof Error ? erro : new Error(String(erro)))
      else resolver()
    })
  })
}

export function propriedadesDoEvento(evento: Evento): Options.Publish {
  return {
    persistent: true,
    contentType: 'application/json',
    messageId: evento.eventId,
    correlationId: evento.correlationId,
    type: evento.type,
    appId: evento.source,
    timestamp: Math.floor(Date.parse(evento.occurredAt) / 1000),
    headers: { 'x-event-version': evento.version },
  }
}

export async function publicarEvento(conexao: ConexaoRabbitMq, evento: Evento): Promise<void> {
  await publicarComConfirmacao(
    conexao.canalDePublicacaoAtivo(),
    exchangeDeEventos,
    evento.type,
    Buffer.from(JSON.stringify(evento)),
    propriedadesDoEvento(evento),
  )
}
