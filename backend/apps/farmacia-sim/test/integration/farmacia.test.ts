import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  aguardarAte,
  aplicarMigracoes,
  iniciarPostgres,
  iniciarReceptorHttp,
  type PostgresDeTeste,
  type ReceptorHttp,
} from '@pricehub/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import type { AmbienteDaFarmacia, FarmaciaId } from '../../src/config/env.js'
import { assinarCorpo } from '../../src/modules/catalogo/webhook.js'
import { criarPrisma, type PrismaClient } from '../../src/plugins/prisma.js'

const migracoes = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'prisma',
  'migrations',
)
const segredo = 'segredo-de-teste'

let postgres: PostgresDeTeste
let receptor: ReceptorHttp
let prisma: PrismaClient

async function montar(farmacia: FarmaciaId) {
  const ambiente: AmbienteDaFarmacia = {
    PHARMACY_ID: farmacia,
    PORT: 0,
    HOST: '127.0.0.1',
    DATABASE_URL: postgres.url,
    INGESTION_URL: receptor.url,
    WEBHOOK_SECRET: segredo,
    WEBHOOK_TIMEOUT_MS: 2000,
    LOG_LEVEL: 'silent',
  }
  const { app, service } = await buildApp({ ambiente, prisma, logger: false })
  await prisma.produto.deleteMany()
  await service.aplicarSeedSeVazio(app.log)
  await app.ready()
  return app
}

beforeAll(async () => {
  postgres = await iniciarPostgres('farmacia')
  await aplicarMigracoes(postgres.url, migracoes)
  receptor = await iniciarReceptorHttp()
  prisma = criarPrisma(postgres.url)
})

afterAll(async () => {
  await prisma?.$disconnect()
  await receptor?.parar()
  await postgres?.parar()
})

beforeEach(() => {
  receptor.recebidas.length = 0
})

describe('farmacia-sim', () => {
  it('BioFarma lista e detalha produtos com preço em reais', async () => {
    const app = await montar('biofarma')
    const lista = await app.inject({ url: '/api/produtos' })
    expect(lista.statusCode).toBe(200)
    expect(lista.json()).toHaveLength(10)
    const losartana = await app.inject({ url: '/api/produtos/2' })
    expect(losartana.json()).toMatchObject({ sku: 'BIO-0002', preco: 11.5 })
    const inexistente = await app.inject({ url: '/api/produtos/999' })
    expect(inexistente.statusCode).toBe(404)
    expect(inexistente.headers['content-type']).toContain('application/problem+json')
    await app.close()
  })

  it('FarmaAzul pagina o catálogo', async () => {
    const app = await montar('farmaazul')
    const primeira = (await app.inject({ url: '/v1/catalogo?page=1&page_size=5' })).json()
    const segunda = (await app.inject({ url: '/v1/catalogo?page=2&page_size=5' })).json()
    expect(primeira).toMatchObject({ page: 1, total_pages: 2 })
    expect(primeira.items).toHaveLength(5)
    expect(segunda.items).toHaveLength(5)
    expect(primeira.items[1]).toMatchObject({ codigo: 'FA-LOS-50', preco_centavos: 890 })
    await app.close()
  })

  it('PATCH altera o preço e dispara webhook assinado com o correlationId', async () => {
    const app = await montar('farmaazul')
    const resposta = await app.inject({
      method: 'PATCH',
      url: '/admin/produtos/2/preco',
      headers: { 'x-correlation-id': 'demo-123' },
      payload: { precoCentavos: 720 },
    })
    expect(resposta.statusCode).toBe(200)
    expect(resposta.json()).toMatchObject({
      precoAnteriorCentavos: 890,
      precoCentavos: 720,
      webhook: 'agendado',
      correlationId: 'demo-123',
    })

    const [webhook] = await aguardarAte(() => (receptor.recebidas.length ? receptor.recebidas : undefined), {
      descricao: 'webhook',
    })
    expect(webhook!.caminho).toBe('/webhooks/farmaazul')
    expect(webhook!.cabecalhos['x-correlation-id']).toBe('demo-123')
    expect(webhook!.cabecalhos['x-pricehub-signature']).toBe(assinarCorpo(webhook!.corpo, segredo))
    expect(JSON.parse(webhook!.corpo)).toMatchObject({
      type: 'price.updated',
      data: { codigo: 'FA-LOS-50', preco_centavos: 720 },
    })

    const catalogo = (await app.inject({ url: '/v1/catalogo?page=1&page_size=5' })).json()
    expect(catalogo.items[1].preco_centavos).toBe(720)
    await app.close()
  })

  it('reset volta ao seed e notifica só os produtos alterados', async () => {
    const app = await montar('biofarma')
    await app.inject({ method: 'PATCH', url: '/admin/produtos/2/preco', payload: { precoCentavos: 999 } })
    await aguardarAte(() => receptor.recebidas.length === 1, { descricao: 'webhook do PATCH' })
    const reset = await app.inject({ method: 'POST', url: '/admin/reset' })
    expect(reset.json()).toMatchObject({ produtos: 10, alterados: 1 })
    await aguardarAte(() => receptor.recebidas.length === 2, { descricao: 'webhook do reset' })
    expect(JSON.parse(receptor.recebidas[1]!.corpo)).toMatchObject({ produto: { id: 2, preco: 11.5 } })
    await app.close()
  })

  it('DrogaPopular não tem webhook e expõe o arquivo legado', async () => {
    const app = await montar('drogapopular')
    const resposta = await app.inject({
      method: 'PATCH',
      url: '/admin/produtos/2/preco',
      payload: { precoCentavos: 650 },
    })
    expect(resposta.json().webhook).toBe('nao-suportado')
    const arquivo = (await app.inject({ url: '/legacy/precos.json' })).json()
    expect(arquivo.loja).toBe('DROGAPOPULAR EXPRESS')
    expect(arquivo.produtos[1]).toMatchObject({ COD: 'DP-0002', PRECO: '6,50' })
    expect((await app.inject({ url: '/api/produtos' })).statusCode).toBe(404)
    await new Promise((resolver) => setTimeout(resolver, 200))
    expect(receptor.recebidas).toHaveLength(0)
    await app.close()
  })

  it('valida o corpo do PATCH', async () => {
    const app = await montar('biofarma')
    const resposta = await app.inject({
      method: 'PATCH',
      url: '/admin/produtos/2/preco',
      payload: { precoCentavos: 7.2 },
    })
    expect(resposta.statusCode).toBe(400)
    await app.close()
  })
})
