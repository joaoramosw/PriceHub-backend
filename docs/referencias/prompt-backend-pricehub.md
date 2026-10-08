# PROMPT — Backend do PriceHub (Node.js + Fastify + RabbitMQ + Docker)

> Execute este prompt na **raiz do repositório** `PriceHub-SitesGenericos` usando o Claude Code.
> Este documento é autossuficiente: tudo o que você precisa saber sobre o projeto está aqui.

---

## 0. Regras de trabalho (leia antes de tudo)

1. **Investigue antes de codar.** Leia `frontend/` inteiro (`site1`, `site2-azul`, `site3-vermelho`, `PROMPT.txt`, `README.md`) e, se existir, o documento de orientação em `docs/referencias/`. Depois apresente um **resumo do plano** (estrutura de pastas, ordem das fases, dúvidas) e **aguarde minha confirmação** antes de escrever código.
2. **Não escreva comentários no código.** Nomes claros substituem comentários. A documentação fica em `docs/`.
3. **Reaproveite o que existe.** Não duplique utilitários. Antes de criar algo em um serviço, verifique se ele pertence a `packages/`.
4. **Commits curtos e semânticos** (Conventional Commits, em português): `feat(catalog): adiciona matching por registro MS`. Um commit por unidade lógica. Trabalhe na branch `feat/backend-microsservicos`. **Não faça `git push`** sem eu pedir.
5. **Suba e valide os containers você mesmo.** Nunca me peça para rodar `docker compose`. Ao final de cada fase:
   - rode `docker compose up -d --build --wait`;
   - confira `docker compose ps` (todos `healthy`);
   - rode os testes da fase e os smoke tests (`curl` nos `/health`);
   - se algo falhar, leia `docker compose logs <servico> --tail 100`, corrija e repita até ficar verde.
   Só avance de fase com o ambiente de pé e os testes passando.
6. **Não altere `frontend/`** nesta etapa (só leitura, para extrair o seed).
7. Ao terminar cada fase, me envie um relatório curto: o que foi feito, como validou (comandos e resultado), commits criados, pendências.

---

## 1. Contexto do projeto

**PriceHub** é o MVP de um TCC de Engenharia de Software (UCSal), com o título *"PriceHub: Uma Arquitetura eficiente Orientada a Eventos e Microsserviços"*. É uma plataforma de **comparação de preços de medicamentos** que recebe, centraliza e apresenta dados de diferentes farmácias.

Como não há integração real com farmácias, existem **3 farmácias fictícias**. O foco avaliado pela banca **não é** o comparador em si, e sim a **arquitetura de microsserviços com comunicação orientada a eventos** usada para integrar, padronizar, centralizar e atualizar os dados.

O orientador exige que o projeto responda claramente:
- quais são as fontes de dados e quais dados cada uma fornece;
- como os dados são padronizados;
- quais são os microsserviços e a responsabilidade de cada um;
- quais eventos existem, quem publica, quem consome, quando é gerado, o que transporta e qual ação dispara;
- como os preços são atualizados;
- como identificar que produtos de fontes diferentes são o mesmo medicamento;
- como é feita a comparação;
- quais padrões de projeto foram usados e por quê;
- como a solução é testada e quais aspectos da arquitetura são avaliados.

**Cenário de avaliação obrigatório:** alterar o preço em uma farmácia → gerar evento → PriceHub processa → informação centralizada é atualizada → novo preço é apresentado ao usuário.

### 1.1 O frontend existente (`frontend/`)

- 3 sites estáticos (HTML + Tailwind CDN + JS puro), sem nenhuma chamada a API:
  - `site1` → **BioFarma Verde** (preço médio)
  - `site2-azul` → **FarmaAzul Confiança** (genéricos com desconto)
  - `site3-vermelho` → **DrogaPopular Express** (preço agressivo)
- Os dados estão fixos em `products.js` (`const MEDICAMENTOS_DATA = [...]`). Os **10 medicamentos são idênticos nos 3 sites** (mesmos `id`, `slug`, `registroMS` e textos); **só o `preco` muda**.
- Campos: `id, slug, nome, dosagem, apresentacao, categoria, preco, tarja, tarjaTipo, laboratorio, principioAtivo, registroMS, imagem, descricao, indicacao, modoDeUso, contraindicacao, avaliacao, avaliacoesTotal`.
- O carrinho fica em `localStorage` e o checkout é simulado.
- **Ainda não existe a tela do comparador PriceHub.** Ela fica fora deste prompt, mas o backend deve deixá-la pronta para ser consumida (REST + SSE + CORS).

---

## 2. Arquitetura alvo

