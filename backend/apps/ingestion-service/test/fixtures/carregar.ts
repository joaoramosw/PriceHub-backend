import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const diretorio = path.dirname(fileURLToPath(import.meta.url))

export function fixture(nome: string): unknown {
  return JSON.parse(readFileSync(path.join(diretorio, `${nome}.json`), 'utf8'))
}

export function buscarJsonDeFixtures(rotas: Record<string, string>) {
  return async (url: string): Promise<unknown> => {
    const caminho = new URL(url).pathname + new URL(url).search
    const nome = rotas[caminho] ?? rotas[new URL(url).pathname]
    if (!nome) throw new Error(`fixture não mapeada para ${caminho}`)
    return fixture(nome)
  }
}
