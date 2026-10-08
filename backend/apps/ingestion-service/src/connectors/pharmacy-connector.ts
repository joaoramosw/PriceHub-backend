import { ContratoInvalidoError, OfertaColetada, validar } from '@pricehub/contracts'

export type ItemDescartado = { externalId: string; motivo: string }

export type ResultadoDaConversao = {
  ofertas: OfertaColetada[]
  descartados: ItemDescartado[]
}

export interface PharmacyConnector {
  readonly farmaciaId: string
  readonly farmaciaNome: string
  readonly modo: 'webhook' | 'polling'
  buscarCatalogo(): Promise<OfertaColetada[]>
  converterWebhook(payload: unknown): OfertaColetada[]
  baixarCatalogo(): Promise<unknown[]>
  converterCatalogo(paginas: unknown[], coletadoEm?: Date): ResultadoDaConversao
  converterWebhookDetalhado(payload: unknown, coletadoEm?: Date): ResultadoDaConversao
}

export class PayloadInvalidoError extends Error {
  constructor(
    readonly farmaciaId: string,
    detalhe: string,
  ) {
    super(`payload inválido da farmácia ${farmaciaId}: ${detalhe}`)
    this.name = 'PayloadInvalidoError'
  }
}

export abstract class ConnectorBase<Item> implements PharmacyConnector {
  abstract readonly farmaciaId: string
  abstract readonly farmaciaNome: string
  abstract readonly modo: 'webhook' | 'polling'

  abstract baixarCatalogo(): Promise<unknown[]>
  protected abstract extrairItensDoCatalogo(pagina: unknown): Item[]
  protected abstract extrairItensDoWebhook(payload: unknown): Item[]
  protected abstract identificar(item: Item): string
  protected abstract converterItem(item: Item, coletadoEm: Date): OfertaColetada

  async buscarCatalogo(): Promise<OfertaColetada[]> {
    return this.converterCatalogo(await this.baixarCatalogo()).ofertas
  }

  converterWebhook(payload: unknown): OfertaColetada[] {
    return this.converterWebhookDetalhado(payload).ofertas
  }

  converterCatalogo(paginas: unknown[], coletadoEm = new Date()): ResultadoDaConversao {
    return this.converterItens(
      paginas.flatMap((pagina) => this.extrairItensDoCatalogo(pagina)),
      coletadoEm,
    )
  }

  converterWebhookDetalhado(payload: unknown, coletadoEm = new Date()): ResultadoDaConversao {
    return this.converterItens(this.extrairItensDoWebhook(payload), coletadoEm)
  }

  private converterItens(itens: Item[], coletadoEm: Date): ResultadoDaConversao {
    const resultado: ResultadoDaConversao = { ofertas: [], descartados: [] }
    for (const item of itens) {
      const externalId = this.identificar(item)
      try {
        resultado.ofertas.push(validar(OfertaColetada, this.converterItem(item, coletadoEm), 'oferta'))
      } catch (erro) {
        const motivo =
          erro instanceof ContratoInvalidoError || erro instanceof Error ? erro.message : String(erro)
        resultado.descartados.push({ externalId, motivo })
      }
    }
    return resultado
  }
}
