import type { IncomingMessage, ServerResponse } from 'node:http'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { type TypeBoxTypeProvider, TypeBoxValidatorCompiler } from '@fastify/type-provider-typebox'
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  LogController,
  type RawServerDefault,
} from 'fastify'
import { cabecalhoCorrelationId, lerCorrelationId } from './correlation-id.js'
import { opcoesDeLogger } from './logger.js'
import { registrarProblemJson } from './problema-http.js'

export type AppPriceHub = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse,
  FastifyBaseLogger,
  TypeBoxTypeProvider
>

export type OpcoesDeApp = {
  servico: string
  titulo: string
  descricao: string
  versao?: string
  nivelDeLog?: string
  logger?: boolean
  documentacao?: boolean
}

export async function criarApp(opcoes: OpcoesDeApp): Promise<AppPriceHub> {
  const app = Fastify({
    logger:
      opcoes.logger === false ? false : opcoesDeLogger({ servico: opcoes.servico, nivel: opcoes.nivelDeLog }),
    genReqId: lerCorrelationId,
    logController: new LogController({
      requestIdLogLabel: 'correlationId',
      disableRequestLogging: (request) => request.url === '/health',
    }),
    trustProxy: true,
  })
    .setValidatorCompiler(TypeBoxValidatorCompiler)
    .withTypeProvider<TypeBoxTypeProvider>()

  app.addHook('onRequest', async (request, reply) => {
    reply.header(cabecalhoCorrelationId, request.id)
  })

  registrarProblemJson(app)

  if (opcoes.documentacao !== false) {
    await app.register(swagger, {
      openapi: {
        openapi: '3.1.0',
        info: { title: opcoes.titulo, description: opcoes.descricao, version: opcoes.versao ?? '1.0.0' },
      },
    })
    await app.register(swaggerUi, { routePrefix: '/docs' })
  }

  return app
}
