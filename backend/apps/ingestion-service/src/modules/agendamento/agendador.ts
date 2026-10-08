import type { FastifyBaseLogger } from 'fastify'

export type TarefaAgendada = () => Promise<unknown>

export class Agendador {
  private readonly temporizadores: NodeJS.Timeout[] = []
  private readonly emExecucao = new Set<string>()

  constructor(private readonly logger: FastifyBaseLogger) {}

  agendar(nome: string, intervaloMs: number, tarefa: TarefaAgendada, executarAgora = false): void {
    const executar = async () => {
      if (this.emExecucao.has(nome)) {
        this.logger.debug({ tarefa: nome }, 'execução anterior ainda em andamento; pulando')
        return
      }
      this.emExecucao.add(nome)
      try {
        await tarefa()
      } catch (erro) {
        this.logger.warn({ err: erro, tarefa: nome }, 'tarefa agendada falhou')
      } finally {
        this.emExecucao.delete(nome)
      }
    }
    this.temporizadores.push(setInterval(() => void executar(), intervaloMs))
    if (executarAgora) void executar()
    this.logger.info({ tarefa: nome, intervaloMs }, 'tarefa agendada')
  }

  parar(): void {
    for (const temporizador of this.temporizadores) clearInterval(temporizador)
    this.temporizadores.length = 0
  }
}
