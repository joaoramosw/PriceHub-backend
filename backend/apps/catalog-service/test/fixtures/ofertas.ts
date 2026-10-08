import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { OfertaColetada } from '@pricehub/contracts'

const diretorio = path.dirname(fileURLToPath(import.meta.url))

export function ofertasDosSeeds(): OfertaColetada[] {
  return JSON.parse(readFileSync(path.join(diretorio, 'ofertas-coletadas.json'), 'utf8')) as OfertaColetada[]
}
