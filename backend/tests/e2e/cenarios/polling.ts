import {
  aguardarPreco,
  alterarPreco,
  idDoMedicamento,
  intervaloDePollingDaDrogaPopularMs,
  precoNaComparacao,
  resetarFarmacias,
  sincronizar,
} from '@pricehub/testing'

export type ResultadoDoCenarioDePolling = {
  correlationIdDoPatch: string
  webhook: string
  precoAntesCentavos: number
  precoNovoCentavos: number
  intervaloDePollingMs: number
  ateApiMs: number
}

export async function executarCenarioDePolling(
  precoNovoCentavos = 1290,
): Promise<ResultadoDoCenarioDePolling> {
  const medicamentoId = await idDoMedicamento('omeprazol')
  const precoAntesCentavos = (await precoNaComparacao(medicamentoId, 'drogapopular')) ?? -1
  const correlationIdDoPatch = `demo-polling-${Date.now()}`
  const t0 = Date.now()
  try {
    const patch = await alterarPreco('drogapopular', 4, precoNovoCentavos, correlationIdDoPatch)
    await aguardarPreco(
      medicamentoId,
      'drogapopular',
      precoNovoCentavos,
      intervaloDePollingDaDrogaPopularMs + 15_000,
      200,
    )
    return {
      correlationIdDoPatch,
      webhook: patch.webhook,
      precoAntesCentavos,
      precoNovoCentavos,
      intervaloDePollingMs: intervaloDePollingDaDrogaPopularMs,
      ateApiMs: Date.now() - t0,
    }
  } finally {
    await resetarFarmacias('drogapopular')
    await sincronizar('drogapopular', `restauracao-polling-${Date.now()}`)
    await aguardarPreco(medicamentoId, 'drogapopular', 1399, 30_000).catch(() => undefined)
  }
}
