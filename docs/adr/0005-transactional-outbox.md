# ADR 0005 — Transactional Outbox

- **Status:** aceita
- **Data:** 2026-10-08

## Contexto
Quando o catalog grava uma oferta, ele precisa publicar `catalogo.oferta.atualizada`. Gravar no banco e publicar no broker são duas operações que podem falhar isoladamente (*dual write*): o preço mudaria sem evento, ou haveria evento sem preço gravado.

## Decisão
O catalog grava a oferta, o histórico e uma linha na tabela `outbox` **na mesma transação**. Um relay faz polling a cada 500 ms com `SELECT ... FOR UPDATE SKIP LOCKED`, publica com publisher confirms e marca `publicado_em`. `SKIP LOCKED` permite várias instâncias do catalog sem publicação duplicada.

## Consequências
- Atomicidade entre estado e evento; nenhuma perda mesmo com o broker fora.
- Entrega *pelo menos uma vez* (o relay pode publicar e cair antes de marcar): consumidores precisam ser idempotentes (`eventId`).
- Latência extra de até um intervalo de polling.

## Alternativas consideradas
- **Publicar depois do commit:** perde eventos se o processo cair entre commit e publish.
- **CDC (Debezium):** robusto, mas exige Kafka Connect e infraestrutura desproporcional ao MVP.
