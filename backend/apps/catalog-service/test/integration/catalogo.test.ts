import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { criarEnvelope, type Evento, type OfertaColetada, TiposDeEvento } from '@pricehub/contracts'
import { ConexaoRabbitMq, publicarEvento } from '@pricehub/messaging'
import {
  aguardarAte,
  aplicarMigracoes,
  iniciarPostgres,
  iniciarRabbitMq,
  type PostgresDeTeste,
  type RabbitMqDeTeste,
} from '@pricehub/testing'
import { type Channel, type ChannelModel, connect } from 'amqplib'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { OutboxRelay } from '../../src/modules/outbox/outbox.relay.js'
import { criarPrisma, type PrismaClient } from '../../src/plugins/prisma.js'
import { iniciarProcessamento } from '../../src/processamento.js'
import { ofertasDosSeeds } from '../fixtures/ofertas.js'

const migracoes = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'prisma',
  'migrations',
)
const filaDoQuery = 'query.catalogo-eventos'
const filaDeRevisao = 'revisao.ofertas-nao-correspondidas'
const logger = pino({ level: 'silent' })

let postgres: PostgresDeTeste
let rabbit: RabbitMqDeTeste
let prisma: PrismaClient
let conexao: ConexaoRabbitMq
let relay: OutboxRelay
let modeloAmqp: ChannelModel
let canal: Channel

function eventoDeOferta(
  oferta: OfertaColetada,
  correlationId = 'corr-seed',
): Evento<'ingestao.oferta.recebida'> {
  return criarEnvelope({
    type: TiposDeEvento.ingestaoOfertaRecebida,
    data: { origem: 'sync', oferta },
    correlationId,
    source: 'teste',
  })
}

async function drenar(fila: string): Promise<Evento[]> {
  const eventos: Evento[] = []
  for (;;) {
    const mensagem = await canal.get(fila, { noAck: true })
    if (!mensagem) return eventos
    eventos.push(JSON.parse(mensagem.content.toString()))
  }
}

async function aguardarProcessamento(totalDeEventosProcessados: number) {
  await aguardarAte(
    async () =>
      (await prisma.eventoProcessado.count()) >= totalDeEventosProcessados &&
      (await prisma.outbox.count({ where: { publicadoEm: null } })) === 0,
    { timeoutMs: 30_000, descricao: `${totalDeEventosProcessados} eventos processados e outbox vazio` },
  )
  await new Promise((resolver) => setTimeout(resolver, 300))
}

const losartanaFarmaAzul = () => ofertasDosSeeds().find((oferta) => oferta.externalId === 'FA-LOS-50')!

beforeAll(async () => {
  ;[postgres, rabbit] = await Promise.all([iniciarPostgres('catalog'), iniciarRabbitMq()])
  await aplicarMigracoes(postgres.url, migracoes)
  prisma = criarPrisma(postgres.url)
  conexao = new ConexaoRabbitMq({ url: rabbit.url, nome: 'teste-catalog', logger })
  await conexao.conectar()
  relay = await iniciarProcessamento({
    prisma,
    conexao,
    logger,
    prefetch: 10,
    intervaloDoOutboxMs: 200,
    loteDoOutbox: 50,
  })
  modeloAmqp = await connect(rabbit.url)
  canal = await modeloAmqp.createChannel()
})

afterAll(async () => {
  await modeloAmqp?.close()
  await conexao?.fechar()
  await relay?.parar()
  await prisma?.$disconnect()
  await Promise.all([postgres?.parar(), rabbit?.parar()])
})

