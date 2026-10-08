export function reais(centavos: number): string {
  return `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`
}

export function tabela(cabecalho: string[], linhas: (string | number)[][]): string {
  const larguras = cabecalho.map((titulo, coluna) =>
    Math.max(titulo.length, ...linhas.map((linha) => String(linha[coluna] ?? '').length)),
  )
  const formatar = (celulas: (string | number)[]) =>
    `| ${celulas.map((celula, coluna) => String(celula).padEnd(larguras[coluna]!)).join(' | ')} |`
  return [
    formatar(cabecalho),
    `|${larguras.map((largura) => '-'.repeat(largura + 2)).join('|')}|`,
    ...linhas.map(formatar),
  ].join('\n')
}

export function titulo(texto: string): void {
  console.log(`\n=== ${texto} ===\n`)
}

export async function executarDemo(nome: string, demo: () => Promise<boolean>): Promise<void> {
  try {
    const aprovado = await demo()
    console.log(`\n${aprovado ? '✔' : '✘'} ${nome}: ${aprovado ? 'APROVADO' : 'REPROVADO'}`)
    process.exitCode = aprovado ? 0 : 1
  } catch (erro) {
    console.error(`\n✘ ${nome} falhou:`, erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  }
}
