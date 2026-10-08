import { describe, expect, it } from 'vitest'
import {
  ContratoInvalidoError,
  criarEnvelope,
  ehValido,
  OfertaColetada,
  TiposDeEvento,
  validarEvento,
} from '../../src/index.js'

const ofertaValida: OfertaColetada = {
  farmaciaId: 'farmaazul',
  farmaciaNome: 'FarmaAzul Confiança',
  externalId: 'FA-LOS-50',
  nome: 'Losartana Potássica 50mg 30 comp rev',
  principioAtivo: 'Losartana Potássica',
  concentracao: { valor: 50, unidade: 'mg' },
  forma: 'comprimido revestido',
  quantidade: { valor: 30, unidade: 'unidade' },
  fabricante: 'Medley',
  registroMs: '1018104210023',
  ean: null,
  categoria: 'Hipertensão & Coração',
  precoCentavos: 890,
  atualizadoNaOrigemEm: '2026-10-08T16:00:00.000Z',
  coletadoEm: '2026-10-08T16:00:01.000Z',
}

describe('OfertaColetada', () => {
  it('aceita uma oferta completa', () => {
    expect(ehValido(OfertaColetada, ofertaValida)).toBe(true)
  })

  it('rejeita preço fracionado, unidade desconhecida e campo extra', () => {
    expect(ehValido(OfertaColetada, { ...ofertaValida, precoCentavos: 8.9 })).toBe(false)
    expect(ehValido(OfertaColetada, { ...ofertaValida, concentracao: { valor: 50, unidade: 'kg' } })).toBe(
      false,
    )
    expect(ehValido(OfertaColetada, { ...ofertaValida, preco: 8.9 })).toBe(false)
  })

  it('rejeita registro MS com máscara', () => {
    expect(ehValido(OfertaColetada, { ...ofertaValida, registroMs: 'MS 1.0181.0421.002-3' })).toBe(false)
  })
})

describe('envelope', () => {
  it('cria envelope com uuid v7, versão do contrato e data ISO', () => {
    const evento = criarEnvelope({
      type: TiposDeEvento.ingestaoOfertaRecebida,
      data: { origem: 'webhook', oferta: ofertaValida },
      correlationId: 'corr-1',
      source: 'ingestion-service',
    })
    expect(evento.eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(evento.version).toBe(1)
    expect(new Date(evento.occurredAt).toISOString()).toBe(evento.occurredAt)
    expect(validarEvento(evento).type).toBe('ingestao.oferta.recebida')
  })

  it('valida os quatro eventos do catálogo', () => {
    const medicamentoId = '01926b1c-0000-7000-8000-000000000001'
    const eventos = [
      criarEnvelope({
        type: TiposDeEvento.catalogoMedicamentoCadastrado,
        data: {
          medicamentoId,
          nome: 'Losartana Potássica 50mg',
          principioAtivo: 'losartana',
          concentracao: { valor: 50, unidade: 'mg' },
          forma: 'comprimido revestido',
          quantidade: { valor: 30, unidade: 'unidade' },
          categoria: null,
        },
        correlationId: 'c',
        source: 'catalog-service',
      }),
      criarEnvelope({
        type: TiposDeEvento.catalogoOfertaAtualizada,
        data: {
          ofertaId: '01926b1c-0000-7000-8000-000000000002',
          medicamentoId,
          farmaciaId: 'farmaazul',
          farmaciaNome: 'FarmaAzul Confiança',
          precoAnteriorCentavos: 890,
          precoAtualCentavos: 720,
          atualizadoEm: '2026-10-08T16:00:00.000Z',
        },
        correlationId: 'c',
        source: 'catalog-service',
      }),
      criarEnvelope({
        type: TiposDeEvento.catalogoOfertaNaoCorrespondida,
        data: { farmaciaId: 'drogapopular', externalId: 'DP-99', motivo: 'concentracao ausente', oferta: {} },
        correlationId: 'c',
        source: 'catalog-service',
      }),
    ]
    for (const evento of eventos) expect(() => validarEvento(evento)).not.toThrow()
  })

  it('rejeita tipo desconhecido, versão errada, data inválida e tipo não aceito', () => {
    const base = criarEnvelope({
      type: TiposDeEvento.ingestaoOfertaRecebida,
      data: { origem: 'sync', oferta: ofertaValida },
      correlationId: 'c',
      source: 's',
    })
    expect(() => validarEvento({ ...base, type: 'x.y.z' })).toThrow(ContratoInvalidoError)
    expect(() => validarEvento({ ...base, version: 2 })).toThrow(/versão 2/)
    expect(() => validarEvento({ ...base, data: { origem: 'fax', oferta: ofertaValida } })).toThrow(
      ContratoInvalidoError,
    )
    expect(() => validarEvento(base, ['catalogo.oferta.atualizada'])).toThrow(/não aceito/)
    expect(() => validarEvento({ ...base, eventId: 'nao-e-uuid' })).toThrow(ContratoInvalidoError)
  })
})
