import { TiposDeEvento } from '@pricehub/contracts'
import { type ConexaoRabbitMq, consumir } from '@pricehub/messaging'
import type { ProjecaoDeComparacao } from '../../modules/comparacao/projecao.service.js'
import type { HubDeEventos } from '../../plugins/sse.js'

export const filaDeEventosDoCatalogo = 'query.catalogo-eventos'

export async function iniciarConsumidorDoCatalogo(
  conexao: ConexaoRabbitMq,
  projecao: ProjecaoDeComparacao,
  hub: HubDeEventos,
  opcoes: { prefetch: number; atrasoBaseMs: number },
): Promise<void> {
  await consumir(conexao, {
    fila: filaDeEventosDoCatalogo,
    tipos: [
      TiposDeEvento.catalogoMedicamentoCadastrado,
      TiposDeEvento.catalogoMedicamentoAtualizado,
      TiposDeEvento.catalogoOfertaAtualizada,
    ],
    prefetch: opcoes.prefetch,
    atrasoBaseMs: opcoes.atrasoBaseMs,
    tratar: async (evento, { logger }) => {
      const resultado = await projecao.aplicar(evento)
      if (resultado.situacao !== 'aplicado') {
        logger.info({ situacao: resultado.situacao }, 'evento não alterou o read model')
        return
      }
      hub.publicar(resultado.notificacao)
      const latenciaDesdeOrigemMs = Date.now() - Date.parse(evento.occurredAt)
      logger.info(
        {
          sse: resultado.notificacao.evento,
          clientesSse: hub.conectados,
          latenciaDesdeOutboxMs: latenciaDesdeOrigemMs,
        },
        'read model atualizado',
      )
    },
  })
}
