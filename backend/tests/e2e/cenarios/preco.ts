import {
  aguardarPreco,
  alterarPreco,
  comparacao,
  conectarSse,
  idDoMedicamento,
  lerLogs,
  resetarFarmacias,
  urls,
} from '@pricehub/testing'

export type Etapa = { etapa: string; servico: string; instante: string; desdeAlteracaoMs: number }

export type ResultadoDoCenarioDePreco = {
  correlationId: string
  precoAnteriorCentavos: number
  precoNovoCentavos: number
  patchMs: number
  ateSseMs: number
  ateApiMs: number
  etapas: Etapa[]
  ofertasFinais: { farmacia: string; precoCentavos: number; ehMenorPreco: boolean }[]
}

const marcos: { servico: string; mensagem: string; etapa: string }[] = [
  {
    servico: 'farmacia-farmaazul',
    mensagem: 'preço alterado na farmácia',
    etapa: '1. preço gravado na farmácia',
  },
  { servico: 'ingestion-service', mensagem: 'webhook recebido', etapa: '2. webhook recebido (HMAC ok)' },
  {
    servico: 'ingestion-service',
    mensagem: 'ofertas publicadas',
    etapa: '3. ingestao.oferta.recebida publicada',
  },
  {
    servico: 'catalog-service',
    mensagem: 'oferta processada',
    etapa: '4. catalog: matching + outbox commitado',
  },
  {
    servico: 'query-service',
    mensagem: 'read model atualizado',
    etapa: '5. query: read model + SSE emitido',
  },
]

export async function executarCenarioDePreco(precoNovoCentavos = 720): Promise<ResultadoDoCenarioDePreco> {
  const medicamentoId = await idDoMedicamento('losartana')
  await resetarFarmacias('farmaazul')
  await aguardarPreco(medicamentoId, 'farmaazul', 890, 20_000)

  const sse = await conectarSse(`${urls.query}/eventos/stream`)
  const correlationId = `demo-preco-${Date.now()}`
  const inicio = new Date(Date.now() - 1000)
  const t0 = Date.now()
  try {
    const patch = await alterarPreco('farmaazul', 2, precoNovoCentavos, correlationId)
    const patchMs = Date.now() - t0
    const mensagem = await sse.aguardar(
      (recebida) =>
        recebida.evento === 'oferta-atualizada' &&
        (recebida.dados as { correlationId?: string }).correlationId === correlationId,
      10_000,
    )
    const ateSseMs = mensagem.recebidoEm - t0
    await aguardarPreco(medicamentoId, 'farmaazul', precoNovoCentavos, 10_000, 10)
    const ateApiMs = Date.now() - t0

    await new Promise((resolver) => setTimeout(resolver, 1500))
    const logs = (
      await lerLogs(['farmacia-farmaazul', 'ingestion-service', 'catalog-service', 'query-service'], inicio)
    ).filter((linha) => linha.correlationId === correlationId)
    const encontrados = marcos
      .map((marco) => ({
        marco,
        linha: logs.find((linha) => linha.container.includes(marco.servico) && linha.msg === marco.mensagem),
      }))
      .filter((item) => item.linha)
    const base = Date.parse(encontrados[0]?.linha?.time ?? new Date(t0).toISOString())
    const etapas = encontrados.map(({ marco, linha }) => ({
      etapa: marco.etapa,
      servico: marco.servico,
      instante: linha!.time,
      desdeAlteracaoMs: Date.parse(linha!.time) - base,
    }))

    const final = await comparacao(medicamentoId)
    return {
      correlationId,
      precoAnteriorCentavos: patch.precoAnteriorCentavos,
      precoNovoCentavos,
      patchMs,
      ateSseMs,
      ateApiMs,
      etapas,
      ofertasFinais: final.ofertas.map((oferta) => ({
        farmacia: oferta.farmacia,
        precoCentavos: oferta.precoCentavos,
        ehMenorPreco: oferta.ehMenorPreco,
      })),
    }
  } finally {
    sse.fechar()
    await resetarFarmacias('farmaazul')
    await aguardarPreco(medicamentoId, 'farmaazul', 890, 20_000).catch(() => undefined)
  }
}
