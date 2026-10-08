import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'

export async function aplicarMigracoes(url: string, diretorioDeMigracoes: string): Promise<void> {
  const migracoes = readdirSync(diretorioDeMigracoes, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .sort()
  const cliente = new pg.Client({ connectionString: url })
  await cliente.connect()
  try {
    for (const migracao of migracoes) {
      await cliente.query(readFileSync(path.join(diretorioDeMigracoes, migracao, 'migration.sql'), 'utf8'))
    }
  } finally {
    await cliente.end()
  }
}
