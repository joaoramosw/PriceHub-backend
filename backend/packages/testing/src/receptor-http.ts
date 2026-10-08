import { createServer, type IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'

export type RequisicaoRecebida = {
  metodo: string
  caminho: string
  cabecalhos: IncomingHttpHeaders
  corpo: string
}

export type ReceptorHttp = {
  url: string
  recebidas: RequisicaoRecebida[]
  parar: () => Promise<void>
}

export async function iniciarReceptorHttp(status = 202): Promise<ReceptorHttp> {
  const recebidas: RequisicaoRecebida[] = []
  const servidor = createServer((requisicao, resposta) => {
    const partes: Buffer[] = []
    requisicao.on('data', (parte: Buffer) => partes.push(parte))
    requisicao.on('end', () => {
      recebidas.push({
        metodo: requisicao.method ?? '',
        caminho: requisicao.url ?? '',
        cabecalhos: requisicao.headers,
        corpo: Buffer.concat(partes).toString('utf8'),
      })
      resposta.writeHead(status).end()
    })
  })
  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver))
  const { port } = servidor.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    recebidas,
    parar: () => new Promise((resolver) => servidor.close(() => resolver())),
  }
}
