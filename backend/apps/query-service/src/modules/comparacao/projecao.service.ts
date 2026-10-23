import type { Evento } from '@pricehub/contracts'
import { executarUmaVez } from '@pricehub/messaging'
import type { PrismaClient, Transacao } from '../../plugins/prisma.js'
import type { EventoSse } from '../../plugins/sse.js'
import {
  descreverApresentacao,
  descreverConcentracao,
  descreverQuantidade,
  termosDeBusca,
} from './apresentacao.js'

export type EventoDoCatalogo = Evento<
  'catalogo.medicamento.cadastrado' | 'catalogo.medicamento.atualizado' | 'catalogo.oferta.atualizada'
>

export class MedicamentoAindaNaoProjetado extends Error {
  constructor(medicamentoId: string) {
    super(
      `medicamento ${medicamentoId} ainda não está no read model; aguardando catalogo.medicamento.cadastrado`,
    )
    this.name = 'MedicamentoAindaNaoProjetado'
  }
}

export type ResultadoDaProjecao =
  | { situacao: 'duplicado' }
  | { situacao: 'ignorado-desatualizado' }
  | { situacao: 'aplicado'; notificacao: EventoSse }

export class ProjecaoDeComparacao {
  constructor(private readonly prisma: PrismaClient) {}

  private readonly executarTransacao = <Resultado>(trabalho: (tx: Transacao) => Promise<Resultado>) =>
    this.prisma.$transaction(trabalho, { timeout: 15_000 })

  async aplicar(evento: EventoDoCatalogo): Promise<ResultadoDaProjecao> {
    const resultado = await executarUmaVez(this.executarTransacao, evento, (tx) =>
      evento.type === 'catalogo.oferta.atualizada'
        ? this.aplicarOferta(evento as Evento<'catalogo.oferta.atualizada'>, tx)
        : this.aplicarMedicamento(
            evento as Evento<'catalogo.medicamento.cadastrado' | 'catalogo.medicamento.atualizado'>,
            tx,
          ),
    )
    return resultado.duplicado ? { situacao: 'duplicado' } : resultado.resultado
  }

  private async aplicarMedicamento(
    evento: Evento<'catalogo.medicamento.cadastrado' | 'catalogo.medicamento.atualizado'>,
    tx: Transacao,
  ): Promise<ResultadoDaProjecao> {
    const { data } = evento
    const dados = {
      nome: data.nomeExibicao ?? data.nome,
      principioAtivo: data.principioAtivoExibicao ?? data.principioAtivo,
      concentracao: data.dosagem ?? descreverConcentracao(data.concentracao),
      forma: data.forma,
      quantidade: descreverQuantidade(data.quantidade),
      apresentacao: data.apresentacaoExibicao ?? descreverApresentacao(data.forma, data.quantidade),
      categoria: data.categoria,
      slug: data.slug ?? null,
      dosagem: data.dosagem ?? null,
      laboratorio: data.laboratorio ?? null,
      registroMs: data.registroMs ?? null,
      tarja: data.tarja ?? null,
      tarjaTipo: data.tarjaTipo ?? null,
      imagem: data.imagem ?? null,
      descricao: data.descricao ?? null,
      indicacao: data.indicacao ?? null,
      modoDeUso: data.modoDeUso ?? null,
      contraindicacao: data.contraindicacao ?? null,
      avaliacao: data.avaliacao ?? null,
      avaliacoesTotal: data.avaliacoesTotal ?? null,
      termosDeBusca: termosDeBusca(
        data.nome,
        data.nomeExibicao,
        data.principioAtivo,
        data.principioAtivoExibicao,
        data.categoria,
      ),
    }
    await tx.comparacaoMedicamento.upsert({
      where: { medicamentoId: data.medicamentoId },
      create: { medicamentoId: data.medicamentoId, ...dados },
      update: dados,
    })
    return {
      situacao: 'aplicado',
      notificacao: {
        evento:
          evento.type === 'catalogo.medicamento.cadastrado'
            ? 'medicamento-cadastrado'
            : 'medicamento-atualizado',
        id: evento.eventId,
        dados: { ...data, correlationId: evento.correlationId, eventId: evento.eventId },
      },
    }
  }

