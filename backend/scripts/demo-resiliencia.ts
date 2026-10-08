import { executarCenarioDeResiliencia } from '../tests/e2e/cenarios/resiliencia.js'
import { executarDemo, reais, tabela, titulo } from './saida.js'

await executarDemo('demo:resiliencia', async () => {
  titulo('Cenário de resiliência: catalog-service fora do ar durante 3 alterações de preço')
  console.log('1. docker compose stop catalog-service')
  console.log('2. altera 3 preços (webhooks chegam ao ingestion normalmente)')
  console.log('3. confere as mensagens acumuladas na fila catalog.ingestao-oferta-recebida')
  console.log('4. docker compose start catalog-service e mede a convergência\n')
  const resultado = await executarCenarioDeResiliencia()

  console.log(
    tabela(
      ['Farmácia', 'Produto', 'Antes', 'Alterado para', 'No read model após recuperar'],
      resultado.alteracoes.map((alteracao) => [
        alteracao.farmacia,
        alteracao.produto,
        reais(alteracao.precoAntesCentavos),
        reais(alteracao.precoCentavos),
        reais(alteracao.precoDepoisCentavos),
      ]),
    ),
  )
  console.log()
  console.log(
    tabela(
      ['Medida', 'Valor'],
      [
        ['mensagens acumuladas na fila com o catalog fora', resultado.mensagensAcumuladas],
        [
          'API pública seguiu respondendo (preços anteriores)',
          resultado.precosAntigosServidosDuranteQueda ? 'sim' : 'não',
        ],
        ['tempo até convergir após o start (ms)', resultado.convergenciaMs],
        ['mensagens na fila ao final', resultado.filaAoFinal],
      ],
    ),
  )
  return (
    resultado.filaAoFinal === 0 &&
    resultado.alteracoes.every((alteracao) => alteracao.precoDepoisCentavos === alteracao.precoCentavos)
  )
})
