import { hostname } from 'node:os'
import { type Logger, type LoggerOptions, pino } from 'pino'

export type OpcoesDeLogger = {
  servico: string
  nivel?: string
}

export function opcoesDeLogger({ servico, nivel = 'info' }: OpcoesDeLogger): LoggerOptions {
  return {
    level: nivel,
    base: { service: servico, instancia: hostname() },
    timestamp: pino.stdTimeFunctions.isoTime,
    messageKey: 'msg',
    formatters: {
      level: (label) => ({ level: label }),
    },
    redact: {
      paths: ['req.headers.authorization', 'req.headers["x-pricehub-signature"]', '*.password', '*.senha'],
      remove: true,
    },
  }
}

export function criarLogger(opcoes: OpcoesDeLogger): Logger {
  return pino(opcoesDeLogger(opcoes))
}

export type { Logger }
