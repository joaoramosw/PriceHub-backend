export async function aguardarAte<T>(
  condicao: () => Promise<T | undefined | null | false> | T | undefined | null | false,
  { timeoutMs = 10_000, intervaloMs = 100, descricao = 'condição' } = {},
): Promise<T> {
  const limite = Date.now() + timeoutMs
  let ultimoErro: unknown
  while (Date.now() < limite) {
    try {
      const resultado = await condicao()
      if (resultado) return resultado
    } catch (erro) {
      ultimoErro = erro
    }
    await new Promise((resolver) => setTimeout(resolver, intervaloMs))
  }
  throw new Error(`timeout de ${timeoutMs}ms aguardando ${descricao}`, { cause: ultimoErro })
}
