# ADR 0002 — RabbitMQ como broker

- **Status:** aceita
- **Data:** 2026-10-08

## Contexto
Precisamos de entrega confiável entre serviços, roteamento por tipo de evento, retry com atraso, dead-letter e uma interface visual para demonstrar filas na banca. O volume é pequeno (dezenas de ofertas) e o ambiente é local (Docker Compose).

## Decisão
Usar **RabbitMQ 4.1** (imagem `management`) com:
- exchange topic durável `pricehub.events` e filas duráveis por consumidor (`<consumidor>.<assunto>`);
- DLX `pricehub.dlx` com uma `<fila>.dlq` por fila;
- filas `<fila>.retry` com TTL por mensagem (atraso exponencial) que devolvem a mensagem à fila de origem pela exchange padrão;
- publisher confirms e ack manual somente depois do commit no banco.

A topologia é declarativa em `infra/rabbitmq/definitions.json`. O usuário do broker é gerado a partir do `.env` por `infra/rabbitmq/entrypoint.sh`, para que nenhuma credencial fique versionada.

## Consequências
- Roteamento por routing key (`catalogo.oferta.atualizada`) permite adicionar consumidores sem alterar produtores.
- A UI de gerenciamento mostra as filas acumulando no cenário de resiliência.
- Retry com TTL por mensagem tem bloqueio de cabeça de fila (uma mensagem com atraso maior segura as seguintes na `.retry`); aceitável no volume do MVP.
- Ordem não é garantida entre instâncias concorrentes: o consumidor final aplica last-write-wins por timestamp.

## Alternativas consideradas
- **Kafka:** log persistente e replay são úteis, mas exigem mais infraestrutura e não oferecem retry/DLQ nativos.
- **Redis Streams / NATS:** mais leves, porém com menos recursos prontos de DLX e menor familiaridade da equipe.
