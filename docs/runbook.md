# Runbook

## Subir o ambiente

```bash
cp .env.example .env                 # uma vez; ajuste portas se houver conflito
docker compose up -d --build --wait  # build + todos os serviços healthy
docker compose ps                    # confira "healthy" em todos
pnpm -C backend install              # para rodar testes, demos e scripts no host
```

No Claude Code, o hook `SessionStart` já sobe o ambiente e `/subir` faz a validação completa.

Para parar: `docker compose down`. Para apagar os dados e recomeçar do seed: `docker compose down -v && docker compose up -d --build --wait`.

## Portas e URLs

| Serviço | URL | Observação |
|---|---|---|
| API pública (query) | http://localhost:3000 · `/docs` | `/eventos/stream` (SSE) |
| ingestion | http://localhost:3001 · `/docs` | `/webhooks/:farmacia`, `/sync/:farmacia`, `/coletas` |
| catalog | sem porta no host | `docker compose exec catalog-service wget -qO- http://127.0.0.1:3002/medicamentos` |
| BioFarma / FarmaAzul / DrogaPopular | :4001 / :4002 / :4003 · `/docs` | `PATCH /admin/produtos/:id/preco`, `POST /admin/reset` |
| RabbitMQ UI | http://localhost:${RABBITMQ_UI_HOST_PORT:-15672} | usuário e senha do `.env` |
| PostgreSQL | localhost:${POSTGRES_HOST_PORT:-5433} | bancos `catalog`, `query`, `ingestion`, `farmacia_*` |

## Demonstrações

| Comando | O que mostra | Duração |
|---|---|---|
| `pnpm -C backend demo:preco` | alteração de preço → SSE, com latência por etapa | ~5 s |
| `pnpm -C backend demo:resiliencia` | catalog fora, fila acumulando, convergência sem perda | ~30 s |
| `pnpm -C backend demo:escala` | 2 instâncias do catalog dividindo a carga sem duplicar | ~30 s |
| `pnpm -C backend test:e2e` | os 4 cenários (inclui o polling da DrogaPopular) com asserções | ~50 s |

Todas restauram os preços do seed ao final.

### Demonstração manual (para a banca)

```bash
curl -N http://localhost:3000/eventos/stream                     # terminal 1: escuta o SSE
curl -s "http://localhost:3000/medicamentos?busca=losartana"     # terminal 2: pega o id
curl -X PATCH http://localhost:4002/admin/produtos/2/preco \
  -H 'content-type: application/json' -H 'x-correlation-id: banca-1' \
  -d '{"precoCentavos":720}'
docker compose logs --no-log-prefix | grep banca-1               # o caminho do evento
curl -X POST http://localhost:4002/admin/reset                   # volta ao seed
```

## Testes

```bash
pnpm -C backend lint
pnpm -C backend test        # unit + integração (Testcontainers sobe Postgres e RabbitMQ efêmeros)
pnpm -C backend test:e2e    # exige o compose de pé
```

## Diagnóstico

| Sintoma | Causa provável | Ação |
|---|---|---|
| `docker compose up` falha com "port is already allocated" | outro projeto usa a porta (ex.: 5432, 15672) | troque `POSTGRES_HOST_PORT` / `RABBITMQ_UI_HOST_PORT` no `.env` |
| Docker Desktop não sobe; build cai com `EOF` / `unexpected end of JSON input` | **disco do Windows cheio**: o `docker_data.vhdx` não consegue crescer (no WSL: `dmesg` mostra `I/O error ... EXT4-fs error loading journal`) | libere espaço no C:; depois feche o Docker Desktop, rode `wsl --shutdown` e abra de novo; `docker builder prune` reduz o cache de build |
| `curl localhost:3001` dá "connection reset" mas o container está healthy | outro processo (ex.: `wslrelay` de uma distro WSL) escuta em `[::1]:3001` | use `127.0.0.1` em vez de `localhost` |
| `vitest` falha com `ERR_PACKAGE_IMPORT_NOT_DEFINED "#module-evaluator"` | repositório clonado num caminho com acento ou nome curto 8.3 do Windows (ex.: `C:UsersJoão...`) | clone num caminho só com ASCII (ex.: `C:devpricehub`) |
| Testes reclamam de `src/generated/prisma` ausente | `pnpm install` não rodou o `postinstall` | `pnpm -C backend install` (gera os clients do Prisma) |
| Serviço não fica healthy | banco ou broker indisponível, migração falhou | `docker compose logs <servico> --tail 100`; o `/health` mostra qual check falhou |
| Preço não muda no comparador | webhook falhou, evento em retry ou DLQ | `docker compose logs --no-log-prefix \| grep <correlationId>`; RabbitMQ UI → filas `.retry` / `.dlq` |
| Mensagens na `catalog.ingestao-oferta-recebida.dlq` | contrato inválido ou erro persistente | inspecione na UI (header `x-ultimo-erro`); corrija e reenvie com shovel ou republique |
| Oferta não aparece no catálogo | matching impossível | `docker compose exec catalog-service wget -qO- http://127.0.0.1:3002/ofertas-nao-correspondidas` e fila `revisao.ofertas-nao-correspondidas` |
| Eventos presos no outbox | broker fora | `.../outbox/estatisticas`; o relay republica sozinho quando o broker volta |
| Mudou `infra/rabbitmq/definitions.json` e nada aconteceu | definições só são lidas no boot do broker | `docker compose restart rabbitmq` |

## Operações comuns

```bash
docker compose up -d --build --wait <servico>      # após alterar código de um serviço
docker compose up -d --scale catalog-service=2     # escalar o catalog
curl -X POST http://localhost:3001/sync/biofarma   # forçar reconciliação de uma farmácia
pnpm -C backend gerar-seed                         # só se o frontend mudar
docker compose watch                               # rebuild automático ao editar src/
```

Criar uma migração após mudar um `schema.prisma` (com o compose de pé; o banco do serviço é exposto na porta do host):

```bash
cd backend/apps/<servico>
DATABASE_URL="postgresql://<usuario>:<senha>@127.0.0.1:5433/<banco>" npx prisma migrate dev --create-only --name <descricao>
```

Revise o SQL gerado, faça o commit junto com o schema e rode `docker compose up -d --build --wait <servico>` (o container aplica com `prisma migrate deploy`).
