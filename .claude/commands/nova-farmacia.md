---
description: Passo a passo para adicionar uma nova farmácia (fonte de dados)
---

Adicione a farmácia descrita em: $ARGUMENTS

Siga `docs/arquitetura/farmacias-simuladas.md` e `docs/padroes/` e faça um commit por etapa:

1. **Seed:** gere `backend/apps/farmacia-sim/seed/<id>.json` (adapte `backend/scripts/gerar-seed.ts` se vier de um novo site).
2. **Formato:** crie o serializador do contrato próprio da farmácia em `backend/apps/farmacia-sim/src/modules/catalogo/formatos/` e registre-o no mapa de formatos.
3. **Connector:** crie `backend/apps/ingestion-service/src/connectors/<id>/` implementando `PharmacyConnector` (`buscarCatalogo`, `converterWebhook`) e registre no `connectors/registry.ts`.
4. **Fixture e teste:** salve uma resposta real em `test/fixtures/<id>.json` e escreva o teste unitário provando que todos os itens viram `OfertaColetada` válidas e casam com o catálogo canônico.
5. **Compose e env:** adicione o serviço `farmacia-<id>` (mesma imagem, `PHARMACY_ID`, porta, `DATABASE_URL`), o banco em `infra/postgres/init.sql`, o segredo `WEBHOOK_SECRET_<ID>` em `.env.example` e a URL no ingestion.
6. **Docs:** atualize `docs/arquitetura/farmacias-simuladas.md`, `docs/arquitetura/servicos.md` e `docs/runbook.md`.
7. Valide: `docker compose up -d --build --wait`, `curl` no `/health`, `pnpm -C backend test`.
