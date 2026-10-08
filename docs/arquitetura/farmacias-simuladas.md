# Farmácias simuladas — três contratos diferentes de propósito

Os três sites do `frontend/` vendem os **mesmos 10 medicamentos** (mesmo `id`, `registroMS` e textos); só o preço muda. Para demonstrar um problema real de **padronização**, cada farmácia simulada expõe o catálogo num formato próprio. Todas rodam a mesma imagem (`backend/apps/farmacia-sim`) e mudam apenas a variável `PHARMACY_ID`.

## Origem dos dados (seed)

`pnpm -C backend gerar-seed` ([`scripts/gerar-seed.ts`](../../backend/scripts/gerar-seed.ts)) lê `frontend/<site>/products.js`, avalia **apenas** o array `MEDICAMENTOS_DATA` num contexto isolado (`node:vm`) e gera `backend/apps/farmacia-sim/seed/<farmacia>.json` já no formato nativo de cada farmácia, com o preço daquele site. O seed é versionado e o script só precisa rodar de novo se o frontend mudar. No boot, cada farmácia aplica o seed se o banco estiver vazio.

| Site | Farmácia | Porta | Seed |
|---|---|---|---|
| `site1` | BioFarma Verde | 4001 | `seed/biofarma.json` |
| `site2-azul` | FarmaAzul Confiança | 4002 | `seed/farmaazul.json` |
| `site3-vermelho` | DrogaPopular Express | 4003 | `seed/drogapopular.json` |

## Os três contratos lado a lado (Losartana)

| Aspecto | BioFarma Verde | FarmaAzul Confiança | DrogaPopular Express |
|---|---|---|---|
| Endpoint | `GET /api/produtos`, `GET /api/produtos/:id` | `GET /v1/catalogo?page=&page_size=` | `GET /legacy/precos.json` |
| Estilo | REST moderno, camelCase | snake_case, paginado | arquivo legado, maiúsculas |
| Identificador | `sku: "BIO-0002"` | `codigo: "FA-LOS-50"` | `COD: "DP-0002"` |
| Nome | `nome` + `dosagem` | `descricao: "Losartana Potássica 50mg 30 comp rev"` | `DESCRICAO: "LOSARTANA POTASSICA 50MG C/30 COMP REV"` |
| Princípio ativo | `"Losartana Potássica 50mg"` (com dose) | `"Losartana Potássica"` | dentro da descrição |
| Concentração | `dosagem: "50mg"` | `concentracao: "50mg"` | dentro da descrição |
| Forma / quantidade | `apresentacao: "30 comprimidos revestidos"` | `forma_farmaceutica` + `quantidade_embalagem: 30` | `C/30 COMP REV` na descrição |
| Registro MS | `"MS 1.0181.0421.002-3"` (com máscara) | `"1018104210023"` (sem máscara) | **ausente** |
| Preço | `preco: 11.50` (reais, número) | `preco_centavos: 890` | `PRECO: "7,49"` (texto com vírgula) |
| Data | `atualizadoEm` ISO UTC | `ultima_atualizacao` ISO com `-03:00` | `gerado_em: "08/10/2026 10:30"` (Brasília) |
| Categoria | sim | não | não |
| Notificação | webhook `{ evento: "preco_alterado", produto }` | webhook `{ type: "price.updated", data }` | **nenhuma** (polling) |

## Plano de controle (todas as instâncias)

| Endpoint | Efeito |
|---|---|
| `PATCH /admin/produtos/:id/preco` `{ "precoCentavos": 720 }` | grava o preço e, se a farmácia tiver webhook, dispara `POST {INGESTION_URL}/webhooks/<farmacia>` |
| `POST /admin/reset` | volta aos preços do seed e notifica os produtos alterados |
| `GET /health` · `GET /docs` | saúde e OpenAPI |

O webhook é assinado com `X-PriceHub-Signature: sha256=<HMAC-SHA256 do corpo>` usando `WEBHOOK_SECRET_<FARMACIA>` e leva `X-Correlation-Id` (o mesmo devolvido pelo PATCH). Falhas de entrega são registradas em log; a **reconciliação periódica** do ingestion (`SYNC_INTERVAL_MS`) cobre a perda.

Código: [`formatos/`](../../backend/apps/farmacia-sim/src/modules/catalogo/formatos) · [`webhook.ts`](../../backend/apps/farmacia-sim/src/modules/catalogo/webhook.ts) · [`catalogo.service.ts`](../../backend/apps/farmacia-sim/src/modules/catalogo/catalogo.service.ts).
