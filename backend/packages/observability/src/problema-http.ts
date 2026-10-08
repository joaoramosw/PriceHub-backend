import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

export const tipoProblemJson = 'application/problem+json'

export type Problema = {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
  correlationId?: string
  errors?: unknown
}

export class ProblemaHttp extends Error {
  constructor(
    readonly status: number,
    readonly titulo: string,
    readonly detalhe?: string,
    readonly tipo = 'about:blank',
    readonly extras: Record<string, unknown> = {},
  ) {
    super(detalhe ?? titulo)
    this.name = 'ProblemaHttp'
  }
}

export class RecursoNaoEncontrado extends ProblemaHttp {
  constructor(detalhe: string) {
    super(404, 'Recurso não encontrado', detalhe, 'https://pricehub.dev/problemas/nao-encontrado')
  }
}

export class NaoAutorizado extends ProblemaHttp {
  constructor(detalhe: string) {
    super(401, 'Não autorizado', detalhe, 'https://pricehub.dev/problemas/nao-autorizado')
  }
}

export class RequisicaoInvalida extends ProblemaHttp {
  constructor(detalhe: string, extras: Record<string, unknown> = {}) {
    super(400, 'Requisição inválida', detalhe, 'https://pricehub.dev/problemas/requisicao-invalida', extras)
  }
}

function responder(reply: FastifyReply, request: FastifyRequest, problema: Problema) {
  return reply
    .code(problema.status)
    .type(tipoProblemJson)
    .send({ ...problema, instance: request.url, correlationId: request.id })
}

function problemaDe(erro: FastifyError | ProblemaHttp): Problema {
  if (erro instanceof ProblemaHttp) {
    return { type: erro.tipo, title: erro.titulo, status: erro.status, detail: erro.detalhe, ...erro.extras }
  }
  if (erro.validation) {
    return {
      type: 'https://pricehub.dev/problemas/requisicao-invalida',
      title: 'Requisição inválida',
      status: 400,
      detail: erro.message,
      errors: erro.validation,
    }
  }
  const status = erro.statusCode && erro.statusCode >= 400 && erro.statusCode < 500 ? erro.statusCode : 500
  return status === 500
    ? { type: 'about:blank', title: 'Erro interno', status }
    : { type: 'about:blank', title: erro.message, status }
}

export function registrarProblemJson(app: FastifyInstance): void {
  app.setErrorHandler((erro: FastifyError | ProblemaHttp, request, reply) => {
    const problema = problemaDe(erro)
    if (problema.status >= 500) request.log.error({ err: erro }, 'erro inesperado')
    else request.log.info({ status: problema.status, detail: problema.detail }, 'requisição recusada')
    return responder(reply, request, problema)
  })
  app.setNotFoundHandler((request, reply) =>
    responder(reply, request, {
      type: 'https://pricehub.dev/problemas/nao-encontrado',
      title: 'Recurso não encontrado',
      status: 404,
      detail: `${request.method} ${request.url} não existe`,
    }),
  )
}
