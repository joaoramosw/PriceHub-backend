import { executarCenarioDeEscala } from '../tests/e2e/cenarios/escala.js'
import { executarDemo, tabela, titulo } from './saida.js'

await executarDemo('demo:escala', async () => {
  titulo('Cenário de escalabilidade: catalog-service com 2 instâncias')
  console.log('docker compose up -d --scale catalog-service=2 e lote de 20 alterações de preço\n')
  const resultado = await executarCenarioDeEscala(2)

  console.log(
    tabela(
      ['Instância (container)', 'Ofertas processadas'],
      Object.entries(resultado.processadasPorInstancia).map(([instancia, total]) => [instancia, total]),
    ),
  )
  console.log()
  console.log(
    tabela(
      ['Medida', 'Valor'],
      [
        ['alterações disparadas', resultado.alteracoes],
        ['eventos processados por mais de uma instância', resultado.eventosProcessadosMaisDeUmaVez],
        ['duplicados descartados pelo consumer idempotente', resultado.duplicadosIgnorados],
        ['tempo até todas aparecerem no read model (ms)', resultado.tempoTotalMs],
      ],
    ),
  )
  const instanciasAtivas = Object.keys(resultado.processadasPorInstancia).length
  return instanciasAtivas === resultado.instancias && resultado.eventosProcessadosMaisDeUmaVez === 0
})
