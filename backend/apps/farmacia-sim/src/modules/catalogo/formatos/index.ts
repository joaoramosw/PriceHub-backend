import type { FarmaciaId } from '../../../config/env.js'
import { formatoBioFarma } from './biofarma.js'
import { formatoDrogaPopular } from './drogapopular.js'
import { formatoFarmaAzul } from './farmaazul.js'
import type { FormatoDaFarmacia } from './formato.js'

export const formatosPorFarmacia: Record<FarmaciaId, FormatoDaFarmacia> = {
  biofarma: formatoBioFarma,
  farmaazul: formatoFarmaAzul,
  drogapopular: formatoDrogaPopular,
}

export type { FormatoDaFarmacia }
