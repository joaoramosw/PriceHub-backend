import { criarEnvelope, type DadosDoEvento, type Evento, type TipoDeEvento } from '@pricehub/contracts'
import type { Transacao } from '../../plugins/prisma.js'

export const origemDosEventos = 'catalog-service'

export class OutboxRepository {
  constructor(private readonly db: Transacao) {}

  async registrar<Tipo extends TipoDeEvento>(
    type: Tipo,
    data: DadosDoEvento<Tipo>,
    correlationId: string,
  ): Promise<Evento<Tipo>> {
    const evento = criarEnvelope({ type, data, correlationId, source: origemDosEventos })
    await this.db.outbox.create({
      data: { id: evento.eventId, tipo: evento.type, payload: evento as object },
    })
    return evento
  }
}
