import { RecursoNaoEncontrado } from '@pricehub/observability'
import type { FastifyBaseLogger } from 'fastify'
import type { AmbienteDaFarmacia } from '../../config/env.js'
import type { CatalogoRepository } from './catalogo.repository.js'
import type { FormatoDaFarmacia } from './formatos/index.js'
import type { Produto } from './produto.js'
import { carregarSeed } from './seed.js'
import type { EnviarWebhook } from './webhook.js'

export type SituacaoDoWebhook = 'agendado' | 'nao-suportado' | 'sem-segredo'

export class CatalogoService {
  constructor(
    private readonly repository: CatalogoRepository,
    private readonly formato: FormatoDaFarmacia,
    private readonly ambiente: Pick<
      AmbienteDaFarmacia,
      'PHARMACY_ID' | 'INGESTION_URL' | 'WEBHOOK_SECRET' | 'WEBHOOK_TIMEOUT_MS'
    >,
    private readonly enviarWebhook: EnviarWebhook,
  ) {}

  async aplicarSeedSeVazio(logger: FastifyBaseLogger): Promise<void> {
    if ((await this.repository.contar()) > 0) return
    const seed = carregarSeed(this.ambiente.PHARMACY_ID)
    await this.repository.substituirPorSeed(seed.produtos, new Date())
    logger.info({ produtos: seed.produtos.length }, 'seed aplicado')
  }

  async alterarPreco(
    id: number,
    precoCentavos: number,
    correlationId: string,
    logger: FastifyBaseLogger,
  ): Promise<{ anterior: Produto; atual: Produto; webhook: SituacaoDoWebhook }> {
    const anterior = await this.repository.buscar(id)
    if (!anterior) throw new RecursoNaoEncontrado(`produto ${id} não existe`)
    const atual = await this.repository.atualizarPreco(id, precoCentavos, new Date())
    logger.info(
      { produtoId: id, precoAnteriorCentavos: anterior.precoCentavos, precoCentavos },
      'preço alterado na farmácia',
    )
    return { anterior, atual, webhook: this.notificar(atual, correlationId, logger) }
  }

  async resetar(
    correlationId: string,
    logger: FastifyBaseLogger,
  ): Promise<{ produtos: number; alterados: number }> {
    const atuais = new Map(
      (await this.repository.listar()).map((produto) => [produto.id, produto.precoCentavos]),
    )
    const seed = carregarSeed(this.ambiente.PHARMACY_ID)
    await this.repository.substituirPorSeed(seed.produtos, new Date())
    const alterados = (await this.repository.listar()).filter(
      (produto) => atuais.get(produto.id) !== produto.precoCentavos,
    )
    for (const produto of alterados) this.notificar(produto, correlationId, logger)
    logger.info({ alterados: alterados.length }, 'catálogo restaurado ao seed')
    return { produtos: seed.produtos.length, alterados: alterados.length }
  }

  private notificar(produto: Produto, correlationId: string, logger: FastifyBaseLogger): SituacaoDoWebhook {
    if (!this.formato.payloadDeWebhook) return 'nao-suportado'
    if (!this.ambiente.WEBHOOK_SECRET) {
      logger.warn('WEBHOOK_SECRET ausente; webhook não enviado')
      return 'sem-segredo'
    }
    void this.enviarWebhook(
      {
        url: `${this.ambiente.INGESTION_URL}/webhooks/${this.ambiente.PHARMACY_ID}`,
        segredo: this.ambiente.WEBHOOK_SECRET,
        payload: this.formato.payloadDeWebhook(produto),
        correlationId,
        timeoutMs: this.ambiente.WEBHOOK_TIMEOUT_MS,
      },
      logger,
    )
    return 'agendado'
  }
}