```
[BioFarma :4001]    [FarmaAzul :4002]    [DrogaPopular :4003]    ← farmácias simuladas (sistemas "externos")
       │ webhook           │ webhook             ▲ polling
       ▼                   ▼                     │
┌────────────────────────────────────────────────────────┐
│ ingestion-service :3001 — 1 adapter por farmácia        │
│ recebe/busca → valida → converte para o modelo canônico │
└───────────────┬────────────────────────────────────────┘
                │ ingestao.oferta.recebida
        ═══════ RabbitMQ (exchange topic "pricehub.events") ═══════
                ▼
┌────────────────────────────────────────────────────────┐
│ catalog-service :3002 — matching, medicamento canônico, │
│ ofertas, histórico de preço, outbox        [Postgres]   │
└───────────────┬────────────────────────────────────────┘
                │ catalogo.medicamento.cadastrado / catalogo.oferta.atualizada
                ▼
┌────────────────────────────────────────────────────────┐
│ query-service :3000 — read model de comparação,         │
│ API pública REST + SSE                     [Postgres]   │
└───────────────┬────────────────────────────────────────┘
                ▼
         (futuro) PriceHub web — comparador
```

**Decisão de fronteira:** a farmácia é um sistema externo, então fala com o PriceHub **por HTTP** (webhook ou polling) e nunca publica direto no broker. Dentro do PriceHub, toda a comunicação entre serviços é **assíncrona, por eventos**. Os serviços não chamam uns aos outros por HTTP.

**Banco por serviço:** cada serviço tem o próprio banco lógico. Um único container Postgres hospeda todos os bancos para simplificar o ambiente local, mas nenhum serviço acessa o banco de outro.

### 2.1 Microsserviços

| Serviço | Porta | Responsabilidade | Banco |
|---|---|---|---|
| `farmacia-sim` | 4001/4002/4003 | Um código, 3 instâncias (`PHARMACY_ID=biofarma\|farmaazul\|drogapopular`). Expõe o catálogo no **formato próprio de cada farmácia**, tem endpoint admin para alterar preço e dispara webhook (exceto a DrogaPopular). | `farmacia_<id>` |
| `ingestion-service` | 3001 | Integração: recebe webhooks (com validação HMAC), faz sync agendado (reconciliação) e polling da DrogaPopular, aplica o **adapter** da farmácia, valida contra o modelo canônico e publica `ingestao.oferta.recebida`. Guarda as coletas brutas para auditoria. | `ingestion` |
| `catalog-service` | 3002 (só interna) | Fonte da verdade: matching para o medicamento canônico, upsert de ofertas, detecção de mudança de preço, histórico de preços, ofertas não correspondidas, **outbox** e publicação dos eventos `catalogo.*`. | `catalog` |
| `query-service` | 3000 | Read model desnormalizado para comparação (CQRS), API pública, SSE com atualizações ao vivo, CORS liberado para os sites locais. | `query` |

O `catalog-service` **não publica porta no host**, só usa `expose`, para permitir `docker compose up --scale catalog-service=2` no teste de escalabilidade. Para inspecioná-lo, use `docker compose exec`.

---

## 3. Stack e decisões técnicas

| Item | Escolha |
|---|---|
| Runtime | Node.js 24 LTS |
| Linguagem | TypeScript (strict), ESM |
| Framework HTTP | Fastify 5 + `@fastify/type-provider-typebox` |
| Validação e contratos | TypeBox (o mesmo schema valida, tipa e gera o OpenAPI) |
| Docs de API | `@fastify/swagger` + `@fastify/swagger-ui` em `/docs` em cada serviço |
| Mensageria | RabbitMQ 3.13+ (imagem `management`) + `amqplib` (ou `amqp-connection-manager` para reconexão) |
| Banco | PostgreSQL 16 |
| ORM / migrações | Prisma (um schema por serviço; `prisma migrate deploy` no start do container) |
| Agendamento | `node-cron` no ingestion |
| Logs | Pino (nativo do Fastify), JSON estruturado, sempre com `correlationId` |
| Lint/format | Biome |
| Testes | Vitest; `app.inject()` para HTTP; Testcontainers (Postgres e RabbitMQ) para integração |
| Execução em dev | `tsx` |
| Monorepo | pnpm workspaces (via `corepack`) |
| Containers | Docker + Docker Compose v2 |

Valores monetários são **sempre inteiros em centavos** (`precoCentavos`) dentro do PriceHub. A conversão acontece só nos adapters.

---

## 4. Estrutura do repositório

