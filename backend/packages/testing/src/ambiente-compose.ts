import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const executar = promisify(execFile)

export const raizDoProjeto = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
)

function lerArquivoEnv(): Record<string, string> {
  const arquivo = [path.join(raizDoProjeto, '.env'), path.join(raizDoProjeto, '.env.example')].find(
    existsSync,
  )
  if (!arquivo) return {}
  return Object.fromEntries(
    readFileSync(arquivo, 'utf8')
      .split(/\r?\n/)
      .map((linha) => linha.trim())
      .filter((linha) => linha && !linha.startsWith('#') && linha.includes('='))
      .map((linha) => [linha.slice(0, linha.indexOf('=')), linha.slice(linha.indexOf('=') + 1)]),
  )
}

const env = { ...lerArquivoEnv(), ...process.env } as Record<string, string | undefined>

export const urls = {
  query: env.QUERY_URL ?? 'http://127.0.0.1:3000',
  ingestion: env.INGESTION_PUBLIC_URL ?? 'http://127.0.0.1:3001',
  farmacias: {
    biofarma: env.BIOFARMA_PUBLIC_URL ?? 'http://127.0.0.1:4001',
    farmaazul: env.FARMAAZUL_PUBLIC_URL ?? 'http://127.0.0.1:4002',
    drogapopular: env.DROGAPOPULAR_PUBLIC_URL ?? 'http://127.0.0.1:4003',
  },
  rabbitmqGerenciamento: `http://127.0.0.1:${env.RABBITMQ_UI_HOST_PORT ?? '15672'}`,
} as const

export type FarmaciaDoCompose = keyof typeof urls.farmacias

export const credenciaisRabbitMq = {
  usuario: env.RABBITMQ_USER ?? 'pricehub',
  senha: env.RABBITMQ_PASSWORD ?? '',
}

export const intervaloDePollingDaDrogaPopularMs = Number(env.DROGAPOPULAR_POLL_INTERVAL_MS ?? 15_000)

export async function dockerCompose(...argumentos: string[]): Promise<string> {
  const { stdout, stderr } = await executar('docker', ['compose', ...argumentos], {
    cwd: raizDoProjeto,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  })
  return `${stdout}${stderr}`
}

export type LinhaDeLog = {
  container: string
  time: string
  service?: string
  instancia?: string
  msg?: string
  correlationId?: string
  [campo: string]: unknown
}

export async function lerLogs(servicos: string[], desde: Date): Promise<LinhaDeLog[]> {
  const saida = await dockerCompose('logs', '--no-color', '--since', desde.toISOString(), ...servicos)
  const linhas: LinhaDeLog[] = []
  for (const linha of saida.split(/\r?\n/)) {
    const separador = linha.indexOf('| {')
    if (separador < 0) continue
    try {
      const registro = JSON.parse(linha.slice(separador + 2)) as LinhaDeLog
      linhas.push({ ...registro, container: linha.slice(0, separador).trim() })
    } catch {}
  }
  return linhas
}

export async function obterJson<T>(url: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(url, init)
  if (!resposta.ok)
    throw new Error(`${init?.method ?? 'GET'} ${url} → HTTP ${resposta.status}: ${await resposta.text()}`)
  return (await resposta.json()) as T
}

export async function filaRabbitMq(nome: string): Promise<{ messages: number; consumers: number }> {
  const autorizacao = Buffer.from(`${credenciaisRabbitMq.usuario}:${credenciaisRabbitMq.senha}`).toString(
    'base64',
  )
  return obterJson(`${urls.rabbitmqGerenciamento}/api/queues/%2F/${encodeURIComponent(nome)}`, {
    headers: { authorization: `Basic ${autorizacao}` },
  })
}
