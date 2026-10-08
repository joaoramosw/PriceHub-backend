import { PrismaPg } from '@prisma/adapter-pg'
import { type Prisma, PrismaClient } from '../generated/prisma/client.js'

export function criarPrisma(url: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
}

export type Transacao = Prisma.TransactionClient

export type { PrismaClient }