```
/
├── frontend/                          # existente — não alterar
├── backend/
│   ├── package.json                   # scripts do workspace
│   ├── pnpm-workspace.yaml
│   ├── tsconfig.base.json
│   ├── biome.json
│   ├── apps/
│   │   ├── farmacia-sim/
│   │   ├── ingestion-service/
│   │   ├── catalog-service/
│   │   └── query-service/
│   ├── packages/
│   │   ├── contracts/                 # schemas TypeBox: modelo canônico + eventos + envelope
│   │   ├── messaging/                 # conexão, publish com confirm, consume, retry, DLQ, idempotência
│   │   ├── observability/             # logger, correlationId, plugin de health
│   │   └── testing/                   # helpers de Testcontainers e fixtures
│   ├── tests/e2e/                     # cenários ponta a ponta contra o compose
│   └── scripts/                       # demo:preco, demo:resiliencia, demo:escala, gerar-seed
├── infra/
│   ├── postgres/init.sql              # cria os bancos de cada serviço
│   └── rabbitmq/
│       ├── definitions.json           # exchanges, filas, bindings, DLX
│       └── rabbitmq.conf
├── docs/                              # ver seção 9
├── .claude/
│   ├── settings.json                  # permissões + hooks (ver seção 8)
│   └── commands/                      # slash commands do projeto
├── docker-compose.yml
├── .env.example
├── AGENTS.md
├── CLAUDE.md
└── README.md
```

### 4.1 Estrutura interna de cada serviço

```
apps/<servico>/
├── Dockerfile
├── package.json
├── prisma/schema.prisma
├── src/
│   ├── server.ts                  # sobe o servidor e os consumers, trata SIGTERM
│   ├── app.ts                     # buildApp(): registra plugins e rotas (usado nos testes)
│   ├── config/env.ts              # env validado com TypeBox; falha no boot se inválido
│   ├── plugins/                   # prisma, rabbitmq, swagger, cors, sse
│   ├── modules/<contexto>/
│   │   ├── <contexto>.routes.ts
│   │   ├── <contexto>.schemas.ts
│   │   ├── <contexto>.service.ts
│   │   └── <contexto>.repository.ts
│   └── events/
│       ├── consumers/
│       └── publishers/
└── test/
    ├── unit/
    └── integration/
```

No `ingestion-service`, os conectores ficam em `src/connectors/<farmacia>/` e todos implementam a mesma interface:

```ts
interface PharmacyConnector {
  readonly farmaciaId: string
  readonly modo: 'webhook' | 'polling'
  buscarCatalogo(): Promise<OfertaColetada[]>
  converterWebhook(payload: unknown): OfertaColetada[]
}
```

### 4.2 Convenções de nomes

- Termos de domínio em **português sem acento** (`medicamento`, `oferta`, `farmacia`, `precoCentavos`); termos técnicos consagrados em inglês (`repository`, `service`, `consumer`, `handler`, `plugin`).
- Arquivos em `kebab-case` ou `<contexto>.<camada>.ts`; tipos em `PascalCase`; funções e variáveis em `camelCase`.
- Erros HTTP no formato **RFC 9457 (`application/problem+json`)**, com um `errorHandler` padronizado em `packages/observability`.

---

## 5. Farmácias simuladas — formatos diferentes de propósito

Os 3 sites usam os mesmos dados. Para demonstrar um **problema real de padronização**, cada farmácia expõe um contrato diferente.

**Seed:** crie `backend/scripts/gerar-seed.ts`, que lê `frontend/*/products.js` (avaliando o array `MEDICAMENTOS_DATA` sem executar o resto do arquivo) e gera `apps/farmacia-sim/seed/<farmacia>.json`, respeitando o preço de cada site:
- `site1` → `biofarma`
- `site2-azul` → `farmaazul`
- `site3-vermelho` → `drogapopular`

O seed JSON é versionado. O script só roda quando o frontend muda.

### 5.1 BioFarma Verde — `:4001` — REST moderno, camelCase, preço em reais, com webhook

```
GET /api/produtos
GET /api/produtos/:id
```
```json
{ "id": 2, "sku": "BIO-0002", "nome": "Losartana Potássica", "dosagem": "50mg",
  "apresentacao": "30 comprimidos revestidos", "principioAtivo": "Losartana Potássica 50mg",
  "laboratorio": "Medley / Eurofarma", "registroMS": "MS 1.0181.0421.002-3",
  "categoria": "Hipertensão & Coração", "preco": 11.50, "atualizadoEm": "2026-10-08T13:00:00Z" }
```
Webhook quando o preço muda: `POST {INGESTION_URL}/webhooks/biofarma`
```json
{ "evento": "preco_alterado", "produto": { ...mesmo formato acima } }
```

### 5.2 FarmaAzul Confiança — `:4002` — snake_case, paginado, preço em centavos, com webhook

```
GET /v1/catalogo?page=1&page_size=5
```
```json
{ "items": [ { "codigo": "FA-LOS-50", "descricao": "Losartana Potássica 50mg 30 comp rev",
    "principio_ativo": "Losartana Potássica", "concentracao": "50mg",
    "forma_farmaceutica": "comprimido revestido", "quantidade_embalagem": 30,
    "fabricante": "Medley", "registro_anvisa": "1018104210023",
    "preco_centavos": 890, "ultima_atualizacao": "2026-10-08T13:00:00-03:00" } ],
  "page": 1, "total_pages": 2 }
```
Webhook: `POST {INGESTION_URL}/webhooks/farmaazul`
```json
{ "type": "price.updated", "data": { ...item no formato acima } }
```
O `registro_anvisa` vem **sem máscara**, enquanto na BioFarma vem com máscara. O adapter normaliza os dois para o mesmo formato canônico.

