import type { PrismaClient } from '../../plugins/prisma.js'
import { normalizarBusca } from './apresentacao.js'
import type { ItemDeMedicamento } from './comparacao.schemas.js'

type LinhaDeMedicamento = {
  medicamentoId: string
  nome: string
  principioAtivo: string
  concentracao: string
  apresentacao: string
  categoria: string | null
  menorPrecoCentavos: number | null
  maiorPrecoCentavos: number | null
  qtdFarmacias: number
  atualizadoEm: Date
}

export function paraItem(linha: LinhaDeMedicamento): ItemDeMedicamento {
  return {
    id: linha.medicamentoId,
    nome: linha.nome,
    principioAtivo: linha.principioAtivo,
    concentracao: linha.concentracao,
    apresentacao: linha.apresentacao,
    categoria: linha.categoria,
    menorPrecoCentavos: linha.menorPrecoCentavos,
    maiorPrecoCentavos: linha.maiorPrecoCentavos,
    qtdFarmacias: linha.qtdFarmacias,
    economiaMaximaCentavos:
      linha.menorPrecoCentavos !== null && linha.maiorPrecoCentavos !== null
        ? linha.maiorPrecoCentavos - linha.menorPrecoCentavos
        : null,
    atualizadoEm: linha.atualizadoEm.toISOString(),
  }
}

export class ComparacaoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listar(filtro: { busca?: string; categoria?: string; page: number; pageSize: number }) {
    const where = {
      ...(filtro.busca ? { termosDeBusca: { contains: normalizarBusca(filtro.busca) } } : {}),
      ...(filtro.categoria ? { categoria: filtro.categoria } : {}),
    }
    const [linhas, total] = await Promise.all([
      this.prisma.comparacaoMedicamento.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: (filtro.page - 1) * filtro.pageSize,
        take: filtro.pageSize,
      }),
      this.prisma.comparacaoMedicamento.count({ where }),
    ])
    return { itens: linhas.map(paraItem), total }
  }

  buscarComOfertas(medicamentoId: string) {
    return this.prisma.comparacaoMedicamento.findUnique({
      where: { medicamentoId },
      include: { ofertas: { orderBy: [{ precoCentavos: 'asc' }, { farmaciaNome: 'asc' }] } },
    })
  }

  async farmacias() {
    const grupos = await this.prisma.comparacaoOferta.groupBy({
      by: ['farmaciaId', 'farmaciaNome'],
      _count: { _all: true },
      orderBy: { farmaciaNome: 'asc' },
    })
    return grupos.map((grupo) => ({
      farmaciaId: grupo.farmaciaId,
      nome: grupo.farmaciaNome,
      qtdOfertas: grupo._count._all,
    }))
  }

  async categorias() {
    const grupos = await this.prisma.comparacaoMedicamento.groupBy({
      by: ['categoria'],
      where: { categoria: { not: null } },
      _count: { _all: true },
      orderBy: { categoria: 'asc' },
    })
    return grupos.map((grupo) => ({ categoria: grupo.categoria!, qtdMedicamentos: grupo._count._all }))
  }

  async verificarConexao(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`
  }
}
