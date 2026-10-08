import {
  criarEnvelope,
  type Evento,
  type OfertaColetada,
  type OrigemDeColeta,
  TiposDeEvento,
} from '@pricehub/contracts'
import { type ConexaoRabbitMq, publicarEvento } from '@pricehub/messaging'

export type PublicarOfertaRecebida = (
  oferta: OfertaColetada,
  origem: OrigemDeColeta,
  correlationId: string,
) => Promise<Evento<'ingestao.oferta.recebida'>>

export function criarPublicadorDeOfertaRecebida(conexao: ConexaoRabbitMq): PublicarOfertaRecebida {
  return async (oferta, origem, correlationId) => {
    const evento = criarEnvelope({
      type: TiposDeEvento.ingestaoOfertaRecebida,
      data: { origem, oferta },
      correlationId,
      source: 'ingestion-service',
    })
    await publicarEvento(conexao, evento)
    return evento
  }
}
