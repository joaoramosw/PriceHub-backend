import { describe, expect, it } from 'vitest'
import {
  descreverApresentacao,
  descreverConcentracao,
  normalizarBusca,
} from '../../src/modules/comparacao/apresentacao.js'
import { paraItem } from '../../src/modules/comparacao/comparacao.repository.js'
import { padroesDeOrigem } from '../../src/plugins/cors.js'

describe('apresentação', () => {
  it('descreve a embalagem a partir do modelo canônico', () => {
    expect(descreverApresentacao('comprimido revestido', { valor: 30, unidade: 'unidade' })).toBe(
      '30 comprimidos revestidos',
    )
    expect(descreverApresentacao('gotas', { valor: 20, unidade: 'ml' })).toBe('Frasco 20ml (gotas)')
    expect(descreverConcentracao({ valor: 2.5, unidade: 'mg' })).toBe('2,5mg')
  })

  it('normaliza a busca sem acentos e sem caixa', () => {
    expect(normalizarBusca('  Losartana   POTÁSSICA ')).toBe('losartana potassica')
  })
})

describe('agregados', () => {
  it('calcula a economia máxima entre o maior e o menor preço', () => {
    const item = paraItem({
      medicamentoId: '01926b1c-0000-7000-8000-000000000001',
      nome: 'Losartana Potássica 50mg',
      principioAtivo: 'Losartana Potássica',
      concentracao: '50mg',
      apresentacao: '30 comprimidos revestidos',
      categoria: null,
      menorPrecoCentavos: 749,
      maiorPrecoCentavos: 1150,
      qtdFarmacias: 3,
      atualizadoEm: new Date('2026-10-08T00:00:00Z'),
    })
    expect(item.economiaMaximaCentavos).toBe(401)
  })
})

describe('CORS', () => {
  it('aceita qualquer porta de localhost e recusa outros domínios', () => {
    const padroes = padroesDeOrigem('http://localhost:*,http://127.0.0.1:*')
    const aceita = (origem: string) => padroes.some((padrao) => padrao.test(origem))
    expect(aceita('http://localhost:5500')).toBe(true)
    expect(aceita('http://127.0.0.1:8080')).toBe(true)
    expect(aceita('http://localhost.evil.com:80')).toBe(false)
    expect(aceita('https://pricehub.com')).toBe(false)
  })
})
