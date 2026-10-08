import { aguardarAte } from './aguardar.js'
import { type FarmaciaDoCompose, obterJson, urls } from './ambiente-compose.js'

export type OfertaDaComparacao = {
  farmaciaId: string
  farmacia: string
  precoCentavos: number
  atualizadoEm: string
  ehMenorPreco: boolean
}

export type ComparacaoDoMedicamento = {
  medicamento: { id: string; nome: string; menorPrecoCentavos: number | null; qtdFarmacias: number }
  ofertas: OfertaDaComparacao[]
}

export const produtosDaDemo = {
  losartana: { id: 2, busca: 'losartana' },
  dipirona: { id: 3, busca: 'dipirona' },
  hidroclorotiazida: { id: 5, busca: 'hidroclorotiazida' },
  sinvastatina: { id: 8, busca: 'sinvastatina' },
  ibuprofeno: { id: 9, busca: 'ibuprofeno' },
  omeprazol: { id: 4, busca: 'omeprazol' },
} as const

export async function idDoMedicamento(busca: string): Promise<string> {
  const pagina = await obterJson<{ itens: { id: string }[] }>(
    `${urls.query}/medicamentos?busca=${encodeURIComponent(busca)}`,
  )
  if (pagina.itens.length !== 1)
    throw new Error(`busca "${busca}" retornou ${pagina.itens.length} medicamentos`)
  return pagina.itens[0]!.id
}

export function comparacao(medicamentoId: string): Promise<ComparacaoDoMedicamento> {
  return obterJson(`${urls.query}/medicamentos/${medicamentoId}/comparacao`)
}

export async function precoNaComparacao(
  medicamentoId: string,
  farmaciaId: string,
): Promise<number | undefined> {
  const resultado = await comparacao(medicamentoId)
  return resultado.ofertas.find((oferta) => oferta.farmaciaId === farmaciaId)?.precoCentavos
}

export async function alterarPreco(
  farmacia: FarmaciaDoCompose,
  produtoId: number,
  precoCentavos: number,
  correlationId: string,
): Promise<{ precoAnteriorCentavos: number; webhook: string; correlationId: string }> {
  return obterJson(`${urls.farmacias[farmacia]}/admin/produtos/${produtoId}/preco`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-correlation-id': correlationId },
    body: JSON.stringify({ precoCentavos }),
  })
}

export async function resetarFarmacias(...farmacias: FarmaciaDoCompose[]): Promise<void> {
  const alvo = farmacias.length ? farmacias : (Object.keys(urls.farmacias) as FarmaciaDoCompose[])
  await Promise.all(
    alvo.map((farmacia) => obterJson(`${urls.farmacias[farmacia]}/admin/reset`, { method: 'POST' })),
  )
}

export async function sincronizar(farmacia: FarmaciaDoCompose, correlationId: string): Promise<void> {
  await obterJson(`${urls.ingestion}/sync/${farmacia}`, {
    method: 'POST',
    headers: { 'x-correlation-id': correlationId },
  })
}

export async function aguardarPreco(
  medicamentoId: string,
  farmaciaId: string,
  precoCentavos: number,
  timeoutMs = 10_000,
  intervaloMs = 25,
): Promise<number> {
  const inicio = Date.now()
  await aguardarAte(async () => (await precoNaComparacao(medicamentoId, farmaciaId)) === precoCentavos, {
    timeoutMs,
    intervaloMs,
    descricao: `${farmaciaId} = ${precoCentavos} centavos no read model`,
  })
  return Date.now() - inicio
}

export async function restaurarSeeds(): Promise<void> {
  await resetarFarmacias()
  await sincronizar('drogapopular', `restauracao-${Date.now()}`)
}
