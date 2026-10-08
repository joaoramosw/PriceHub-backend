import { ehValido, listarErros, type OfertaColetada } from '@pricehub/contracts'
import Type, { type Static } from 'typebox'
import type { BuscarJson } from '../http.js'
import {
  dataIsoOuNula,
  interpretarApresentacao,
  interpretarConcentracao,
  normalizarEspacos,
  normalizarRegistroMs,
  principioSemDose,
  reaisParaCentavos,
} from '../normalizacao.js'
import { ConnectorBase, PayloadInvalidoError } from '../pharmacy-connector.js'

const ProdutoBioFarma = Type.Object({
  id: Type.Integer(),
  sku: Type.String({ minLength: 1 }),
  nome: Type.String({ minLength: 1 }),
  dosagem: Type.String(),
  apresentacao: Type.String(),
  principioAtivo: Type.String(),
  laboratorio: Type.Optional(Type.String()),
  registroMS: Type.Optional(Type.String()),
  categoria: Type.Optional(Type.String()),
  preco: Type.Number({ minimum: 0 }),
  atualizadoEm: Type.Optional(Type.String()),
})
type ProdutoBioFarma = Static<typeof ProdutoBioFarma>

const CatalogoBioFarma = Type.Array(ProdutoBioFarma)
const WebhookBioFarma = Type.Object({ evento: Type.String(), produto: Type.Unknown() })

export class BioFarmaConnector extends ConnectorBase<ProdutoBioFarma> {
  readonly farmaciaId = 'biofarma'
  readonly farmaciaNome = 'BioFarma Verde'
  readonly modo = 'webhook' as const

  constructor(
    private readonly baseUrl: string,
    private readonly buscarJson: BuscarJson,
  ) {
    super()
  }

  async baixarCatalogo(): Promise<unknown[]> {
    return [await this.buscarJson(`${this.baseUrl}/api/produtos`)]
  }

  protected extrairItensDoCatalogo(pagina: unknown): ProdutoBioFarma[] {
    if (!ehValido(CatalogoBioFarma, pagina)) {
      throw new PayloadInvalidoError(this.farmaciaId, JSON.stringify(listarErros(CatalogoBioFarma, pagina)))
    }
    return pagina
  }

  protected extrairItensDoWebhook(payload: unknown): ProdutoBioFarma[] {
    if (!ehValido(WebhookBioFarma, payload)) {
      throw new PayloadInvalidoError(this.farmaciaId, 'esperado { evento, produto }')
    }
    if (payload.evento !== 'preco_alterado') return []
    if (!ehValido(ProdutoBioFarma, payload.produto)) {
      throw new PayloadInvalidoError(
        this.farmaciaId,
        JSON.stringify(listarErros(ProdutoBioFarma, payload.produto)),
      )
    }
    return [payload.produto]
  }

  protected identificar(item: ProdutoBioFarma): string {
    return item.sku
  }

  protected converterItem(item: ProdutoBioFarma, coletadoEm: Date): OfertaColetada {
    const { forma, quantidade } = interpretarApresentacao(item.apresentacao)
    const concentracao = interpretarConcentracao(item.dosagem) ?? interpretarConcentracao(item.principioAtivo)
    if (!concentracao) throw new Error(`concentração não identificada em "${item.dosagem}"`)
    if (!quantidade) throw new Error(`quantidade não identificada em "${item.apresentacao}"`)
    return {
      farmaciaId: this.farmaciaId,
      farmaciaNome: this.farmaciaNome,
      externalId: item.sku,
      nome: normalizarEspacos(`${item.nome} ${item.dosagem}`),
      principioAtivo: principioSemDose(item.principioAtivo),
      concentracao,
      forma,
      quantidade,
      fabricante: item.laboratorio ?? null,
      registroMs: normalizarRegistroMs(item.registroMS),
      ean: null,
      categoria: item.categoria ?? null,
      precoCentavos: reaisParaCentavos(item.preco),
      atualizadoNaOrigemEm: dataIsoOuNula(item.atualizadoEm),
      coletadoEm: coletadoEm.toISOString(),
    }
  }
}