### 5.3 DrogaPopular Express — `:4003` — legado, sem webhook (só polling)

```
GET /legacy/precos.json
```
```json
{ "loja": "DROGAPOPULAR EXPRESS", "gerado_em": "08/10/2026 10:30",
  "produtos": [ { "COD": "DP-0002", "DESCRICAO": "LOSARTANA POTASSICA 50MG C/30 COMP REV",
                  "LAB": "MEDLEY", "PRECO": "7,49" } ] }
```
Sem registro MS, com a dosagem e a quantidade **dentro da descrição**, preço como string com vírgula e data em formato brasileiro. O ingestion faz polling a cada `DROGAPOPULAR_POLL_INTERVAL_MS` (padrão 15000).

### 5.4 Endpoints comuns de todas as instâncias (plano de controle da simulação)

```
PATCH /admin/produtos/:id/preco   { "precoCentavos": 720 }  → grava e dispara webhook (se a farmácia tiver)
POST  /admin/reset                                           → volta ao seed
GET   /health
GET   /docs
```
O webhook é assinado com `X-PriceHub-Signature: sha256=<HMAC do corpo>`, usando o segredo da farmácia (`WEBHOOK_SECRET_<FARMACIA>`), e envia `X-Correlation-Id` (gerado no PATCH, se não vier no request). A falha de entrega do webhook é registrada em log; a reconciliação periódica do ingestion cobre a perda.

---

## 6. Modelo canônico, matching e dados

### 6.1 `OfertaColetada` (em `packages/contracts`)

```ts
{
  farmaciaId: string
  farmaciaNome: string
  externalId: string
  nome: string
  principioAtivo: string
  concentracao: { valor: number, unidade: 'mg' | 'mg/ml' | 'g' | 'ml' | 'mcg' }
  forma: 'comprimido' | 'comprimido revestido' | 'comprimido liberacao prolongada' | 'capsula' | 'gotas' | 'suspensao' | 'outro'
  quantidade: { valor: number, unidade: 'unidade' | 'ml' }
  fabricante: string | null
  registroMs: string | null
  ean: string | null
  categoria: string | null
  precoCentavos: number
  atualizadoNaOrigemEm: string | null
  coletadoEm: string
}
```

### 6.2 Matching (catalog-service) — Strategy

Ordem de tentativa (`MatchingStrategy[]`):
1. `RegistroMsStrategy`: igualdade do registro MS normalizado (só dígitos).
2. `EanStrategy`: igualdade do EAN.
3. `ChaveCanonicaStrategy`: `slug(principioAtivoNormalizado)|concentracao|forma|quantidade`. O princípio ativo normalizado não tem acentos, sais nem prefixos ("cloridrato de", "potassica" etc.). Use um **dicionário de sinônimos** versionado em `catalog-service/src/modules/matching/sinonimos.ts`.

Regras:
- Se nenhuma estratégia casar, mas os dados mínimos forem válidos, crie um novo medicamento canônico e publique `catalogo.medicamento.cadastrado`.
- Se casar pela chave canônica e a oferta trouxer registro MS ou EAN que o medicamento ainda não tem, **enriqueça o medicamento**. Isso resolve o caso em que a DrogaPopular chega antes das outras.
- Se os dados mínimos (princípio ativo, concentração, quantidade) não puderem ser extraídos, grave em `ofertas_nao_correspondidas` e publique `catalogo.oferta.nao-correspondida`.
- O MVP compara o **mesmo produto**. A equivalência entre laboratórios fica documentada como trabalho futuro.
- Os **10 medicamentos dos 3 seeds precisam casar 100%**. Escreva um teste que garanta isso.

### 6.3 Tabelas principais

**catalog:** `farmacias`, `medicamentos` (uuid, `chave_canonica` única, `registro_ms` único e nulo, `ean` único e nulo, demais atributos), `ofertas` (único em `farmacia_id + external_id`, `preco_centavos`, `atualizado_em`, `versao`), `historico_precos`, `ofertas_nao_correspondidas`, `outbox` (`id`, `tipo`, `payload jsonb`, `criado_em`, `publicado_em`), `eventos_processados` (`event_id` PK).

**query:** `comparacao_medicamentos` (dados de exibição + `menor_preco_centavos`, `maior_preco_centavos`, `qtd_farmacias`), `comparacao_ofertas` (`medicamento_id`, `farmacia_id`, `farmacia_nome`, `preco_centavos`, `atualizado_em`), `eventos_processados`.

**ingestion:** `coletas_brutas` (`farmacia_id`, `origem`, `payload jsonb`, `correlation_id`, `recebido_em`).

---

## 7. Eventos e mensageria

