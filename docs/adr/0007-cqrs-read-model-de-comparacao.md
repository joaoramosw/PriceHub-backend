# ADR 0007 — CQRS: read model de comparação

- **Status:** aceita
- **Data:** 2026-10-08

## Contexto
O modelo de escrita do catálogo é normalizado (medicamentos, ofertas, histórico, outbox) e otimizado para matching e consistência. A tela de comparação precisa de leituras rápidas com agregados (menor e maior preço, economia, quantidade de farmácias) e de notificações ao vivo.

## Decisão
Separar escrita e leitura: o `query-service` mantém um **read model desnormalizado** (`comparacao_medicamentos`, `comparacao_ofertas`) atualizado pelos eventos `catalogo.*`, recalcula os agregados a cada oferta e expõe REST + SSE. A ordem é garantida por last-write-wins em `atualizadoEm`.

## Consequências
- Leituras simples e baratas; a API pública não toca o catálogo.
- O read model pode ser reconstruído a partir dos eventos.
- Consistência eventual entre catálogo e comparação.

## Alternativas consideradas
- **Consultar o catálogo diretamente:** acopla a API pública ao modelo de escrita e exige joins e agregações a cada leitura.
- **Views materializadas no banco do catálogo:** violam o banco por serviço e não emitem notificações ao vivo.
