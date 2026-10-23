import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const origem = path.join(raiz, 'frontend', 'site1', 'images')
const destino = path.join(raiz, 'comparador-web', 'public', 'medicamentos')

await mkdir(destino, { recursive: true })
await rm(destino, { recursive: true, force: true })
await mkdir(destino, { recursive: true })
await cp(origem, destino, { recursive: true })
