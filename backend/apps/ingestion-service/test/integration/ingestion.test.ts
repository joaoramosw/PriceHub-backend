import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ConexaoRabbitMq } from '@pricehub/messaging'
import type { AppPriceHub } from '@pricehub/observability'
import {
  aplicarMigracoes,
  iniciarPostgres,
  iniciarRabbitMq,
  type PostgresDeTeste,
  type RabbitMqDeTeste,
} from '@pricehub/testing'
import { type Channel, type ChannelModel, connect } from 'amqplib'
import { pino } from 'pino'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import type { AmbienteDaIngestao } from '../../src/config/env.js'
import { assinar } from '../../src/modules/webhooks/assinatura.js'
import { criarPrisma, type PrismaClient } from '../../src/plugins/prisma.js'
import { buscarJsonDeFixtures, fixture } from '../fixtures/carregar.js'

const migracoes = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'prisma',
  'migrations',
)
const fila = 'catalog.ingestao-oferta-recebida'
const segredoBioFarma = 'segredo-biofarma-teste'

let postgres: PostgresDeTeste
let rabbit: RabbitMqDeTeste
let prisma: PrismaClient
let conexao: ConexaoRabbitMq
let app: AppPriceHub
let modeloAmqp: ChannelModel
let canal: Channel

async function drenarFila(): Promise<{ conteudo: Record<string, unknown>; correlationId?: string }[]> {
  const mensagens = []
  for (;;) {
    const mensagem = await canal.get(fila, { noAck: true })
    if (!mensagem) return mensagens
    mensagens.push({
      conteudo: JSON.parse(mensagem.content.toString()),
      correlationId: mensagem.properties.correlationId,
    })
  }
}

beforeAll(async () => {
  ;[postgres, rabbit] = await Promise.all([iniciarPostgres('ingestion'), iniciarRabbitMq()])
  await aplicarMigracoes(postgres.url, migracoes)
  prisma = criarPrisma(postgres.url)
  conexao = new ConexaoRabbitMq({
    url: rabbit.url,
    nome: 'teste-ingestion',
    logger: pino({ level: 'silent' }),
  })
  await conexao.conectar()
  const ambiente: AmbienteDaIngestao = {
    PORT: 0,
    HOST: '127.0.0.1',
    DATABASE_URL: postgres.url,
    RABBITMQ_URL: rabbit.url,
    BIOFARMA_URL: 'http://biofarma',
    FARMAAZUL_URL: 'http://farmaazul',
    DROGAPOPULAR_URL: 'http://drogapopular',
    WEBHOOK_SECRET_BIOFARMA: segredoBioFarma,
    WEBHOOK_SECRET_FARMAAZUL: 'segredo-farmaazul-teste',
    SYNC_INTERVAL_MS: 60_000,
    DROGAPOPULAR_POLL_INTERVAL_MS: 15_000,
    SYNC_NO_BOOT: false,
    HTTP_TIMEOUT_MS: 1000,
    LOG_LEVEL: 'silent',
  }
  const buscarJson = buscarJsonDeFixtures({
    '/api/produtos': 'biofarma-catalogo',
    '/legacy/precos.json': 'drogapopular-precos',
  })
  ;({ app } = await buildApp({ ambiente, prisma, conexao, buscarJson, logger: false }))
  await app.ready()
  modeloAmqp = await connect(rabbit.url)
  canal = await modeloAmqp.createChannel()
})

afterAll(async () => {
  await modeloAmqp?.close()
  await app?.close()
  await conexao?.fechar()
  await prisma?.$disconnect()
  await Promise.all([postgres?.parar(), rabbit?.parar()])
})

beforeEach(async () => {
  await canal.purgeQueue(fila)
})

function enviarWebhook(corpo: string, assinatura: string, correlationId = 'corr-webhook') {
  return app.inject({
    method: 'POST',
    url: '/webhooks/biofarma',
    headers: {
      'content-type': 'application/json',
      'x-pricehub-signature': assinatura,
      'x-correlation-id': correlationId,
    },
    payload: corpo,
  })
}

describe('ingestion-service', () => {
  it('recusa webhook com assinatura inválida com 401 e não publica nada', async () => {
    const corpo = JSON.stringify(fixture('biofarma-webhook'))
    const resposta = await enviarWebhook(corpo, assinar(corpo, 'segredo-errado'))
    expect(resposta.statusCode).toBe(401)
    expect(resposta.headers['content-type']).toContain('application/problem+json')
    const semAssinatura = await enviarWebhook(corpo, '')
    expect(semAssinatura.statusCode).toBe(401)
    expect(await drenarFila()).toHaveLength(0)
  })

  it('aceita webhook assinado, guarda a coleta bruta e publica ingestao.oferta.recebida', async () => {
    const corpo = JSON.stringify(fixture('biofarma-webhook'))
    const resposta = await enviarWebhook(corpo, assinar(corpo, segredoBioFarma), 'corr-valido')
    expect(resposta.statusCode).toBe(202)
    expect(resposta.json()).toMatchObject({ publicadas: 1, origem: 'webhook', correlationId: 'corr-valido' })

    const [mensagem] = await drenarFila()
    expect(mensagem!.correlationId).toBe('corr-valido')
    expect(mensagem!.conteudo).toMatchObject({
      type: 'ingestao.oferta.recebida',
      version: 1,
      correlationId: 'corr-valido',
      source: 'ingestion-service',
      data: {
        origem: 'webhook',
        oferta: { farmaciaId: 'biofarma', externalId: 'BIO-0002', precoCentavos: 990 },
      },
    })

    const coleta = await prisma.coletaBruta.findFirstOrThrow({ where: { correlationId: 'corr-valido' } })
    expect(coleta).toMatchObject({ farmaciaId: 'biofarma', origem: 'webhook', ofertas: 1 })
  })

  it('responde 400 para payload assinado fora do contrato', async () => {
    const corpo = JSON.stringify({ evento: 'preco_alterado', produto: { sku: 'X' } })
    const resposta = await enviarWebhook(corpo, assinar(corpo, segredoBioFarma))
    expect(resposta.statusCode).toBe(400)
  })

  it('responde 404 para webhook de farmácia sem webhook ou desconhecida', async () => {
    const drogapopular = await app.inject({
      method: 'POST',
      url: '/webhooks/drogapopular',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    })
    expect(drogapopular.statusCode).toBe(404)
    const desconhecida = await app.inject({
      method: 'POST',
      url: '/webhooks/farmaciax',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    })
    expect(desconhecida.statusCode).toBe(404)
  })

  it('sync manual publica as 10 ofertas da farmácia', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/sync/drogapopular',
      headers: { 'x-correlation-id': 'corr-sync' },
    })
    expect(resposta.statusCode).toBe(200)
    expect(resposta.json()).toMatchObject({ publicadas: 10, descartadas: [] })
    const mensagens = await drenarFila()
    expect(mensagens).toHaveLength(10)
    expect(new Set(mensagens.map((mensagem) => mensagem.correlationId))).toEqual(new Set(['corr-sync']))
  })

  it('lista as farmácias, as coletas e responde health com banco e broker', async () => {
    expect((await app.inject({ url: '/farmacias' })).json()).toHaveLength(3)
    expect((await app.inject({ url: '/coletas?limite=5' })).json().length).toBeGreaterThan(0)
    const saude = await app.inject({ url: '/health' })
    expect(saude.json()).toMatchObject({ status: 'ok', checks: { database: 'ok', broker: 'ok' } })
  })
})
