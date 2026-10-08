# ADR 0003 — Fastify + TypeBox

- **Status:** aceita
- **Data:** 2026-10-08

## Contexto
Os serviços precisam validar entradas HTTP, validar eventos, expor OpenAPI e manter tipos TypeScript coerentes com tudo isso, sem duplicar definições.

## Decisão
Usar **Fastify 5** com `@fastify/type-provider-typebox`. Cada contrato é escrito uma vez em **TypeBox**: o mesmo schema valida a requisição, tipa o handler, gera o OpenAPI (`@fastify/swagger` + `@fastify/swagger-ui` em `/docs`) e valida os eventos em `@pricehub/contracts`. Logs com Pino (nativo do Fastify). Persistência com **Prisma 7** usando o driver adapter `@prisma/adapter-pg` (sem engine binária, o que elimina a configuração de `binaryTargets`/OpenSSL no Alpine).

## Consequências
- Um único lugar para cada contrato; mudanças aparecem no OpenAPI e nos tipos ao mesmo tempo.
- Alto desempenho e baixo overhead.
- Curva de aprendizado de TypeBox para quem vem de Zod.

## Alternativas consideradas
- **Express + Zod:** popular, mas exige plugins extras para OpenAPI e não valida por schema nativamente.
- **NestJS:** produtivo, mas pesado para três serviços pequenos e esconde detalhes que o TCC quer mostrar.
