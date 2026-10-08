import { PrismaPg } from '@prisma/adapter-pg'
import { type Prisma, PrismaClient } from '../generated/prisma/client.js'

export function criarPrisma(url: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
}

export type Transacao = Prisma.TransactionClient

export function ehConflitoTransitorio(erro: unknown): boolean {
  const codigo = (erro as { code?: unknown } | null)?.code
  const mensagem = erro instanceof Error ? erro.message : ''
  return (
    codigo === 'P2002' ||
    codigo === 'P2034' ||
    /unique constraint|could not serialize|deadlock detected/i.test(mensagem)
  )
}

export type { PrismaClient }
