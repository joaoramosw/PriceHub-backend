export type ExecutorSql = {
  $executeRawUnsafe(consulta: string, ...valores: unknown[]): Promise<number>
}

export type ExecutorDeTransacao<Transacao extends ExecutorSql> = <Resultado>(
  trabalho: (transacao: Transacao) => Promise<Resultado>,
) => Promise<Resultado>

export async function registrarEventoProcessado(
  transacao: ExecutorSql,
  evento: { eventId: string; type: string },
): Promise<boolean> {
  const inseridos = await transacao.$executeRawUnsafe(
    'INSERT INTO eventos_processados (event_id, tipo, processado_em) VALUES ($1::uuid, $2, now()) ON CONFLICT (event_id) DO NOTHING',
    evento.eventId,
    evento.type,
  )
  return inseridos === 1
}

export async function executarUmaVez<Transacao extends ExecutorSql, Resultado>(
  executarTransacao: ExecutorDeTransacao<Transacao>,
  evento: { eventId: string; type: string },
  efeito: (transacao: Transacao) => Promise<Resultado>,
): Promise<{ duplicado: true } | { duplicado: false; resultado: Resultado }> {
  return executarTransacao(async (transacao) => {
    const novo = await registrarEventoProcessado(transacao, evento)
    if (!novo) return { duplicado: true as const }
    return { duplicado: false as const, resultado: await efeito(transacao) }
  })
}
