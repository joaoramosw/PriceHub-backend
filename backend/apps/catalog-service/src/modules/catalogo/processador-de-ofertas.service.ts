import { type Evento, gerarId, TiposDeEvento } from '@pricehub/contracts'
import { executarUmaVez } from '@pricehub/messaging'
import type { Logger } from 'pino'
import { ehConflitoTransitorio, type PrismaClient, type Transacao } from '../../plugins/prisma.js'
import { MatchingService } from '../matching/matching.service.js'
import { normalizarOferta } from '../matching/normalizacao.js'
import { OutboxRepository } from '../outbox/outbox.repository.js'
import { FarmaciasRepository, NaoCorrespondidasRepository } from './apoio.repository.js'
import { dadosDoEventoDeMedicamento, MedicamentosRepository } from './medicamentos.repository.js'
import { OfertasRepository } from './ofertas.repository.js'

export type SituacaoDaOferta =
  | 'oferta-criada'
  | 'preco-alterado'
  | 'preco-inalterado'
  | 'ignorada-desatualizada'
  | 'nao-correspondida'

export type ResultadoDoProcessamento =
  | { duplicado: true }
  | {
      duplicado: false
      situacao: SituacaoDaOferta
      medicamentoId?: string
      estrategia?: string
      eventosGerados: number
    }

function repositorios(tx: Transacao) {
  return {
    farmacias: new FarmaciasRepository(tx),
    medicamentos: new MedicamentosRepository(tx),
    ofertas: new OfertasRepository(tx),
    naoCorrespondidas: new NaoCorrespondidasRepository(tx),
    outbox: new OutboxRepository(tx),
  }
}

export class ProcessadorDeOfertas {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly matching = new MatchingService(),
    private readonly tentativasEmConflito = 3,
  ) {}

  private readonly executarTransacao = <Resultado>(trabalho: (tx: Transacao) => Promise<Resultado>) =>
    this.prisma.$transaction(trabalho, { timeout: 15_000 })

  async processar(
    evento: Evento<'ingestao.oferta.recebida'>,
    logger: Logger,
  ): Promise<ResultadoDoProcessamento> {
    for (let tentativa = 1; ; tentativa += 1) {
      try {
        const resultado = await executarUmaVez(this.executarTransacao, evento, (tx) => this.aplicar(evento, tx))
        return resultado.duplicado ? { duplicado: true } : { duplicado: false, ...resultado.resultado }
      } catch (erro) {
        if (!ehConflitoTransitorio(erro) || tentativa >= this.tentativasEmConflito) throw erro
        logger.debug({ tentativa }, 'conflito de concorrência; repetindo a transação')
      }
    }
  }

  private async aplicar(evento: Evento<'ingestao.oferta.recebida'>, tx: Transacao) {
    const { oferta, origem } = evento.data
    const { correlationId } = evento
    const repos = repositorios(tx)
    await repos.farmacias.garantir(oferta.farmaciaId, oferta.farmaciaNome)

    const normalizada = normalizarOferta(oferta)
    const matching = await this.matching.casar(normalizada, repos.medicamentos)

    if (matching.tipo === 'nao-correspondido') {
      await repos.naoCorrespondidas.registrar({
        farmaciaId: oferta.farmaciaId,
        externalId: oferta.externalId,
        motivo: matching.motivo,
        payload: oferta,
        correlationId,
      })
      await repos.outbox.registrar(
        TiposDeEvento.catalogoOfertaNaoCorrespondida,
        { farmaciaId: oferta.farmaciaId, externalId: oferta.externalId, motivo: matching.motivo, oferta },
        correlationId,
      )
      return { situacao: 'nao-correspondida' as const, eventosGerados: 1 }
    }

    let eventosGerados = 0
    const { medicamento } = matching
    if (matching.tipo === 'novo') {
      await repos.outbox.registrar(
        TiposDeEvento.catalogoMedicamentoCadastrado,
        dadosDoEventoDeMedicamento(medicamento),
        correlationId,
      )
      eventosGerados += 1
    } else if (matching.enriquecido) {
      await repos.outbox.registrar(
        TiposDeEvento.catalogoMedicamentoAtualizado,
        dadosDoEventoDeMedicamento(medicamento),
        correlationId,
      )
      eventosGerados += 1
    }
    await repos.naoCorrespondidas.resolver(oferta.farmaciaId, oferta.externalId)

    const estrategia = matching.tipo === 'casado' ? matching.estrategia : 'novo'
    const atualizadoEm = new Date(oferta.atualizadoNaOrigemEm ?? oferta.coletadoEm)
    const existente = await repos.ofertas.bloquearParaAtualizacao(oferta.farmaciaId, oferta.externalId)

    const publicarOferta = async (ofertaId: string, precoAnteriorCentavos: number | null) => {
      await repos.ofertas.registrarHistorico({
        id: gerarId(),
        ofertaId,
        precoAnteriorCentavos,
        precoCentavos: oferta.precoCentavos,
        origem,
        correlationId,
      })
      await repos.outbox.registrar(
        TiposDeEvento.catalogoOfertaAtualizada,
        {
          ofertaId,
          medicamentoId: medicamento.id,
          farmaciaId: oferta.farmaciaId,
          farmaciaNome: oferta.farmaciaNome,
          precoAnteriorCentavos,
          precoAtualCentavos: oferta.precoCentavos,
          atualizadoEm: atualizadoEm.toISOString(),
        },
        correlationId,
      )
      eventosGerados += 1
    }

    if (!existente) {
      const criada = await repos.ofertas.criar({
        id: gerarId(),
        farmaciaId: oferta.farmaciaId,
        externalId: oferta.externalId,
        medicamentoId: medicamento.id,
        nomeNaOrigem: oferta.nome,
        precoCentavos: oferta.precoCentavos,
        atualizadoEm,
      })
      await publicarOferta(criada.id, null)
      return { situacao: 'oferta-criada' as const, medicamentoId: medicamento.id, estrategia, eventosGerados }
    }

    if (atualizadoEm < existente.atualizadoEm) {
      return {
        situacao: 'ignorada-desatualizada' as const,
        medicamentoId: medicamento.id,
        estrategia,
        eventosGerados,
      }
    }

    if (existente.precoCentavos === oferta.precoCentavos) {
      return {
        situacao: 'preco-inalterado' as const,
        medicamentoId: medicamento.id,
        estrategia,
        eventosGerados,
      }
    }

    await repos.ofertas.atualizarPreco(existente.id, oferta.precoCentavos, atualizadoEm, oferta.nome)
    await publicarOferta(existente.id, existente.precoCentavos)
    return { situacao: 'preco-alterado' as const, medicamentoId: medicamento.id, estrategia, eventosGerados }
  }
}
