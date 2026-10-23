import Type, { type Static } from 'typebox'
import { centavosParaTextoComVirgula, dataHoraBrasileira } from '../datas.js'
import type { Produto } from '../produto.js'
import type { FormatoDaFarmacia } from './formato.js'

export const ProdutoDrogaPopular = Type.Object({
  COD: Type.String(),
  DESCRICAO: Type.String(),
  LAB: Type.String(),
  PRECO: Type.String({ description: 'Preço em reais com vírgula decimal' }),
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
  AVALIACOES_TOTAL: Type.Optional(Type.Integer()),
})
export type ProdutoDrogaPopular = Static<typeof ProdutoDrogaPopular>

export const ArquivoDePrecosDrogaPopular = Type.Object({
  loja: Type.String(),
  gerado_em: Type.String({ description: 'dd/mm/aaaa hh:mm no horário de Brasília' }),
  produtos: Type.Array(ProdutoDrogaPopular),
})
export type ArquivoDePrecosDrogaPopular = Static<typeof ArquivoDePrecosDrogaPopular>

export function serializarDrogaPopular(produto: Produto): ProdutoDrogaPopular {
  return {
    ...(produto.dados as Omit<ProdutoDrogaPopular, 'PRECO'>),
    PRECO: centavosParaTextoComVirgula(produto.precoCentavos),
  }
}

export function gerarArquivoDePrecos(produtos: Produto[], agora = new Date()): ArquivoDePrecosDrogaPopular {
  return {
    loja: 'DROGAPOPULAR EXPRESS',
    gerado_em: dataHoraBrasileira(agora),
    produtos: produtos.map(serializarDrogaPopular),
  }
}

export const formatoDrogaPopular: FormatoDaFarmacia = {
  farmaciaId: 'drogapopular',
  nome: 'DrogaPopular Express',
  registrarRotas(app, repository) {
    app.get(
      '/legacy/precos.json',
      {
        schema: {
          tags: ['catalogo'],
          summary: 'Arquivo legado de preços da DrogaPopular (sem webhook, só polling)',
          response: { 200: ArquivoDePrecosDrogaPopular },
        },
      },
      async () => gerarArquivoDePrecos(await repository.listar()),
    )
  },
}
