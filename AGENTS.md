# AGENTS.md — regras para qualquer agente ou pessoa

## Projeto

PriceHub é o MVP do TCC "PriceHub: Uma Arquitetura eficiente Orientada a Eventos e Microsserviços" (Engenharia de Software, UCSal).
Compara preços de medicamentos de 3 farmácias fictícias. O que se avalia é a **arquitetura**: microsserviços
que integram, padronizam, centralizam e atualizam preços por meio de **eventos** (RabbitMQ).
Cenário-chave: preço muda numa farmácia → evento → PriceHub processa → read model atualizado → usuário vê o novo preço (SSE).

## Mapa do repositório

| Caminho | Conteúdo |
|---|---|
| `frontend/` | 3 sites estáticos das farmácias (somente leitura nesta etapa) |
| `backend/apps/farmacia-sim` | simulador das 3 farmácias (uma imagem, 3 instâncias, formatos diferentes) |
| `backend/apps/ingestion-service` | adapters por farmácia, webhooks HMAC, sync e polling → `ingestao.oferta.recebida` |
| `backend/apps/catalog-service` | matching, medicamento canônico, ofertas, histórico, outbox → `catalogo.*` |
| `backend/apps/query-service` | read model de comparação (CQRS), API pública REST + SSE |
| `backend/packages/contracts` | schemas TypeBox: modelo canônico, envelope e eventos |
| `backend/packages/messaging` | conexão, publish com confirm, consume, retry, DLQ, idempotência |
| `backend/packages/observability` | logger, correlationId, problem+json, plugin `/health` |
| `backend/packages/testing` | helpers de Testcontainers e fixtures |
| `backend/tests/e2e` | cenários ponta a ponta contra o compose |
| `backend/scripts` | `gerar-seed`, `demo-preco`, `demo-resiliencia`, `demo-escala` |
| `infra/` | `init.sql` do Postgres, topologia e config do RabbitMQ |
| `docs/` | arquitetura, ADRs, padrões, guia de IA, runbook, material do TCC |

## Comandos essenciais

```bash
cp .env.example .env                 # uma vez
docker compose up -d --build --wait  # sobe tudo (healthy)
pnpm -C backend install
pnpm -C backend lint
pnpm -C backend test                 # unit + integração (Testcontainers)
pnpm -C backend test:e2e             # exige o compose de pé
pnpm -C backend demo:preco           # cenário de avaliação
docker compose logs <servico> --tail 100
```

## Regras de ouro

1. **Investigue antes de codar.** Leia o código e `docs/` relevantes, apresente um plano curto e só então implemente.
2. **Sem comentários no código.** Nomes claros substituem comentários; a documentação fica em `docs/`.
3. **Reaproveite.** Antes de criar utilitário num serviço, verifique se ele pertence a `backend/packages/`.
4. **Commits curtos e semânticos** (Conventional Commits em português): `feat(catalog): adiciona matching por registro MS`.
   Um commit por unidade lógica. Nunca faça `git push` sem pedido explícito.
5. **Suba e valide os containers você mesmo**: `docker compose up -d --build --wait`, `docker compose ps` (todos `healthy`),
   testes e `curl` nos `/health`. Se falhar, leia os logs, encontre a causa raiz, corrija e repita.
6. **Não altere `frontend/`** sem pedido explícito.
7. **Contratos de evento** mudam junto com `docs/arquitetura/eventos.md`, no mesmo commit.
8. **Dinheiro é inteiro em centavos** (`precoCentavos`). Conversão só nos adapters.
9. **Serviços não se chamam por HTTP.** Entre serviços, só eventos. Farmácias falam com o PriceHub por HTTP.
10. **Banco por serviço.** Nenhum serviço lê o banco de outro.
11. **Segredos** nunca entram em prompts, código ou arquivos versionados (use `.env`).

## Convenções

- Domínio em português sem acento (`medicamento`, `oferta`, `precoCentavos`); termos técnicos em inglês (`repository`, `consumer`).
- Arquivos `kebab-case` ou `<contexto>.<camada>.ts`; tipos `PascalCase`; funções e variáveis `camelCase`.
- TypeScript strict, ESM, sem `any`. Validação e contratos com TypeBox. Erros HTTP em `application/problem+json`.
- Detalhes em `docs/padroes/`.

## Definition of Done

- [ ] `docker compose up -d --build --wait` sobe tudo `healthy` a partir de um clone limpo (`.env` copiado do exemplo).
- [ ] `pnpm -C backend lint`, `pnpm -C backend test` e (se tocar fluxo ponta a ponta) `pnpm -C backend test:e2e` verdes.
- [ ] `/health` e `/docs` respondendo nos serviços afetados.
- [ ] Sem comentários, sem segredos, sem `any` sem ADR.
- [ ] `docs/` atualizado com o que mudou (eventos, serviços, ADR se houve decisão).
- [ ] Commits semânticos pequenos.

## Onde ler mais

- Índice: [`docs/README.md`](docs/README.md)
- Arquitetura: [`docs/arquitetura/`](docs/arquitetura/) · Eventos: [`docs/arquitetura/eventos.md`](docs/arquitetura/eventos.md)
- Decisões: [`docs/adr/`](docs/adr/) · Padrões de código: [`docs/padroes/`](docs/padroes/)
- Uso de IA: [`docs/ia/guia-uso-ia.md`](docs/ia/guia-uso-ia.md) · Checklist: [`docs/ia/checklist-revisao.md`](docs/ia/checklist-revisao.md)
- Operação: [`docs/runbook.md`](docs/runbook.md)
