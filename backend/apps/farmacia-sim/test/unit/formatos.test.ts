import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { dataHoraBrasileira, isoComFusoDeBrasilia } from '../../src/modules/catalogo/datas.js'
import { formatoBioFarma, serializarBioFarma } from '../../src/modules/catalogo/formatos/biofarma.js'
import {
  gerarArquivoDePrecos,
  serializarDrogaPopular,
} from '../../src/modules/catalogo/formatos/drogapopular.js'
import { formatoFarmaAzul, serializarFarmaAzul } from '../../src/modules/catalogo/formatos/farmaazul.js'
import type { Produto } from '../../src/modules/catalogo/produto.js'
import { carregarSeed } from '../../src/modules/catalogo/seed.js'
import { assinarCorpo } from '../../src/modules/catalogo/webhook.js'

const atualizadoEm = new Date('2026-10-08T13:00:00.000Z')

function produtoDoSeed(farmacia: 'biofarma' | 'farmaazul' | 'drogapopular', id: number): Produto {
  const produto = carregarSeed(farmacia).produtos.find((item) => item.id === id)
  if (!produto) throw new Error(`produto ${id} ausente no seed de ${farmacia}`)
  return { ...produto, atualizadoEm }
}

describe('seeds', () => {
  it('trazem os 10 medicamentos de cada site com os preços do frontend', () => {
    const precosDaLosartana = { biofarma: 1150, farmaazul: 890, drogapopular: 749 }
    for (const [farmacia, preco] of Object.entries(precosDaLosartana)) {
      const seed = carregarSeed(farmacia as keyof typeof precosDaLosartana)
      expect(seed.produtos).toHaveLength(10)
      expect(seed.produtos.find((produto) => produto.id === 2)?.precoCentavos).toBe(preco)
    }
  })
})

describe('BioFarma (camelCase, preço em reais)', () => {
  it('serializa a Losartana no formato especificado', () => {
    expect(serializarBioFarma(produtoDoSeed('biofarma', 2))).toEqual({
      id: 2,
      sku: 'BIO-0002',
      nome: 'Losartana Potássica',
      dosagem: '50mg',
      apresentacao: '30 comprimidos revestidos',
      principioAtivo: 'Losartana Potássica 50mg',
      laboratorio: 'Medley / Eurofarma',
      registroMS: 'MS 1.0181.0421.002-3',
      categoria: 'Hipertensão & Coração',
      preco: 11.5,
      atualizadoEm: '2026-10-08T13:00:00.000Z',
    })
  })

  it('envia webhook com evento preco_alterado', () => {
    expect(formatoBioFarma.payloadDeWebhook?.(produtoDoSeed('biofarma', 2))).toMatchObject({
      evento: 'preco_alterado',
      produto: { sku: 'BIO-0002', preco: 11.5 },
    })
  })
})

describe('FarmaAzul (snake_case, centavos, registro sem máscara)', () => {
  it('serializa a Losartana no formato especificado', () => {
    expect(serializarFarmaAzul(produtoDoSeed('farmaazul', 2))).toEqual({
      codigo: 'FA-LOS-50',
      descricao: 'Losartana Potássica 50mg 30 comp rev',
      principio_ativo: 'Losartana Potássica',
      concentracao: '50mg',
      forma_farmaceutica: 'comprimido revestido',
      quantidade_embalagem: 30,
      fabricante: 'Medley',
      registro_anvisa: '1018104210023',
      preco_centavos: 890,
      ultima_atualizacao: '2026-10-08T10:00:00-03:00',
    })
  })

  it('envia webhook com type price.updated', () => {
    expect(formatoFarmaAzul.payloadDeWebhook?.(produtoDoSeed('farmaazul', 2))).toMatchObject({
      type: 'price.updated',
      data: { codigo: 'FA-LOS-50', preco_centavos: 890 },
    })
  })
})

describe('DrogaPopular (legado, sem registro MS, preço com vírgula)', () => {
  it('serializa a Losartana com dosagem e quantidade dentro da descrição', () => {
    expect(serializarDrogaPopular(produtoDoSeed('drogapopular', 2))).toEqual({
      COD: 'DP-0002',
      DESCRICAO: 'LOSARTANA POTASSICA 50MG C/30 COMP REV',
      LAB: 'MEDLEY',
      PRECO: '7,49',
    })
  })

  it('gera o arquivo com loja e data no formato brasileiro', () => {
    const arquivo = gerarArquivoDePrecos([produtoDoSeed('drogapopular', 3)], new Date('2026-10-08T13:30:00Z'))
    expect(arquivo).toEqual({
      loja: 'DROGAPOPULAR EXPRESS',
      gerado_em: '08/10/2026 10:30',
      produtos: [
        {
          COD: 'DP-0003',
          DESCRICAO: 'DIPIRONA SODICA 500MG/ML GTS FR 20ML',
          LAB: 'NEO QUIMICA',
          PRECO: '5,99',
        },
      ],
    })
  })
})

describe('datas e assinatura', () => {
  it('formata datas no fuso de Brasília', () => {
    const data = new Date('2026-01-02T03:04:05Z')
    expect(isoComFusoDeBrasilia(data)).toBe('2026-01-02T00:04:05-03:00')
    expect(dataHoraBrasileira(data)).toBe('02/01/2026 00:04')
  })

  it('assina o corpo com HMAC-SHA256', () => {
    const esperado = createHmac('sha256', 'segredo-123').update('{"a":1}').digest('hex')
    expect(assinarCorpo('{"a":1}', 'segredo-123')).toBe(`sha256=${esperado}`)
  })
})
