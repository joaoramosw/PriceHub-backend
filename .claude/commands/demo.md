---
description: Executa o cenário de avaliação de alteração de preço e reporta a latência
---

1. Garanta o ambiente de pé (siga `/subir` se necessário).
2. Rode `pnpm -C backend demo:preco`.
3. Reporte em tabela: correlationId, preço anterior → novo, latência de cada etapa (PATCH → webhook → ingestion → catalog → query → SSE) e a latência total.
4. Compare com o critério de aceite (< 2 s) e diga se passou.
5. Se falhar, investigue os logs filtrando pelo `correlationId` (`docker compose logs --no-log-prefix | grep <id>`), explique a causa raiz e só então corrija.

$ARGUMENTS
