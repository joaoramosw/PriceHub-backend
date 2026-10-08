# Padrões de Docker

## Dockerfile (todos os apps)
- Multi-stage com `node:24-alpine`, contexto de build em `./backend`, `.dockerignore` na raiz.
- `corepack enable` → `pnpm install --frozen-lockfile` → `prisma generate` → `tsc` → `pnpm deploy --filter <app> --prod /out`.
- Imagem final: só `/out` (dependências de produção + `dist` + `prisma`), usuário não-root `node`, `NODE_ENV=production`.
- Entrypoint: `prisma migrate deploy && node dist/server.js` (a farmácia também aplica o seed se o banco estiver vazio).
- `HEALTHCHECK` com `wget -qO- http://127.0.0.1:<porta>/health`, coerente com o compose.

## Compose
- Arquivo único na raiz (`docker-compose.yml`), projeto `pricehub`.
- **Healthcheck em todos** os serviços; `depends_on` com `condition: service_healthy`.
- Variáveis vindas do `.env` (modelo completo em `.env.example`; `.env` fica fora do git).
- As 3 farmácias usam a **mesma imagem**, variando `PHARMACY_ID`, porta e `DATABASE_URL`.
- `catalog-service` sem `ports` (só `expose`) para permitir `--scale catalog-service=2`.
- Postgres com volume nomeado e `init.sql`; RabbitMQ com `definitions.json`, `rabbitmq.conf` e entrypoint que gera o usuário a partir do `.env`.
- Portas do host configuráveis (`POSTGRES_HOST_PORT`, `RABBITMQ_UI_HOST_PORT`) para evitar conflito com outros projetos.
- `develop.watch` disponível: `docker compose watch` sincroniza `src/` e reconstrói.

## Validação obrigatória
```bash
docker compose up -d --build --wait
docker compose ps                         # todos healthy
curl -fsS http://localhost:3000/health
docker compose logs <servico> --tail 100  # em caso de falha
```
