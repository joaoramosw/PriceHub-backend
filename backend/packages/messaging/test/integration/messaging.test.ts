import { criarEnvelope, type Evento, TiposDeEvento } from '@pricehub/contracts'
import {
  aguardarAte,
  iniciarPostgres,
  iniciarRabbitMq,
  type PostgresDeTeste,
  type RabbitMqDeTeste,
} from '@pricehub/testing'
import { connect } from 'amqplib'
import pg from 'pg'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ConexaoRabbitMq,
  consumir,
  type ExecutorSql,
  executarUmaVez,
  filaDeMortas,
  filaDeRetry,
  publicarComConfirmacao,
  publicarEvento,
} from '../../src/index.js'

const logger = pino({ level: 'silent' })

let rabbit: RabbitMqDeTeste
let postgres: PostgresDeTeste

function eventoDeOferta(precoAtualCentavos: number, eventId?: string): Evento<'catalogo.oferta.atualizada'> {
  return criarEnvelope({
    type: TiposDeEvento.catalogoOfertaAtualizada,
    eventId,
    data: {
      ofertaId: '01926b1c-0000-7000-8000-000000000002',
      medicamentoId: '01926b1c-0000-7000-8000-000000000001',
      farmaciaId: 'farmaazul',
      farmaciaNome: 'FarmaAzul Confiança',
      precoAnteriorCentavos: 890,
      precoAtualCentavos,
      atualizadoEm: new Date().toISOString(),
    },
    correlationId: `teste-${precoAtualCentavos}`,
    source: 'teste',
  })
}

async function mensagensNaFila(nome: string): Promise<number> {
  const conexao = await connect(rabbit.url)
  const canal = await conexao.createChannel()
  const { messageCount } = await canal.checkQueue(nome)
  await conexao.close()
  return messageCount
}

async function lerDaFila(
  nome: string,
): Promise<{ conteudo: unknown; cabecalhos: Record<string, unknown> } | null> {
  const conexao = await connect(rabbit.url)
  const canal = await conexao.createChannel()
  const mensagem = await canal.get(nome, { noAck: true })
  await conexao.close()
  if (!mensagem) return null
  return { conteudo: JSON.parse(mensagem.content.toString()), cabecalhos: mensagem.properties.headers ?? {} }
}

let contadorDeFilas = 0

async function criarFilaDeTeste(): Promise<string> {
  contadorDeFilas += 1
  const fila = `teste.fila-${contadorDeFilas}`
  const conexao = await connect(rabbit.url)
  const canal = await conexao.createChannel()
  await canal.assertQueue(fila, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': 'pricehub.dlx', 'x-dead-letter-routing-key': fila },
  })
  await canal.assertQueue(filaDeRetry(fila), {
    durable: true,
    arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': fila },
  })
  await canal.assertQueue(filaDeMortas(fila), { durable: true })
  await canal.bindQueue(fila, 'pricehub.events', 'catalogo.oferta.atualizada')
  await canal.bindQueue(filaDeMortas(fila), 'pricehub.dlx', fila)
  await conexao.close()
  return fila
}

async function novaConexao(nome: string): Promise<ConexaoRabbitMq> {
  const conexao = new ConexaoRabbitMq({ url: rabbit.url, nome, logger })
  await conexao.conectar()
  return conexao
}

beforeAll(async () => {
  ;[rabbit, postgres] = await Promise.all([iniciarRabbitMq(), iniciarPostgres()])
})

afterAll(async () => {
  await Promise.all([rabbit?.parar(), postgres?.parar()])
})

