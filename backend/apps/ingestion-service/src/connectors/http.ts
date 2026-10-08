export class FarmaciaIndisponivelError extends Error {
  constructor(url: string, causa: string) {
    super(`farmácia indisponível em ${url}: ${causa}`)
    this.name = 'FarmaciaIndisponivelError'
  }
}

export type BuscarJson = (url: string) => Promise<unknown>

export function criarBuscarJson(timeoutMs: number): BuscarJson {
  return async (url) => {
    let resposta: Response
    try {
      resposta = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (erro) {
      throw new FarmaciaIndisponivelError(url, erro instanceof Error ? erro.message : String(erro))
    }
    if (!resposta.ok) throw new FarmaciaIndisponivelError(url, `HTTP ${resposta.status}`)
    return resposta.json()
  }
}
