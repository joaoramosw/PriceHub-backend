# Resultados dos testes (insumo para o capítulo 5)

Medições de 08/10/2026 na branch `feat/backend-microsservicos`, com o ambiente completo no Docker Compose.

## Ambiente de medição

| Item | Valor |
|---|---|
| Máquina | notebook Windows 11 Pro, 7,7 GB de RAM, 12 threads |
| Docker | Docker Desktop 28.5 (backend WSL 2), VM com 3,96 GB de RAM |
| Containers | 8 (postgres, rabbitmq, 3 farmácias, ingestion, catalog, query) |
| Configuração | `.env.example` (sync 60 s, polling da DrogaPopular 15 s, outbox 500 ms, prefetch 10) |
| Cliente | Node.js 24 no host, acessando as portas publicadas (`127.0.0.1`) |

As latências por etapa vêm dos logs estruturados de cada serviço, filtrados pelo `correlationId` da execução e medidos em relação ao log "preço alterado na farmácia". As medidas ponta a ponta usam o relógio do cliente, do envio do PATCH até o evento SSE ou até a resposta da API.

## 5.1 Cenário obrigatório — alteração de preço até o usuário

`pnpm -C backend demo:preco`: Losartana na FarmaAzul de R$ 8,90 para R$ 7,20, via webhook.

### Execução de demonstração

```
correlationId: demo-preco-1791477498041
preço: R$ 8,90 → R$ 7,20

| Etapa                                   | Serviço            | Δ desde a alteração (ms) |
|-----------------------------------------|--------------------|--------------------------|
| 1. preço gravado na farmácia            | farmacia-farmaazul | 0                        |
| 2. webhook recebido (HMAC ok)           | ingestion-service  | 43                       |
| 3. ingestao.oferta.recebida publicada   | ingestion-service  | 54                       |
| 4. catalog: matching + outbox commitado | catalog-service    | 76                       |
| 5. query: read model + SSE emitido      | query-service      | 118                      |

| Medida (relógio do cliente)             | ms  |
|-----------------------------------------|-----|
| PATCH na farmácia respondeu             | 61  |
| evento SSE "oferta-atualizada" recebido | 146 |
| GET /comparacao já mostra o novo preço  | 152 |

| Farmácia             | Preço    | Menor preço? |
|----------------------|----------|--------------|
| FarmaAzul Confiança  | R$ 7,20  | sim          |
| DrogaPopular Express | R$ 7,49  |              |
| BioFarma Verde       | R$ 11,50 |              |

critério de aceite: atualização visível em < 2000 ms → 152 ms
✔ demo:preco: APROVADO
```

A primeira execução após o boot inclui o aquecimento (JIT, pools de conexão). As execuções seguintes ficam abaixo de 120 ms.

### Série de 10 execuções consecutivas

| Medida | mín. | mediana | p95 | máx. |
|---|---|---|---|---|
| PATCH respondido (ms) | 6 | 8 | 17 | 17 |
| SSE `oferta-atualizada` recebido (ms) | 53 | 81 | 111 | 111 |
| `GET /medicamentos/:id/comparacao` com o novo preço (ms) | 59 | 85 | 119 | 119 |

| Etapa (Δ desde a gravação na farmácia) | mín. | mediana | p95 | máx. |
|---|---|---|---|---|
| 2. webhook recebido (HMAC ok) | 2 | 2 | 8 | 8 |
| 3. evento publicado (confirm do broker) | 8 | 9 | 18 | 18 |
| 4. catalog: matching + outbox commitado | 13 | 15 | 30 | 30 |
| 5. query: read model atualizado + SSE | 43 | 73 | 96 | 96 |

**Leitura:** a etapa mais longa é a 4→5 (≈ 50 ms), que inclui o relay do outbox, a segunda passagem pelo broker e a transação do query. O relay é acordado logo após o commit, então o polling de 500 ms só entra em ação se o aviso se perder. O critério de **< 2 s** foi atendido com folga de ~20×.

## 5.2 Resiliência — catalog-service fora do ar

`pnpm -C backend demo:resiliencia`

```
| Farmácia  | Produto           | Antes    | Alterado para | No read model após recuperar |
|-----------|-------------------|----------|---------------|------------------------------|
| biofarma  | hidroclorotiazida | R$ 6,50  | R$ 5,90       | R$ 5,90                      |
| farmaazul | sinvastatina      | R$ 14,50 | R$ 12,90      | R$ 12,90                     |
| farmaazul | ibuprofeno        | R$ 17,90 | R$ 15,90      | R$ 15,90                     |

| Medida                                             | Valor |
|----------------------------------------------------|-------|
| mensagens acumuladas na fila com o catalog fora    | 13    |
| API pública seguiu respondendo (preços anteriores) | sim   |
| tempo até convergir após o start (ms)              | 5493  |
| mensagens na fila ao final                         | 0     |

✔ demo:resiliencia: APROVADO
```