describe('messaging', () => {
  it('publica com confirmação e entrega ao consumidor pela routing key', async () => {
    const fila = await criarFilaDeTeste()
    const conexao = await novaConexao('teste-entrega')
    const recebidos: Evento[] = []
    await consumir(conexao, {
      fila,
      tipos: ['catalogo.oferta.atualizada', 'catalogo.medicamento.cadastrado'],
      tratar: async (evento) => {
        recebidos.push(evento)
      },
    })
    const evento = eventoDeOferta(720)
    await publicarEvento(conexao, evento)
    await aguardarAte(() => recebidos.length === 1, { descricao: 'entrega do evento' })
    expect(recebidos[0]).toEqual(evento)
    await conexao.fechar()
  })

  it('reprocessa com atraso exponencial e manda para a DLQ após 3 tentativas', async () => {
    const fila = await criarFilaDeTeste()
    const conexao = await novaConexao('teste-retry')
    const tentativas: { tentativa: number; em: number }[] = []
    await consumir(conexao, {
      fila,
      tipos: ['catalogo.oferta.atualizada'],
      atrasoBaseMs: 100,
      maximoDeTentativas: 3,
      tratar: async (_evento, contexto) => {
        tentativas.push({ tentativa: contexto.tentativa, em: Date.now() })
        throw new Error('banco indisponível')
      },
    })
    const evento = eventoDeOferta(700)
    await publicarEvento(conexao, evento)

    const naDlq = await aguardarAte(() => lerDaFila(filaDeMortas(fila)), {
      timeoutMs: 15_000,
      descricao: 'mensagem na DLQ',
    })
    expect(naDlq.conteudo).toEqual(evento)
    expect(naDlq.cabecalhos['x-retry-count']).toBe(3)
    expect(tentativas.map((t) => t.tentativa)).toEqual([0, 1, 2, 3])
    const intervalos = tentativas.slice(1).map((t, indice) => t.em - tentativas[indice]!.em)
    expect(intervalos[0]).toBeGreaterThanOrEqual(90)
    expect(intervalos[1]).toBeGreaterThanOrEqual(190)
    expect(intervalos[2]).toBeGreaterThanOrEqual(390)
    await conexao.fechar()
  })

  it('manda mensagem com contrato inválido direto para a DLQ sem chamar o handler', async () => {
    const fila = await criarFilaDeTeste()
    const conexao = await novaConexao('teste-contrato')
    let chamadas = 0
    await consumir(conexao, {
      fila,
      tipos: ['catalogo.oferta.atualizada'],
      tratar: async () => {
        chamadas += 1
      },
    })
    await publicarComConfirmacao(
      conexao.canalDePublicacaoAtivo(),
      'pricehub.events',
      'catalogo.oferta.atualizada',
      Buffer.from(JSON.stringify({ type: 'catalogo.oferta.atualizada', data: { preco: 'barato' } })),
      { persistent: true },
    )
    const naDlq = await aguardarAte(() => lerDaFila(filaDeMortas(fila)), {
      descricao: 'mensagem inválida na DLQ',
    })
    expect(naDlq.conteudo).toMatchObject({ data: { preco: 'barato' } })
    expect(chamadas).toBe(0)
    await conexao.fechar()
  })

  it('não duplica o efeito quando o mesmo evento chega duas vezes', async () => {
    const pool = new pg.Pool({ connectionString: postgres.url })
    await pool.query(
      'CREATE TABLE eventos_processados (event_id uuid PRIMARY KEY, tipo text NOT NULL, processado_em timestamptz NOT NULL)',
    )
    await pool.query('CREATE TABLE efeitos (event_id uuid NOT NULL, preco integer NOT NULL)')

    const executarTransacao = async <R>(trabalho: (tx: ExecutorSql) => Promise<R>): Promise<R> => {
      const cliente = await pool.connect()
      try {
        await cliente.query('BEGIN')
        const tx: ExecutorSql = {
          $executeRawUnsafe: async (sql, ...valores) => (await cliente.query(sql, valores)).rowCount ?? 0,
        }
        const resultado = await trabalho(tx)
        await cliente.query('COMMIT')
        return resultado
      } catch (erro) {
        await cliente.query('ROLLBACK')
        throw erro
      } finally {
        cliente.release()
      }
    }

    const fila = await criarFilaDeTeste()
    const conexao = await novaConexao('teste-idempotencia')
    const resultados: boolean[] = []
    await consumir(conexao, {
      fila,
      tipos: ['catalogo.oferta.atualizada'],
      tratar: async (evento) => {
        const resultado = await executarUmaVez(executarTransacao, evento, async (tx) => {
          await tx.$executeRawUnsafe(
            'INSERT INTO efeitos (event_id, preco) VALUES ($1, $2)',
            evento.eventId,
            evento.data.precoAtualCentavos,
          )
        })
        resultados.push(resultado.duplicado)
      },
    })

    const evento = eventoDeOferta(650)
    await publicarEvento(conexao, evento)
    await publicarEvento(conexao, evento)
    await publicarEvento(conexao, evento)
    await aguardarAte(() => resultados.length === 3, { descricao: 'três entregas' })

    const { rows } = await pool.query('SELECT count(*)::int AS total FROM efeitos WHERE event_id = $1', [
      evento.eventId,
    ])
    expect(rows[0].total).toBe(1)
    expect(resultados.filter((duplicado) => duplicado)).toHaveLength(2)
    expect(await mensagensNaFila(filaDeMortas(fila))).toBe(0)
    await conexao.fechar()
    await pool.end()
  })
})