describe('catalog-service', () => {
  it('10 medicamentos × 3 farmácias resultam em exatamente 10 medicamentos canônicos com 3 ofertas cada', async () => {
    for (const oferta of ofertasDosSeeds()) await publicarEvento(conexao, eventoDeOferta(oferta))
    await aguardarProcessamento(30)

    const medicamentos = await prisma.medicamento.findMany({ include: { ofertas: true } })
    expect(medicamentos).toHaveLength(10)
    for (const medicamento of medicamentos) {
      expect(new Set(medicamento.ofertas.map((oferta) => oferta.farmaciaId))).toEqual(
        new Set(['biofarma', 'farmaazul', 'drogapopular']),
      )
    }
    expect(await prisma.ofertaNaoCorrespondida.count()).toBe(0)

    const eventos = await drenar(filaDoQuery)
    const porTipo = Object.groupBy(eventos, (evento) => evento.type)
    expect(porTipo['catalogo.medicamento.cadastrado']).toHaveLength(10)
    expect(porTipo['catalogo.oferta.atualizada']).toHaveLength(30)
    expect(eventos.every((evento) => evento.correlationId === 'corr-seed')).toBe(true)
  })

  it('preço repetido não gera evento', async () => {
    const antes = await prisma.outbox.count()
    for (const oferta of ofertasDosSeeds())
      await publicarEvento(conexao, eventoDeOferta(oferta, 'corr-repetido'))
    await aguardarProcessamento(60)
    expect(await prisma.outbox.count()).toBe(antes)
    expect(await drenar(filaDoQuery)).toHaveLength(0)
  })

  it('evento duplicado não duplica o efeito', async () => {
    const evento = eventoDeOferta({ ...losartanaFarmaAzul(), precoCentavos: 720 }, 'corr-duplicado')
    await publicarEvento(conexao, evento)
    await publicarEvento(conexao, evento)
    await publicarEvento(conexao, evento)
    await aguardarProcessamento(61)
    await new Promise((resolver) => setTimeout(resolver, 500))

    expect(await prisma.eventoProcessado.count({ where: { eventId: evento.eventId } })).toBe(1)
    const oferta = await prisma.oferta.findUniqueOrThrow({
      where: { farmaciaId_externalId: { farmaciaId: 'farmaazul', externalId: 'FA-LOS-50' } },
      include: { historico: { orderBy: { registradoEm: 'asc' } } },
    })
    expect(oferta.precoCentavos).toBe(720)
    expect(oferta.versao).toBe(2)
    expect(
      oferta.historico.map((registro) => [registro.precoAnteriorCentavos, registro.precoCentavos]),
    ).toEqual([
      [null, 890],
      [890, 720],
    ])

    const eventos = await drenar(filaDoQuery)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({
      type: 'catalogo.oferta.atualizada',
      correlationId: 'corr-duplicado',
      data: { farmaciaId: 'farmaazul', precoAnteriorCentavos: 890, precoAtualCentavos: 720 },
    })
  })

  it('ignora oferta com timestamp mais antigo do que o gravado', async () => {
    const antiga = {
      ...losartanaFarmaAzul(),
      precoCentavos: 999,
      atualizadoNaOrigemEm: '2020-01-01T00:00:00.000Z',
    }
    await publicarEvento(conexao, eventoDeOferta(antiga, 'corr-antiga'))
    await aguardarProcessamento(62)
    const oferta = await prisma.oferta.findUniqueOrThrow({
      where: { farmaciaId_externalId: { farmaciaId: 'farmaazul', externalId: 'FA-LOS-50' } },
    })
    expect(oferta.precoCentavos).toBe(720)
    expect(await drenar(filaDoQuery)).toHaveLength(0)
  })

  it('oferta sem dados mínimos vai para ofertas_nao_correspondidas e para a fila de revisão', async () => {
    const [base] = ofertasDosSeeds().filter((oferta) => oferta.farmaciaId === 'drogapopular')
    const estranha: OfertaColetada = {
      ...base!,
      externalId: 'DP-9999',
      nome: 'XAROPE DE GUACO 35MG/ML FR 120ML',
      principioAtivo: 'XAROPE DE GUACO',
      forma: 'outro',
    }
    await publicarEvento(conexao, eventoDeOferta(estranha, 'corr-estranha'))
    await aguardarProcessamento(63)

    expect(await prisma.ofertaNaoCorrespondida.findMany()).toEqual([
      expect.objectContaining({ farmaciaId: 'drogapopular', externalId: 'DP-9999' }),
    ])
    const [revisao] = await drenar(filaDeRevisao)
    expect(revisao).toMatchObject({
      type: 'catalogo.oferta.nao-correspondida',
      data: { externalId: 'DP-9999', motivo: expect.stringContaining('forma farmacêutica') },
    })
    expect(await prisma.medicamento.count()).toBe(10)
  })
})
