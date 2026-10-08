# Padrões de código

## Linguagem e ferramentas
- TypeScript **strict** (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`), ESM, Node.js 24.
- Lint e formatação: **Biome** (`pnpm -C backend lint` / `format`). O hook do Claude Code formata ao editar.
- Sem `any`. Se for inevitável, registre a justificativa num ADR. Prefira `unknown` + validação TypeBox.

## Sem comentários
Não escreva comentários no código. Use nomes que expliquem a intenção; extraia funções em vez de comentar blocos. Explicações de arquitetura ficam em `docs/`.

## Nomes
- Domínio em português sem acento: `medicamento`, `oferta`, `farmacia`, `precoCentavos`, `registroMs`.
- Termos técnicos em inglês: `repository`, `service`, `consumer`, `publisher`, `handler`, `plugin`.
- Arquivos: `kebab-case.ts` ou `<contexto>.<camada>.ts` (`ofertas.repository.ts`).
- Tipos `PascalCase`; funções e variáveis `camelCase`; constantes de módulo `camelCase` ou `UPPER_SNAKE` para env.

## Camadas de um serviço
```
routes  → recebe HTTP, valida com schema, chama o service
service → regra de negócio, orquestra repositories e publishers
repository → acesso a dados (Prisma), sem regra de negócio
events/consumers  → recebem eventos, validam contrato, chamam o service
events/publishers → montam o envelope e publicam (ou gravam no outbox)
```
- `app.ts` exporta `buildApp()` (usado nos testes com `app.inject()`); `server.ts` sobe HTTP e consumers e trata `SIGTERM`.
- `config/env.ts` valida variáveis com TypeBox e falha no boot se inválidas.

## Dinheiro e datas
- Valores monetários sempre em **centavos inteiros** (`precoCentavos`). Conversão de reais/strings só nos adapters.
- Datas trafegam como ISO 8601 UTC (`toISOString()`).

## Erros
- Erros HTTP seguem RFC 9457 (`application/problem+json`) pelo `errorHandler` de `@pricehub/observability`.
- Lance `ProblemaHttp` (ou subclasses) para erros esperados; deixe erros inesperados virarem 500.
- Consumidores: erros de validação de contrato vão direto para a DLQ; erros transitórios seguem o retry.

## Reaproveitamento
Antes de criar utilitário dentro de um serviço, verifique `backend/packages/`. Se dois serviços precisam, o código pertence a um pacote.
