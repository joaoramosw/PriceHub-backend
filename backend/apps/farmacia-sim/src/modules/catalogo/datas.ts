const fusoDeBrasilia = 'America/Sao_Paulo'

function partes(data: Date): Record<string, string> {
  const formatador = new Intl.DateTimeFormat('en-GB', {
    timeZone: fusoDeBrasilia,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  return Object.fromEntries(formatador.formatToParts(data).map((parte) => [parte.type, parte.value]))
}

export function isoComFusoDeBrasilia(data: Date): string {
  const p = partes(data)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}-03:00`
}

export function dataHoraBrasileira(data: Date): string {
  const p = partes(data)
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`
}

export function centavosParaReais(centavos: number): number {
  return Math.round(centavos) / 100
}

export function centavosParaTextoComVirgula(centavos: number): string {
  return (centavos / 100).toFixed(2).replace('.', ',')
}
