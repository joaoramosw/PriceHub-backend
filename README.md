# PriceHub

**Comparador de preços de medicamentos construído com microsserviços e comunicação assíncrona orientada a eventos.**

Objeto de estudo do TCC *"PriceHub: uma arquitetura eficiente orientada a eventos e microsserviços"* (UCSal, 2026).

![Comparador do PriceHub com as três farmácias integradas](docs/passo-a-passo/04-comparador-completo.png)

---

## Sumário

1. [Objetivo](#1-objetivo)
2. [O que a aplicação faz](#2-o-que-a-aplicação-faz)
3. [Tecnologias](#3-tecnologias)
4. [Arquitetura](#4-arquitetura)
5. [Como rodar (Docker)](#5-como-rodar-docker)
6. [Tour pela aplicação, com prints](#6-tour-pela-aplicação-com-prints)
7. [Roteiro da demonstração e validação ponta a ponta](#7-roteiro-da-demonstração-e-validação-ponta-a-ponta)
8. [Eventos e filas](#8-eventos-e-filas)
9. [Onde cada conceito está no código](#9-onde-cada-conceito-está-no-código)
10. [Desenvolvimento sem Docker](#10-desenvolvimento-sem-docker)
11. [Testes](#11-testes)
12. [Estrutura de pastas](#12-estrutura-de-pastas)
13. [Problemas comuns](#13-problemas-comuns)
14. [Decisões de arquitetura](#14-decisões-de-arquitetura)

---

## 1. Objetivo

Medicamentos idênticos costumam ter preços bem diferentes de uma farmácia para outra, e cada farmácia expõe seus dados de
um jeito: uma avisa por webhook, outra entrega uma API paginada com preço em centavos, outra só tem um arquivo legado que
precisa ser consultado periodicamente.

O PriceHub reúne essas fontes em um único catálogo e mostra, para cada medicamento, a oferta mais barata e quanto o
visitante economiza. **O produto é a porta de entrada; o foco do trabalho é a arquitetura**:

* **Orientação a serviços e microsserviços:** cada responsabilidade em um serviço independente, com banco próprio.
* **Comunicação assíncrona por eventos:** os serviços conversam pelo RabbitMQ, sem chamadas HTTP em cadeia.
* **Orientação a objetos e padrões de projeto:** Observer, Adapter, Template Method, Strategy e Transactional Outbox.
* **Observabilidade:** um serviço de log assina todos os eventos, rastreia cada operação por `correlationId` e mede o
  ganho da comunicação assíncrona (tempo de aceite x janela de convergência).

A pergunta que o projeto responde na prática: *quanto a farmácia deixa de esperar quando o PriceHub aceita a alteração e
processa o resto de forma assíncrona, e o que acontece quando um serviço sai do ar?* O monitor de eventos mostra as duas
respostas com números reais.

## 2. O que a aplicação faz

| Tela | Para quem | O que mostra |
|---|---|---|
| **Comparador** (`:5173`) | Visitante | Busca por nome, princípio ativo ou fabricante; filtros por categoria; menor preço, número de ofertas e economia; atualização em tempo real (SSE) |
| **Gestão das lojas** (`:5174`) | Quem opera a demonstração | Cadastro, edição, remoção e preço dos produtos de cada farmácia simulada; cada alteração mostra, ao vivo, os eventos que ela gerou |
| **Monitor de eventos** (`:5175`) | Banca / desenvolvedores | Eventos ao vivo, linha do tempo por operação, filas do RabbitMQ, experimento de pausa, métricas e links das APIs |
| **Vitrines** (`:5176`) | Contexto | O "site" de cada farmácia, como um cliente dela veria |

Três farmácias simuladas alimentam o sistema, cada uma com um perfil de integração diferente:

| Farmácia | Porta | Integração | Formato | Perfil de preço |
|---|---|---|---|---|
| BioFarma Verde | 8101 | Webhook assinado (HMAC) | camelCase, preço em reais | caro |
| FarmaAzul Confiança | 8102 | Webhook assinado (HMAC) | API paginada, preço em centavos | mediano |
| DrogaPopular Express | 8103 | **Sem webhook**: polling a cada 15 s com ETag | arquivo legado | barato |

## 3. Tecnologias

| Camada | Tecnologias |
|---|---|
| Backend | Python 3.12, FastAPI (Swagger em `/docs` de cada serviço), Pydantic, SQLAlchemy assíncrono, aio-pika |
| Mensageria | RabbitMQ 4, exchange *topic* `pricehub.eventos`, filas duráveis com `.retry` e `.dlq` |
| Banco | PostgreSQL 16, **um banco por serviço com persistência** (`ingestao`, `catalogo`, `consulta`, `auditoria`) |
| Frontend | React 19, Tailwind CSS 4, Vite, TypeScript, monorepositório de micro-frontends (npm workspaces) |
| Infraestrutura | Docker e Docker Compose |

## 4. Arquitetura

```mermaid
flowchart LR
  subgraph Externos["Farmácias simuladas (sistemas externos, dados em memória)"]
    BIO["farmacia-biofarma :8101<br/>webhook · camelCase · R$"]
    AZUL["farmacia-farmaazul :8102<br/>webhook · paginada · centavos"]
    POP["farmacia-drogapopular :8103<br/>sem webhook · arquivo legado"]
  end

  BIO -- "POST /webhooks (HMAC)" --> ING
  AZUL -- "POST /webhooks (HMAC)" --> ING
  ING -- "GET a cada 15 s (ETag)" --> POP

  ING["ms-ingestao :8001<br/>Adapter · banco ingestao"]
  ING -- "ingestao.*" --> MQ{{"RabbitMQ<br/>exchange pricehub.eventos (topic)"}}
  MQ -- "fila ms-catalogo.eventos-de-ingestao" --> CAT["ms-catalogo :8002<br/>Strategy · Outbox · banco catalogo"]
  CAT -- "catalogo.* (via outbox)" --> MQ
  MQ -- "fila ms-log.todos-os-eventos (#)" --> LOG["ms-log :8003<br/>serviço de log · banco auditoria"]

  MQ -- "catalogo.visao.atualizada" --> QRY["ms-consulta :8004<br/>projeções CQRS · banco consulta"]
  WEB["micro-frontends React<br/>comparador · lojas · monitor · vitrines"] --> BFF["ms-bff :8000<br/>fachada HTTP"]
  BFF --> QRY
  BFF --> CAT
  BFF --> LOG
  BFF --> BIO
  BFF --> AZUL
  BFF --> POP
  QRY -. "SSE /tempo-real" .-> WEB
  LOG -. "SSE /registros/tempo-real" .-> WEB
```

O BFF é a borda HTTP chamada pelo navegador e encaminha cada rota à API responsável. As chamadas entre serviços de domínio
continuam orientadas a eventos no RabbitMQ; o BFF não acessa bancos. O serviço de consulta guarda uma projeção independente,
e o catálogo pode republicar snapshots quando recebe `consulta.projecao.solicitada` após a projeção ser criada vazia.

### Caminho de uma alteração de preço

1. A gestão envia a alteração pelo BFF à API da farmácia; o BFF devolve o aceite e o `correlationId` da operação.
2. A farmácia aplica o **Observer**: o observador de webhook envia a alteração assinada com HMAC para o `ms-ingestao`
   (no caso da DrogaPopular, o `ms-ingestao` percebe a mudança no próximo polling).
3. O `ms-ingestao` usa o **Adapter** da farmácia para converter o formato dela no modelo canônico, grava a coleta bruta,
   publica `ingestao.oferta.recebida` no RabbitMQ e **responde na hora** (esse é o *tempo de aceite*).
4. O `ms-catalogo` consome o evento, associa a oferta a um medicamento único (**Strategy**), atualiza preço e histórico e
   grava o evento de saída na **outbox** na mesma transação. Um relay publica `catalogo.oferta.atualizada`.
5. O `ms-catalogo` grava um snapshot de leitura na outbox, na mesma transação da mudança. O `ms-consulta` aplica o evento
   na projeção do seu banco e envia SSE ao comparador pelo BFF. O `ms-log` registra os passos com o mesmo `correlationId`.

### Serviços e portas

| Serviço | Porta | Responsabilidade | Banco |
|---|---|---|---|
| `ms-ingestao` | 8001 interno | Recebe webhooks, faz polling, adapta cada formato ao modelo canônico e publica eventos | `ingestao` (coletas brutas) |
| `ms-catalogo` | 8002 interno | Consome a ingestão, associa ofertas a medicamentos únicos, mantém preço e histórico imutável e publica snapshots via outbox | `catalogo` |
| `ms-log` | 8003 interno | Assina **todos** os eventos (`#`), grava, rastreia por `correlationId`, mede aceite x convergência, lê as filas | `auditoria` |
| `ms-consulta` | 8004 interno | Mantém projeções CQRS a partir de eventos do catálogo; serve busca, detalhe, histórico e SSE | `consulta` |
| `ms-bff` | 8000 | Fachada HTTP dos micro-frontends; encaminha consultas, gestão das lojas, monitor e comandos de operação | - |
| `farmacia-*` | 8101-8103 | Farmácias simuladas: API própria + API de gestão; padrão Observer | memória |
| `frontend` | 5173-5176 | Comparador, gestão das lojas, monitor de eventos, vitrines | - |
| RabbitMQ | 5672 / 15672 | Broker AMQP e painel de gerenciamento | - |
| PostgreSQL | 5433 | Um banco por microsserviço | - |

## 5. Como rodar (Docker)

### Pré-requisitos

* [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e aberto.
* Portas livres: 5173-5176, 8000, 8101-8103, 5433, 5672 e 15672 (veja [Problemas comuns](#13-problemas-comuns) se
  alguma estiver ocupada).
* Internet na primeira execução (download das imagens) e para abrir o Swagger, que carrega a interface de uma CDN.

### Passo a passo

```bash
git clone https://github.com/joaoramosw/PriceHub-backend.git
cd PriceHub-backend

# Windows (PowerShell):  copy .env.example .env
cp .env.example .env

# uma vez por clone: ativa o hook que barra coautoria de IA nos commits
git config core.hooksPath .githooks

docker compose up -d --build
```

O primeiro build leva alguns minutos. Para acompanhar:

```bash
docker compose ps        # todos devem ficar "healthy" (o frontend fica só "Up")
docker compose logs -f ms-ingestao ms-catalogo ms-consulta ms-bff ms-log
```

Para demonstrar réplicas do consumidor de leitura, o `ms-consulta` não publica porta fixa no host e pode ser escalado:

```bash
docker compose up -d --scale ms-consulta=3
```

As réplicas compartilham a fila durável de projeção e o banco `consulta`; cada uma mantém uma fila SSE efêmera própria
para os navegadores conectados a ela. O `ms-ingestao` permanece em uma instância porque o agendador de polling ainda
não usa eleição distribuída.

Quando tudo estiver de pé, as farmácias já terão enviado a carga inicial e o comparador mostra 10 medicamentos com
3 ofertas cada.

### Endereços

| O quê | Endereço |
|---|---|
| Comparador (visitante) | http://localhost:5173 |
| Gestão das lojas | http://localhost:5174 |
| Monitor de eventos, filas, métricas e links das APIs | http://localhost:5175 |
| Vitrines das farmácias | http://localhost:5176 |
| Swagger do ms-bff / ms-ingestao / ms-catalogo / ms-log / ms-consulta | http://localhost:8000/docs · http://localhost:8000/ingestao/docs · http://localhost:8000/catalogo/docs · http://localhost:8000/log/docs · http://localhost:8000/consulta/docs |
| Swagger das farmácias | http://localhost:8000/farmacias/biofarma/docs · http://localhost:8000/farmacias/farmaazul/docs · http://localhost:8000/farmacias/drogapopular/docs |
| Painel do RabbitMQ | http://localhost:15672 (usuário `pricehub`, senha `pricehub`) |

### Configuração (`.env`)

| Variável | Padrão | Para quê |
|---|---|---|
| `POSTGRES_USUARIO` / `POSTGRES_SENHA` | `pricehub` / `pricehub` | Credenciais do PostgreSQL |
| `RABBITMQ_USUARIO` / `RABBITMQ_SENHA` | `pricehub` / `pricehub` | Credenciais do RabbitMQ |
| `SEGREDO_DO_WEBHOOK_BIOFARMA` / `SEGREDO_DO_WEBHOOK_FARMAAZUL` | `segredo-*-dev` | Chave HMAC que assina os webhooks |
| `INTERVALO_DE_POLLING_S` | `15` | Intervalo do polling da DrogaPopular |
| `INTERVALO_DE_RECONCILIACAO_S` | `120` | Reconciliação periódica das farmácias com webhook |
| `NIVEL_DE_LOG` | `INFO` | Nível dos logs JSON dos serviços |

Os valores são só para uso local. Em uma instalação anterior com volume persistente, crie o banco adicional uma vez com
`docker compose exec postgres createdb -U pricehub consulta` (ajuste o usuário se alterou `POSTGRES_USUARIO`).

### Parar e limpar

```bash
docker compose down        # para tudo e mantém os dados
docker compose down -v     # para tudo e apaga os bancos (volta ao "PriceHub vazio")
```

## 6. Tour pela aplicação, com prints

As capturas seguem a ordem da demonstração: o PriceHub começa vazio, as farmácias chegam uma a uma, um preço muda e o
monitor comprova cada passo.

### 6.1 PriceHub vazio

Sem farmácias no ar, o comparador avisa que o catálogo está vazio e o monitor não tem eventos.

| Comparador vazio | Monitor vazio |
|---|---|
| ![Comparador vazio](docs/passo-a-passo/01-comparador-vazio.png) | ![Monitor vazio](docs/passo-a-passo/02-monitor-vazio.png) |

### 6.2 Chegada das farmácias

Com só a BioFarma no ar, cada medicamento tem uma oferta. Quando as três chegam, o comparador passa a mostrar o menor
preço, quantas ofertas existem e quanto o visitante economiza.

| Só a BioFarma | As três farmácias |
|---|---|
| ![Só BioFarma](docs/passo-a-passo/03-comparador-so-biofarma.png) | ![Comparador completo](docs/passo-a-passo/04-comparador-completo.png) |

Ao clicar em um medicamento, o detalhe lista as ofertas da mais barata para a mais cara:

![Detalhe do medicamento](docs/passo-a-passo/12-comparador-detalhe.png)

### 6.3 Gestão das lojas e vitrines

Cada farmácia é um sistema externo com API própria. Na gestão é possível criar, editar e remover produtos e alterar
preços. A vitrine mostra o site da farmácia, como um cliente dela veria.

| Gestão das lojas | Vitrine |
|---|---|
| ![Gestão das lojas](docs/passo-a-passo/05-lojas.png) | ![Vitrine](docs/passo-a-passo/06-vitrine.png) |

### 6.4 Alteração de preço por webhook

Ao salvar um novo preço na FarmaAzul, o painel **Propagação ao vivo** mostra os eventos em sequência, com o tempo de
cada um (`ingestao.oferta.recebida` → `ingestao.coleta.realizada` → `catalogo.oferta.atualizada`, em ~26 ms). O
comparador destaca o card alterado e exibe um aviso, sem recarregar a página.

| Propagação na gestão | Aviso no comparador |
|---|---|
| ![Propagação por webhook](docs/passo-a-passo/07-lojas-propagacao-webhook.png) | ![Aviso no comparador](docs/passo-a-passo/08-comparador-aviso.png) |

### 6.5 Alteração de preço por polling

A DrogaPopular não tem webhook. A gestão mostra que a alteração está aguardando a próxima consulta do `ms-ingestao`
(até 15 s) e, depois, os eventos gerados por ela.

| Aguardando o polling | Atualizado pelo polling |
|---|---|
| ![Aguardando polling](docs/passo-a-passo/09-lojas-polling-aguardando.png) | ![Polling atualizado](docs/passo-a-passo/10-lojas-polling-atualizado.png) |

### 6.6 Monitor de eventos: rastreamento por `correlationId`

Todos os eventos que passam pelo RabbitMQ, filtráveis por origem e farmácia. Ao clicar em um evento, a **linha do tempo
da operação** mostra cada passo, o serviço que o produziu e o tempo decorrido. O botão **Exportar JSON** baixa o log bruto.

![Monitor com linha do tempo](docs/passo-a-passo/11-monitor-linha-do-tempo.png)

### 6.7 Resiliência: o catálogo sai do ar

Na aba **Filas e serviços**, um botão pausa o consumo do `ms-catalogo`. As farmácias continuam sendo atendidas normalmente
e os eventos ficam retidos na fila. Ao retomar, a fila esvazia e nada se perde.

| Consumo pausado (16 mensagens retidas) | Consumo retomado |
|---|---|
| ![Fila crescendo](docs/passo-a-passo/13-filas-catalogo-pausado.png) | ![Fila esvaziada](docs/passo-a-passo/14-filas-retomado.png) |

### 6.8 Microsserviços x monólito: o ganho medido

O `ms-log` calcula, a partir dos eventos reais da execução:

* **Tempo de aceite:** quanto a farmácia esperou (o `ms-ingestao` responde assim que publica no RabbitMQ).
* **Janela de convergência:** do primeiro evento até o catálogo atualizado (consistência eventual).
* **Espera equivalente se fosse síncrono:** aceite + convergência, o que a farmácia esperaria numa cadeia HTTP ou num monólito.

No print, com o catálogo pausado durante parte das alterações, a farmácia esperou **24 ms** (mediana) enquanto a
convergência chegou a **7,78 s**: o produtor não sente a indisponibilidade do consumidor.

![Métricas](docs/passo-a-passo/15-monitor-metricas.png)

> Há mais capturas em [`docs/telas/`](docs/telas/) (incluindo a aba de documentação das APIs) e execuções completas do
> roteiro, com JSON e resumo, em [`docs/evidencias/exemplo-execucao-local/`](docs/evidencias/exemplo-execucao-local/).

## 7. Roteiro da demonstração e validação ponta a ponta

O script `scripts/validacao_ponta_a_ponta.py` reproduz a demonstração e grava evidências (JSON e um `resumo.md`) em
`docs/evidencias/<data-hora>/`. Ele precisa de `pip install httpx`.

```bash
# 0. do zero
docker compose down -v

# 1. PriceHub sem farmácias: o comparador mostra "catálogo vazio"
docker compose up -d --build postgres rabbitmq ms-ingestao ms-catalogo ms-log frontend
python scripts/validacao_ponta_a_ponta.py etapa1

# 2. Sobe uma farmácia de cada vez e observe o monitor (http://localhost:5175)
docker compose up -d farmacia-biofarma
docker compose up -d farmacia-farmaazul
docker compose up -d farmacia-drogapopular
python scripts/validacao_ponta_a_ponta.py etapa2

# 3. Alteração de preço (pela tela de gestão das lojas ou pelo script)
python scripts/validacao_ponta_a_ponta.py etapa3

# 4. Resiliência (ms-catalogo pausado) e rajada de alterações
python scripts/validacao_ponta_a_ponta.py resiliencia
python scripts/validacao_ponta_a_ponta.py rajada --quantidade 60
```

Log em texto dos contêineres: `docker compose logs ms-ingestao ms-catalogo ms-log --since 5m`.

## 8. Eventos e filas

| Evento (chave de roteamento) | Produtor | Consumidores |
|---|---|---|
| `ingestao.oferta.recebida` | ms-ingestao | ms-catalogo, ms-log |
| `ingestao.oferta.removida` | ms-ingestao | ms-catalogo, ms-log |
| `ingestao.oferta.descartada` | ms-ingestao | ms-log |
| `ingestao.coleta.realizada` | ms-ingestao | ms-catalogo, ms-log |
| `ingestao.farmacia.indisponivel` | ms-ingestao | ms-log |
| `catalogo.medicamento.cadastrado` | ms-catalogo | ms-log, comparador (SSE) |
| `catalogo.oferta.atualizada` | ms-catalogo | ms-log, comparador (SSE) |
| `catalogo.oferta.indisponivel` | ms-catalogo | ms-log, comparador (SSE) |
| `catalogo.oferta.nao-correspondida` | ms-catalogo | ms-log |
| `catalogo.visao.atualizada` | ms-catalogo | ms-consulta, ms-log |
| `consulta.projecao.solicitada` | ms-consulta | ms-catalogo (republica snapshots para reconstrução) |

Todo evento viaja no mesmo envelope:

```json
{
  "idDoEvento": "5f3c2e12-5339-4acb-a767-a40e18ad6588",
  "tipo": "catalogo.oferta.atualizada",
  "versao": 1,
  "ocorridoEm": "2026-11-12T02:55:14.590854+00:00",
  "correlationId": "1d6f7a32-1d82-4fa6-82cc-3daf07ae25e7",
  "servicoDeOrigem": "ms-catalogo",
  "dados": { "...": "conteúdo específico de cada evento" }
}
```

Cada fila durável tem uma fila `.retry` (nova tentativa após 2 s) e uma `.dlq` (mensagens que esgotaram 5 tentativas).
O `ms-catalogo` e o `ms-consulta` são consumidores idempotentes: guardam o `idDoEvento` e ignoram repetições. A projeção
também compara `ocorridoEm` para não regredir diante de snapshots atrasados. O histórico no PostgreSQL usa triggers que
rejeitam `UPDATE` e `DELETE`.

## 9. Onde cada conceito está no código

| Conceito | Arquivo |
|---|---|
| Observer (sujeito e observadores) | `backend/services/ms-farmacia/app/dominio/catalogo.py`, `.../observadores/` |
| Adapter + Template Method | `backend/services/ms-ingestao/app/adaptadores/base.py` e um arquivo por farmácia |
| Strategy (correspondência de medicamentos) | `backend/services/ms-catalogo/app/dominio/correspondencia.py` |
| Transactional Outbox | `backend/services/ms-catalogo/app/servicos/relay_da_outbox.py` |
| Factory simples dos adaptadores | `backend/services/ms-ingestao/app/adaptadores/__init__.py` (`criar_registro`) |
| BFF | `backend/services/ms-bff/app/roteador.py` |
| Projeções CQRS | `backend/services/ms-consulta/app/` |
| Proteção do histórico no banco | `backend/services/ms-catalogo/app/persistencia/modelos.py` (`proteger_historico_precos`) |
| Consumidor idempotente | `backend/services/ms-catalogo/app/servicos/processador.py` (tabela `eventos_processados`) |
| Envelope dos eventos | `backend/libs/pricehub_common/pricehub_common/eventos/envelope.py` |
| Contratos dos eventos | `backend/libs/pricehub_common/pricehub_common/eventos/contratos.py` |
| Retry e DLQ no RabbitMQ | `backend/libs/pricehub_common/pricehub_common/mensageria/rabbitmq.py` |
| Validadores da Web API | `esquemas.py` de cada serviço (Pydantic) e `pricehub_common/http.py` (respostas `problem+json`) |
| Polling com ETag e redução de eventos inúteis | `ms-ingestao/app/adaptadores/drogapopular.py`, `.../servicos/memoria_de_ofertas.py` |
| Webhook assinado (HMAC-SHA256) | `ms-farmacia/app/observadores/webhook.py`, `ms-ingestao/app/api/rotas.py` |
| Métricas aceite x convergência | `backend/services/ms-log/app/servicos/metricas.py` |

## 10. Desenvolvimento sem Docker

Com PostgreSQL e RabbitMQ rodando (podem ser só os dois contêineres: `docker compose up -d postgres rabbitmq`):

```bash
cd backend
python -m venv .venv && . .venv/bin/activate      # no Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt

# um terminal por serviço (o Postgres do compose fica na porta 5433)
cd services/ms-ingestao && URL_DO_BANCO=postgresql+asyncpg://pricehub:pricehub@localhost:5433/ingestao uvicorn app.main:app --port 8001
cd services/ms-catalogo && URL_DO_BANCO=postgresql+asyncpg://pricehub:pricehub@localhost:5433/catalogo uvicorn app.main:app --port 8002
cd services/ms-log      && URL_DO_BANCO=postgresql+asyncpg://pricehub:pricehub@localhost:5433/auditoria uvicorn app.main:app --port 8003
cd services/ms-consulta && URL_DO_BANCO=postgresql+asyncpg://pricehub:pricehub@localhost:5433/consulta uvicorn app.main:app --port 8004
cd services/ms-bff      && uvicorn app.main:app --port 8000
cd services/ms-farmacia && FARMACIA_ID=biofarma SEGREDO_DO_WEBHOOK=segredo-biofarma-dev uvicorn app.main:app --port 8101
```

Frontend:

```bash
cd frontend
npm install
npm run dev            # sobe os quatro micro-frontends (5173 a 5176)
```

## 11. Testes

```bash
cd backend
./executar_testes.sh   # testes de contratos, Observer, Adapter, BFF, projeções CQRS, imutabilidade e outbox
ruff check .
cd ../frontend && npm run verificar-tipos && npm run build
```

Com a stack Docker iniciada, o teste E2E de interface altera um preço, acompanha o aceite e verifica a projeção/eventos:

```bash
pip install playwright
python -m playwright install chromium
python scripts/teste_e2e_interface.py --farmacia biofarma
```

O baseline de carga da leitura pelo BFF (concorrência e duração configuráveis) grava percentis e vazão observados:

```bash
python scripts/benchmark_escalabilidade.py --concorrencia 10 --duracao 30 --saida docs/evidencias/baseline.json
```

## 12. Estrutura de pastas

```
backend/
  libs/pricehub_common/      contratos de eventos, barramento RabbitMQ, logs JSON, fábrica FastAPI, SSE
  services/ms-farmacia/      farmácias simuladas (uma base de código, três instâncias)
  services/ms-ingestao/      adaptadores, webhooks, polling, coletas brutas
  services/ms-catalogo/      catálogo, correspondência, outbox, histórico e publicações
  services/ms-consulta/      projeções CQRS, leitura e SSE
  services/ms-bff/           fachada HTTP para os micro-frontends
  services/ms-log/           serviço de log, rastreamento, métricas, filas, saúde
frontend/
  packages/api/              clientes tipados de cada microsserviço e hooks (consulta, SSE)
  packages/ui/               componentes e formatadores compartilhados
  apps/comparador/           produto principal para o visitante
  apps/lojas/                gestão dos produtos de cada farmácia
  apps/monitor/              eventos ao vivo, filas, comparativo e documentação das APIs
  apps/vitrines/             sites das três farmácias
infra/postgres/              criação de um banco por serviço
scripts/                     validação ponta a ponta com geração de evidências
docs/
  passo-a-passo/             capturas da demonstração, em ordem (usadas neste README)
  telas/                     capturas de cada tela
  evidencias/                execuções do script de validação
  GUIA-OVERLEAF.md           guia de ajustes do texto do TCC
docker-compose.yml           sobe tudo: infraestrutura, microsserviços, farmácias e frontend
AGENTS.md, CLAUDE.md         instruções para agentes de IA (Codex e Claude Code)
.agents/skills/              skills para o Codex (commit-pr, tdd, implement, grilling, domain-modeling, playwright)
.claude/skills/              as mesmas skills para o Claude Code
.githooks/                   hook commit-msg que remove coautoria de IA
.github/workflows/           verificação de coautoria de IA nos PRs e na main
```

## 13. Problemas comuns

**`failed to solve: image "docker.io/pricehub/ms-farmacia:local": already exists`**
As três farmácias usam a mesma imagem e o build em paralelo pode colidir. A imagem já foi gerada: rode
`docker compose up -d` de novo (sem `--build`).

**`Bind for 0.0.0.0:5672 failed: port is already allocated`** (ou outra porta)
Outro contêiner ou programa está usando a porta; descubra qual com `docker ps`. Para mudar a porta só na sua máquina,
crie um `docker-compose.override.yml` na raiz (o `docker compose` lê esse arquivo automaticamente), por exemplo:

```yaml
services:
  rabbitmq:
    ports: !override
      - "5673:5672"
      - "15673:15672"
```

Os serviços conversam pela rede interna do Docker, então mudar a porta do host não afeta a aplicação (só o endereço do
painel, que passa a ser http://localhost:15673).

**Contêineres de uma versão antiga do PriceHub reiniciando sem parar**
O nome do projeto Compose vem da pasta. Se houver contêineres antigos com o mesmo nome, rode
`docker compose down --remove-orphans` ou suba com outro nome: `docker compose -p pricehub-tcc up -d --build`.

**Comparador vazio depois de subir tudo**
As farmácias com webhook enviam a carga ao iniciar; a DrogaPopular entra no próximo polling (até 15 s). Confira
`docker compose ps` e a aba **Filas e serviços** do monitor (`:5175`).

**Swagger em branco**
O Swagger e o ReDoc carregam a interface de uma CDN, então é preciso estar com internet.

## 14. Decisões de arquitetura

* **RabbitMQ, não Kafka nem Redis Pub/Sub:** o PriceHub precisa de roteamento por tópico, confirmação de processamento (ACK),
  retentativa e fila de mensagens mortas. O Redis Pub/Sub não guarda a mensagem se o consumidor estiver fora do ar, e o Kafka
  traz um log retido em disco que este escopo não usa.
* **Um banco por serviço:** nenhum serviço lê o banco de outro; a integração entre eles é feita por eventos.
* **Transactional Outbox no catálogo:** o estado e o evento de saída são gravados na mesma transação, então nenhum evento
  se perde se o RabbitMQ cair entre o commit e a publicação.
* **Farmácias sem banco:** a orientação foi manter os dados delas em memória. Reiniciar uma farmácia volta à carga inicial.
* **Consistência eventual:** o catálogo fica correto alguns milissegundos depois da farmácia. O monitor mede essa janela.
* **Sem autenticação:** uso local e acadêmico. Os webhooks são assinados com HMAC para mostrar a integridade da origem.

---

Licença: veja [LICENSE](LICENSE).
