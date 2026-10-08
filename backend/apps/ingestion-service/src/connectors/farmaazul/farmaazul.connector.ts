import { ehValido, listarErros, type OfertaColetada } from '@pricehub/contracts'
import Type, { type Static } from 'typebox'
import type { BuscarJson } from '../http.js'
import {
  dataIsoOuNula,
  interpretarConcentracao,
  interpretarForma,
  normalizarRegistroMs,
  unidadeDeQuantidadePara,
} from '../normalizacao.js'
import { ConnectorBase, PayloadInvalidoError } from '../pharmacy-connector.js'

const ItemFarmaAzul = Type.Object({
  codigo: Type.String({ minLength: 1 }),
  descricao: Type.String({ minLength: 1 }),
  principio_ativo: Type.String({ minLength: 1 }),
  concentracao: Type.String(),
  forma_farmaceutica: Type.String(),
  quantidade_embalagem: Type.Number({ exclusiveMinimum: 0 }),
  fabricante: Type.Optional(Type.String()),
  registro_anvisa: Type.Optional(Type.String()),
  preco_centavos: Type.Integer({ minimum: 0 }),
  ultima_atualizacao: Type.Optional(Type.String()),
})
type ItemFarmaAzul = Static<typeof ItemFarmaAzul>

const PaginaFarmaAzul = Type.Object({
  items: Type.Array(ItemFarmaAzul),
  page: Type.Integer({ minimum: 1 }),
  total_pages: Type.Integer({ minimum: 0 }),
})

const WebhookFarmaAzul = Type.Object({ type: Type.String(), data: Type.Unknown() })

export class FarmaAzulConnector extends ConnectorBase<ItemFarmaAzul> {
  readonly farmaciaId = 'farmaazul'
  readonly farmaciaNome = 'FarmaAzul Confiança'
  readonly modo = 'webhook' as const

  constructor(
    private readonly baseUrl: string,
    private readonly buscarJson: BuscarJson,
    private readonly tamanhoDaPagina = 20,
    private readonly limiteDePaginas = 100,
  ) {
    super()
  }

  async baixarCatalogo(): Promise<unknown[]> {
    const paginas: unknown[] = []
    for (let pagina = 1; pagina <= this.limiteDePaginas; pagina += 1) {
      const resposta = await this.buscarJson(
        `${this.baseUrl}/v1/catalogo?page=${pagina}&page_size=${this.tamanhoDaPagina}`,
      )
      paginas.push(resposta)
      if (!ehValido(PaginaFarmaAzul, resposta) || pagina >= resposta.total_pages) break
    }
    return paginas
  }

  protected extrairItensDoCatalogo(pagina: unknown): ItemFarmaAzul[] {
    if (!ehValido(PaginaFarmaAzul, pagina)) {
      throw new PayloadInvalidoError(this.farmaciaId, JSON.stringify(listarErros(PaginaFarmaAzul, pagina)))
    }
    return pagina.items
  }

  protected extrairItensDoWebhook(payload: unknown): ItemFarmaAzul[] {
    if (!ehValido(WebhookFarmaAzul, payload)) {
      throw new PayloadInvalidoError(this.farmaciaId, 'esperado { type, data }')
    }
    if (payload.type !== 'price.updated') return []
    if (!ehValido(ItemFarmaAzul, payload.data)) {
      throw new PayloadInvalidoError(
        this.farmaciaId,
        JSON.stringify(listarErros(ItemFarmaAzul, payload.data)),
      )
    }
    return [payload.data]
  }

  protected identificar(item: ItemFarmaAzul): string {
    return item.codigo
  }

  protected converterItem(item: ItemFarmaAzul, coletadoEm: Date): OfertaColetada {
    const concentracao = interpretarConcentracao(item.concentracao)
    if (!concentracao) throw new Error(`concentração não identificada em "${item.concentracao}"`)
    const forma = interpretarForma(item.forma_farmaceutica)
    return {
      farmaciaId: this.farmaciaId,
      farmaciaNome: this.farmaciaNome,
      externalId: item.codigo,
      nome: item.descricao,
      principioAtivo: item.principio_ativo,
      concentracao,
      forma,
      quantidade: { valor: item.quantidade_embalagem, unidade: unidadeDeQuantidadePara(forma) },
      fabricante: item.fabricante ?? null,
      registroMs: normalizarRegistroMs(item.registro_anvisa),
      ean: null,
      categoria: null,
      precoCentavos: item.preco_centavos,
      atualizadoNaOrigemEm: dataIsoOuNula(item.ultima_atualizacao),
      coletadoEm: coletadoEm.toISOString(),
    }
  }
}
