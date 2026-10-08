# Padrões de projeto utilizados

Somente padrões **efetivamente implementados**, com o problema que resolvem e onde estão no código.

## Adapter

- **Problema:** cada farmácia expõe um contrato diferente (camelCase em reais, snake_case paginado em centavos, arquivo legado com tudo numa string). O restante do sistema não pode conhecer esses formatos.
- **Solução:** um adapter por farmácia converte o formato externo para o modelo canônico `OfertaColetada`, atrás de uma interface comum (`PharmacyConnector`). Cada adapter também valida o payload externo contra o schema daquela farmácia, funcionando como camada anticorrupção.
- **Onde:**
  - interface e classe base: [`ingestion-service/src/connectors/pharmacy-connector.ts`](../backend/apps/ingestion-service/src/connectors/pharmacy-connector.ts)
  - adapters: [`biofarma/`](../backend/apps/ingestion-service/src/connectors/biofarma/biofarma.connector.ts), [`farmaazul/`](../backend/apps/ingestion-service/src/connectors/farmaazul/farmaazul.connector.ts), [`drogapopular/`](../backend/apps/ingestion-service/src/connectors/drogapopular/drogapopular.connector.ts)
  - registro: [`connectors/registry.ts`](../backend/apps/ingestion-service/src/connectors/registry.ts)
- **Por quê:** adicionar uma farmácia exige só um adapter novo (Open/Closed); catalog e query não mudam.

## Template Method

- **Problema:** os três adapters repetiriam o mesmo fluxo: extrair itens, converter cada um, validar contra o modelo canônico, descartar com motivo os inválidos e seguir com os demais.
- **Solução:** `ConnectorBase` implementa o algoritmo (`converterCatalogo`, `converterWebhookDetalhado`, `buscarCatalogo`) e delega os passos variáveis (`extrairItensDoCatalogo`, `extrairItensDoWebhook`, `identificar`, `converterItem`) às subclasses.
- **Onde:** [`pharmacy-connector.ts`](../backend/apps/ingestion-service/src/connectors/pharmacy-connector.ts).
- **Por quê:** o tratamento de erro por item e a validação canônica ficam em um único lugar.

## Strategy

- **Problema:** existem critérios diferentes para decidir se duas ofertas são o mesmo medicamento, com confiabilidades diferentes, e a lista tende a crescer.
- **Solução:** cada critério é uma `MatchingStrategy` (`RegistroMsStrategy`, `EanStrategy`, `ChaveCanonicaStrategy`), e o `MatchingService` percorre a lista em ordem de confiabilidade.
- **Onde:** [`catalog-service/src/modules/matching/strategies.ts`](../backend/apps/catalog-service/src/modules/matching/strategies.ts), [`matching.service.ts`](../backend/apps/catalog-service/src/modules/matching/matching.service.ts).
- **Por quê:** novas estratégias (ex.: equivalência entre laboratórios) entram sem alterar as existentes, e a ordem é configurável e testável isoladamente.

## Publisher/Subscriber (orientação a eventos)

- **Problema:** os serviços precisam reagir a mudanças uns dos outros sem acoplamento temporal nem conhecimento mútuo.
- **Solução:** os produtores publicam eventos numa exchange topic (`pricehub.events`) e cada consumidor tem a própria fila ligada às routing keys que lhe interessam. Várias instâncias do mesmo serviço competem pela mesma fila (competing consumers).
- **Onde:** publicação em [`messaging/src/publicar.ts`](../backend/packages/messaging/src/publicar.ts), consumo em [`messaging/src/consumir.ts`](../backend/packages/messaging/src/consumir.ts), topologia em [`infra/rabbitmq/definitions.json`](../infra/rabbitmq/definitions.json), contratos em [`packages/contracts`](../backend/packages/contracts/src/eventos).
- **Por quê:** o catalog pode cair sem afetar ingestion nem query, e novos consumidores (ex.: alertas de preço) entram só com um binding.

## Transactional Outbox

