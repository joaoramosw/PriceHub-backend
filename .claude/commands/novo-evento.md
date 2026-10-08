---
description: Passo a passo para criar um novo evento de domínio
---

Crie o evento descrito em: $ARGUMENTS

1. **Contrato:** defina o schema TypeBox do `data` em `backend/packages/contracts/src/eventos/` com `type` no formato `<contexto>.<entidade>.<fato-no-passado>` e `version: 1`. Exporte no `index.ts` e adicione ao mapa `EventosPorTipo`.
2. **Teste de schema:** em `backend/packages/contracts/test/unit/`.
3. **Topologia:** crie ou ajuste a fila `<consumidor>.<assunto>` e o binding em `infra/rabbitmq/definitions.json` (com `.retry` e `.dlq`).
4. **Publisher:** se o produtor for o catalog, grave no outbox na mesma transação do efeito; caso contrário use `publicarEvento` do `@pricehub/messaging`.
5. **Consumer idempotente:** use `consumir` + `eventos_processados` na mesma transação do efeito.
6. **Teste** de integração do consumer (incluindo evento duplicado).
7. **Docs no mesmo commit:** linha nova em `docs/arquitetura/eventos.md`.
8. Valide com `docker compose up -d --build --wait` e os testes afetados.