- As 13 mensagens são as 3 alterações mais um ciclo de polling da DrogaPopular (10 ofertas), que chegou enquanto o catalog estava parado.
- O ingestion e o query **não foram afetados**: os webhooks foram aceitos (202) e a API pública seguiu respondendo com os últimos preços conhecidos (consistência eventual).
- Os 5,5 s de convergência incluem o boot do container (`prisma migrate deploy`, conexão com banco e broker). O processamento do backlog em si leva milissegundos.
- Nenhuma alteração se perdeu, e a fila terminou vazia.

## 5.3 Escalabilidade — duas instâncias do catalog-service

`pnpm -C backend demo:escala` (`docker compose up -d --scale catalog-service=2` e 20 alterações disparadas em paralelo)

```
| Instância (container) | Ofertas processadas |
|-----------------------|---------------------|
| catalog-service-1     | 10                  |
| catalog-service-2     | 10                  |

| Medida                                           | Valor |
|--------------------------------------------------|-------|
| alterações disparadas                            | 20    |
| eventos processados por mais de uma instância    | 0     |
| duplicados descartados pelo consumer idempotente | 0     |
| tempo até todas aparecerem no read model (ms)    | 790   |

✔ demo:escala: APROVADO
```

- O RabbitMQ distribuiu as mensagens em round-robin entre os dois consumidores da mesma fila (competing consumers): 10 e 10.
- Nenhum `eventId` foi processado por mais de uma instância. O relay do outbox das duas instâncias usa `FOR UPDATE SKIP LOCKED`, de modo que cada evento `catalogo.*` é publicado por uma única instância.

## 5.4 Fonte sem webhook — polling da DrogaPopular

Cenário `executarCenarioDePolling` (Omeprazol na DrogaPopular, R$ 13,99 → R$ 12,90):

| Medida | Valor |
|---|---|
| webhook da farmácia | `nao-suportado` |
| intervalo de polling configurado | 15 000 ms |
| tempo até o novo preço aparecer na comparação | 3 938 ms |

O tempo depende de em que ponto do ciclo de 15 s o PATCH caiu. O pior caso esperado é o intervalo mais o processamento (≈ 15,1 s), e o teste e2e aceita até intervalo + 5 s.

## Testes automatizados

| Suíte | Comando | Arquivos | Testes | Resultado |
|---|---|---|---|---|
| Unitários | `pnpm -C backend test:unit` | 7 | 78 | ✔ |
| Integração (Testcontainers: Postgres + RabbitMQ reais) | `pnpm -C backend test:integration` | 5 | 27 | ✔ |
| **Unit + integração** | `pnpm -C backend test` | **12** | **105** | ✔ (66 s) |
| E2E contra o compose (4 cenários acima) | `pnpm -C backend test:e2e` | 1 | 4 | ✔ (49 s) |

### O que cada nível prova

| Aspecto da arquitetura | Evidência |
|---|---|
| Padronização de formatos heterogêneos | `ingestion-service/test/unit/connectors.test.ts`: os 30 itens dos 3 formatos viram `OfertaColetada` válidas, com os mesmos atributos canônicos |
| Identificação do mesmo medicamento | `catalog-service/test/unit/matching.test.ts`: 30 ofertas → 10 chaves × 3 farmácias, casando 100% em qualquer ordem de chegada |
| Retry com atraso exponencial e DLQ | `messaging/test/integration/messaging.test.ts`: 4 tentativas (0, 1, 2, 3) com intervalos ≥ 100/200/400 ms e mensagem na `.dlq` com `x-retry-count = 3` |
| Mensagem envenenada | idem: contrato inválido vai direto para a DLQ sem chamar o handler |
| Idempotência | `messaging` (3 entregas do mesmo evento → 1 efeito), `catalog` (evento duplicado não altera versão nem histórico), `query` (LWW + duplicado) |
| Preço repetido não gera evento | `catalog-service/test/integration/catalogo.test.ts`: 30 ofertas reenviadas → outbox inalterado, fila vazia |
| Ordem fora de sequência | catalog e query ignoram `atualizadoEm` mais antigo; query reprocessa oferta que chega antes do medicamento |
| Segurança do webhook | `ingestion-service/test/integration`: assinatura inválida ou ausente → 401 e nada publicado |
| Contratos | `contracts/test/unit`: schemas rejeitam preço fracionado, unidade desconhecida, registro com máscara, versão errada |
