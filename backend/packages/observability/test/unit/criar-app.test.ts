import Type from 'typebox'
import { afterEach, describe, expect, it } from 'vitest'
import { type AppPriceHub, criarApp, RecursoNaoEncontrado, registrarHealth } from '../../src/index.js'

let app: AppPriceHub

afterEach(async () => {
  await app?.close()
})

async function montar(verificacoes: Record<string, () => Promise<unknown>>) {
  app = await criarApp({ servico: 'teste', titulo: 'Teste', descricao: 'teste', logger: false })
  registrarHealth(app, 'teste', verificacoes)
  app.get(
    '/itens/:id',
    { schema: { params: Type.Object({ id: Type.Integer({ minimum: 1 }) }) } },
    async (request) => {
      if (request.params.id === 99) throw new RecursoNaoEncontrado('item 99 não existe')
      return { id: request.params.id }
    },
  )
  app.get('/explode', async () => {
    throw new Error('segredo interno')
  })
  await app.ready()
}

describe('criarApp', () => {
  it('propaga o X-Correlation-Id recebido e gera um quando ausente', async () => {
    await montar({})
    const comCabecalho = await app.inject({ url: '/itens/1', headers: { 'x-correlation-id': 'abc-123' } })
    expect(comCabecalho.headers['x-correlation-id']).toBe('abc-123')
    const semCabecalho = await app.inject({ url: '/itens/1' })
    expect(semCabecalho.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('converte params pela schema TypeBox', async () => {
    await montar({})
    const resposta = await app.inject({ url: '/itens/7' })
    expect(resposta.json()).toEqual({ id: 7 })
  })

  it('responde erros em application/problem+json', async () => {
    await montar({})
    const invalido = await app.inject({ url: '/itens/abc', headers: { 'x-correlation-id': 'c1' } })
    expect(invalido.statusCode).toBe(400)
    expect(invalido.headers['content-type']).toContain('application/problem+json')
    expect(invalido.json()).toMatchObject({ status: 400, title: 'Requisição inválida', correlationId: 'c1' })

    const ausente = await app.inject({ url: '/itens/99' })
    expect(ausente.json()).toMatchObject({ status: 404, detail: 'item 99 não existe', instance: '/itens/99' })

    const rotaInexistente = await app.inject({ url: '/nada' })
    expect(rotaInexistente.statusCode).toBe(404)

    const interno = await app.inject({ url: '/explode' })
    expect(interno.statusCode).toBe(500)
    expect(interno.body).not.toContain('segredo interno')
  })

  it('health retorna 200 quando tudo está ok e 503 com o check que falhou', async () => {
    let brokerDisponivel = true
    await montar({
      database: async () => true,
      broker: async () => {
        if (!brokerDisponivel) throw new Error('broker fora')
      },
    })
    const saudavel = await app.inject({ url: '/health' })
    expect(saudavel.statusCode).toBe(200)
    expect(saudavel.json()).toMatchObject({ status: 'ok', checks: { database: 'ok', broker: 'ok' } })

    brokerDisponivel = false
    const degradado = await app.inject({ url: '/health' })
    expect(degradado.statusCode).toBe(503)
    expect(degradado.json().checks.broker).toBe('broker fora')
  })

  it('serve o OpenAPI em /docs', async () => {
    await montar({})
    const resposta = await app.inject({ url: '/docs/json' })
    expect(resposta.statusCode).toBe(200)
    expect(resposta.json().paths['/health']).toBeDefined()
  })
})
