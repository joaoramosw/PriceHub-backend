import type { ServerResponse } from 'node:http'
import type { AppPriceHub } from '@pricehub/observability'

export type EventoSse = { evento: string; id: string; dados: unknown }

type Cliente = { resposta: ServerResponse; correlationId: string }

export class HubDeEventos {
  private readonly clientes = new Set<Cliente>()
  private temporizador: NodeJS.Timeout | undefined

  constructor(private readonly heartbeatMs: number) {}

  get conectados(): number {
    return this.clientes.size
  }

  iniciar(): void {
    this.temporizador = setInterval(
      () => this.escreverParaTodos(`: heartbeat ${Date.now()}\n\n`),
      this.heartbeatMs,
    )
  }

  adicionar(cliente: Cliente): () => void {
    this.clientes.add(cliente)
    return () => this.clientes.delete(cliente)
  }

  publicar({ evento, id, dados }: EventoSse): void {
    this.escreverParaTodos(`id: ${id}\nevent: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`)
  }

  encerrar(): void {
    clearInterval(this.temporizador)
    for (const cliente of this.clientes) cliente.resposta.end()
    this.clientes.clear()
  }

  private escreverParaTodos(mensagem: string): void {
    for (const cliente of this.clientes) {
      if (cliente.resposta.writableEnded) this.clientes.delete(cliente)
      else cliente.resposta.write(mensagem)
    }
  }
}

export function registrarRotaSse(app: AppPriceHub, hub: HubDeEventos): void {
  app.get(
    '/eventos/stream',
    {
      schema: {
        tags: ['tempo-real'],
        summary: 'Server-Sent Events: "oferta-atualizada" e "medicamento-cadastrado", com correlationId',
        produces: ['text/event-stream'],
      },
    },
    (request, reply) => {
      reply.hijack()
      const resposta = reply.raw
      resposta.writeHead(200, {
        ...(reply.getHeaders() as Record<string, string>),
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      })
      resposta.write(
        `retry: 2000\nevent: conectado\ndata: ${JSON.stringify({ correlationId: request.id })}\n\n`,
      )
      const remover = hub.adicionar({ resposta, correlationId: request.id })
      request.log.info({ conectados: hub.conectados }, 'cliente SSE conectado')
      request.raw.on('close', () => {
        remover()
        request.log.info({ conectados: hub.conectados }, 'cliente SSE desconectado')
      })
    },
  )
}
