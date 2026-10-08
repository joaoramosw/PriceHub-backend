import { ehValido, OfertaColetada } from '@pricehub/contracts'
import { describe, expect, it } from 'vitest'
import { BioFarmaConnector } from '../../src/connectors/biofarma/biofarma.connector.js'
import { DrogaPopularConnector } from '../../src/connectors/drogapopular/drogapopular.connector.js'
import { FarmaAzulConnector } from '../../src/connectors/farmaazul/farmaazul.connector.js'
import { PayloadInvalidoError } from '../../src/connectors/pharmacy-connector.js'
import { buscarJsonDeFixtures, fixture } from '../fixtures/carregar.js'

const buscarJson = buscarJsonDeFixtures({
  '/api/produtos': 'biofarma-catalogo',
  '/v1/catalogo?page=1&page_size=5': 'farmaazul-catalogo-p1',
  '/v1/catalogo?page=2&page_size=5': 'farmaazul-catalogo-p2',
  '/legacy/precos.json': 'drogapopular-precos',
})

const biofarma = new BioFarmaConnector('http://biofarma', buscarJson)
const farmaazul = new FarmaAzulConnector('http://farmaazul', buscarJson, 5)
const drogapopular = new DrogaPopularConnector('http://drogapopular', buscarJson)

describe('os 30 itens dos seeds viram OfertaColetada válidas', () => {
  it.each([
    ['biofarma', biofarma],
    ['farmaazul', farmaazul],
    ['drogapopular', drogapopular],
  ])('%s', async (_nome, connector) => {
    const paginas = await connector.baixarCatalogo()
    const { ofertas, descartados } = connector.converterCatalogo(paginas)
    expect(descartados).toEqual([])
    expect(ofertas).toHaveLength(10)
    for (const oferta of ofertas) expect(ehValido(OfertaColetada, oferta)).toBe(true)
  })
})

describe('padronização da Losartana nas três farmácias', () => {
  it('produz os mesmos atributos canônicos a partir de formatos diferentes', async () => {
    const [bio, azul, popular] = await Promise.all([
      biofarma.buscarCatalogo(),
      farmaazul.buscarCatalogo(),
      drogapopular.buscarCatalogo(),
    ])
    const losartana = [bio[1]!, azul[1]!, popular[1]!]
    for (const oferta of losartana) {
      expect(oferta.concentracao).toEqual({ valor: 50, unidade: 'mg' })
      expect(oferta.forma).toBe('comprimido revestido')
      expect(oferta.quantidade).toEqual({ valor: 30, unidade: 'unidade' })
    }
    expect(losartana.map((oferta) => oferta.precoCentavos)).toEqual([1150, 890, 749])
    expect(losartana.map((oferta) => oferta.registroMs)).toEqual(['1018104210023', '1018104210023', null])
    expect(losartana.map((oferta) => oferta.externalId)).toEqual(['BIO-0002', 'FA-LOS-50', 'DP-0002'])
    expect(losartana.map((oferta) => oferta.principioAtivo)).toEqual([
      'Losartana Potássica',
      'Losartana Potássica',
      'LOSARTANA POTASSICA',
    ])
  })

  it('interpreta frascos em gotas com concentração em mg/ml e volume em ml', async () => {
    const [bio, azul, popular] = await Promise.all([
      biofarma.buscarCatalogo(),
      farmaazul.buscarCatalogo(),
      drogapopular.buscarCatalogo(),
    ])
    for (const dipirona of [bio[2]!, azul[2]!, popular[2]!]) {
      expect(dipirona).toMatchObject({
        concentracao: { valor: 500, unidade: 'mg/ml' },
        forma: 'gotas',
        quantidade: { valor: 20, unidade: 'ml' },
      })
    }
  })

  it('reconhece liberação prolongada e cápsulas', async () => {
    const [bio, azul, popular] = await Promise.all([
      biofarma.buscarCatalogo(),
      farmaazul.buscarCatalogo(),
      drogapopular.buscarCatalogo(),
    ])
    for (const ofertas of [bio, azul, popular]) {
      expect(ofertas[0]!.forma).toBe('comprimido liberacao prolongada')
      expect(ofertas[3]!.forma).toBe('capsula')
      expect(ofertas[3]!.quantidade).toEqual({ valor: 28, unidade: 'unidade' })
    }
  })
})

describe('webhooks', () => {
  it('BioFarma converte preco_alterado de reais para centavos', () => {
    const [oferta] = biofarma.converterWebhook(fixture('biofarma-webhook'))
    expect(oferta).toMatchObject({ externalId: 'BIO-0002', precoCentavos: 990, farmaciaId: 'biofarma' })
  })

  it('FarmaAzul converte price.updated', () => {
    const [oferta] = farmaazul.converterWebhook(fixture('farmaazul-webhook'))
    expect(oferta).toMatchObject({ externalId: 'FA-LOS-50', precoCentavos: 720, registroMs: '1018104210023' })
  })

  it('ignora eventos desconhecidos e recusa payload fora do contrato', () => {
    expect(biofarma.converterWebhook({ evento: 'estoque_alterado', produto: {} })).toEqual([])
    expect(() => farmaazul.converterWebhook({ data: {} })).toThrow(PayloadInvalidoError)
    expect(() => biofarma.converterWebhook({ evento: 'preco_alterado', produto: { sku: 1 } })).toThrow(
      PayloadInvalidoError,
    )
    expect(() => drogapopular.converterWebhook({})).toThrow(PayloadInvalidoError)
  })
})

describe('FarmaAzul paginado', () => {
  it('percorre todas as páginas', async () => {
    const paginas = await farmaazul.baixarCatalogo()
    expect(paginas).toHaveLength(2)
  })
})

describe('DrogaPopular legado', () => {
  it('descarta item cuja descrição não traz concentração, sem perder os demais', () => {
    const arquivo = fixture('drogapopular-precos') as { produtos: unknown[] }
    const comItemRuim = {
      ...arquivo,
      produtos: [
        ...arquivo.produtos,
        { COD: 'DP-9999', DESCRICAO: 'KIT PRIMEIROS SOCORROS', LAB: 'X', PRECO: '19,90' },
      ],
    }
    const { ofertas, descartados } = drogapopular.converterCatalogo([comItemRuim])
    expect(ofertas).toHaveLength(10)
    expect(descartados).toEqual([
      { externalId: 'DP-9999', motivo: expect.stringContaining('concentração ausente') },
    ])
  })

  it('converte a data brasileira de geração para ISO', async () => {
    const [primeira] = await drogapopular.buscarCatalogo()
    expect(primeira!.atualizadoNaOrigemEm).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/)
  })
})
