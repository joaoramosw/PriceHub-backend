import { v7 as uuidv7 } from 'uuid'
import {
  type DadosDoEvento,
  type Evento,
  EventosPorTipo,
  type TipoDeEvento,
} from './eventos/catalogo-de-eventos.js'

export function gerarId(): string {
  return uuidv7()
}

export function criarEnvelope<Tipo extends TipoDeEvento>(parametros: {
  type: Tipo
  data: DadosDoEvento<Tipo>
  correlationId: string
  source: string
  occurredAt?: Date
  eventId?: string
}): Evento<Tipo> {
  return {
    eventId: parametros.eventId ?? gerarId(),
    type: parametros.type,
    version: EventosPorTipo[parametros.type].version,
    occurredAt: (parametros.occurredAt ?? new Date()).toISOString(),
    correlationId: parametros.correlationId,
    source: parametros.source,
    data: parametros.data,
  } as Evento<Tipo>
}
