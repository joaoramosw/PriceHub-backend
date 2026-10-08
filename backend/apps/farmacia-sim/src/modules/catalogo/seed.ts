import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FarmaciaId } from '../../config/env.js'
import type { SeedDaFarmacia } from './produto.js'

const diretorioDeSeeds = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'seed')

export function carregarSeed(farmaciaId: FarmaciaId): SeedDaFarmacia {
  return JSON.parse(readFileSync(path.join(diretorioDeSeeds, `${farmaciaId}.json`), 'utf8')) as SeedDaFarmacia
}