  private async aplicarOferta(
    evento: Evento<'catalogo.oferta.atualizada'>,
    tx: Transacao,
  ): Promise<ResultadoDaProjecao> {
    const { data } = evento
    const bloqueado = await tx.$queryRaw<{ nome: string }[]>`
      SELECT nome FROM comparacao_medicamentos WHERE medicamento_id = ${data.medicamentoId}::uuid FOR UPDATE`
    if (bloqueado.length === 0) throw new MedicamentoAindaNaoProjetado(data.medicamentoId)

    const atualizadoEm = new Date(data.atualizadoEm)
    const chave = {
      medicamentoId_farmaciaId: { medicamentoId: data.medicamentoId, farmaciaId: data.farmaciaId },
    }
    const existente = await tx.comparacaoOferta.findUnique({ where: chave })
    if (existente && existente.atualizadoEm > atualizadoEm) return { situacao: 'ignorado-desatualizado' }

    const oferta = {
      farmaciaNome: data.farmaciaNome,
      ofertaId: data.ofertaId,
      precoCentavos: data.precoAtualCentavos,
      atualizadoEm,
    }
    await tx.comparacaoOferta.upsert({
      where: chave,
      create: { medicamentoId: data.medicamentoId, farmaciaId: data.farmaciaId, ...oferta },
      update: oferta,
    })
    const agregados = await tx.comparacaoOferta.aggregate({
      where: { medicamentoId: data.medicamentoId },
      _min: { precoCentavos: true },
      _max: { precoCentavos: true },
      _count: { _all: true },
    })
    const medicamento = await tx.comparacaoMedicamento.update({
      where: { medicamentoId: data.medicamentoId },
      data: {
        nome: data.nomeExibicao ?? undefined,
        principioAtivo: data.principioAtivoExibicao ?? undefined,
        concentracao: data.dosagem ?? undefined,
        dosagem: data.dosagem ?? undefined,
        apresentacao: data.apresentacaoExibicao ?? undefined,
        ...(data.nomeExibicao || data.principioAtivoExibicao || data.dosagem || data.apresentacaoExibicao
          ? {
              termosDeBusca: termosDeBusca(
                data.nomeExibicao,
                data.principioAtivoExibicao,
                data.dosagem,
                data.apresentacaoExibicao,
              ),
            }
          : {}),
        menorPrecoCentavos: agregados._min.precoCentavos,
        maiorPrecoCentavos: agregados._max.precoCentavos,
        qtdFarmacias: agregados._count._all,
        slug: data.slug ?? undefined,
        laboratorio: data.laboratorio ?? undefined,
        registroMs: data.registroMs ?? undefined,
        tarja: data.tarja ?? undefined,
        tarjaTipo: data.tarjaTipo ?? undefined,
        imagem: data.imagem ?? undefined,
        descricao: data.descricao ?? undefined,
        indicacao: data.indicacao ?? undefined,
        modoDeUso: data.modoDeUso ?? undefined,
        contraindicacao: data.contraindicacao ?? undefined,
        avaliacao: data.avaliacao ?? undefined,
        avaliacoesTotal: data.avaliacoesTotal ?? undefined,
      },
    })
    const menorOferta = await tx.comparacaoOferta.findFirst({
      where: { medicamentoId: data.medicamentoId, precoCentavos: agregados._min.precoCentavos ?? undefined },
      orderBy: { farmaciaNome: 'asc' },
    })
    const ofertasAtualizadas = await tx.comparacaoOferta.findMany({
      where: { medicamentoId: data.medicamentoId },
      orderBy: [{ precoCentavos: 'asc' }, { farmaciaNome: 'asc' }],
    })
    return {
      situacao: 'aplicado',
      notificacao: {
        evento: 'oferta-atualizada',
        id: evento.eventId,
        dados: {
          medicamentoId: data.medicamentoId,
          nome: medicamento.nome,
          farmaciaId: data.farmaciaId,
          farmaciaNome: data.farmaciaNome,
          precoAnteriorCentavos: existente?.precoCentavos ?? data.precoAnteriorCentavos,
          precoAtualCentavos: data.precoAtualCentavos,
          menorPrecoCentavos: medicamento.menorPrecoCentavos,
          maiorPrecoCentavos: medicamento.maiorPrecoCentavos,
          qtdFarmacias: medicamento.qtdFarmacias,
          slug: medicamento.slug,
          dosagem: medicamento.dosagem,
          laboratorio: medicamento.laboratorio,
          registroMS: medicamento.registroMs,
          tarja: medicamento.tarja,
          tarjaTipo: medicamento.tarjaTipo,
          imagem: medicamento.imagem,
          descricao: medicamento.descricao,
          indicacao: medicamento.indicacao,
          modoDeUso: medicamento.modoDeUso,
          contraindicacao: medicamento.contraindicacao,
          avaliacao: medicamento.avaliacao,
          avaliacoesTotal: medicamento.avaliacoesTotal,
          farmaciaMaisBarata: menorOferta?.farmaciaNome ?? null,
          ofertas: ofertasAtualizadas.map((oferta) => ({
            farmaciaId: oferta.farmaciaId,
            farmacia: oferta.farmaciaNome,
            precoCentavos: oferta.precoCentavos,
            atualizadoEm: oferta.atualizadoEm.toISOString(),
            ehMenorPreco: oferta.precoCentavos === medicamento.menorPrecoCentavos,
            diferencaParaMenorCentavos:
              oferta.precoCentavos - (medicamento.menorPrecoCentavos ?? oferta.precoCentavos),
          })),
          atualizadoEm: data.atualizadoEm,
          correlationId: evento.correlationId,
          eventId: evento.eventId,
          projetadoEm: new Date().toISOString(),
        },
      },
    }
  }
}
