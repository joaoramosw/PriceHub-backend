import type { PrismaClient } from '../../plugins/prisma.js'
import type { Produto, ProdutoDoSeed } from './produto.js'

function paraProduto(registro: {
  id: number
  codigo: string
  dados: unknown
  precoCentavos: number
  atualizadoEm: Date
}): Produto {
  return { ...registro, dados: registro.dados as Record<string, unknown> }
}

export class CatalogoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listar(): Promise<Produto[]> {
    const registros = await this.prisma.produto.findMany({ orderBy: { id: 'asc' } })
    return registros.map(paraProduto)
  }

  async listarPagina(pagina: number, tamanho: number): Promise<{ produtos: Produto[]; total: number }> {
    const [registros, total] = await Promise.all([
      this.prisma.produto.findMany({ orderBy: { id: 'asc' }, skip: (pagina - 1) * tamanho, take: tamanho }),
      this.prisma.produto.count(),
    ])
    return { produtos: registros.map(paraProduto), total }
  }

  async buscar(id: number): Promise<Produto | null> {
    const registro = await this.prisma.produto.findUnique({ where: { id } })
    return registro ? paraProduto(registro) : null
  }

  async atualizarPreco(id: number, precoCentavos: number, atualizadoEm: Date): Promise<Produto> {
    return paraProduto(
      await this.prisma.produto.update({ where: { id }, data: { precoCentavos, atualizadoEm } }),
    )
  }

  async contar(): Promise<number> {
    return this.prisma.produto.count()
  }

  async substituirPorSeed(produtos: ProdutoDoSeed[], atualizadoEm: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.produto.deleteMany(),
      this.prisma.produto.createMany({
        data: produtos.map((produto) => ({
          id: produto.id,
          codigo: produto.codigo,
          dados: produto.dados as object,
          precoCentavos: produto.precoCentavos,
          atualizadoEm,
        })),
      }),
    ])
  }

  async verificarConexao(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`
  }
}
