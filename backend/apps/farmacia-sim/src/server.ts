import { encerrarComGraca } from '@pricehub/observability'
import { buildApp } from './app.js'
import { carregarAmbienteDaFarmacia } from './config/env.js'
import { criarPrisma } from './plugins/prisma.js'

const ambiente = carregarAmbienteDaFarmacia()
const prisma = criarPrisma(ambiente.DATABASE_URL)
const { app, service } = await buildApp({ ambiente, prisma })

await service.aplicarSeedSeVazio(app.log)
await app.listen({ port: ambiente.PORT, host: ambiente.HOST })

encerrarComGraca(app.log, [() => app.close(), () => prisma.$disconnect()])
