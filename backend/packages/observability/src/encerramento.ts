import type { Logger } from 'pino'

export type TarefaDeEncerramento = () => Promise<unknown> | unknown

export function encerrarComGraca(
  logger: Pick<Logger, 'info' | 'error'>,
  tarefas: TarefaDeEncerramento[],
): void {
  let encerrando = false
  const encerrar = async (sinal: string) => {
    if (encerrando) return
    encerrando = true
    logger.info({ sinal }, 'encerrando serviço')
    for (const tarefa of tarefas) {
      try {
        await tarefa()
      } catch (erro) {
        logger.error({ err: erro }, 'falha ao encerrar recurso')
      }
    }
    process.exit(0)
  }
  process.once('SIGTERM', () => void encerrar('SIGTERM'))
  process.once('SIGINT', () => void encerrar('SIGINT'))
}
