# ADR 0001 — Microsserviços orientados a eventos

- **Status:** aceita
- **Data:** 2026-10-08

## Contexto
O PriceHub precisa integrar fontes heterogêneas (farmácias com contratos, frequências e confiabilidade diferentes), padronizar os dados, centralizá-los e refletir mudanças de preço rapidamente para o usuário. O tema do TCC exige avaliar uma arquitetura de microsserviços com comunicação orientada a eventos.

## Decisão
Dividir o backend em três serviços com responsabilidades isoladas — `ingestion-service` (integração), `catalog-service` (fonte da verdade) e `query-service` (leitura) — que se comunicam **apenas por eventos assíncronos** publicados num broker. Nenhum serviço chama outro por HTTP. As farmácias são sistemas externos simulados por `farmacia-sim`.

## Consequências
- Cada etapa (coletar, padronizar/casar, apresentar) evolui, escala e falha de forma independente.
- Uma falha no catalog não derruba a ingestão: as mensagens acumulam na fila e são processadas quando ele volta.
- Consistência eventual entre catálogo e read model, mitigada por latência baixa (< 2 s) e SSE.
- Mais peças operacionais (broker, filas, DLQ) e necessidade de idempotência, retry e rastreio por `correlationId`.

## Alternativas consideradas
- **Monólito modular:** mais simples, mas não demonstra integração assíncrona nem isolamento de falhas, que são o objeto do TCC.
- **Microsserviços síncronos (REST entre serviços):** acoplamento temporal; a queda de um serviço propaga erros em cadeia.
