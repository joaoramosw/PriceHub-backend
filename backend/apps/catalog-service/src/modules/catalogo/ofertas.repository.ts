import type { Transacao } from '../../plugins/prisma.js'

export type Oferta = {
  id: string
  farmaciaId: string
  externalId: string
  medicamentoId: string
  nomeNaOrigem: string
  precoCentavos: number
  atualizadoEm: Date
  versao: number
}

export type RegistroDeHistorico = {
  id: string
  ofertaId: string
  precoAnteriorCentavos: number | null
  precoCentavos: number
  origem: string
  correlationId: string
}

export class OfertasRepository {
  constructor(private readonly db: Transacao) {}

  async bloquearParaAtualizacao(farmaciaId: string, externalId: string): Promise<Oferta | null> {
    const linhas = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM ofertas WHERE farmacia_id = ${farmaciaId} AND external_id = ${externalId} FOR UPDATE`
    if (linhas.length === 0) return null
    return this.db.oferta.findUnique({ where: { id: linhas[0]!.id } })
  }

  criar(oferta: Omit<Oferta, 'versao'>): Promise<Oferta> {
    return this.db.oferta.create({ data: { ...oferta, versao: 1 } })
  }

  atualizarPreco(
    id: string,
    precoCentavos: number,
    atualizadoEm: Date,
    nomeNaOrigem: string,
  ): Promise<Oferta> {
    return this.db.oferta.update({
      where: { id },
      data: { precoCentavos, atualizadoEm, nomeNaOrigem, versao: { increment: 1 } },
    })
  }

  async registrarHistorico(registro: RegistroDeHistorico): Promise<void> {
    await this.db.historicoPreco.create({ data: registro })
  }
}
