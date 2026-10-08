# Documentação do PriceHub

## Arquitetura
- [Visão geral](arquitetura/visao-geral.md) — diagrama C4 nível 2 e decisão de fronteira
- [Serviços](arquitetura/servicos.md) — responsabilidade, porta, banco e eventos de cada serviço
- [Eventos](arquitetura/eventos.md) — catálogo de eventos, envelope e topologia do RabbitMQ
- [Fluxo de atualização de preço](arquitetura/fluxo-atualizacao-preco.md) — cenário de avaliação
- [Modelo canônico](arquitetura/modelo-canonico.md) — `OfertaColetada` e regras de normalização
- [Matching](arquitetura/matching.md) — como identificar o mesmo medicamento em fontes diferentes
- [Farmácias simuladas](arquitetura/farmacias-simuladas.md) — os 3 contratos lado a lado

## Decisões (ADR)
- [0000 — Template](adr/0000-template.md)
- [0001 — Microsserviços orientados a eventos](adr/0001-microsservicos-orientados-a-eventos.md)
- [0002 — RabbitMQ como broker](adr/0002-rabbitmq-como-broker.md)
- [0003 — Fastify + TypeBox](adr/0003-fastify-typebox.md)
- [0004 — Fronteira HTTP com as farmácias](adr/0004-fronteira-http-com-farmacias.md)
- [0005 — Transactional Outbox](adr/0005-transactional-outbox.md)
- [0006 — Banco por serviço](adr/0006-banco-por-servico.md)
- [0007 — CQRS: read model de comparação](adr/0007-cqrs-read-model-de-comparacao.md)

## Padrões de desenvolvimento
- [Código](padroes/codigo.md) · [API](padroes/api.md) · [Eventos](padroes/eventos.md) · [Banco](padroes/banco.md)
- [Testes](padroes/testes.md) · [Docker](padroes/docker.md) · [Git](padroes/git.md)
- [Padrões de projeto usados](padroes-de-projeto.md)

## Uso de IA
- [Guia de uso de IA](ia/guia-uso-ia.md) — fluxo obrigatório
- [Template de prompt](ia/template-prompt.md)
- [Checklist de revisão](ia/checklist-revisao.md)
- [Contexto para agentes](ia/contexto-para-agentes.md)

## Operação e TCC
- [Runbook](runbook.md) — subir, portas, troubleshooting, demos
- [Mapeamento da orientação do TCC](tcc/mapeamento-orientacao.md)
- [Resultados dos testes](tcc/resultados-testes.md)
