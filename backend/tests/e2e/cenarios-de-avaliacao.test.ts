import { intervaloDePollingDaDrogaPopularMs, obterJson, urls } from '@pricehub/testing'
import { beforeAll, describe, expect, it } from 'vitest'
import { executarCenarioDeEscala } from './cenarios/escala.js'
import { executarCenarioDePolling } from './cenarios/polling.js'
import { executarCenarioDePreco } from './cenarios/preco.js'
import { executarCenarioDeResiliencia } from './cenarios/resiliencia.js'

beforeAll(async () => {
  const servicos = [urls.query, urls.ingestion, ...Object.values(urls.farmacias)]
  for (const url of servicos) {
    const saude = await obterJson<{ status: string }>(`${url}/health`).catch((erro: Error) => {
      throw new Error(
        `ambiente fora do ar (${url}). Rode: docker compose up -d --build --wait. ${erro.message}`,
      )
    })
    expect(saude.status).toBe('ok')
  }
})

describe('cenários de avaliação (contra o docker compose)', () => {
  it('alteração de preço por webhook chega ao usuário via SSE em menos de 2 s', async () => {
    const resultado = await executarCenarioDePreco()
    expect(resultado.precoAnteriorCentavos).toBe(890)
    expect(resultado.ateSseMs).toBeLessThan(2000)
    expect(resultado.ateApiMs).toBeLessThan(2000)
    expect(resultado.etapas.map((etapa) => etapa.servico)).toEqual([
      'farmacia-farmaazul',
      'ingestion-service',
      'ingestion-service',
      'catalog-service',
      'query-service',
    ])
    expect(resultado.ofertasFinais[0]).toMatchObject({
      farmacia: 'FarmaAzul Confiança',
      precoCentavos: 720,
      ehMenorPreco: true,
    })
  })

  it('com o catalog fora, as mensagens acumulam e tudo converge sem perda quando ele volta', async () => {
    const resultado = await executarCenarioDeResiliencia()
    expect(resultado.mensagensAcumuladas).toBeGreaterThanOrEqual(3)
    expect(resultado.precosAntigosServidosDuranteQueda).toBe(true)
    expect(resultado.filaAoFinal).toBe(0)
    for (const alteracao of resultado.alteracoes) {
      expect(alteracao.precoDepoisCentavos).toBe(alteracao.precoCentavos)
    }
  })

  it('duas instâncias do catalog dividem a carga sem processar o mesmo evento duas vezes', async () => {
    const resultado = await executarCenarioDeEscala(2)
    expect(Object.keys(resultado.processadasPorInstancia)).toHaveLength(2)
    const total = Object.values(resultado.processadasPorInstancia).reduce((soma, valor) => soma + valor, 0)
    expect(total).toBe(resultado.alteracoes)
    expect(resultado.eventosProcessadosMaisDeUmaVez).toBe(0)
  })

  it('mudança na DrogaPopular (sem webhook) chega pelo polling dentro do intervalo configurado', async () => {
    const resultado = await executarCenarioDePolling()
    expect(resultado.webhook).toBe('nao-suportado')
    expect(resultado.ateApiMs).toBeLessThanOrEqual(intervaloDePollingDaDrogaPopularMs + 5000)
  })
})
