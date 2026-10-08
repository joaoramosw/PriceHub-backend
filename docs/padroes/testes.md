# Padrões de testes

## Pirâmide

| Tipo | Onde | O que cobre | Dependências |
|---|---|---|---|
| Unitário | `apps/*/test/unit`, `packages/*/test/unit` | adapters e normalização, parser da DrogaPopular, matching (com repositório em memória), serializadores das farmácias, schemas, CORS, HMAC | nenhuma |
| Integração | `apps/*/test/integration`, `packages/*/test/integration` | consumers, outbox, retry/DLQ, idempotência, rotas HTTP, SSE | Testcontainers (Postgres 16 e RabbitMQ 4.1 efêmeros) |
| E2E | `tests/e2e` | os 4 cenários de avaliação contra o compose | `docker compose up -d --build --wait` |

## Como rodar

```bash
pnpm -C backend test              # unit + integração (exige Docker)
pnpm -C backend test:unit
pnpm -C backend test:integration
pnpm -C backend test:e2e          # exige o compose de pé
pnpm -C backend demo:preco        # mesmos cenários, com saída legível
```

## Organização

- **Vitest 4** com três projetos em [`backend/vitest.config.ts`](../../backend/vitest.config.ts): `unit`, `integration` (sem paralelismo de arquivos) e `e2e`.
- Os pacotes do workspace são resolvidos pelo código-fonte (condição `@pricehub/source`), sem precisar de build antes dos testes.
- HTTP testado com `buildApp()` + `app.inject()`, sem abrir porta. O SSE é a exceção: abre porta efêmera e usa `conectarSse`.
- [`@pricehub/testing`](../../backend/packages/testing/src) oferece:
  - `iniciarPostgres`, `iniciarRabbitMq` (já aplica a topologia de `infra/rabbitmq/definitions.json`), `aplicarMigracoes`;
  - `iniciarReceptorHttp` (captura webhooks), `conectarSse`, `aguardarAte`;
  - para e2e: `dockerCompose`, `lerLogs`, `filaRabbitMq`, `alterarPreco`, `aguardarPreco`, `resetarFarmacias`.
- **Fixtures reais:** as respostas das farmácias foram capturadas do ambiente em execução ([`ingestion-service/test/fixtures`](../../backend/apps/ingestion-service/test/fixtures)), e as 30 `OfertaColetada` produzidas pelos adapters viram fixture do catalog ([`ofertas-coletadas.json`](../../backend/apps/catalog-service/test/fixtures/ofertas-coletadas.json)). Isso funciona como teste de contrato entre ingestion e catalog.
- **Cenários e2e reutilizáveis:** a lógica fica em [`tests/e2e/cenarios`](../../backend/tests/e2e/cenarios); os testes fazem asserções e os scripts `demo:*` imprimem tabelas a partir das mesmas funções. Cada cenário restaura os preços do seed ao terminar.

## Regras

- Teste o comportamento observável (resposta HTTP, linha no banco, mensagem na fila, evento SSE), não detalhes internos.
- Cada teste de integração usa filas e dados próprios para não depender da ordem de execução.
- Todo bug corrigido ganha um teste que falhava antes.
- Os 10 medicamentos dos 3 seeds devem casar 100% ([`matching.test.ts`](../../backend/apps/catalog-service/test/unit/matching.test.ts)).
