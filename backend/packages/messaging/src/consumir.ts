import { ContratoInvalidoError, type Evento, type TipoDeEvento, validarEvento } from '@pricehub/contracts'
import type { ChannelModel, ConfirmChannel, ConsumeMessage } from 'amqplib'
import type { Logger } from 'pino'
import type { ConexaoRabbitMq } from './conexao.js'
import { publicarComConfirmacao } from './publicar.js'
import { filaDeRetry } from './topologia.js'

export const cabecalhoDeTentativas = 'x-retry-count'

export type ContextoDeMensagem = {
  logger: Logger
  tentativa: number
  fila: string
}

export type OpcoesDeConsumo<Tipo extends TipoDeEvento> = {
  fila: string
  tipos: readonly Tipo[]
  prefetch?: number
  maximoDeTentativas?: number
  atrasoBaseMs?: number
  tratar: (evento: Evento<Tipo>, contexto: ContextoDeMensagem) => Promise<void>
}

export class MensagemDescartavel extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'MensagemDescartavel'
  }
}

export function atrasoDeRetry(tentativa: number, atrasoBaseMs: number): number {
  return atrasoBaseMs * 2 ** tentativa
}

function tentativasAnteriores(mensagem: ConsumeMessage): number {
  const valor = Number(mensagem.properties.headers?.[cabecalhoDeTentativas] ?? 0)
  return Number.isFinite(valor) && valor >= 0 ? valor : 0
}

function lerEvento<Tipo extends TipoDeEvento>(
  mensagem: ConsumeMessage,
  tipos: readonly Tipo[],
): Evento<Tipo> {
  let conteudo: unknown
  try {
    conteudo = JSON.parse(mensagem.content.toString('utf8'))
  } catch {
    throw new ContratoInvalidoError('mensagem não é JSON válido')
  }
  return validarEvento(conteudo, tipos)
}

async function agendarRetry(
  canal: ConfirmChannel,
  mensagem: ConsumeMessage,
  fila: string,
  tentativa: number,
  atrasoMs: number,
  erro: unknown,
): Promise<void> {
  await publicarComConfirmacao(canal, '', filaDeRetry(fila), mensagem.content, {
    ...mensagem.properties,
    expiration: String(atrasoMs),
    headers: {
      ...mensagem.properties.headers,
      [cabecalhoDeTentativas]: tentativa,
      'x-ultimo-erro': erro instanceof Error ? erro.message.slice(0, 500) : String(erro).slice(0, 500),
    },
  })
}

export async function consumir<Tipo extends TipoDeEvento>(
  conexao: ConexaoRabbitMq,
  opcoes: OpcoesDeConsumo<Tipo>,
): Promise<void> {
  const maximoDeTentativas = opcoes.maximoDeTentativas ?? 3
  const atrasoBaseMs = opcoes.atrasoBaseMs ?? 1000
  const logger = conexao.logger.child({ fila: opcoes.fila })

  const iniciar = async (modelo: ChannelModel) => {
    const canal = await modelo.createConfirmChannel()
    canal.on('error', (erro) => logger.error({ err: erro }, 'erro no canal de consumo'))
    await canal.prefetch(opcoes.prefetch ?? 10)

    const processar = async (mensagem: ConsumeMessage) => {
      const tentativa = tentativasAnteriores(mensagem)
      let evento: Evento<Tipo>
      try {
        evento = lerEvento(mensagem, opcoes.tipos)
      } catch (erro) {
        logger.error(
          { err: erro, messageId: mensagem.properties.messageId },
          'mensagem com contrato inválido → DLQ',
        )
        canal.nack(mensagem, false, false)
        return
      }

      const loggerDoEvento = logger.child({
        correlationId: evento.correlationId,
        eventId: evento.eventId,
        type: evento.type,
        tentativa,
      })
      const inicio = performance.now()
      try {
        await opcoes.tratar(evento, { logger: loggerDoEvento, tentativa, fila: opcoes.fila })
        canal.ack(mensagem)
        loggerDoEvento.debug({ duracaoMs: Math.round(performance.now() - inicio) }, 'evento processado')
      } catch (erro) {
        if (erro instanceof MensagemDescartavel || tentativa >= maximoDeTentativas) {
          loggerDoEvento.error({ err: erro }, 'evento esgotou tentativas → DLQ')
          canal.nack(mensagem, false, false)
          return
        }
        const atrasoMs = atrasoDeRetry(tentativa, atrasoBaseMs)
        loggerDoEvento.warn(
          { err: erro, proximaTentativaEmMs: atrasoMs },
          'falha ao processar evento → retry',
        )
        try {
          await agendarRetry(canal, mensagem, opcoes.fila, tentativa + 1, atrasoMs, erro)
          canal.ack(mensagem)
        } catch (erroDeRetry) {
          loggerDoEvento.error({ err: erroDeRetry }, 'falha ao agendar retry; devolvendo à fila')
          canal.nack(mensagem, false, true)
        }
      }
    }

    const emAndamento = new Set<Promise<void>>()
    const { consumerTag } = await canal.consume(opcoes.fila, (mensagem) => {
      if (!mensagem) return
      const tarefa = processar(mensagem).finally(() => emAndamento.delete(tarefa))
      emAndamento.add(tarefa)
    })
    conexao.registrarDreno(async () => {
      await canal.cancel(consumerTag).catch(() => undefined)
      await Promise.allSettled([...emAndamento])
      await canal.close().catch(() => undefined)
    })
    logger.info({ prefetch: opcoes.prefetch ?? 10 }, 'consumidor iniciado')
  }

  await conexao.executarAgora(iniciar)
}
