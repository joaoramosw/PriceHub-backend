import type { FastifyInstance } from 'fastify'
import Type from 'typebox'

export type VerificacaoDeSaude = () => Promise<unknown>

const RespostaDeSaude = Type.Object({
  status: Type.Union([Type.Literal('ok'), Type.Literal('degradado')]),
  service: Type.String(),
  uptimeSegundos: Type.Number(),
  checks: Type.Record(Type.String(), Type.Union([Type.Literal('ok'), Type.String()])),
})

async function executarComTimeout(verificacao: VerificacaoDeSaude, ms: number): Promise<'ok' | string> {
  let temporizador: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      verificacao(),
      new Promise((_, rejeitar) => {
        temporizador = setTimeout(() => rejeitar(new Error(`timeout de ${ms}ms`)), ms)
      }),
    ])
    return 'ok'
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro)
  } finally {
    clearTimeout(temporizador)
  }
}

export function registrarHealth(
  app: FastifyInstance,
  servico: string,
  verificacoes: Record<string, VerificacaoDeSaude>,
): void {
  app.get(
    '/health',
    {
      logLevel: 'warn',
      schema: {
        tags: ['health'],
        summary: 'Saúde do serviço e das dependências',
        response: { 200: RespostaDeSaude, 503: RespostaDeSaude },
      },
    },
    async (_request, reply) => {
      const nomes = Object.keys(verificacoes)
      const resultados = await Promise.all(nomes.map((nome) => executarComTimeout(verificacoes[nome]!, 2000)))
      const checks = Object.fromEntries(nomes.map((nome, indice) => [nome, resultados[indice]!]))
      const saudavel = resultados.every((resultado) => resultado === 'ok')
      return reply.code(saudavel ? 200 : 503).send({
        status: saudavel ? 'ok' : 'degradado',
        service: servico,
        uptimeSegundos: Math.round(process.uptime()),
        checks,
      })
    },
  )
}
