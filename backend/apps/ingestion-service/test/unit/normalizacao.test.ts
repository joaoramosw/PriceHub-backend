import { describe, expect, it } from 'vitest'
import { interpretarDescricaoDrogaPopular } from '../../src/connectors/drogapopular/descricao-parser.js'
import {
  dataBrasileiraParaIso,
  interpretarApresentacao,
  interpretarConcentracao,
  interpretarForma,
  normalizarRegistroMs,
  principioSemDose,
  reaisParaCentavos,
  textoDeReaisParaCentavos,
} from '../../src/connectors/normalizacao.js'
import { assinar, assinaturaValida } from '../../src/modules/webhooks/assinatura.js'

describe('normalização', () => {
  it('registro MS com e sem máscara vira só dígitos', () => {
    expect(normalizarRegistroMs('MS 1.0181.0421.002-3')).toBe('1018104210023')
    expect(normalizarRegistroMs('1018104210023')).toBe('1018104210023')
    expect(normalizarRegistroMs('')).toBeNull()
    expect(normalizarRegistroMs('123')).toBeNull()
  })

  it.each([
    ['50mg', { valor: 50, unidade: 'mg' }],
    ['500mg/ml', { valor: 500, unidade: 'mg/ml' }],
    ['500MG/ML', { valor: 500, unidade: 'mg/ml' }],
    ['2,5 mg', { valor: 2.5, unidade: 'mg' }],
    ['1g', { valor: 1, unidade: 'g' }],
  ])('concentração %s', (texto, esperado) => {
    expect(interpretarConcentracao(texto)).toEqual(esperado)
  })

  it.each([
    ['30 comprimidos revestidos', 'comprimido revestido'],
    ['comprimido de liberação prolongada', 'comprimido liberacao prolongada'],
    ['COMP LIB PROL', 'comprimido liberacao prolongada'],
    ['28 cápsulas duras gastro-resistentes', 'capsula'],
    ['solução oral em gotas', 'gotas'],
    ['GTS FR', 'gotas'],
    ['C/12 COMP', 'comprimido'],
    ['suspensão oral', 'suspensao'],
    ['pomada', 'outro'],
  ])('forma "%s" → %s', (texto, esperado) => {
    expect(interpretarForma(texto)).toBe(esperado)
  })

  it('apresentação da BioFarma', () => {
    expect(interpretarApresentacao('Frasco conta-gotas com 15ml')).toEqual({
      forma: 'gotas',
      quantidade: { valor: 15, unidade: 'ml' },
    })
    expect(interpretarApresentacao('12 comprimidos')).toEqual({
      forma: 'comprimido',
      quantidade: { valor: 12, unidade: 'unidade' },
    })
  })

  it('preços', () => {
    expect(reaisParaCentavos(11.5)).toBe(1150)
    expect(reaisParaCentavos(14.9)).toBe(1490)
    expect(textoDeReaisParaCentavos('7,49')).toBe(749)
    expect(textoDeReaisParaCentavos('1.234,56')).toBe(123456)
    expect(() => textoDeReaisParaCentavos('abc')).toThrow()
  })

  it('datas e princípio ativo', () => {
    expect(dataBrasileiraParaIso('08/10/2026 10:30')).toBe('2026-10-08T13:30:00.000Z')
    expect(dataBrasileiraParaIso('2026-10-08')).toBeNull()
    expect(principioSemDose('Cloridrato de Metformina 500mg')).toBe('Cloridrato de Metformina')
  })
})

describe('parser da descrição da DrogaPopular', () => {
  it.each([
    [
      'LOSARTANA POTASSICA 50MG C/30 COMP REV',
      'LOSARTANA POTASSICA',
      { valor: 50, unidade: 'mg' },
      'comprimido revestido',
      { valor: 30, unidade: 'unidade' },
    ],
    [
      'DIPIRONA SODICA 500MG/ML GTS FR 20ML',
      'DIPIRONA SODICA',
      { valor: 500, unidade: 'mg/ml' },
      'gotas',
      { valor: 20, unidade: 'ml' },
    ],
    [
      'METFORMINA 500MG C/30 COMP LIB PROL',
      'METFORMINA',
      { valor: 500, unidade: 'mg' },
      'comprimido liberacao prolongada',
      { valor: 30, unidade: 'unidade' },
    ],
    [
      'OMEPRAZOL 20MG C/28 CAPS',
      'OMEPRAZOL',
      { valor: 20, unidade: 'mg' },
      'capsula',
      { valor: 28, unidade: 'unidade' },
    ],
  ])('%s', (descricao, principioAtivo, concentracao, forma, quantidade) => {
    expect(interpretarDescricaoDrogaPopular(descricao)).toEqual({
      principioAtivo,
      concentracao,
      forma,
      quantidade,
    })
  })

  it('falha sem quantidade', () => {
    expect(() => interpretarDescricaoDrogaPopular('XAROPE GUACO 10MG')).toThrow(/quantidade ausente/)
  })
})

describe('assinatura HMAC', () => {
  it('aceita a assinatura correta e recusa adulterações', () => {
    const corpo = Buffer.from('{"type":"price.updated"}')
    const assinatura = assinar(corpo, 'segredo-abc')
    expect(assinaturaValida(corpo, assinatura, 'segredo-abc')).toBe(true)
    expect(assinaturaValida(corpo, assinatura, 'outro-segredo')).toBe(false)
    expect(assinaturaValida(Buffer.from('{"type":"x"}'), assinatura, 'segredo-abc')).toBe(false)
    expect(assinaturaValida(corpo, undefined, 'segredo-abc')).toBe(false)
    expect(assinaturaValida(corpo, 'sha256=curta', 'segredo-abc')).toBe(false)
  })
})
