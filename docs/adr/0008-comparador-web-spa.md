# ADR 0008 — Interface web do comparador

- **Status:** aceita
- **Data:** 2026-10-22

## Contexto

O read model do `query-service` já oferece listagem, comparação de ofertas e atualizações por SSE, mas o comparador ainda não tinha uma interface web. A aplicação precisa exibir o catálogo das três farmácias sem acoplar o navegador aos serviços internos.

## Decisão

Implementar `comparador-web/` como SPA React com TypeScript strict e Vite. A SPA consome somente a API REST e o stream SSE do `query-service`, compartilha uma única conexão SSE enquanto está montada e roda em desenvolvimento ou como arquivos estáticos servidos por nginx no Compose. Os campos de exibição passam pelo contrato canônico e pelos eventos do catálogo até a projeção de consulta.

## Consequências

- A UI não consulta diretamente catálogo, ingestion ou farmácias.
- O `comparador-web` passa a ser o nono container do ambiente e depende do healthcheck do `query-service`.
- As imagens são copiadas da fonte estática em `frontend/` durante dev/build; a pasta de origem segue somente leitura.
- Novos campos públicos do read model são opcionais nos contratos de evento para manter compatibilidade com mensagens antigas.

## Alternativas consideradas

- **SSR ou framework full-stack:** adicionaria um servidor e dependências que não são necessários para uma tela de leitura com atualização via SSE.
- **Consumir os bancos dos serviços ou as APIs das farmácias:** violaria a fronteira CQRS e o isolamento dos bancos por serviço.
