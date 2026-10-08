import { TiposDeEvento } from '@pricehub/contracts'
import { type ConexaoRabbitMq, consumir } from '@pricehub/messaging'
import type { ProcessadorDeOfertas } from '../../modules/catalogo/processador-de-ofertas.service.js'
import type { OutboxRelay } from '../../modules/outbox/outbox.relay.js'

export const filaDeOfertasRecebidas = 'catalog.ingestao-oferta-recebida'

export async function iniciarConsumidorDeOfertasRecebidas(
  conexao: ConexaoRabbitMq,
  processador: ProcessadorDeOfertas,
  relay: OutboxRelay,
  prefetch: number,
): Promise<void> {
  await consumir(conexao, {
    fila: filaDeOfertasRecebidas,
    tipos: [TiposDeEvento.ingestaoOfertaRecebida],
    prefetch,
    tratar: async (evento, { logger }) => {
      const inicio = performance.now()
      const resultado = await processador.processar(evento, logger)
      if (resultado.duplicado) {
        logger.info('evento duplicado ignorado')
        return
      }
      if (resultado.eventosGerados > 0) relay.acordar()
      const nivel = resultado.situacao === 'preco-inalterado' ? 'debug' : 'info'
      logger[nivel](
        {
          farmaciaId: evento.data.oferta.farmaciaId,
          externalId: evento.data.oferta.externalId,
          origem: evento.data.origem,
          situacao: resultado.situacao,
          estrategia: resultado.estrategia,
          medicamentoId: resultado.medicamentoId,
          precoCentavos: evento.data.oferta.precoCentavos,
          duracaoMs: Math.round(performance.now() - inicio),
        },
        'oferta processada',
      )
    },
  })
}
