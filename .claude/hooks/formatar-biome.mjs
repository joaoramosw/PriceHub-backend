import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const entrada = await new Promise((resolve) => {
  let dados = ''
  process.stdin.on('data', (parte) => {
    dados += parte
  })
  process.stdin.on('end', () => resolve(dados))
})

const projeto = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const backend = path.join(projeto, 'backend')
const arquivo = JSON.parse(entrada || '{}')?.tool_input?.file_path

const relativo = arquivo ? path.relative(backend, path.resolve(arquivo)) : ''
const dentroDoBackend = relativo && !relativo.startsWith('..') && !path.isAbsolute(relativo)
const biome = path.join(backend, 'node_modules', '@biomejs', 'biome', 'bin', 'biome')

if (dentroDoBackend && arquivo.endsWith('.ts') && existsSync(biome)) {
  spawnSync(process.execPath, [biome, 'check', '--write', '--no-errors-on-unmatched', relativo], {
    cwd: backend,
    stdio: 'ignore',
  })
}
