import type { OrigemDeColeta } from '@pricehub/contracts'
import type { PrismaClient } from '../../plugins/prisma.js'

export type NovaColeta = {
  farmaciaId: string
  origem: OrigemDeColeta
  payload: unknown
  correlationId: string
}

export type ColetaRegistrada = {
  id: string
  farmaciaId: string
  origem: string
  correlationId: string
  ofertas: number
  recebidoEm: Date
}

export class ColetasRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async registrar(coleta: NovaColeta): Promise<string> {
    const { id } = await this.prisma.coletaBruta.create({
      data: { ...coleta, payload: coleta.payload as object },
      select: { id: true },
    })
    return id
  }

  async registrarQuantidadeDeOfertas(id: string, ofertas: number): Promise<void> {
    await this.prisma.coletaBruta.update({ where: { id }, data: { ofertas } })
  }

  async listarRecentes(farmaciaId: string | undefined, limite: number): Promise<ColetaRegistrada[]> {
    return this.prisma.coletaBruta.findMany({
      where: farmaciaId ? { farmaciaId } : {},
      orderBy: { recebidoEm: 'desc' },
      take: limite,
      select: {
        id: true,
        farmaciaId: true,
        origem: true,
        correlationId: true,
        ofertas: true,
        recebidoEm: true,
      },
    })
  }

  async verificarConexao(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`
  }
}
