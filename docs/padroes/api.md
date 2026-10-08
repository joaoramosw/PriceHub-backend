# Padrões de API (REST)

- **Recursos no plural, em português sem acento:** `/medicamentos`, `/farmacias`, `/medicamentos/:id/comparacao`.
- **Schemas TypeBox** em `<contexto>.schemas.ts` para `params`, `querystring`, `body` e `response`; nada sem schema.
- **OpenAPI** gerado automaticamente e servido em `/docs` em todo serviço HTTP. Use `tags` e `summary` em cada rota.
- **Paginação:** `?page=1&pageSize=20` → `{ itens, page, pageSize, total, totalPages }`. `pageSize` máximo 100.
- **Erros:** `application/problem+json` (RFC 9457) com `type`, `title`, `status`, `detail`, `instance` e `correlationId`.
  - 400 validação · 401 assinatura inválida · 404 recurso inexistente · 409 conflito · 500 inesperado.
- **Correlation ID:** aceitar `X-Correlation-Id` na requisição; gerar se ausente; devolver no response.
- **Health:** `GET /health` → `200 { status: 'ok', checks: { database, broker } }` ou `503` com o check que falhou.
- **SSE:** `text/event-stream`, eventos nomeados (`event: oferta-atualizada`), `data` em JSON com `correlationId`, heartbeat a cada 15 s.
- **CORS:** origens configuráveis por `CORS_ORIGINS` (padrão `http://localhost:*`).
- **Versionamento:** a API pública é a v1 implícita; mudança incompatível cria novo prefixo (`/v2`). APIs das farmácias simuladas têm o próprio esquema (`/api`, `/v1`, `/legacy`) para representar parceiros reais.
- **Valores monetários** sempre em centavos (`precoCentavos`).
