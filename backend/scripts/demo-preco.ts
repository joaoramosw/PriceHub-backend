import { executarCenarioDePreco } from '../tests/e2e/cenarios/preco.js'
import { executarDemo, reais, tabela, titulo } from './saida.js'

await executarDemo('demo:preco', async () => {
  titulo('Cenário de avaliação: Losartana na FarmaAzul R$ 8,90 → R$ 7,20')
  const resultado = await executarCenarioDePreco(720)

  console.log(`correlationId: ${resultado.correlationId}`)
  console.log(`preço: ${reais(resultado.precoAnteriorCentavos)} → ${reais(resultado.precoNovoCentavos)}\n`)
  console.log(
    tabela(
      ['Etapa', 'Serviço', 'Δ desde a alteração (ms)'],
      resultado.etapas.map((etapa) => [etapa.etapa, etapa.servico, etapa.desdeAlteracaoMs]),
    ),
  )
  console.log()
  console.log(
    tabela(
      ['Medida (relógio do cliente)', 'ms'],
      [
        ['PATCH na farmácia respondeu', resultado.patchMs],
        ['evento SSE "oferta-atualizada" recebido', resultado.ateSseMs],
        ['GET /comparacao já mostra o novo preço', resultado.ateApiMs],
      ],
    ),
  )
  console.log()
  console.log(
    tabela(
      ['Farmácia', 'Preço', 'Menor preço?'],
      resultado.ofertasFinais.map((oferta) => [
        oferta.farmacia,
        reais(oferta.precoCentavos),
        oferta.ehMenorPreco ? 'sim' : '',
      ]),
    ),
  )
  const aprovado = resultado.ateSseMs < 2000 && resultado.ateApiMs < 2000
  console.log(`\ncritério de aceite: atualização visível em < 2000 ms → ${resultado.ateApiMs} ms`)
  return aprovado
})
