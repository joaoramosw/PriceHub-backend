import type { Medicamento, MedicamentosRepository } from '../catalogo/medicamentos.repository.js'
import type { OfertaNormalizada } from './normalizacao.js'

export type NomeDaEstrategia = 'registro-ms' | 'ean' | 'chave-canonica'

export interface MatchingStrategy {
  readonly nome: NomeDaEstrategia
  encontrar(oferta: OfertaNormalizada, medicamentos: MedicamentosRepository): Promise<Medicamento | null>
}

export class RegistroMsStrategy implements MatchingStrategy {
  readonly nome = 'registro-ms' as const

  async encontrar(oferta: OfertaNormalizada, medicamentos: MedicamentosRepository) {
    return oferta.registroMs ? medicamentos.porRegistroMs(oferta.registroMs) : null
  }
}

export class EanStrategy implements MatchingStrategy {
  readonly nome = 'ean' as const

  async encontrar(oferta: OfertaNormalizada, medicamentos: MedicamentosRepository) {
    return oferta.ean ? medicamentos.porEan(oferta.ean) : null
  }
}

export class ChaveCanonicaStrategy implements MatchingStrategy {
  readonly nome = 'chave-canonica' as const

  async encontrar(oferta: OfertaNormalizada, medicamentos: MedicamentosRepository) {
    return oferta.chaveCanonica ? medicamentos.porChaveCanonica(oferta.chaveCanonica) : null
  }
}

export const estrategiasPadrao: readonly MatchingStrategy[] = [
  new RegistroMsStrategy(),
  new EanStrategy(),
  new ChaveCanonicaStrategy(),
]
