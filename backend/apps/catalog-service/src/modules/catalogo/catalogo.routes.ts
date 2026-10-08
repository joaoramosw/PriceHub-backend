import { type AppPriceHub, RecursoNaoEncontrado } from '@pricehub/observability'
import Type from 'typebox'
import type { PrismaClient } from '../../plugins/prisma.js'

const ResumoDeMedicamento = Type.Object({
  id: Type.String(),
  nome: Type.String(),
  chaveCanonica: Type.String(),
  registroMs: Type.Union([Type.String(), Type.Null()]),
  categoria: Type.Union([Type.String(), Type.Null()]),
  ofertas: Type.Integer(),
})

const DetalheDeMedicamento = Type.Object({
  id: Type.String(),
  nome: Type.String(),
  principioAtivo: Type.String(),
  chaveCanonica: Type.String(),
  registroMs: Type.Union([Type.String(), Type.Null()]),
  ofertas: Type.Array(
    Type.Object({
      farmaciaId: Type.String(),
      externalId: Type.String(),
      precoCentavos: Type.Integer(),
      versao: Type.Integer(),
      atualizadoEm: Type.String(),
      historico: Type.Array(
        Type.Object({
          precoAnteriorCentavos: Type.Union([Type.Integer(), Type.Null()]),
          precoCentavos: Type.Integer(),
          origem: Type.String(),
          correlationId: Type.String(),
          registradoEm: Type.String(),
        }),
      ),
    }),
  ),
})

const NaoCorrespondida = Type.Object({
  farmaciaId: Type.String(),
  externalId: Type.String(),
  motivo: Type.String(),
  tentativas: Type.Integer(),
  atualizadoEm: Type.String(),
})

const EstatisticasDoOutbox = Type.Object({ pendentes: Type.Integer(), publicados: Type.Integer() })

export function registrarRotasDoCatalogo(app: AppPriceHub, prisma: PrismaClient): void {
  app.get(
    '/medicamentos',
    {
      schema: {
        tags: ['catalogo'],
        summary: 'Medicamentos canônicos e quantidade de ofertas (fonte da verdade)',
        response: { 200: Type.Array(ResumoDeMedicamento) },
      },
    },
    async () => {
      const medicamentos = await prisma.medicamento.findMany({
        orderBy: { nome: 'asc' },
        include: { _count: { select: { ofertas: true } } },
      })
      return medicamentos.map((medicamento) => ({
        id: medicamento.id,
        nome: medicamento.nome,
        chaveCanonica: medicamento.chaveCanonica,
        registroMs: medicamento.registroMs,
        categoria: medicamento.categoria,
        ofertas: medicamento._count.ofertas,
      }))
    },
  )

  app.get(
    '/medicamentos/:id',
    {
      schema: {
        tags: ['catalogo'],
        summary: 'Medicamento com ofertas e histórico de preços',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: { 200: DetalheDeMedicamento },
      },
    },
    async (request) => {
      const medicamento = await prisma.medicamento.findUnique({
        where: { id: request.params.id },
        include: { ofertas: { include: { historico: { orderBy: { registradoEm: 'desc' }, take: 20 } } } },
      })
      if (!medicamento) throw new RecursoNaoEncontrado(`medicamento ${request.params.id} não existe`)
      return {
        ...medicamento,
        ofertas: medicamento.ofertas.map((oferta) => ({
          ...oferta,
          atualizadoEm: oferta.atualizadoEm.toISOString(),
          historico: oferta.historico.map((registro) => ({
            ...registro,
            registradoEm: registro.registradoEm.toISOString(),
          })),
        })),
      }
    },
  )

  app.get(
    '/ofertas-nao-correspondidas',
    {
      schema: {
        tags: ['catalogo'],
        summary: 'Ofertas que não puderam ser associadas a um medicamento canônico',
        response: { 200: Type.Array(NaoCorrespondida) },
      },
    },
    async () =>
      (await prisma.ofertaNaoCorrespondida.findMany({ orderBy: { atualizadoEm: 'desc' } })).map(
        (registro) => ({
          ...registro,
          atualizadoEm: registro.atualizadoEm.toISOString(),
        }),
      ),
  )

  app.get(
    '/outbox/estatisticas',
    {
      schema: {
        tags: ['outbox'],
        summary: 'Quantidade de eventos pendentes e publicados no outbox',
        response: { 200: EstatisticasDoOutbox },
      },
    },
    async () => {
      const [pendentes, publicados] = await Promise.all([
        prisma.outbox.count({ where: { publicadoEm: null } }),
        prisma.outbox.count({ where: { publicadoEm: { not: null } } }),
      ])
      return { pendentes, publicados }
    },
  )
}
