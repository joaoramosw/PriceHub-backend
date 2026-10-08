export type MensagemSse = { evento: string; id?: string; dados: unknown; recebidoEm: number }

export type ClienteSse = {
  mensagens: MensagemSse[]
  aguardar: (predicado: (mensagem: MensagemSse) => boolean, timeoutMs?: number) => Promise<MensagemSse>
  fechar: () => void
}

export async function conectarSse(url: string, cabecalhos: Record<string, string> = {}): Promise<ClienteSse> {
  const controlador = new AbortController()
  const resposta = await fetch(url, {
    headers: { accept: 'text/event-stream', ...cabecalhos },
    signal: controlador.signal,
  })
  if (!resposta.ok || !resposta.body) throw new Error(`SSE indisponível: HTTP ${resposta.status}`)
  const mensagens: MensagemSse[] = []
  const ouvintes = new Set<() => void>()
  const leitor = resposta.body.pipeThrough(new TextDecoderStream()).getReader()

  void (async () => {
    let acumulado = ''
    try {
      for (;;) {
        const { value, done } = await leitor.read()
        if (done) return
        acumulado += value
        let separador = acumulado.indexOf('\n\n')
        while (separador >= 0) {
          const bloco = acumulado.slice(0, separador)
          acumulado = acumulado.slice(separador + 2)
          const campos = Object.fromEntries(
            bloco
              .split('\n')
              .filter((linha) => linha && !linha.startsWith(':'))
              .map((linha) => [
                linha.slice(0, linha.indexOf(':')),
                linha.slice(linha.indexOf(':') + 1).trim(),
              ]),
          )
          if (campos.event && campos.data !== undefined) {
            mensagens.push({
              evento: campos.event,
              id: campos.id,
              dados: JSON.parse(campos.data),
              recebidoEm: Date.now(),
            })
            for (const ouvinte of ouvintes) ouvinte()
          }
          separador = acumulado.indexOf('\n\n')
        }
      }
    } catch {
      return
    }
  })()

  return {
    mensagens,
    fechar: () => controlador.abort(),
    aguardar: (predicado, timeoutMs = 10_000) =>
      new Promise((resolver, rejeitar) => {
        const verificar = () => {
          const encontrada = mensagens.find(predicado)
          if (!encontrada) return false
          clearTimeout(temporizador)
          ouvintes.delete(verificar)
          resolver(encontrada)
          return true
        }
        const temporizador = setTimeout(() => {
          ouvintes.delete(verificar)
          rejeitar(new Error(`timeout de ${timeoutMs}ms aguardando mensagem SSE`))
        }, timeoutMs)
        if (!verificar()) ouvintes.add(verificar)
      }),
  }
}
