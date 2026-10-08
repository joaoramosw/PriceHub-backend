# Mapeamento: orientação do TCC → artefatos do projeto

Liga cada seção exigida pela orientação, e cada pergunta do orientador, ao arquivo que a responde.

> O documento original de orientação não estava no repositório. As 14 perguntas abaixo foram derivadas da seção 1 do [prompt do backend](../referencias/prompt-backend-pricehub.md), desdobrando o item "eventos" em suas partes (quais existem, quem publica e consome, quando, o que transporta, que ação dispara). Se o documento oficial tiver outra numeração, ajuste esta tabela.

## Seções do TCC

| Seção | Conteúdo esperado | Onde está |
|---|---|---|
| **4.2 Arquitetura** | visão geral, estilo arquitetural, fronteiras, decisões | [arquitetura/visao-geral.md](../arquitetura/visao-geral.md) (C4 nível 2), [ADR 0001](../adr/0001-microsservicos-orientados-a-eventos.md), [ADR 0004](../adr/0004-fronteira-http-com-farmacias.md), [ADR 0006](../adr/0006-banco-por-servico.md) |
| **4.3 APIs das farmácias** | fontes de dados e contratos | [arquitetura/farmacias-simuladas.md](../arquitetura/farmacias-simuladas.md), OpenAPI em `:4001/docs`, `:4002/docs`, `:4003/docs`, código em [`apps/farmacia-sim/src/modules/catalogo/formatos`](../../backend/apps/farmacia-sim/src/modules/catalogo/formatos) |
| **4.4 Modelo e padronização** | modelo canônico, normalização | [arquitetura/modelo-canonico.md](../arquitetura/modelo-canonico.md), [`contracts/src/oferta-coletada.ts`](../../backend/packages/contracts/src/oferta-coletada.ts), [`connectors/normalizacao.ts`](../../backend/apps/ingestion-service/src/connectors/normalizacao.ts) |
| **4.5 Microsserviços** | serviços, responsabilidades, bancos | [arquitetura/servicos.md](../arquitetura/servicos.md), [`docker-compose.yml`](../../docker-compose.yml) |
| **4.6 Eventos** | catálogo, envelope, topologia, confiabilidade | [arquitetura/eventos.md](../arquitetura/eventos.md), [arquitetura/fluxo-atualizacao-preco.md](../arquitetura/fluxo-atualizacao-preco.md), [`infra/rabbitmq/definitions.json`](../../infra/rabbitmq/definitions.json), [ADR 0002](../adr/0002-rabbitmq-como-broker.md), [ADR 0005](../adr/0005-transactional-outbox.md) |
| **4.7 Padrões** | padrões de projeto e justificativas | [padroes-de-projeto.md](../padroes-de-projeto.md), [ADR 0003](../adr/0003-fastify-typebox.md), [ADR 0007](../adr/0007-cqrs-read-model-de-comparacao.md) |
| **4.8 Comparação** | matching e comparação de preços | [arquitetura/matching.md](../arquitetura/matching.md), query em [arquitetura/servicos.md#query-service](../arquitetura/servicos.md#query-service), OpenAPI em `:3000/docs` |
| **5.1 Teste do cenário de atualização de preço** | alteração → evento → processamento → usuário | [resultados-testes.md §5.1](resultados-testes.md#51-cenário-obrigatório--alteração-de-preço-até-o-usuário), `pnpm -C backend demo:preco` |
| **5.2 Teste de resiliência** | falha de um serviço sem perda de dados | [resultados-testes.md §5.2](resultados-testes.md#52-resiliência--catalog-service-fora-do-ar), `pnpm -C backend demo:resiliencia` |
| **5.3 Teste de escalabilidade** | instâncias concorrentes sem duplicidade | [resultados-testes.md §5.3](resultados-testes.md#53-escalabilidade--duas-instâncias-do-catalog-service), `pnpm -C backend demo:escala` |
| **5.4 Testes automatizados e fonte sem webhook** | pirâmide de testes, polling | [resultados-testes.md §5.4 e "Testes automatizados"](resultados-testes.md#54-fonte-sem-webhook--polling-da-drogapopular), [padroes/testes.md](../padroes/testes.md) |

## As 14 perguntas do orientador

| # | Pergunta | Resposta curta | Onde aprofundar |
|---|---|---|---|
| 1 | **Quais são as fontes de dados?** | Três farmácias fictícias como sistemas externos: BioFarma Verde, FarmaAzul Confiança e DrogaPopular Express, simuladas pela mesma aplicação (`farmacia-sim`) e alimentadas pelos sites do `frontend/`. | [farmacias-simuladas.md](../arquitetura/farmacias-simuladas.md) |
| 2 | **Quais dados cada uma fornece?** | BioFarma: REST camelCase com preço em reais, registro MS com máscara e categoria. FarmaAzul: snake_case paginado, centavos, registro sem máscara, sem categoria. DrogaPopular: arquivo legado com nome, dose, quantidade e forma dentro de uma string, preço com vírgula, sem registro MS. | [farmacias-simuladas.md — tabela lado a lado](../arquitetura/farmacias-simuladas.md#os-três-contratos-lado-a-lado-losartana) |
| 3 | **Como os dados são padronizados?** | No ingestion, um adapter por farmácia converte para o modelo canônico `OfertaColetada` (centavos inteiros, registro só com dígitos, concentração, forma e quantidade enumeradas), validado por schema TypeBox. | [modelo-canonico.md](../arquitetura/modelo-canonico.md) |
| 4 | **Quais são os microsserviços?** | `ingestion-service`, `catalog-service`, `query-service`, mais o simulador `farmacia-sim` (3 instâncias), todos com banco próprio. | [servicos.md](../arquitetura/servicos.md) |
| 5 | **Qual a responsabilidade de cada um?** | ingestion integra e padroniza; catalog é a fonte da verdade (matching, ofertas, histórico, outbox); query mantém o read model de comparação e a API pública com SSE. | [servicos.md](../arquitetura/servicos.md), [visao-geral.md](../arquitetura/visao-geral.md#responsabilidades-em-uma-frase) |
| 6 | **Quais eventos existem?** | `ingestao.oferta.recebida`, `catalogo.medicamento.cadastrado`, `catalogo.medicamento.atualizado`, `catalogo.oferta.atualizada`, `catalogo.oferta.nao-correspondida`. | [eventos.md — catálogo](../arquitetura/eventos.md#catálogo-de-eventos) |
| 7 | **Quem publica e quem consome cada evento?** | ingestion → catalog; catalog → query; catalog → fila de revisão. | [eventos.md — catálogo](../arquitetura/eventos.md#catálogo-de-eventos), [topologia](../arquitetura/eventos.md#topologia-rabbitmq) |
| 8 | **Quando cada evento é gerado?** | Oferta recebida: a cada item válido de webhook, sync ou polling. Medicamento cadastrado: matching sem correspondência. Medicamento atualizado: enriquecimento. Oferta atualizada: oferta nova ou preço diferente. Não correspondida: matching impossível. | [eventos.md](../arquitetura/eventos.md#catálogo-de-eventos) |
| 9 | **O que cada evento transporta?** | Envelope padrão (`eventId`, `type`, `version`, `occurredAt`, `correlationId`, `source`) + `data` tipado por evento. | [eventos.md — envelope](../arquitetura/eventos.md#envelope-todos-os-eventos), [`packages/contracts/src/eventos`](../../backend/packages/contracts/src/eventos) |
| 10 | **Qual ação cada evento dispara?** | Oferta recebida → matching, upsert, histórico, outbox. Medicamento cadastrado/atualizado → upsert no read model e SSE. Oferta atualizada → upsert, recálculo de menor e maior preço e SSE. Não correspondida → revisão humana. | [eventos.md](../arquitetura/eventos.md#catálogo-de-eventos), [fluxo-atualizacao-preco.md](../arquitetura/fluxo-atualizacao-preco.md) |
| 11 | **Como os preços são atualizados?** | Webhook assinado em tempo real (BioFarma, FarmaAzul), polling a cada 15 s (DrogaPopular) e sync de reconciliação a cada 60 s para todas. Preço igual não gera evento; timestamp antigo é ignorado (LWW). | [fluxo-atualizacao-preco.md](../arquitetura/fluxo-atualizacao-preco.md), [ADR 0004](../adr/0004-fronteira-http-com-farmacias.md) |
| 12 | **Como identificar que produtos de fontes diferentes são o mesmo medicamento?** | Estratégias em ordem: registro MS, EAN e chave canônica (`princípio ativo normalizado \| concentração \| forma \| quantidade`), com dicionário de sinônimos e enriquecimento do medicamento quando uma fonte melhor chega. Os 10 × 3 casam 100%. | [matching.md](../arquitetura/matching.md) |
| 13 | **Como é feita a comparação?** | O query mantém, por medicamento, as ofertas de cada farmácia e os agregados (menor e maior preço, quantidade de farmácias, economia máxima). `GET /medicamentos/:id/comparacao` ordena por preço e marca `ehMenorPreco`; o SSE avisa o usuário a cada mudança. | [servicos.md — query](../arquitetura/servicos.md#query-service), [ADR 0007](../adr/0007-cqrs-read-model-de-comparacao.md) |
| 14 | **Quais padrões de projeto foram usados e por quê?** | Adapter, Template Method, Strategy, Publisher/Subscriber, Transactional Outbox, Idempotent Consumer, CQRS, Repository (+ Dead Letter Channel, retry com backoff, Correlation Identifier, Canonical Data Model). | [padroes-de-projeto.md](../padroes-de-projeto.md) |

## Como a solução é testada e quais aspectos são avaliados

| Aspecto avaliado | Como | Evidência |
|---|---|---|
| Latência fim a fim (< 2 s) | `demo:preco` + série de 10 execuções | mediana 81 ms até o SSE ([§5.1](resultados-testes.md#51-cenário-obrigatório--alteração-de-preço-até-o-usuário)) |
| Resiliência / ausência de perda | `demo:resiliencia` | 13 mensagens retidas, convergência sem perda ([§5.2](resultados-testes.md#52-resiliência--catalog-service-fora-do-ar)) |
| Escalabilidade horizontal sem duplicidade | `demo:escala` | 10/10 entre 2 instâncias, 0 duplicados ([§5.3](resultados-testes.md#53-escalabilidade--duas-instâncias-do-catalog-service)) |
| Integração por polling | cenário e2e da DrogaPopular | 3,9 s com intervalo de 15 s ([§5.4](resultados-testes.md#54-fonte-sem-webhook--polling-da-drogapopular)) |
| Padronização e matching | testes unitários com dados reais | 30/30 ofertas válidas, 10 × 3 casadas |
| Confiabilidade da mensageria | integração com RabbitMQ real | retry exponencial, DLQ, idempotência |
| Segurança da fronteira | integração do ingestion | HMAC inválido → 401 |

Estratégia de testes: [padroes/testes.md](../padroes/testes.md). Uso de IA no desenvolvimento: [ia/guia-uso-ia.md](../ia/guia-uso-ia.md).