### 7.1 Envelope (todos os eventos)

```ts
{ eventId: string /* uuid v7 */, type: string, version: number, occurredAt: string,
  correlationId: string, source: string, data: object }
```

### 7.2 Catálogo de eventos

| Evento | Produtor → Consumidor | Quando | `data` | Ação no consumidor |
|---|---|---|---|---|
| `ingestao.oferta.recebida` v1 | ingestion → catalog | Cada item recebido por webhook, sync ou polling | `{ origem: 'webhook'\|'sync'\|'polling', oferta: OfertaColetada }` | Matching, upsert da oferta; se o preço mudou, grava histórico e outbox |
| `catalogo.medicamento.cadastrado` v1 | catalog → query | Novo medicamento canônico | `{ medicamentoId, nome, principioAtivo, concentracao, forma, quantidade, categoria }` | Cria a entrada em `comparacao_medicamentos` |
| `catalogo.oferta.atualizada` v1 | catalog → query | Oferta nova ou preço alterado | `{ ofertaId, medicamentoId, farmaciaId, farmaciaNome, precoAnteriorCentavos, precoAtualCentavos, atualizadoEm }` | Upsert em `comparacao_ofertas`, recalcula os agregados, emite SSE |
| `catalogo.oferta.nao-correspondida` v1 | catalog → fila de revisão | Matching impossível | `{ farmaciaId, externalId, motivo, oferta }` | Fica na fila `revisao.ofertas-nao-correspondidas` para inspeção |

Se uma oferta chega com o mesmo preço, o catalog **não** publica `oferta.atualizada`. Isso evita inundar o sistema com o polling.

### 7.3 Topologia (em `infra/rabbitmq/definitions.json`)

- Exchange `pricehub.events` (topic, durável). Exchange `pricehub.dlx` (topic, durável).
- Filas duráveis, nomeadas `<consumidor>.<assunto>`:
  - `catalog.ingestao-oferta-recebida` ← `ingestao.oferta.recebida`
  - `query.catalogo-eventos` ← `catalogo.medicamento.cadastrado`, `catalogo.oferta.atualizada`
  - `revisao.ofertas-nao-correspondidas` ← `catalogo.oferta.nao-correspondida`
  - cada fila com DLX `pricehub.dlx` e uma `<fila>.dlq` correspondente.
- Retry: até 3 tentativas com atraso exponencial, via fila de espera com TTL (`<fila>.retry`), controlado pelo header `x-retry-count`. Depois da última tentativa, a mensagem vai para a DLQ.
- Publisher confirms ligados. `prefetch` configurável (padrão 10). Ack manual só depois de commitar no banco.

### 7.4 Confiabilidade

- **Transactional Outbox** no catalog: gravar a oferta e a linha do outbox na mesma transação. Um relay faz polling a cada 500 ms com `SELECT ... FOR UPDATE SKIP LOCKED`, o que permite várias instâncias.
- **Idempotent Consumer** em catalog e query: insert em `eventos_processados` na mesma transação do efeito; `eventId` duplicado gera ack sem reprocessar.
- **Ordem:** o query ignora `oferta.atualizada` com `atualizadoEm` mais antigo do que o já gravado (last-write-wins por timestamp).
- **Correlation ID:** vem no `X-Correlation-Id` do webhook (ou é gerado no ingestion), passa por todos os eventos e logs e chega ao payload SSE.

---

## 8. Docker e Claude Code

### 8.1 `docker-compose.yml` (raiz)

Serviços: `postgres`, `rabbitmq`, `farmacia-biofarma`, `farmacia-farmaazul`, `farmacia-drogapopular`, `ingestion-service`, `catalog-service`, `query-service`.

Requisitos:
- **Healthcheck em todos** (`pg_isready`, `rabbitmq-diagnostics -q ping`, `GET /health` nos serviços Node).
- `depends_on` com `condition: service_healthy`.
- Postgres com volume nomeado e `infra/postgres/init.sql` montado em `/docker-entrypoint-initdb.d`.
- RabbitMQ com `definitions.json` e `rabbitmq.conf` montados (`load_definitions`), UI em `:15672`.
- As 3 farmácias usam a **mesma imagem** e variam só por `PHARMACY_ID`, porta e `DATABASE_URL`.
- `catalog-service` sem `ports`, só `expose`.
- Variáveis vindas de `.env` (crie `.env.example` completo; o `.env` real fica no `.gitignore`).
- Opcional: bloco `develop.watch` (sync + restart em `src/`) para usar `docker compose watch` durante o desenvolvimento.

### 8.2 Dockerfile (padrão para todos os apps)

