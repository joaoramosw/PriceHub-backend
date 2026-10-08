export type Produto = {
  id: number
  codigo: string
  dados: Record<string, unknown>
  precoCentavos: number
  atualizadoEm: Date
}

export type ProdutoDoSeed = Omit<Produto, 'atualizadoEm'>

export type SeedDaFarmacia = {
  farmaciaId: string
  farmaciaNome: string
  produtos: ProdutoDoSeed[]
}
