# ADR 0004 — Fronteira HTTP com as farmácias

- **Status:** aceita
- **Data:** 2026-10-08

## Contexto
Farmácias reais são sistemas externos: não compartilham nosso broker, têm contratos próprios e nem todas oferecem notificações. Precisamos demonstrar padronização de formatos heterogêneos.

## Decisão
Farmácias falam com o PriceHub **somente por HTTP**:
- **webhook** assinado com HMAC-SHA256 (`X-PriceHub-Signature: sha256=<hex>`) quando a farmácia suporta (BioFarma, FarmaAzul);
- **polling** quando não suporta (DrogaPopular);
- **sync periódico** (reconciliação) de todas as farmácias, para cobrir webhooks perdidos.

Cada farmácia tem um **Adapter** (`PharmacyConnector`) que converte o formato próprio para o modelo canônico `OfertaColetada`. Dentro do PriceHub, tudo é evento.

## Consequências
- O broker fica protegido dentro da fronteira; credenciais nunca saem do PriceHub.
- Uma nova farmácia exige só um connector e configuração, sem tocar catalog ou query.
- Webhook perdido é recuperado pelo sync; o polling tem latência limitada pelo intervalo.

## Alternativas consideradas
- **Farmácias publicando direto no RabbitMQ:** irreal para parceiros externos e acopla-os à nossa topologia.
- **Só polling:** simples, mas aumenta a latência e a carga para farmácias que podem notificar.
