import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { aplicarTopologia, type DefinicoesRabbitMq } from '@pricehub/messaging'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq'
import { connect } from 'amqplib'

const raizDoRepositorio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

export const caminhoDasDefinicoesRabbitMq = path.join(
  raizDoRepositorio,
  'infra',
  'rabbitmq',
  'definitions.json',
)

export function lerDefinicoesRabbitMq(): DefinicoesRabbitMq {
  return JSON.parse(readFileSync(caminhoDasDefinicoesRabbitMq, 'utf8')) as DefinicoesRabbitMq
}

export type RabbitMqDeTeste = {
  url: string
  container: StartedRabbitMQContainer
  parar: () => Promise<void>
}

export async function iniciarRabbitMq(): Promise<RabbitMqDeTeste> {
  const container = await new RabbitMQContainer('rabbitmq:4.1-management-alpine').start()
  const url = container.getAmqpUrl()
  const conexao = await connect(url)
  const canal = await conexao.createChannel()
  await aplicarTopologia(canal, lerDefinicoesRabbitMq())
  await conexao.close()
  return { url, container, parar: async () => void (await container.stop()) }
}

export type PostgresDeTeste = {
  url: string
  container: StartedPostgreSqlContainer
  parar: () => Promise<void>
}

export async function iniciarPostgres(banco = 'teste'): Promise<PostgresDeTeste> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').withDatabase(banco).start()
  return { url: container.getConnectionUri(), container, parar: async () => void (await container.stop()) }
}