- Multi-stage com `node:24-alpine`; `corepack enable`; `pnpm install --frozen-lockfile`; build com `tsc`; `pnpm deploy --filter <app> --prod` para gerar a imagem final enxuta.
- Garanta a compatibilidade do Prisma com Alpine (`openssl` e `binaryTargets`).
- Entrypoint: `prisma migrate deploy && node dist/server.js` (na farmácia, também aplica o seed se o banco estiver vazio).
- Usuário não-root, `NODE_ENV=production`, `HEALTHCHECK` coerente com o compose.
- Um `.dockerignore` na raiz e o contexto de build em `./backend`.

### 8.3 Scripts (`backend/package.json`)

```
dev:up            docker compose -f ../docker-compose.yml up -d --build --wait
dev:down          docker compose -f ../docker-compose.yml down
dev:reset         docker compose -f ../docker-compose.yml down -v && pnpm dev:up
dev:logs          docker compose -f ../docker-compose.yml logs -f --tail 100
lint / format     biome
test              vitest (unit + integração de todos os pacotes)
test:e2e          vitest em tests/e2e contra o compose em execução
demo:preco        scripts/demo-preco.ts
demo:resiliencia  scripts/demo-resiliencia.ts
demo:escala       scripts/demo-escala.ts
gerar-seed        scripts/gerar-seed.ts
```

### 8.4 Subida automática dos containers pelo Claude Code

Crie `.claude/settings.json` com:

1. **Hook `SessionStart`** que sobe o ambiente sempre que uma sessão do Claude Code começa no projeto:
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "docker compose up -d --wait 2>&1 | tail -n 20 || echo 'AVISO: ambiente docker não subiu — rode /subir'"
          }
        ]
      }
    ]
  }
}
```
2. **Hook `PostToolUse`** (matcher `Edit|Write`) que formata com Biome o arquivo editado, quando ele for `.ts` dentro de `backend/`. O caminho do arquivo vem em `tool_input.file_path` no JSON recebido pelo stdin.
3. **Permissões** `allow` para: `Bash(docker compose:*)`, `Bash(docker ps:*)`, `Bash(docker logs:*)`, `Bash(pnpm:*)`, `Bash(corepack:*)`, `Bash(curl:*)`, `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git log:*)`, `Bash(git add:*)`, `Bash(git commit:*)`, `Bash(git checkout:*)`. **`deny`** para `Bash(git push:*)` e `Bash(docker system prune:*)`.

Antes de gravar, **confira o formato atual de hooks e permissões na documentação do Claude Code** e ajuste se algo tiver mudado. Depois **teste o hook**: abra uma nova sessão, ou execute o comando do hook manualmente, e confirme que os containers sobem.

Além disso, o `CLAUDE.md` deve conter a regra explícita: *"Sempre que alterar código de um serviço, rebuild e suba com `docker compose up -d --build --wait <servico>`, verifique `/health` e rode os testes afetados antes de dizer que terminou. Nunca peça ao usuário para subir containers."*

### 8.5 Slash commands do projeto (`.claude/commands/`)

| Arquivo | O que faz |
|---|---|
| `subir.md` | Sobe o ambiente, espera os healthchecks, faz `curl` nos `/health`, lista as URLs (`/docs` de cada serviço, RabbitMQ UI) e diagnostica falhas pelos logs |
| `demo.md` | Roda `demo:preco` e reporta a latência por etapa |
| `nova-farmacia.md` | Passo a passo para adicionar uma 4ª fonte: seed, formato, connector, fixture, teste, compose, docs |
| `novo-evento.md` | Passo a passo para criar um evento: schema em `contracts`, binding no `definitions.json`, publisher, consumer idempotente, teste, linha em `docs/arquitetura/eventos.md` |
| `revisar.md` | Aplica o checklist de `docs/ia/checklist-revisao.md` ao diff atual |

---

## 9. Documentação — padronização de desenvolvimento e de uso de IA

O grupo tem 5 pessoas usando agentes diferentes (Claude Code, Cursor, Codex, OpenCode). A documentação garante que **qualquer agente ou pessoa** siga as mesmas regras.

### 9.1 Arquivos de raiz para agentes

- **`AGENTS.md`**: fonte única de regras para qualquer agente. Conteúdo:
  - resumo do projeto (5 linhas);
  - mapa do repositório;
  - comandos essenciais;
  - regras de ouro (seção 0 deste prompt);
  - "Definition of Done";
  - links para `docs/`.
  Máximo de ~150 linhas.
- **`CLAUDE.md`**: começa com `@AGENTS.md` (import) e acrescenta só o que é específico do Claude Code: a regra de subir e validar containers, os slash commands disponíveis e o uso dos hooks.
- **`README.md`** (raiz): visão de produto, como rodar em 3 comandos, portas e URLs, links para `docs/`.

### 9.2 `docs/`

```
docs/
├── README.md                          # índice
├── arquitetura/
│   ├── visao-geral.md                 # diagrama Mermaid (C4 nível 2) + decisão de fronteira
│   ├── servicos.md                    # responsabilidade, porta, banco, eventos de cada serviço
│   ├── eventos.md                     # catálogo de eventos (tabela da seção 7.2) + envelope + topologia
│   ├── fluxo-atualizacao-preco.md     # diagrama de sequência Mermaid do cenário de avaliação
│   ├── modelo-canonico.md             # OfertaColetada + regras de normalização
│   ├── matching.md                    # estratégias, sinônimos, limitações
│   └── farmacias-simuladas.md         # os 3 contratos lado a lado
├── adr/
│   ├── 0000-template.md
│   ├── 0001-microsservicos-orientados-a-eventos.md
│   ├── 0002-rabbitmq-como-broker.md
│   ├── 0003-fastify-typebox.md
│   ├── 0004-fronteira-http-com-farmacias.md
│   ├── 0005-transactional-outbox.md
│   ├── 0006-banco-por-servico.md
│   └── 0007-cqrs-read-model-de-comparacao.md
├── padroes/
│   ├── codigo.md                      # TS strict, nomes, sem comentários, camadas, erros
│   ├── api.md                         # REST, problem+json, paginação, versionamento, OpenAPI
│   ├── eventos.md                     # nomenclatura, versionamento, idempotência, retry/DLQ
│   ├── banco.md                       # Prisma, migrações, convenções de tabela
│   ├── testes.md                      # pirâmide, onde fica cada tipo, como rodar
│   ├── docker.md                      # Dockerfile padrão, compose, healthchecks
│   └── git.md                         # branches, Conventional Commits, PR, revisão
├── padroes-de-projeto.md              # para cada padrão usado: problema, solução, onde está no código, justificativa
├── ia/
│   ├── guia-uso-ia.md                 # fluxo obrigatório: investigar → planejar → implementar → validar → documentar
│   ├── template-prompt.md             # modelo de prompt de tarefa (contexto, objetivo, restrições, critérios de aceite, validação)
│   ├── checklist-revisao.md           # o que revisar em código gerado por IA antes de aceitar
│   └── contexto-para-agentes.md       # como manter AGENTS.md/CLAUDE.md atualizados; o que nunca colocar neles
├── runbook.md                         # como subir, portas, URLs, troubleshooting comum, como rodar as demos
└── tcc/
    └── mapeamento-orientacao.md       # cada seção da orientação do TCC → artefato/arquivo que a responde
