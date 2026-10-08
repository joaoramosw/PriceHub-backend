---
description: Sobe o ambiente PriceHub, valida os healthchecks e lista as URLs
---

Suba e valide o ambiente local do PriceHub. Não peça ao usuário para rodar nada.

1. Confirme que o Docker está rodando com `docker info`. Se não estiver, avise e pare.
2. Garanta que `.env` existe (copie de `.env.example` se faltar).
3. Rode `docker compose up -d --build --wait`.
4. Rode `docker compose ps` e confirme que todos os serviços estão `healthy`.
5. Faça `curl -fsS` em cada `/health`:
   - farmácias: `http://127.0.0.1:4001/health`, `:4002`, `:4003`
   - ingestion: `http://127.0.0.1:3001/health`
   - query: `http://127.0.0.1:3000/health`
   - catalog (sem porta no host): `docker compose exec catalog-service wget -qO- http://127.0.0.1:3002/health`
6. Se algo falhar, leia `docker compose logs <servico> --tail 100`, identifique a causa raiz, corrija e repita.
7. Ao final, liste:
   - OpenAPI: `http://localhost:{3000,3001,4001,4002,4003}/docs`
   - RabbitMQ UI: `http://localhost:${RABBITMQ_UI_HOST_PORT:-15672}` (usuário e senha do `.env`)
   - Postgres: `localhost:${POSTGRES_HOST_PORT:-5433}`

$ARGUMENTS
