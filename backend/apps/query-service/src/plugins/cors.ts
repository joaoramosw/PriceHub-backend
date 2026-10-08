import cors from '@fastify/cors'
import type { AppPriceHub } from '@pricehub/observability'

export function padroesDeOrigem(configuracao: string): RegExp[] {
  return configuracao
    .split(',')
    .map((padrao) => padrao.trim())
    .filter(Boolean)
    .map((padrao) => new RegExp(`^${padrao.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`))
}

export async function registrarCors(app: AppPriceHub, configuracao: string): Promise<void> {
  const padroes = padroesDeOrigem(configuracao)
  await app.register(cors, {
    origin: (origem, concluir) => {
      concluir(null, !origem || padroes.some((padrao) => padrao.test(origem)))
    },
    methods: ['GET', 'HEAD', 'OPTIONS'],
    exposedHeaders: ['x-correlation-id'],
  })
}
