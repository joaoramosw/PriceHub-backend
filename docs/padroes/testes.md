# Padrões de testes

## Pirâmide
| Tipo | Onde | O que cobre | Dependências |
|---|---|---|---|
| Unitário | `apps/*/test/unit`, `packages/*/test/unit` | adapters, parsers, matching, serializadores, schemas | nenhuma |
| Integração | `apps/*/test/integration`, `packages/*/test/integration` | consumers, repositories, outbox, retry/DLQ, rotas com `app.inject()` | Testcontainers (Postgres, RabbitMQ) |
| E2E | `tests/e2e` | cenários de avaliação contra o compose em execução | `docker compose up -d --build --wait` |

## Como rodar
```bash
pnpm -C backend test              # unit + integração
pnpm -C backend test:unit
pnpm -C backend test:integration  # exige Docker
pnpm -C backend test:e2e          # exige o compose de pé
```

## Regras
- **Vitest** em todo o monorepo (`backend/vitest.config.ts`, projetos `unit`, `integration`, `e2e`).
- HTTP testado com `buildApp()` + `app.inject()`, sem abrir porta.
- Integração usa `@pricehub/testing` para subir Postgres/RabbitMQ efêmeros e aplicar a topologia de `infra/rabbitmq/definitions.json`.
- Fixtures reais de cada formato de farmácia ficam em `test/fixtures/` do serviço que as consome.
- Teste o comportamento, não a implementação: entrada → saída observável (resposta, linha no banco, mensagem na fila).
- Todo bug corrigido ganha um teste que falhava antes.
- Os 10 medicamentos dos 3 seeds devem casar 100% (teste no catalog).
