import {
  aguardarPreco,
  alterarPreco,
  dockerCompose,
  type FarmaciaDoCompose,
  idDoMedicamento,
  lerLogs,
  resetarFarmacias,
} from '@pricehub/testing'

const produtos = [
  { id: 1, busca: 'metformina' },
  { id: 2, busca: 'losartana' },
  { id: 3, busca: 'dipirona' },
  { id: 4, busca: 'omeprazol' },
  { id: 5, busca: 'hidroclorotiazida' },
  { id: 6, busca: 'nimesulida' },
  { id: 7, busca: 'tadalafila' },
  { id: 8, busca: 'sinvastatina' },
  { id: 9, busca: 'ibuprofeno' },
  { id: 10, busca: 'simeticona' },
] as const

const farmaciasComWebhook: FarmaciaDoCompose[] = ['biofarma', 'farmaazul']

export type ResultadoDoCenarioDeEscala = {
  instancias: number
  alteracoes: number
  processadasPorInstancia: Record<string, number>
  eventosProcessadosMaisDeUmaVez: number
  duplicadosIgnorados: number
  tempoTotalMs: number
}

export async function executarCenarioDeEscala(instancias = 2): Promise<ResultadoDoCenarioDeEscala> {
  await dockerCompose('up', '-d', '--no-recreate', '--wait', '--scale', `catalog-service=${instancias}`)
  const ids = await Promise.all(produtos.map((produto) => idDoMedicamento(produto.busca)))
  const lote = farmaciasComWebhook.flatMap((farmacia, indiceDaFarmacia) =>
    produtos.map((produto, indice) => ({
      farmacia,
      produto,
      medicamentoId: ids[indice]!,
      precoCentavos: 5000 + indiceDaFarmacia * 100 + indice,
      correlationId: `demo-escala-${Date.now()}-${farmacia}-${produto.id}`,
    })),
  )

  const inicio = new Date(Date.now() - 1000)
  const t0 = Date.now()
  try {
    await Promise.all(
      lote.map((item) =>
        alterarPreco(item.farmacia, item.produto.id, item.precoCentavos, item.correlationId),
      ),
    )
    await Promise.all(
      lote.map((item) => aguardarPreco(item.medicamentoId, item.farmacia, item.precoCentavos, 30_000, 100)),
    )
    const tempoTotalMs = Date.now() - t0

    await new Promise((resolver) => setTimeout(resolver, 1500))
    const correlationIds = new Set(lote.map((item) => item.correlationId))
    const logs = (await lerLogs(['catalog-service'], inicio)).filter(
      (linha) => linha.correlationId && correlationIds.has(linha.correlationId),
    )
    const processadas = logs.filter((linha) => linha.msg === 'oferta processada')
    const processadasPorInstancia: Record<string, number> = {}
    const vezesPorEvento = new Map<string, number>()
    for (const linha of processadas) {
      processadasPorInstancia[linha.container] = (processadasPorInstancia[linha.container] ?? 0) + 1
      const eventId = String(linha.eventId)
      vezesPorEvento.set(eventId, (vezesPorEvento.get(eventId) ?? 0) + 1)
    }
    return {
      instancias,
      alteracoes: lote.length,
      processadasPorInstancia,
      eventosProcessadosMaisDeUmaVez: [...vezesPorEvento.values()].filter((vezes) => vezes > 1).length,
      duplicadosIgnorados: logs.filter((linha) => linha.msg === 'evento duplicado ignorado').length,
      tempoTotalMs,
    }
  } finally {
    await resetarFarmacias('biofarma', 'farmaazul')
    await dockerCompose('up', '-d', '--no-recreate', '--wait', '--scale', 'catalog-service=1')
  }
}