- **Problema:** gravar a oferta e publicar o evento são duas operações em sistemas diferentes (dual write); uma pode falhar sem a outra.
- **Solução:** o evento é gravado na tabela `outbox` na **mesma transação** da oferta e do histórico. Um relay lê com `FOR UPDATE SKIP LOCKED`, publica com confirmação e marca `publicado_em`.
- **Onde:** gravação em [`outbox.repository.ts`](../backend/apps/catalog-service/src/modules/outbox/outbox.repository.ts) (chamado de [`processador-de-ofertas.service.ts`](../backend/apps/catalog-service/src/modules/catalogo/processador-de-ofertas.service.ts)), relay em [`outbox.relay.ts`](../backend/apps/catalog-service/src/modules/outbox/outbox.relay.ts). [ADR 0005](adr/0005-transactional-outbox.md).
- **Por quê:** nenhum preço muda sem evento e nenhum evento sai sem preço gravado; `SKIP LOCKED` permite escalar o catalog.

## Idempotent Consumer

- **Problema:** a entrega é *pelo menos uma vez* (retry, relay que cai após publicar, redelivery do broker); processar duas vezes duplicaria histórico e eventos.
- **Solução:** o `eventId` é inserido em `eventos_processados` (`ON CONFLICT DO NOTHING`) na mesma transação do efeito; se já existia, o efeito é pulado e a mensagem recebe ack.
- **Onde:** [`messaging/src/idempotencia.ts`](../backend/packages/messaging/src/idempotencia.ts) (`executarUmaVez`), usado em [`processador-de-ofertas.service.ts`](../backend/apps/catalog-service/src/modules/catalogo/processador-de-ofertas.service.ts) e [`projecao.service.ts`](../backend/apps/query-service/src/modules/comparacao/projecao.service.ts).
- **Por quê:** permite retry agressivo e várias instâncias sem efeitos duplicados.

## CQRS (Command Query Responsibility Segregation)

- **Problema:** o modelo de escrita, normalizado e otimizado para matching e consistência, não serve bem à leitura de comparação, que precisa de agregados e notificação em tempo real.
- **Solução:** o catalog é o lado de escrita, e o query mantém um read model desnormalizado (`comparacao_medicamentos`, `comparacao_ofertas`) atualizado por eventos, com agregados pré-calculados.
- **Onde:** projeção em [`query-service/src/modules/comparacao/projecao.service.ts`](../backend/apps/query-service/src/modules/comparacao/projecao.service.ts), leitura em [`comparacao.repository.ts`](../backend/apps/query-service/src/modules/comparacao/comparacao.repository.ts). [ADR 0007](adr/0007-cqrs-read-model-de-comparacao.md).
- **Por quê:** consultas simples e rápidas, API pública isolada do modelo de escrita e read model reconstruível a partir dos eventos.

## Repository

- **Problema:** regras de negócio misturadas com acesso a dados dificultam testes e trocas de tecnologia.
- **Solução:** todo acesso a dados passa por classes `*.repository.ts`; services e o matching dependem delas, não do client do banco.
- **Onde:** [`catalog-service/src/modules/catalogo/*.repository.ts`](../backend/apps/catalog-service/src/modules/catalogo), [`ingestion-service/src/modules/coletas/coletas.repository.ts`](../backend/apps/ingestion-service/src/modules/coletas/coletas.repository.ts), [`farmacia-sim/src/modules/catalogo/catalogo.repository.ts`](../backend/apps/farmacia-sim/src/modules/catalogo/catalogo.repository.ts), [`query-service/src/modules/comparacao/comparacao.repository.ts`](../backend/apps/query-service/src/modules/comparacao/comparacao.repository.ts).
- **Por quê:** o matching é testado com um repositório em memória ([`matching.test.ts`](../backend/apps/catalog-service/test/unit/matching.test.ts)) sem banco.

## Padrões de mensageria complementares

| Padrão | Onde | Papel |
|---|---|---|
| Dead Letter Channel | DLX `pricehub.dlx` + `<fila>.dlq` | isola mensagens que esgotaram as tentativas ou violam o contrato |
| Retry com backoff exponencial | `<fila>.retry` com TTL por mensagem ([`consumir.ts`](../backend/packages/messaging/src/consumir.ts)) | absorve falhas transitórias sem bloquear a fila principal |
| Correlation Identifier | `correlationId` no envelope, nos logs e no SSE | rastreia uma alteração de preço através de todos os serviços |
| Canonical Data Model | [`OfertaColetada`](../backend/packages/contracts/src/oferta-coletada.ts) | formato único entre ingestion e catalog |
