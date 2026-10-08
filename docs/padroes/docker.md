# Padrões de Docker

## Dockerfile único com um target por serviço

[`backend/Dockerfile`](../../backend/Dockerfile), contexto de build `./backend`, [`backend/.dockerignore`](../../backend/.dockerignore).

```
base     node:24-alpine + openssl + corepack
build    pnpm fetch → pnpm install --frozen-lockfile --offline
         → build de packages e apps (um tsc por vez, heap limitado)
         → pnpm deploy --prod de cada app em /out/<app>
runtime  node:24-alpine + openssl, NODE_ENV=production, usuário node
  ├─ farmacia-sim        COPY /out/farmacia-sim     EXPOSE 4000
  ├─ ingestion-service   COPY /out/ingestion-service EXPOSE 3001
  ├─ catalog-service     COPY /out/catalog-service  EXPOSE 3002
  └─ query-service       COPY /out/query-service    EXPOSE 3000
CMD: prisma migrate deploy && node dist/server.js
```

- **Por que um arquivo só:** a instalação e a compilação do monorepo acontecem **uma vez** e são compartilhadas pelos quatro targets. Com um Dockerfile por app, cada imagem repetia `pnpm install` e todo o `tsc`, o que quadruplicava tempo, CPU e uso de disco da VM do Docker.
- **Build serial** (`--workspace-concurrency=1`, `--max-old-space-size=1536`): mantém o pico de memória baixo em notebooks em que a VM do Docker tem cerca de 4 GB.
- **Prisma 7** com `@prisma/adapter-pg`: o client não usa engine binária. O CLI (`prisma migrate deploy`) continua na imagem final, o que explica a maior parte dos ~750 MB por imagem.
- `HEALTHCHECK` com `wget -qO- http://127.0.0.1:${PORT}/health`, coerente com o compose.
- A farmácia aplica o seed no boot se o banco estiver vazio.

## Compose

- Arquivo único na raiz ([`docker-compose.yml`](../../docker-compose.yml)), projeto `pricehub`.
- **Healthcheck em todos** os serviços; `depends_on` com `condition: service_healthy`.
- Variáveis vindas do `.env` (modelo completo em `.env.example`; `.env` fica fora do git).
- As 3 farmácias usam a **mesma imagem** (`pricehub/farmacia-sim:local`): só `farmacia-biofarma` tem `build`; as outras usam `pull_policy: never`, para evitar três builds concorrentes gravando a mesma tag.
- `catalog-service` sem `ports` (só `expose`), para permitir `--scale catalog-service=2`.
- Postgres com volume nomeado e `init.sql`. RabbitMQ com `definitions.json` (topologia), `rabbitmq.conf` e [`entrypoint.sh`](../../infra/rabbitmq/entrypoint.sh), que gera o usuário do broker a partir do `.env`: quando o RabbitMQ carrega definições no boot, ele não cria o usuário padrão, e versionar credenciais em `definitions.json` não é aceitável.
- AMQP (5672) **não** é publicado no host; scripts e demos usam a API de gerenciamento.
- Portas do host configuráveis (`POSTGRES_HOST_PORT`, `RABBITMQ_UI_HOST_PORT`) para conviver com outros projetos.
- `develop.watch`: `docker compose watch` reconstrói o serviço ao editar `apps/<app>/src` ou `packages/`.

## Validação obrigatória

```bash
docker compose up -d --build --wait
docker compose ps                         # todos healthy
curl -fsS http://127.0.0.1:3000/health
docker compose logs <servico> --tail 100  # em caso de falha
```

## Cuidados com o host

- O `docker_data.vhdx` do Docker Desktop cresce com imagens e cache de build. **Disco do Windows cheio derruba o Docker Desktop** (erros de I/O no VHDX). Mantenha folga de disco e rode `docker builder prune` de vez em quando.
- Use `127.0.0.1` nos scripts: `localhost` pode resolver para `::1`, onde outro processo (ex.: `wslrelay`) pode estar escutando.
