import type { AppPriceHub } from '@pricehub/observability'
import type { FarmaciaId } from '../../../config/env.js'
import type { CatalogoRepository } from '../catalogo.repository.js'
import type { Produto } from '../produto.js'

export type FormatoDaFarmacia = {
  farmaciaId: FarmaciaId
  nome: string
  registrarRotas: (app: AppPriceHub, repository: CatalogoRepository) => void
  payloadDeWebhook?: (produto: Produto) => unknown
}
