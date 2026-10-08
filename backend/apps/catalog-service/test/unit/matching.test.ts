import { describe, expect, it } from 'vitest'
import type {
  Medicamento,
  MedicamentosRepository,
} from '../../src/modules/catalogo/medicamentos.repository.js'
import { MatchingService } from '../../src/modules/matching/matching.service.js'
import { normalizarOferta, normalizarPrincipioAtivo } from '../../src/modules/matching/normalizacao.js'
import { ofertasDosSeeds } from '../fixtures/ofertas.js'

class MedicamentosEmMemoria {
  readonly itens: Medicamento[] = []

  async porRegistroMs(registroMs: string) {
    return this.itens.find((item) => item.registroMs === registroMs) ?? null
  }

  async porEan(ean: string) {
    return this.itens.find((item) => item.ean === ean) ?? null
  }

  async porChaveCanonica(chave: string) {
    return this.itens.find((item) => item.chaveCanonica === chave) ?? null
  }

  async criar(medicamento: Medicamento) {
    this.itens.push(medicamento)
    return medicamento
  }

  async atualizar(id: string, alteracao: Partial<Medicamento>) {
    const item = this.itens.find((medicamento) => medicamento.id === id)!
    Object.assign(item, alteracao)
    return item
  }
}

describe('normalização do princípio ativo', () => {
  it.each([
    ['Cloridrato de Metformina', 'metformina'],
    ['METFORMINA', 'metformina'],
    ['Losartana Potássica', 'losartana'],
    ['LOSARTANA POTASSICA', 'losartana'],
    ['Dipirona Monoidratada', 'dipirona'],
    ['DIPIRONA SODICA', 'dipirona'],
    ['Metamizol Sódico', 'dipirona'],
    ['Omeprazol Microgrânulos', 'omeprazol'],
    ['Tadalafila Micronizada', 'tadalafila'],
    ['Simeticona Emulsão', 'simeticona'],
    ['Losartana Potássica 50mg', 'losartana'],
    ['Metformina / Glifage XR', 'metformina'],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarPrincipioAtivo(entrada)).toBe(esperado)
  })

  it('gera a mesma chave canônica para a Losartana das três farmácias', () => {
    const chaves = ofertasDosSeeds()
      .filter((oferta) => oferta.externalId.match(/0002$|LOS/))
      .map((oferta) => normalizarOferta(oferta).chaveCanonica)
    expect(new Set(chaves)).toEqual(new Set(['losartana|50mg|comprimido-revestido|30un']))
  })
})

describe('matching dos seeds', () => {
  it('as 30 ofertas formam exatamente 10 chaves canônicas com 3 farmácias cada', () => {
    const porChave = new Map<string, Set<string>>()
    for (const oferta of ofertasDosSeeds()) {
      const { chaveCanonica } = normalizarOferta(oferta)
      expect(chaveCanonica).not.toBeNull()
      porChave.set(chaveCanonica!, (porChave.get(chaveCanonica!) ?? new Set()).add(oferta.farmaciaId))
    }
    expect(porChave.size).toBe(10)
    for (const farmacias of porChave.values()) expect(farmacias.size).toBe(3)
  })

  it.each([
    ['BioFarma → FarmaAzul → DrogaPopular', ['biofarma', 'farmaazul', 'drogapopular']],
    ['DrogaPopular primeiro (sem registro MS)', ['drogapopular', 'farmaazul', 'biofarma']],
    ['FarmaAzul primeiro (sem categoria)', ['farmaazul', 'drogapopular', 'biofarma']],
  ])('casa 100%% em qualquer ordem de chegada: %s', async (_ordem, farmacias) => {
    const repositorio = new MedicamentosEmMemoria()
    const matching = new MatchingService()
    const ofertas = ofertasDosSeeds().sort(
      (a, b) => farmacias.indexOf(a.farmaciaId) - farmacias.indexOf(b.farmaciaId),
    )
    const estrategias: Record<string, number> = {}
    for (const oferta of ofertas) {
      const resultado = await matching.casar(
        normalizarOferta(oferta),
        repositorio as unknown as MedicamentosRepository,
      )
      expect(resultado.tipo).not.toBe('nao-correspondido')
      const chave = resultado.tipo === 'casado' ? resultado.estrategia : 'novo'
      estrategias[chave] = (estrategias[chave] ?? 0) + 1
    }
    expect(repositorio.itens).toHaveLength(10)
    expect(estrategias.novo).toBe(10)
    for (const medicamento of repositorio.itens) {
      expect(medicamento.registroMs).toMatch(/^\d{13}$/)
      expect(medicamento.categoria).not.toBeNull()
      expect(medicamento.fonteDosDados).toBe('registro')
    }
    const losartana = repositorio.itens.find((item) => item.principioNormalizado === 'losartana')!
    expect(losartana.nome).toBe('Losartana Potássica 50mg')
  })

  it('manda para não correspondidas uma oferta sem forma identificável e sem registro', async () => {
    const repositorio = new MedicamentosEmMemoria()
    const [base] = ofertasDosSeeds().filter((oferta) => oferta.farmaciaId === 'drogapopular')
    const resultado = await new MatchingService().casar(
      normalizarOferta({
        ...base!,
        externalId: 'DP-9999',
        principioAtivo: 'XAROPE DE GUACO',
        forma: 'outro',
      }),
      repositorio as unknown as MedicamentosRepository,
    )
    expect(resultado).toEqual({
      tipo: 'nao-correspondido',
      motivo: expect.stringContaining('forma farmacêutica'),
    })
    expect(repositorio.itens).toHaveLength(0)
  })
})
