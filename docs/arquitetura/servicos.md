# Serviços

| Serviço | Porta | Banco | Publica | Consome | Responsabilidade |
|---|---|---|---|---|---|
| `farmacia-sim` (×3) | 4001 / 4002 / 4003 | `farmacia_<id>` | — (HTTP: webhook) | — | Simula o sistema externo de cada farmácia, com formato próprio, admin de preço e webhook HMAC |
| `ingestion-service` | 3001 | `ingestion` | `ingestao.oferta.recebida` | — (HTTP: webhooks, sync, polling) | Integração e padronização |
| `catalog-service` | 3002 (só rede interna) | `catalog` | `catalogo.medicamento.cadastrado`, `catalogo.medicamento.atualizado`, `catalogo.oferta.atualizada`, `catalogo.oferta.nao-correspondida` | `ingestao.oferta.recebida` | Fonte da verdade |
| `query-service` | 3000 | `query` | — (SSE para o usuário) | `catalogo.medicamento.*`, `catalogo.oferta.atualizada` | Read model e API pública |

Todos os serviços Node expõem `GET /health` (checa banco e, quando houver, broker) e `GET /docs` (OpenAPI gerado dos schemas TypeBox).

---

## farmacia-sim

**Código:** [`backend/apps/farmacia-sim`](../../backend/apps/farmacia-sim) · **Detalhes:** [farmácias simuladas](farmacias-simuladas.md)

- Uma imagem, três instâncias (`PHARMACY_ID=biofarma|farmaazul|drogapopular`).
- Tabela `produtos` (`id`, `codigo`, `dados jsonb` no formato nativo, `preco_centavos`, `atualizado_em`); seed aplicado no boot se vazia.
- `PATCH /admin/produtos/:id/preco` grava o preço e agenda o webhook assinado (exceto DrogaPopular). `POST /admin/reset` volta ao seed.

## ingestion-service

**Código:** [`backend/apps/ingestion-service`](../../backend/apps/ingestion-service)

| Endpoint | Descrição |
|---|---|
| `POST /webhooks/:farmacia` | valida `X-PriceHub-Signature` (HMAC-SHA256, comparação em tempo constante) → 401 se inválida; aplica o adapter; publica; responde 202 |
| `POST /sync/:farmacia` | reconciliação manual: baixa o catálogo inteiro e publica todas as ofertas |
| `GET /farmacias` | farmácias integradas e modo (webhook/polling) |
| `GET /coletas` | últimas coletas brutas (auditoria) |

- **Adapters** (`src/connectors/<farmacia>/`), todos implementando `PharmacyConnector` (`buscarCatalogo`, `converterWebhook`).
- **Agendamento:** sync completo no boot e a cada `SYNC_INTERVAL_MS` (padrão 60 s) para todas as farmácias; polling da DrogaPopular a cada `DROGAPOPULAR_POLL_INTERVAL_MS` (padrão 15 s). Execuções sobrepostas da mesma tarefa são puladas.
- **Auditoria:** cada webhook ou download é gravado em `coletas_brutas` (`farmacia_id`, `origem`, `payload jsonb`, `correlation_id`, `ofertas`, `recebido_em`) antes da conversão.
- **Falhas:** payload fora do contrato → 400; broker indisponível → 503 (a farmácia registra a falha e o sync seguinte reconcilia); farmácia fora do ar no sync → registrado em log, nova tentativa no próximo ciclo.

## catalog-service

**Código:** [`backend/apps/catalog-service`](../../backend/apps/catalog-service)

- Consome `catalog.ingestao-oferta-recebida` com prefetch configurável (`RABBITMQ_PREFETCH`, padrão 10).
- Para cada evento, numa única transação: registra o `eventId` em `eventos_processados`; garante a farmácia; faz o [matching](matching.md); cria ou enriquece o medicamento; faz upsert da oferta com bloqueio de linha (`FOR UPDATE`); grava `historico_precos`; grava os eventos no `outbox`.
- Preço igual ao gravado → nada é publicado. `atualizadoEm` mais antigo que o gravado → ignorado.
- Conflitos de concorrência (duas instâncias criando o mesmo medicamento) → a transação é repetida até 3 vezes antes de recorrer ao retry do broker.
- **Outbox relay:** a cada `OUTBOX_POLL_INTERVAL_MS` (500 ms) e logo após cada commit; `SELECT ... FOR UPDATE SKIP LOCKED` permite várias instâncias.
- Sem porta no host (`expose: 3002`) para permitir `--scale catalog-service=2`. Rotas de inspeção: `GET /medicamentos`, `GET /medicamentos/:id` (ofertas e histórico), `GET /ofertas-nao-correspondidas`, `GET /outbox/estatisticas`.

Tabelas: `farmacias`, `medicamentos`, `ofertas`, `historico_precos`, `ofertas_nao_correspondidas`, `outbox`, `eventos_processados`.

## query-service

**Código:** [`backend/apps/query-service`](../../backend/apps/query-service)

| Endpoint | Descrição |
|---|---|
| `GET /medicamentos?busca=&categoria=&page=&pageSize=` | itens com `menorPrecoCentavos`, `maiorPrecoCentavos`, `qtdFarmacias`, `economiaMaximaCentavos`; busca sem acento |
| `GET /medicamentos/:id/comparacao` | medicamento + ofertas ordenadas por preço (`farmacia`, `precoCentavos`, `atualizadoEm`, `ehMenorPreco`, `diferencaParaMenorCentavos`) |
| `GET /farmacias` · `GET /categorias` | apoio aos filtros |
| `GET /eventos/stream` | SSE: `oferta-atualizada`, `medicamento-cadastrado`, `medicamento-atualizado` (todos com `correlationId`); heartbeat a cada 15 s |

- Tabelas: `comparacao_medicamentos` (dados de exibição + agregados), `comparacao_ofertas` (uma linha por medicamento × farmácia), `eventos_processados`.
- A cada `oferta.atualizada`: bloqueia a linha do medicamento, aplica last-write-wins, faz upsert da oferta, recalcula os agregados e, **depois do commit**, emite o SSE.
- Oferta que chega antes do `medicamento.cadastrado` → erro transitório → retry (100 ms × 2ⁿ no compose) até o medicamento existir.
- CORS liberado para `CORS_ORIGINS` (padrão `http://localhost:*,http://127.0.0.1:*`).