```

Requisitos de conteúdo:
- Os ADRs seguem o formato **Contexto → Decisão → Consequências → Alternativas consideradas**.
- O `padroes-de-projeto.md` cobre **apenas** os padrões realmente implementados: Adapter, Strategy, Publisher/Subscriber, Transactional Outbox, Idempotent Consumer, CQRS, Repository. Para cada um, informe o caminho do arquivo onde aparece.
- O `guia-uso-ia.md` define:
  - que nenhum código gerado por IA entra sem os testes passando e o ambiente validado;
  - que toda mudança de contrato atualiza `docs/arquitetura/eventos.md` no mesmo commit;
  - que o agente deve reportar a causa raiz antes de corrigir um bug;
  - que segredos nunca entram em prompts nem em arquivos versionados.
- O `tcc/mapeamento-orientacao.md` cobre: 4.2 Arquitetura, 4.3 APIs das farmácias, 4.4 Modelo e padronização, 4.5 Microsserviços, 4.6 Eventos, 4.7 Padrões, 4.8 Comparação, 5.1–5.4 Testes, e responde às 14 perguntas do orientador (seção 1) com links para os arquivos.
- Os diagramas usam **Mermaid**, que o GitHub renderiza.

---

## 10. API pública do query-service

```
GET /medicamentos?busca=&categoria=&page=&pageSize=
    → itens com menorPrecoCentavos, maiorPrecoCentavos, qtdFarmacias, economiaMaximaCentavos
GET /medicamentos/:id/comparacao
    → medicamento + ofertas ordenadas por preço (farmacia, precoCentavos, atualizadoEm, ehMenorPreco)
GET /farmacias
GET /eventos/stream            (SSE: eventos "oferta-atualizada" e "medicamento-cadastrado", com correlationId)
GET /health
GET /docs
```
CORS liberado para `http://localhost:*` (configurável via env).

---

## 11. Fases de execução

Cada fase termina com: **ambiente de pé (`--wait`) + testes verdes + commit(s) + relatório curto.**

**Fase 0 — Investigação e plano**
Leia o frontend e este prompt. Apresente o plano e as dúvidas, e **aguarde meu OK**.

**Fase 1 — Fundação**
- Crie o monorepo pnpm, os tsconfig, o Biome e o `.env.example`.
- Crie o `docker-compose.yml` só com `postgres` e `rabbitmq`, com `init.sql` e `definitions.json`.
- Crie `.claude/settings.json` (hooks e permissões), `.claude/commands/`, `AGENTS.md`, `CLAUDE.md`, `README.md` e o esqueleto de `docs/`, com índice, ADRs 0001–0007 e `padroes/*`.
- Aceite: `docker compose up -d --wait` sobe infra healthy; as filas e exchanges aparecem na UI do RabbitMQ; o hook `SessionStart` funciona.

