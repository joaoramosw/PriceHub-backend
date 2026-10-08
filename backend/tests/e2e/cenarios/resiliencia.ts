import {
  aguardarAte,
  aguardarPreco,
  alterarPreco,
  dockerCompose,
  type FarmaciaDoCompose,
  filaRabbitMq,
  idDoMedicamento,
  precoNaComparacao,
  produtosDaDemo,
  resetarFarmacias,
} from '@pricehub/testing'

const filaDoCatalogo = 'catalog.ingestao-oferta-recebida'

type Alteracao = { farmacia: FarmaciaDoCompose; produto: keyof typeof produtosDaDemo; precoCentavos: number }

const alteracoes: Alteracao[] = [
  { farmacia: 'biofarma', produto: 'hidroclorotiazida', precoCentavos: 590 },
  { farmacia: 'farmaazul', produto: 'sinvastatina', precoCentavos: 1290 },
  { farmacia: 'farmaazul', produto: 'ibuprofeno', precoCentavos: 1590 },
]

export type ResultadoDoCenarioDeResiliencia = {
  mensagensAcumuladas: number
  precosAntigosServidosDuranteQueda: boolean
  convergenciaMs: number
  filaAoFinal: number
  alteracoes: (Alteracao & {
    correlationId: string
    precoAntesCentavos: number
    precoDepoisCentavos: number
  })[]
}

export async function executarCenarioDeResiliencia(): Promise<ResultadoDoCenarioDeResiliencia> {
  const ids = Object.fromEntries(
    await Promise.all(
      alteracoes.map(async (alteracao) => [
        alteracao.produto,
        await idDoMedicamento(produtosDaDemo[alteracao.produto].busca),
      ]),
    ),
  ) as Record<string, string>
  const precosAntes = await Promise.all(
    alteracoes.map((alteracao) => precoNaComparacao(ids[alteracao.produto]!, alteracao.farmacia)),
  )

  await dockerCompose('stop', 'catalog-service')
  const registros: ResultadoDoCenarioDeResiliencia['alteracoes'] = []
  try {
    for (const [indice, alteracao] of alteracoes.entries()) {
      const correlationId = `demo-resiliencia-${Date.now()}-${indice}`
      await alterarPreco(
        alteracao.farmacia,
        produtosDaDemo[alteracao.produto].id,
        alteracao.precoCentavos,
        correlationId,
      )
      registros.push({
        ...alteracao,
        correlationId,
        precoAntesCentavos: precosAntes[indice]!,
        precoDepoisCentavos: 0,
      })
    }

    const { messages: mensagensAcumuladas } = await aguardarAte(
      async () => {
        const fila = await filaRabbitMq(filaDoCatalogo)
        return fila.consumers === 0 && fila.messages >= alteracoes.length ? fila : undefined
      },
      { timeoutMs: 30_000, intervaloMs: 1000, descricao: 'mensagens acumuladas na fila do catalog' },
    )

    const precosDuranteQueda = await Promise.all(
      alteracoes.map((alteracao) => precoNaComparacao(ids[alteracao.produto]!, alteracao.farmacia)),
    )
    const precosAntigosServidosDuranteQueda = precosDuranteQueda.every(
      (preco, indice) => preco === precosAntes[indice],
    )

    const inicioDaRecuperacao = Date.now()
    await dockerCompose('start', 'catalog-service')
    for (const alteracao of alteracoes) {
      await aguardarPreco(ids[alteracao.produto]!, alteracao.farmacia, alteracao.precoCentavos, 90_000, 200)
    }
    const convergenciaMs = Date.now() - inicioDaRecuperacao

    const { messages: filaAoFinal } = await aguardarAte(
      async () => {
        const fila = await filaRabbitMq(filaDoCatalogo)
        return fila.messages === 0 ? fila : undefined
      },
      { timeoutMs: 30_000, intervaloMs: 1000, descricao: 'fila do catalog drenada' },
    )

    for (const registro of registros) {
      registro.precoDepoisCentavos =
        (await precoNaComparacao(ids[registro.produto]!, registro.farmacia)) ?? -1
    }
    return {
      mensagensAcumuladas,
      precosAntigosServidosDuranteQueda,
      convergenciaMs,
      filaAoFinal,
      alteracoes: registros,
    }
  } finally {
    await dockerCompose('up', '-d', '--wait', 'catalog-service')
    await resetarFarmacias('biofarma', 'farmaazul')
    for (const [indice, alteracao] of alteracoes.entries()) {
      await aguardarPreco(ids[alteracao.produto]!, alteracao.farmacia, precosAntes[indice]!, 30_000).catch(
        () => undefined,
      )
    }
  }
}
