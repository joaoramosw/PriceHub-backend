# Padrões de eventos

## Nomenclatura
- `type` = `<contexto>.<entidade>.<fato-no-passado>` em português sem acento, minúsculo, com hífen se necessário:
  `ingestao.oferta.recebida`, `catalogo.oferta.atualizada`, `catalogo.oferta.nao-correspondida`.
- O `type` é também a **routing key** na exchange `pricehub.events`.
- Filas: `<consumidor>.<assunto>` (`catalog.ingestao-oferta-recebida`), com `<fila>.retry` e `<fila>.dlq`.

## Envelope
Todo evento usa o envelope de `@pricehub/contracts`:
```ts
{ eventId /* uuid v7 */, type, version, occurredAt, correlationId, source, data }
```
- `eventId` é único e serve para idempotência.
- `correlationId` atravessa HTTP → eventos → logs → SSE.

## Versionamento
- `version` começa em 1. Adicionar campo opcional não muda a versão.
- Remover ou mudar o significado de um campo cria `version: 2`; o produtor publica as duas versões até todos os consumidores migrarem.
- Toda mudança de contrato atualiza `docs/arquitetura/eventos.md` **no mesmo commit**.

## Publicação
- Fora do catalog: `publicarEvento()` com publisher confirms.
- No catalog: grave na tabela `outbox` na mesma transação do efeito; o relay publica.

## Consumo
- Valide o envelope e o `data` com o schema do contrato antes de processar.
- **Idempotência:** insira `eventId` em `eventos_processados` na mesma transação do efeito; se já existir, faça ack sem reprocessar.
- **Ack manual** só depois do commit.
- **Retry:** erro transitório → publica em `<fila>.retry` com `expiration` exponencial (1 s, 2 s, 4 s) e header `x-retry-count`; após 3 tentativas → `nack` sem requeue → DLX → `<fila>.dlq`.
- **Contrato inválido** (mensagem envenenada) vai direto para a DLQ.
- **Ordem:** não é garantida; quem precisa aplica last-write-wins por timestamp do domínio.