**Fase 2 — Pacotes compartilhados**
- `contracts`: modelo canônico, envelope e os 4 eventos, com testes de schema.
- `messaging`: connect com reconexão, `publish` com confirm, `consume` com ack manual, retry com TTL e DLQ, helper de idempotência. Testes de integração com Testcontainers.
- `observability`: logger, correlationId, problem+json, plugin `/health` (que checa banco e broker).
- Aceite: testes de integração do `messaging` provam retry → DLQ e a deduplicação.

**Fase 3 — farmacia-sim**
- Script `gerar-seed`, o Prisma, os 3 formatos (seção 5), os endpoints admin, o webhook com HMAC e o Dockerfile.
- Adicione as 3 instâncias ao compose.
- Aceite: os 3 `GET` retornam os formatos especificados com os preços dos sites; o `PATCH` altera o preço e dispara o webhook (verificado com um receptor de teste); os testes unitários de serialização de cada formato passam.

**Fase 4 — ingestion-service**
- Os 3 connectors com fixtures reais de cada formato e o parser da descrição da DrogaPopular.
- `POST /webhooks/:farmacia` com validação HMAC; `POST /sync/:farmacia` manual; sync completo no boot e a cada `SYNC_INTERVAL_MS`; polling da DrogaPopular.
- Gravação em `coletas_brutas` e publicação de `ingestao.oferta.recebida`.
- Aceite: testes unitários dos adapters (os 30 itens dos seeds viram `OfertaColetada` válidas); assinatura inválida retorna 401; as mensagens aparecem na fila.

**Fase 5 — catalog-service**
- Matching (3 strategies + sinônimos), upsert, histórico, não correspondidas, outbox + relay, consumer idempotente.
- Aceite: teste garantindo que os 10 medicamentos × 3 farmácias resultam em **exatamente 10 medicamentos canônicos com 3 ofertas cada**; preço repetido não gera evento; evento duplicado não duplica efeito.

**Fase 6 — query-service**
- Read model, consumers, endpoints da seção 10, SSE e CORS.
- Aceite: `GET /medicamentos/:id/comparacao` mostra as 3 farmácias com o menor preço marcado; o SSE recebe o evento quando o preço muda.

**Fase 7 — Cenários de avaliação (e2e)**
- **`demo:preco`**: faz `PATCH` no preço da Losartana na FarmaAzul (890 → 720), escuta o SSE, faz polling em `/comparacao` e imprime a latência total e por etapa usando o `correlationId`. Aceite: atualização visível em < 2 s.
- **`demo:resiliencia`**: `docker compose stop catalog-service`, altera 3 preços, confere que as mensagens acumulam na fila, faz `start` e confirma que tudo converge sem perda.
- **`demo:escala`**: `docker compose up -d --scale catalog-service=2`, dispara um lote de alterações e mostra no log a distribuição entre as instâncias, sem processamento duplicado.
- **DrogaPopular**: altera o preço e confirma que a mudança chega pelo polling dentro do intervalo configurado.
- Testes e2e automatizados em `tests/e2e` cobrindo os quatro cenários.
- Registre os resultados (latências, prints de log) em `docs/tcc/resultados-testes.md`, que vai alimentar o capítulo 5 do TCC.

**Fase 8 — Fechamento da documentação**
- Atualize todos os arquivos de `docs/` com o que foi realmente implementado (caminhos de arquivo reais), finalize `mapeamento-orientacao.md`, `padroes-de-projeto.md` e o `runbook.md`.
- Revise o `AGENTS.md` e o `CLAUDE.md`.
- Rode `/revisar` no diff completo.

---

## 12. Definition of Done (global)

- [ ] `docker compose up -d --build --wait` a partir de um clone limpo (com `.env` copiado de `.env.example`) sobe **tudo healthy** sem passos manuais.
- [ ] `pnpm -C backend test` e `pnpm -C backend test:e2e` verdes.
- [ ] `pnpm -C backend lint` sem erros.
- [ ] Os 4 cenários da Fase 7 executados e com resultados registrados.
- [ ] `/docs` (OpenAPI) disponível em todos os serviços HTTP.
- [ ] Nenhum comentário no código, nenhum segredo versionado, nenhum `any` sem justificativa em ADR.
- [ ] `docs/` reflete o código real; o `mapeamento-orientacao.md` responde às 14 perguntas.
- [ ] Commits semânticos pequenos na branch `feat/backend-microsservicos`, sem push.

## 13. Fora de escopo (próximos prompts)

- Tela web do comparador PriceHub (consumirá o `query-service`).
- Trocar o `products.js` dos 3 sites por chamadas às APIs das farmácias.
- Autenticação de usuários, deploy em nuvem e observabilidade com Prometheus/Grafana.
