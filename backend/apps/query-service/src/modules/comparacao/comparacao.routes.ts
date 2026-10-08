import { type AppPriceHub, RecursoNaoEncontrado } from '@pricehub/observability'
import { type ComparacaoRepository, paraItem } from './comparacao.repository.js'
import {
  Comparacao,
  ConsultaDeMedicamentos,
  ListaDeCategorias,
  ListaDeFarmacias,
  PaginaDeMedicamentos,
  ParametrosDoMedicamento,
} from './comparacao.schemas.js'

export function registrarRotasDeComparacao(app: AppPriceHub, repository: ComparacaoRepository): void {
  app.get(
    '/medicamentos',
    {
      schema: {
        tags: ['comparacao'],
        summary: 'Lista medicamentos com menor e maior preço, quantidade de farmácias e economia máxima',
        querystring: ConsultaDeMedicamentos,
        response: { 200: PaginaDeMedicamentos },
      },
    },
    async (request) => {
      const page = request.query.page ?? 1
      const pageSize = request.query.pageSize ?? 20
      const { itens, total } = await repository.listar({
        busca: request.query.busca,
        categoria: request.query.categoria,
        page,
        pageSize,
      })
      return { itens, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
    },
  )

  app.get(
    '/medicamentos/:id/comparacao',
    {
      schema: {
        tags: ['comparacao'],
        summary: 'Compara as ofertas de um medicamento, ordenadas por preço, com o menor preço marcado',
        params: ParametrosDoMedicamento,
        response: { 200: Comparacao },
      },
    },
    async (request) => {
      const medicamento = await repository.buscarComOfertas(request.params.id)
      if (!medicamento) throw new RecursoNaoEncontrado(`medicamento ${request.params.id} não encontrado`)
      const menor = medicamento.menorPrecoCentavos
      return {
        medicamento: paraItem(medicamento),
        ofertas: medicamento.ofertas.map((oferta) => ({
          farmaciaId: oferta.farmaciaId,
          farmacia: oferta.farmaciaNome,
          precoCentavos: oferta.precoCentavos,
          atualizadoEm: oferta.atualizadoEm.toISOString(),
          ehMenorPreco: oferta.precoCentavos === menor,
          diferencaParaMenorCentavos: oferta.precoCentavos - (menor ?? oferta.precoCentavos),
        })),
      }
    },
  )

  app.get(
    '/farmacias',
    {
      schema: {
        tags: ['comparacao'],
        summary: 'Farmácias presentes no comparador',
        response: { 200: ListaDeFarmacias },
      },
    },
    () => repository.farmacias(),
  )

  app.get(
    '/categorias',
    {
      schema: {
        tags: ['comparacao'],
        summary: 'Categorias disponíveis para filtro',
        response: { 200: ListaDeCategorias },
      },
    },
    () => repository.categorias(),
  )
}
