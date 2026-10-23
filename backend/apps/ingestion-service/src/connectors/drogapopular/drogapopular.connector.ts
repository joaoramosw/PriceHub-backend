import { ehValido, listarErros, type OfertaColetada } from '@pricehub/contracts'
import Type, { type Static } from 'typebox'
import type { BuscarJson } from '../http.js'
import { dataBrasileiraParaIso, normalizarRegistroMs, textoDeReaisParaCentavos } from '../normalizacao.js'
import { ConnectorBase, PayloadInvalidoError } from '../pharmacy-connector.js'
import { interpretarDescricaoDrogaPopular } from './descricao-parser.js'

const ProdutoDrogaPopular = Type.Object({
  COD: Type.String({ minLength: 1 }),
  DESCRICAO: Type.String({ minLength: 1 }),
  LAB: Type.Optional(Type.String()),
  PRECO: Type.String({ minLength: 1 }),
  REGISTRO_MS: Type.Optional(Type.String()),
  SLUG: Type.Optional(Type.String()),
  NOME_EXIBICAO: Type.Optional(Type.String()),
  DOSAGEM: Type.Optional(Type.String()),
  PRINCIPIO_ATIVO_EXIBICAO: Type.Optional(Type.String()),
  APRESENTACAO_EXIBICAO: Type.Optional(Type.String()),
  LABORATORIO: Type.Optional(Type.String()),
  TARJA: Type.Optional(Type.String()),
  TARJA_TIPO: Type.Optional(Type.String()),
  IMAGEM: Type.Optional(Type.String()),
  DESCRICAO_COMERCIAL: Type.Optional(Type.String()),
  INDICACAO: Type.Optional(Type.String()),
  MODO_DE_USO: Type.Optional(Type.String()),
  CONTRAINDICACAO: Type.Optional(Type.String()),
  AVALIACAO: Type.Optional(Type.Number()),
  AVALIACOES_TOTAL: Type.Optional(Type.Integer({ minimum: 0 })),
})

const ArquivoDrogaPopular = Type.Object({
  loja: Type.String(),
  gerado_em: Type.String(),
  produtos: Type.Array(ProdutoDrogaPopular),
})

type ItemDrogaPopular = Static<typeof ProdutoDrogaPopular> & { geradoEm: string | null }

export class DrogaPopularConnector extends ConnectorBase<ItemDrogaPopular> {
  readonly farmaciaId = 'drogapopular'
  readonly farmaciaNome = 'DrogaPopular Express'
  readonly modo = 'polling' as const

  constructor(
    private readonly baseUrl: string,
    private readonly buscarJson: BuscarJson,
  ) {
    super()
  }

  async baixarCatalogo(): Promise<unknown[]> {
    return [await this.buscarJson(`${this.baseUrl}/legacy/precos.json`)]
  }

  protected extrairItensDoCatalogo(pagina: unknown): ItemDrogaPopular[] {
    if (!ehValido(ArquivoDrogaPopular, pagina)) {
      throw new PayloadInvalidoError(
        this.farmaciaId,
        JSON.stringify(listarErros(ArquivoDrogaPopular, pagina)),
      )
    }
    const geradoEm = dataBrasileiraParaIso(pagina.gerado_em)
    return pagina.produtos.map((produto) => ({ ...produto, geradoEm }))
  }

  protected extrairItensDoWebhook(): ItemDrogaPopular[] {
    throw new PayloadInvalidoError(this.farmaciaId, 'a DrogaPopular não envia webhooks')
  }

  protected identificar(item: ItemDrogaPopular): string {
    return item.COD
  }

  protected converterItem(item: ItemDrogaPopular, coletadoEm: Date): OfertaColetada {
    const descricao = interpretarDescricaoDrogaPopular(item.DESCRICAO)
    return {
      farmaciaId: this.farmaciaId,
      farmaciaNome: this.farmaciaNome,
      externalId: item.COD,
      nome: item.DESCRICAO,
      principioAtivo: descricao.principioAtivo,
      concentracao: descricao.concentracao,
      forma: descricao.forma,
      quantidade: descricao.quantidade,
      fabricante: item.LAB ?? null,
      registroMs: normalizarRegistroMs(item.REGISTRO_MS),
      ean: null,
      categoria: null,
      slug: item.SLUG ?? null,
      nomeExibicao: item.NOME_EXIBICAO ?? null,
      dosagem: item.DOSAGEM ?? null,
      principioAtivoExibicao: item.PRINCIPIO_ATIVO_EXIBICAO ?? null,
      apresentacaoExibicao: item.APRESENTACAO_EXIBICAO ?? null,
      laboratorio: item.LABORATORIO ?? null,
      tarja: item.TARJA ?? null,
      tarjaTipo: item.TARJA_TIPO ?? null,
      imagem: item.IMAGEM ?? null,
      descricao: item.DESCRICAO_COMERCIAL ?? null,
      indicacao: item.INDICACAO ?? null,
      modoDeUso: item.MODO_DE_USO ?? null,
      contraindicacao: item.CONTRAINDICACAO ?? null,
      avaliacao: item.AVALIACAO ?? null,
      avaliacoesTotal: item.AVALIACOES_TOTAL ?? null,
      precoCentavos: textoDeReaisParaCentavos(item.PRECO),
      atualizadoNaOrigemEm: item.geradoEm,
      coletadoEm: coletadoEm.toISOString(),
    }
  }
}
