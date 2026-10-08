# PriceHub

Plataforma de **comparação de preços de medicamentos** que recebe, padroniza e centraliza ofertas de diferentes farmácias e mostra ao usuário o menor preço, atualizado em tempo real.

MVP do TCC *"PriceHub: Uma Arquitetura eficiente Orientada a Eventos e Microsserviços"* (Engenharia de Software — UCSal). O foco é a arquitetura: microsserviços que se comunicam por **eventos** (RabbitMQ), com Transactional Outbox, consumidores idempotentes e um read model de comparação (CQRS).

```
Farmácias (HTTP: webhook / polling) → ingestion → [ingestao.oferta.recebida] → catalog → [catalogo.*] → query → REST + SSE
```

## Como rodar (3 comandos)

Pré-requisitos: Docker Desktop (Compose v2), Node.js 24 e pnpm (via `corepack`).

```bash
cp .env.example .env
docker compose up -d --build --wait
pnpm -C backend install && pnpm -C backend demo:preco
```

## Portas e URLs

| Serviço | URL | Observação |
|---|---|---|
| query-service (API pública) | http://localhost:3000 · [/docs](http://localhost:3000/docs) | REST + SSE em `/eventos/stream` |
| ingestion-service | http://localhost:3001 · [/docs](http://localhost:3001/docs) | webhooks e sync manual |
| catalog-service | porta 3002 só na rede interna | `docker compose exec catalog-service ...` |
| BioFarma Verde (simulada) | http://localhost:4001 · [/docs](http://localhost:4001/docs) | REST camelCase, webhook |
| FarmaAzul Confiança (simulada) | http://localhost:4002 · [/docs](http://localhost:4002/docs) | snake_case paginado, webhook |
| DrogaPopular Express (simulada) | http://localhost:4003 · [/docs](http://localhost:4003/docs) | legado, só polling |
| RabbitMQ UI | http://localhost:15672 | usuário e senha do `.env` (porta configurável em `RABBITMQ_UI_HOST_PORT`) |
| PostgreSQL | localhost:5433 | um banco lógico por serviço |

## Resultados

Alteração de preço numa farmácia → evento → catálogo → read model → SSE: **mediana de 81 ms** (critério: < 2 s). O sistema também foi validado com o catalog fora do ar (sem perda) e com 2 instâncias (sem duplicidade). Detalhes em [`docs/tcc/resultados-testes.md`](docs/tcc/resultados-testes.md).

## Estrutura

- `frontend/` — vitrines estáticas das 3 farmácias
- `backend/` — monorepo pnpm (apps, packages, testes e2e, scripts)
- `infra/` — Postgres e RabbitMQ
- `docs/` — arquitetura, ADRs, padrões, guia de IA e material do TCC

## Documentação

Comece por [`docs/README.md`](docs/README.md). Para agentes de IA: [`AGENTS.md`](AGENTS.md).
