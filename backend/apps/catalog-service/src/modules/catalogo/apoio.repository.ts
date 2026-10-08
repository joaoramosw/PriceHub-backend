import { gerarId } from '@pricehub/contracts'
import type { Transacao } from '../../plugins/prisma.js'

export class FarmaciasRepository {
  constructor(private readonly db: Transacao) {}

  async garantir(id: string, nome: string): Promise<void> {
    await this.db.farmacia.upsert({ where: { id }, create: { id, nome }, update: { nome } })
  }
}

export type OfertaSemCorrespondencia = {
  farmaciaId: string
  externalId: string
  motivo: string
  payload: unknown
  correlationId: string
}

export class NaoCorrespondidasRepository {
  constructor(private readonly db: Transacao) {}

  async registrar(registro: OfertaSemCorrespondencia): Promise<void> {
    const { farmaciaId, externalId } = registro
    await this.db.ofertaNaoCorrespondida.upsert({
      where: { farmaciaId_externalId: { farmaciaId, externalId } },
      create: { ...registro, id: gerarId(), payload: registro.payload as object },
      update: {
        motivo: registro.motivo,
        payload: registro.payload as object,
        correlationId: registro.correlationId,
        tentativas: { increment: 1 },
      },
    })
  }

  async resolver(farmaciaId: string, externalId: string): Promise<void> {
    await this.db.ofertaNaoCorrespondida.deleteMany({ where: { farmaciaId, externalId } })
  }
}
