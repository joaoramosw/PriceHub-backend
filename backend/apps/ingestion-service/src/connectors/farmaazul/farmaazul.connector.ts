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
  registro_ms_pricehub: Type.Optional(Type.String()),
  slug: Type.Optional(Type.String()),
  nome_exibicao: Type.Optional(Type.String()),
  dosagem: Type.Optional(Type.String()),
  principio_ativo_exibicao: Type.Optional(Type.String()),
  apresentacao_exibicao: Type.Optional(Type.String()),
  laboratorio_completo: Type.Optional(Type.String()),
  tarja: Type.Optional(Type.String()),
  tarja_tipo: Type.Optional(Type.String()),
  imagem: Type.Optional(Type.String()),
  descricao_comercial: Type.Optional(Type.String()),
  indicacao: Type.Optional(Type.String()),
  modo_de_uso: Type.Optional(Type.String()),
  contraindicacao: Type.Optional(Type.String()),
  avaliacao: Type.Optional(Type.Number()),
  avaliacoes_total: Type.Optional(Type.Integer({ minimum: 0 })),
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
      registroMs: normalizarRegistroMs(item.registro_ms_pricehub ?? item.registro_anvisa),
      ean: null,
      categoria: null,
      slug: item.slug ?? null,
      nomeExibicao: item.nome_exibicao ?? null,
      dosagem: item.dosagem ?? null,
      principioAtivoExibicao: item.principio_ativo_exibicao ?? null,
      apresentacaoExibicao: item.apresentacao_exibicao ?? null,
      laboratorio: item.laboratorio_completo ?? item.fabricante ?? null,
      tarja: item.tarja ?? null,
      tarjaTipo: item.tarja_tipo ?? null,
      imagem: item.imagem ?? null,
      descricao: item.descricao_comercial ?? null,
      indicacao: item.indicacao ?? null,
      modoDeUso: item.modo_de_uso ?? null,
      contraindicacao: item.contraindicacao ?? null,
      avaliacao: item.avaliacao ?? null,
      avaliacoesTotal: item.avaliacoes_total ?? null,
      precoCentavos: item.preco_centavos,
      atualizadoNaOrigemEm: dataIsoOuNula(item.ultima_atualizacao),
      coletadoEm: coletadoEm.toISOString(),
    }
  }
}
