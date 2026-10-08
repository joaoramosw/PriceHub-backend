# PriceHub — Backend

Plataforma de **comparação de preços de medicamentos** que recebe, padroniza e centraliza ofertas de diferentes farmácias e mostra ao usuário o menor preço, atualizado em tempo real.

MVP do TCC *"PriceHub: Uma Arquitetura eficiente Orientada a Eventos e Microsserviços"* (Engenharia de Software — UCSal). O foco avaliado é a **arquitetura**: microsserviços que se comunicam por **eventos** (RabbitMQ), com Transactional Outbox, consumidores idempotentes e um read model de comparação (CQRS).

| Repositório | Conteúdo |
|---|---|
| **Este repositório** — [joaoramosw/PriceHub-backend](https://github.com/joaoramosw/PriceHub-backend) | backend, infraestrutura, testes e documentação (branch `feat/backend-microsservicos`) |
| **Sites das farmácias** — [DaviLuquini/PriceHub-SitesGenericos](https://github.com/DaviLuquini/PriceHub-SitesGenericos) | os 3 sites estáticos originais (BioFarma, FarmaAzul, DrogaPopular), de onde vêm os dados dos medicamentos. Uma cópia está em `frontend/` |

---

## 1. Como funciona, em uma figura

```
 BioFarma :4001 ──webhook──┐
 FarmaAzul :4002 ─webhook──┤                                   ┌─────────────┐
 DrogaPopular :4003 ◄─polling┤   ingestion-service :3001        │  RabbitMQ   │
                           └──► adapters + HMAC + sync ──────►│ pricehub.   │
                                                               │   events    │
                                catalog-service :3002 ◄────────┤             │
                                matching, histórico, outbox ──►│             │
                                                               │             │
                                query-service :3000 ◄──────────┤             │
                                REST + SSE ──► usuário         └─────────────┘
```

1. A farmácia muda um preço e avisa o PriceHub por **webhook** assinado, ou o PriceHub busca o catálogo por **polling**.
2. O **ingestion** converte o formato da farmácia para o modelo canônico e publica `ingestao.oferta.recebida`.
3. O **catalog** descobre qual medicamento é, grava o preço e o histórico e publica `catalogo.oferta.atualizada`.
4. O **query** atualiza a tabela de comparação e avisa o navegador via **SSE**.

Tudo isso leva cerca de **80 ms** (mediana medida). Detalhes em [`docs/arquitetura/visao-geral.md`](docs/arquitetura/visao-geral.md).

---

## 2. Requisitos

| Requisito | Versão / detalhe | Como verificar |
|---|---|---|
| Git | qualquer recente | `git --version` |
| Docker Desktop (ou Docker Engine + Compose v2) | Compose 2.20+ | `docker compose version` |
| Node.js | **24 LTS** | `node --version` |
| pnpm | 10 (via `corepack`) | `corepack enable` e depois `pnpm --version` |
| RAM | 8 GB no host (a VM do Docker usa ~4 GB) | — |
| Disco livre | **15 GB ou mais** (imagens + cache de build) | disco cheio derruba o Docker Desktop |
| Caminho do clone | **sem acentos ou espaços** (ex.: `C:\dev\pricehub`) | o Vitest falha em caminhos como `C:\Users\João\...` |

Portas usadas no host: `3000`, `3001`, `4001`–`4003`, `5433` (Postgres) e `15672` (RabbitMQ UI). Todas podem ser trocadas no `.env`.

---

## 3. Passo a passo para rodar

### 3.1 Clonar

```bash
git clone -b feat/backend-microsservicos https://github.com/joaoramosw/PriceHub-backend.git pricehub
cd pricehub
```

### 3.2 Configurar o ambiente

```bash
cp .env.example .env
```

Os valores do `.env.example` funcionam como estão. Troque as senhas se quiser, e troque as portas se alguma já estiver ocupada (por exemplo, `RABBITMQ_UI_HOST_PORT=15673`). O `.env` nunca vai para o git.

### 3.3 Subir tudo

```bash
docker compose up -d --build --wait
docker compose ps
```

A primeira build leva alguns minutos; as seguintes usam cache. No final, os 8 containers devem aparecer como `healthy`: `postgres`, `rabbitmq`, `farmacia-biofarma`, `farmacia-farmaazul`, `farmacia-drogapopular`, `ingestion-service`, `catalog-service` e `query-service`.

### 3.4 Conferir que está funcionando

```bash
curl http://127.0.0.1:3000/health
curl "http://127.0.0.1:3000/medicamentos?busca=losartana"
```

A segunda chamada deve devolver a Losartana com `qtdFarmacias: 3` e `menorPrecoCentavos: 749`. No boot, o ingestion já sincronizou as 3 farmácias.

> Use `127.0.0.1` em vez de `localhost`: em algumas máquinas Windows, `localhost` resolve para IPv6 e cai em outro processo.

### 3.5 Instalar as dependências do backend (para testes e demos)

```bash
pnpm -C backend install
```

O `postinstall` gera automaticamente os clients do Prisma.

### 3.6 Ver o cenário de avaliação

```bash
pnpm -C backend demo:preco
```

O script muda o preço da Losartana na FarmaAzul de R$ 8,90 para R$ 7,20, escuta o SSE e imprime a latência de cada etapa. Ao final, restaura o preço original.

### 3.7 Rodar os testes

```bash
pnpm -C backend lint
pnpm -C backend test       # unitários + integração (sobe Postgres/RabbitMQ descartáveis via Testcontainers)
pnpm -C backend test:e2e   # 4 cenários contra o ambiente do passo 3.3
```

---

## 4. Endereços úteis

| O quê | URL |
|---|---|
| API pública (comparador) | http://127.0.0.1:3000 · documentação em [/docs](http://127.0.0.1:3000/docs) |
| Eventos em tempo real (SSE) | http://127.0.0.1:3000/eventos/stream |
| ingestion (webhooks, sync) | http://127.0.0.1:3001/docs |
| BioFarma / FarmaAzul / DrogaPopular | http://127.0.0.1:4001/docs · :4002/docs · :4003/docs |
| RabbitMQ (filas, mensagens) | http://127.0.0.1:15672 (usuário e senha do `.env`) |
| catalog (sem porta no host) | `docker compose exec catalog-service wget -qO- http://127.0.0.1:3002/medicamentos` |

### Demonstração manual (ex.: para a banca)

```bash
# terminal 1 — fica escutando as atualizações
curl -N http://127.0.0.1:3000/eventos/stream

# terminal 2 — muda um preço na farmácia
curl -X PATCH http://127.0.0.1:4002/admin/produtos/2/preco \
  -H "content-type: application/json" -H "x-correlation-id: banca-1" \
  -d '{"precoCentavos":720}'

# acompanha o caminho do evento por todos os serviços
docker compose logs --no-log-prefix | grep banca-1

# volta os preços ao original
curl -X POST http://127.0.0.1:4002/admin/reset
```

Outras demonstrações: `pnpm -C backend demo:resiliencia` (catalog fora do ar, sem perda) e `pnpm -C backend demo:escala` (2 instâncias do catalog, sem duplicidade).

---

## 5. Estrutura do repositório

```
├── frontend/                 # cópia dos 3 sites do repositório do Davi (somente leitura)
├── backend/                  # monorepo pnpm + TypeScript
│   ├── apps/
│   │   ├── farmacia-sim/       # simulador das 3 farmácias (formatos diferentes de propósito)
│   │   ├── ingestion-service/  # adapters, webhooks HMAC, sync e polling
│   │   ├── catalog-service/    # matching, ofertas, histórico, outbox
│   │   └── query-service/      # read model, API pública, SSE
│   ├── packages/
│   │   ├── contracts/          # modelo canônico e eventos (TypeBox)
│   │   ├── messaging/          # RabbitMQ: publish, consume, retry, DLQ, idempotência
│   │   ├── observability/      # logger, correlationId, erros, /health
│   │   └── testing/            # Testcontainers e helpers de e2e
│   ├── tests/e2e/              # cenários de avaliação
│   ├── scripts/                # gerar-seed e demos
│   └── Dockerfile              # um target por serviço
├── infra/                    # init do Postgres, topologia e config do RabbitMQ
├── docs/                     # arquitetura, ADRs, padrões, guia de IA, material do TCC
├── docker-compose.yml
├── AGENTS.md                 # regras para qualquer agente de IA (e pessoas)
└── CLAUDE.md                 # complemento específico do Claude Code
```

Stack: Node.js 24, TypeScript strict, Fastify 5, TypeBox, Prisma 7, PostgreSQL 16, RabbitMQ 4.1, Vitest, Biome, Docker Compose.

---

## 6. Por onde começar a ler

| Se você quer… | Leia |
|---|---|
| Entender a arquitetura em 10 minutos | [`docs/arquitetura/visao-geral.md`](docs/arquitetura/visao-geral.md) e [`fluxo-atualizacao-preco.md`](docs/arquitetura/fluxo-atualizacao-preco.md) |
| Saber o que cada serviço faz | [`docs/arquitetura/servicos.md`](docs/arquitetura/servicos.md) |
| Ver os eventos, filas e garantias | [`docs/arquitetura/eventos.md`](docs/arquitetura/eventos.md) |
| Entender como o mesmo remédio é reconhecido nas 3 farmácias | [`docs/arquitetura/matching.md`](docs/arquitetura/matching.md) |
| Ver os formatos das farmácias | [`docs/arquitetura/farmacias-simuladas.md`](docs/arquitetura/farmacias-simuladas.md) |
| Saber por que cada decisão foi tomada | [`docs/adr/`](docs/adr) |
| Material para o TCC (capítulos 4 e 5) | [`docs/tcc/mapeamento-orientacao.md`](docs/tcc/mapeamento-orientacao.md) e [`resultados-testes.md`](docs/tcc/resultados-testes.md) |
| Resolver um problema | [`docs/runbook.md`](docs/runbook.md) |
| Índice completo | [`docs/README.md`](docs/README.md) |

---

## 7. Como continuar o desenvolvimento

### 7.1 Regras do projeto (resumo de [`AGENTS.md`](AGENTS.md))

1. **Investigue antes de codar** e combine um plano curto antes de mudanças grandes.
2. **Sem comentários no código**: nomes claros; explicações vão para `docs/`.
3. **Serviços não se chamam por HTTP**; entre eles, só eventos. Cada serviço tem o próprio banco.
4. **Dinheiro sempre em centavos inteiros** (`precoCentavos`).
5. **Mudou um contrato de evento?** Atualize [`docs/arquitetura/eventos.md`](docs/arquitetura/eventos.md) no mesmo commit.
6. **Antes de dizer que terminou:** `docker compose up -d --build --wait <servico>`, `/health` ok, `pnpm -C backend lint` e os testes afetados verdes.
7. **Commits pequenos** em [Conventional Commits](docs/padroes/git.md) em português: `feat(catalog): adiciona ...`.

### 7.2 Fluxo de trabalho

```bash
git checkout -b feat/<assunto>
# ... código + testes + docs ...
pnpm -C backend lint && pnpm -C backend test
docker compose up -d --build --wait <servico>
git commit -m "feat(<escopo>): <o que mudou>"
```

Usando agentes de IA (Claude Code, Cursor, Codex, OpenCode): siga [`docs/ia/guia-uso-ia.md`](docs/ia/guia-uso-ia.md), use o [template de prompt](docs/ia/template-prompt.md) e revise com o [checklist](docs/ia/checklist-revisao.md). No Claude Code já existem `/subir`, `/demo`, `/nova-farmacia`, `/novo-evento` e `/revisar`.

### 7.3 Receitas comuns

| Tarefa | Onde começar |
|---|---|
| Adicionar uma 4ª farmácia | [`.claude/commands/nova-farmacia.md`](.claude/commands/nova-farmacia.md) (passo a passo serve para qualquer pessoa) |
| Criar um novo evento | [`.claude/commands/novo-evento.md`](.claude/commands/novo-evento.md) |
| Ensinar um novo sinônimo de princípio ativo | [`backend/apps/catalog-service/src/modules/matching/sinonimos.ts`](backend/apps/catalog-service/src/modules/matching/sinonimos.ts) + teste em `matching.test.ts` |
| Alterar uma tabela | `schema.prisma` do serviço + migração (ver [`docs/padroes/banco.md`](docs/padroes/banco.md)) |
| Mudar os medicamentos/preços de origem | edite `frontend/*/products.js` e rode `pnpm -C backend gerar-seed` |
| Desenvolver com rebuild automático | `docker compose watch` |

### 7.4 Próximos passos (fora do escopo atual)

- **Tela do comparador PriceHub**, consumindo `GET /medicamentos`, `GET /medicamentos/:id/comparacao` e o SSE em `/eventos/stream`. O CORS já está liberado para `http://localhost:*`.
- Trocar o `products.js` fixo dos 3 sites por chamadas às APIs das farmácias simuladas.
- Equivalência entre laboratórios (genérico × referência) no matching.
- Autenticação, deploy em nuvem e observabilidade com Prometheus/Grafana.

---

## 8. Problemas comuns

| Sintoma | Solução |
|---|---|
| `port is already allocated` | troque `POSTGRES_HOST_PORT` / `RABBITMQ_UI_HOST_PORT` no `.env` |
| Docker Desktop não sobe ou a build cai com `EOF` | disco cheio: libere espaço, rode `wsl --shutdown` e reabra o Docker Desktop |
| Vitest: `ERR_PACKAGE_IMPORT_NOT_DEFINED "#module-evaluator"` | clone num caminho sem acentos |
| Testes reclamam de `src/generated/prisma` | rode `pnpm -C backend install` |
| Preço não chega ao comparador | `docker compose logs --no-log-prefix \| grep <correlationId>` e as filas `.dlq` no RabbitMQ |

Lista completa no [runbook](docs/runbook.md).
