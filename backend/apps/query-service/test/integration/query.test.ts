import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { criarEnvelope, type DadosDoEvento, type Evento, TiposDeEvento } from '@pricehub/contracts'
import { ConexaoRabbitMq, publicarEvento } from '@pricehub/messaging'
import type { AppPriceHub } from '@pricehub/observability'
import {
  aguardarAte,
  aplicarMigracoes,
  type ClienteSse,
  conectarSse,
  iniciarPostgres,
  iniciarRabbitMq,
  type PostgresDeTeste,
  type RabbitMqDeTeste,
} from '@pricehub/testing'
import { pino } from 'pino'
import type { Static } from 'typebox'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import type { AmbienteDoQuery } from '../../src/config/env.js'
import { iniciarConsumidorDoCatalogo } from '../../src/events/consumers/catalogo-eventos.consumer.js'
import type {
  Comparacao,
  ListaDeFarmacias,
  PaginaDeMedicamentos,
} from '../../src/modules/comparacao/comparacao.schemas.js'
import { ProjecaoDeComparacao } from '../../src/modules/comparacao/projecao.service.js'
import { criarPrisma, type PrismaClient } from '../../src/plugins/prisma.js'
import { HubDeEventos } from '../../src/plugins/sse.js'

const migracoes = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'prisma',
  'migrations',
)
const logger = pino({ level: 'silent' })
const losartana = '01926b1c-0000-7000-8000-000000000002'
const dipirona = '01926b1c-0000-7000-8000-000000000003'

let postgres: PostgresDeTeste
let rabbit: RabbitMqDeTeste
let prisma: PrismaClient
let conexao: ConexaoRabbitMq
let hub: HubDeEventos
let app: AppPriceHub
let urlBase: string
let sse: ClienteSse

function medicamentoCadastrado(
  medicamentoId: string,
  nome: string,
): Evento<'catalogo.medicamento.cadastrado'> {
  return criarEnvelope({
    type: TiposDeEvento.catalogoMedicamentoCadastrado,
    data: {
      medicamentoId,
      nome,
      principioAtivo: nome.split(' ').slice(0, 2).join(' '),
      concentracao: { valor: 50, unidade: 'mg' },
      forma: 'comprimido revestido',
      quantidade: { valor: 30, unidade: 'unidade' },
      categoria: 'Hipertensão & Coração',
    },
    correlationId: 'corr-cadastro',
    source: 'teste',
  })
}

function ofertaAtualizada(
  dados: Partial<DadosDoEvento<'catalogo.oferta.atualizada'>> &
    Pick<DadosDoEvento<'catalogo.oferta.atualizada'>, 'farmaciaId' | 'precoAtualCentavos'>,
  correlationId = 'corr-oferta',
): Evento<'catalogo.oferta.atualizada'> {
  return criarEnvelope({
    type: TiposDeEvento.catalogoOfertaAtualizada,
    data: {
      ofertaId: '01926b1c-0000-7000-8000-0000000000aa',
      medicamentoId: losartana,
      farmaciaNome: dados.farmaciaId,
      precoAnteriorCentavos: null,
      atualizadoEm: new Date().toISOString(),
      ...dados,
    },
    correlationId,
    source: 'teste',
  })
}

async function obterJson<T>(url: string): Promise<T> {
  return (await fetch(url)).json() as Promise<T>
}

async function comparacao(
  id = losartana,
): Promise<{ status: number; corpo: Static<typeof Comparacao> | null }> {
  const resposta = await fetch(`${urlBase}/medicamentos/${id}/comparacao`)
  return {
    status: resposta.status,
    corpo: resposta.status === 200 ? ((await resposta.json()) as Static<typeof Comparacao>) : null,
  }
}

beforeAll(async () => {
  ;[postgres, rabbit] = await Promise.all([iniciarPostgres('query'), iniciarRabbitMq()])
  await aplicarMigracoes(postgres.url, migracoes)
  prisma = criarPrisma(postgres.url)
  conexao = new ConexaoRabbitMq({ url: rabbit.url, nome: 'teste-query', logger })
  await conexao.conectar()
  hub = new HubDeEventos(60_000)
  const ambiente: AmbienteDoQuery = {
    PORT: 0,
    HOST: '127.0.0.1',
    DATABASE_URL: postgres.url,
    RABBITMQ_URL: rabbit.url,
    RABBITMQ_PREFETCH: 10,
    RETRY_BASE_MS: 100,
    CORS_ORIGINS: 'http://localhost:*',
    SSE_HEARTBEAT_MS: 60_000,
    LOG_LEVEL: 'silent',
  }
  app = await buildApp({ ambiente, prisma, conexao, hub, logger: false })
  await iniciarConsumidorDoCatalogo(conexao, new ProjecaoDeComparacao(prisma), hub, {
    prefetch: 10,
    atrasoBaseMs: 100,
  })
  urlBase = await app.listen({ port: 0, host: '127.0.0.1' })
  sse = await conectarSse(`${urlBase}/eventos/stream`)
})

afterAll(async () => {
  sse?.fechar()
  hub?.encerrar()
  await app?.close()
  await conexao?.fechar()
  await prisma?.$disconnect()
  await Promise.all([postgres?.parar(), rabbit?.parar()])
})

