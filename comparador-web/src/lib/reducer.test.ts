import { describe, expect, it } from 'vitest'
import type { AtualizacaoOferta, Medicamento } from '../types'
import { reduzirEstado } from './reducer'

const medicamento: Medicamento = {
  id: 'med-2',
  nome: 'Losartana Potássica',
  principioAtivo: 'Losartana',
  concentracao: '50mg',
  dosagem: '50mg',
  apresentacao: '30 comprimidos',
  slug: 'losartana',
  categoria: null,
  laboratorio: null,
  registroMS: null,
  tarja: null,
  tarjaTipo: 'vermelha',
  imagem: null,
  descricao: null,
  indicacao: null,
  modoDeUso: null,
  contraindicacao: null,
  avaliacao: null,
  avaliacoesTotal: null,
  farmaciaMaisBarata: 'DrogaPopular Express',
  menorPrecoCentavos: 749,
  maiorPrecoCentavos: 1150,
  qtdFarmacias: 3,
  economiaMaximaCentavos: 401,
  atualizadoEm: '2026-10-22T00:00:00.000Z',
}

const atualizacao: AtualizacaoOferta = {
  medicamentoId: 'med-2',
  nome: 'Losartana Potássica',
  farmaciaId: 'farmaazul',
  farmaciaNome: 'FarmaAzul Confiança',
  precoAnteriorCentavos: 890,
  precoAtualCentavos: 720,
  menorPrecoCentavos: 720,
  maiorPrecoCentavos: 1150,
  qtdFarmacias: 3,
  farmaciaMaisBarata: 'FarmaAzul Confiança',
  ofertas: [],
  atualizadoEm: '2026-10-22T00:01:00.000Z',
  correlationId: 'corr',
  eventId: 'evt',
}

describe('reducer de atualizações SSE', () => {
  it('atualiza a menor oferta e anuncia a farmácia mais barata', () => {
    const estado = reduzirEstado(
      { itens: [medicamento], alterado: null, anuncio: '' },
      { type: 'oferta', dados: atualizacao },
    )
    expect(estado.itens[0]?.menorPrecoCentavos).toBe(720)
    expect(estado.itens[0]?.farmaciaMaisBarata).toBe('FarmaAzul Confiança')
    expect(estado.anuncio).toContain('R$ 7,20')
    expect(estado.alterado).toBe('med-2')
  })
})
