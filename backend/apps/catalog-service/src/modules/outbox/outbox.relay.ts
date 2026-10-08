import { type Evento, validarEvento } from '@pricehub/contracts'
import { type ConexaoRabbitMq, publicarEvento } from '@pricehub/messaging'
import type { Logger } from 'pino'
import type { PrismaClient } from '../../plugins/prisma.js'

type LinhaDoOutbox = { id: string; payload: unknown }

export type PublicadorDoRelay = (evento: Evento) => Promise<void>

export class OutboxRelay {
  private temporizador: NodeJS.Timeout | undefined
  private executando: Promise<number> | undefined
  private pendenteDeNovaRodada = false

  constructor(
    private readonly prisma: PrismaClient,
    private readonly publicar: PublicadorDoRelay,
    private readonly logger: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>,
    private readonly lote = 50,
  ) {}

  static paraRabbitMq(
    prisma: PrismaClient,
    conexao: ConexaoRabbitMq,
    logger: Logger,
    lote?: number,
  ): OutboxRelay {
    return new OutboxRelay(prisma, (evento) => publicarEvento(conexao, evento), logger, lote)
  }

  iniciar(intervaloMs: number): void {
    this.temporizador = setInterval(() => this.acordar(), intervaloMs)
  }

  acordar(): void {
    if (this.executando) {
      this.pendenteDeNovaRodada = true
      return
    }
    this.executando = this.publicarTudo().finally(() => {
      this.executando = undefined
      if (this.pendenteDeNovaRodada) {
        this.pendenteDeNovaRodada = false
        this.acordar()
      }
    })
  }

  async parar(): Promise<void> {
    clearInterval(this.temporizador)
    await this.executando
  }

  async publicarTudo(): Promise<number> {
    let total = 0
    for (;;) {
      const publicados = await this.publicarLote().catch((erro) => {
        this.logger.warn({ err: erro }, 'falha no relay do outbox; nova tentativa no próximo ciclo')
        return 0
      })
      total += publicados
      if (publicados < this.lote) return total
    }
  }

  async publicarLote(): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        const linhas = await tx.$queryRaw<LinhaDoOutbox[]>`
          SELECT id, payload FROM outbox
          WHERE publicado_em IS NULL
          ORDER BY criado_em, id
          LIMIT ${this.lote}
          FOR UPDATE SKIP LOCKED`
        const publicados: string[] = []
        try {
          for (const linha of linhas) {
            const evento = validarEvento(linha.payload)
            await this.publicar(evento)
            publicados.push(linha.id)
            this.logger.debug(
              { eventId: evento.eventId, type: evento.type, correlationId: evento.correlationId },
              'evento do outbox publicado',
            )
          }
        } finally {
          if (publicados.length > 0) {
            await tx.$executeRaw`
              UPDATE outbox SET publicado_em = now(), tentativas = tentativas + 1
              WHERE id = ANY(${publicados}::uuid[])`
          }
        }
        if (publicados.length > 0) this.logger.info({ publicados: publicados.length }, 'outbox publicado')
        return publicados.length
      },
      { timeout: 15_000 },
    )
  }
}