describe('query-service', () => {
  it('monta a comparação com as 3 farmácias e marca o menor preço', async () => {
    await publicarEvento(conexao, medicamentoCadastrado(losartana, 'Losartana Potássica 50mg'))
    await sse.aguardar((mensagem) => mensagem.evento === 'medicamento-cadastrado')
    for (const [farmaciaId, preco] of [
      ['biofarma', 1150],
      ['farmaazul', 890],
      ['drogapopular', 749],
    ] as const) {
      await publicarEvento(conexao, ofertaAtualizada({ farmaciaId, precoAtualCentavos: preco }))
    }
    const { corpo } = await aguardarAte<{ corpo: Static<typeof Comparacao> | null }>(
      async () => {
        const resultado = await comparacao()
        return resultado.corpo?.ofertas.length === 3 ? resultado : undefined
      },
      { descricao: 'três ofertas no read model' },
    )
    expect(corpo!.medicamento).toMatchObject({
      menorPrecoCentavos: 749,
      maiorPrecoCentavos: 1150,
      qtdFarmacias: 3,
      economiaMaximaCentavos: 401,
      apresentacao: '30 comprimidos revestidos',
    })
    expect(corpo!.ofertas.map((oferta) => oferta.farmaciaId)).toEqual([
      'drogapopular',
      'farmaazul',
      'biofarma',
    ])
    expect(corpo!.ofertas.map((oferta) => oferta.ehMenorPreco)).toEqual([true, false, false])
  })

  it('emite oferta-atualizada no SSE com o correlationId quando o preço muda', async () => {
    const evento = ofertaAtualizada(
      { farmaciaId: 'farmaazul', precoAnteriorCentavos: 890, precoAtualCentavos: 720 },
      'corr-demo-sse',
    )
    await publicarEvento(conexao, evento)
    const mensagem = await sse.aguardar(
      (recebida) =>
        recebida.evento === 'oferta-atualizada' &&
        (recebida.dados as { correlationId: string }).correlationId === 'corr-demo-sse',
    )
    expect(mensagem.id).toBe(evento.eventId)
    expect(mensagem.dados).toMatchObject({
      medicamentoId: losartana,
      farmaciaId: 'farmaazul',
      precoAnteriorCentavos: 890,
      precoAtualCentavos: 720,
      menorPrecoCentavos: 720,
      maiorPrecoCentavos: 1150,
    })
    const { corpo } = await comparacao()
    expect(corpo!.ofertas[0]).toMatchObject({
      farmaciaId: 'farmaazul',
      precoCentavos: 720,
      ehMenorPreco: true,
    })
  })

  it('ignora oferta com atualizadoEm mais antigo (last-write-wins) e evento duplicado', async () => {
    const antiga = ofertaAtualizada({
      farmaciaId: 'farmaazul',
      precoAtualCentavos: 100,
      atualizadoEm: '2020-01-01T00:00:00.000Z',
    })
    await publicarEvento(conexao, antiga)
    await publicarEvento(conexao, antiga)
    await aguardarAte(
      async () => (await prisma.eventoProcessado.count({ where: { eventId: antiga.eventId } })) === 1,
      { descricao: 'evento antigo processado' },
    )
    await new Promise((resolver) => setTimeout(resolver, 300))
    expect((await comparacao()).corpo!.medicamento.menorPrecoCentavos).toBe(720)
  })

  it('oferta que chega antes do medicamento é reprocessada até o medicamento existir', async () => {
    await publicarEvento(
      conexao,
      ofertaAtualizada({ medicamentoId: dipirona, farmaciaId: 'biofarma', precoAtualCentavos: 890 }),
    )
    await new Promise((resolver) => setTimeout(resolver, 150))
    expect((await comparacao(dipirona)).status).toBe(404)
    await publicarEvento(conexao, medicamentoCadastrado(dipirona, 'Dipirona Monoidratada 500mg/ml'))
    const { corpo } = await aguardarAte<{ corpo: Static<typeof Comparacao> | null }>(
      async () => {
        const resultado = await comparacao(dipirona)
        return resultado.corpo?.ofertas.length === 1 ? resultado : undefined
      },
      { timeoutMs: 15_000, descricao: 'oferta projetada após retry' },
    )
    expect(corpo!.medicamento.menorPrecoCentavos).toBe(890)
  })

  it('lista, busca sem acento, filtra por categoria e lista farmácias', async () => {
    const lista = await obterJson<Static<typeof PaginaDeMedicamentos>>(
      `${urlBase}/medicamentos?busca=potassica`,
    )
    expect(lista).toMatchObject({ total: 1, page: 1, totalPages: 1 })
    expect(lista.itens[0]).toMatchObject({ id: losartana, economiaMaximaCentavos: 430 })
    const porCategoria = await obterJson<Static<typeof PaginaDeMedicamentos>>(
      `${urlBase}/medicamentos?categoria=${encodeURIComponent('Hipertensão & Coração')}`,
    )
    expect(porCategoria.total).toBe(2)
    const farmacias = await obterJson<Static<typeof ListaDeFarmacias>>(`${urlBase}/farmacias`)
    expect(farmacias.map((farmacia) => farmacia.farmaciaId).sort()).toEqual([
      'biofarma',
      'drogapopular',
      'farmaazul',
    ])
    expect((await fetch(`${urlBase}/medicamentos?pageSize=500`)).status).toBe(400)
  })

  it('libera CORS para sites locais e expõe health e docs', async () => {
    const resposta = await fetch(`${urlBase}/medicamentos`, { headers: { origin: 'http://localhost:5500' } })
    expect(resposta.headers.get('access-control-allow-origin')).toBe('http://localhost:5500')
    const externa = await fetch(`${urlBase}/medicamentos`, { headers: { origin: 'https://evil.example' } })
    expect(externa.headers.get('access-control-allow-origin')).toBeNull()
    expect((await obterJson<{ checks: unknown }>(`${urlBase}/health`)).checks).toEqual({
      database: 'ok',
      broker: 'ok',
    })
    expect((await fetch(`${urlBase}/docs/json`)).status).toBe(200)
  })
})
