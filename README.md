# PriceHub

**Comparador de preços de medicamentos construído com microsserviços e comunicação assíncrona orientada a eventos.**

Objeto de estudo do TCC *"PriceHub: uma arquitetura eficiente orientada a eventos e microsserviços"* (UCSal, 2026).

![Comparador do PriceHub com os preços das três farmácias](docs/capturas/01-lista.png)

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

O PriceHub capta os preços dessas fontes, reúne tudo em um único catálogo e mostra, para cada medicamento, o preço nas
três farmácias, a mais barata em destaque e o histórico de alterações. **O produto é a porta de entrada; o foco do trabalho é a arquitetura**:

* **Orientação a serviços e microsserviços:** cada responsabilidade em um serviço independente, com banco próprio.
* **Comunicação assíncrona por eventos:** os serviços conversam pelo RabbitMQ, sem chamadas HTTP em cadeia.
* **Orientação a objetos e padrões de projeto:** Observer, Adapter, Template Method, Strategy e Transactional Outbox.
* **Observabilidade:** um serviço de log assina todos os eventos, rastreia cada operação por `correlationId` e mede o
  ganho da comunicação assíncrona (tempo de aceite x janela de convergência).

A pergunta que o projeto responde na prática: *quanto a farmácia deixa de esperar quando o PriceHub aceita a alteração e
processa o resto de forma assíncrona, e o que acontece quando um serviço sai do ar?* O monitor de eventos mostra as duas
respostas com números reais.

## 2. O que a aplicação faz

Tudo é acessado por um único endereço, o gateway em **http://localhost:8080**, com rotas separadas por prefixo:

| Rota | Para quem | O que mostra |
|---|---|---|
| `/` | Visitante | Os **três preços** de cada medicamento, com o **mais barato em destaque**; busca e filtro por categoria; clique num preço abre o produto no site da farmácia; atualização em tempo real (SSE) |
| `/medicamento/{id}` | Visitante | Preço em cada farmácia com link para o produto, **resumo dos preços** (menor e maior já cobrados, preço médio atual, economia, alterações por farmácia), **gráfico do histórico** e a tabela de alterações com variação, **origem** (carga inicial, manual ou programada) e código de rastreio |
| `/parceiras` | Visitante | As três farmácias, a forma de integração de cada uma e os links para o site e a administração |
| `/monitor/` | Banca / desenvolvedores | Três abas: **Eventos** (`/monitor/eventos`, ao vivo, com a linha do tempo por `correlationId`), **Filas e serviços** (`/monitor/filas`: filas do RabbitMQ, saúde, Swagger e links da loja e da gestão de cada farmácia) e **Métricas** (`/monitor/metricas`: aceite x convergência, webhook x polling, alterações por farmácia e por origem, trocas da farmácia mais barata) |
| `/loja/<farmácia>/` | Cliente da farmácia | O site de cada farmácia (sistema externo), com o preço ao vivo; produto em `/loja/<farmácia>/produto/{código}` |
| `/loja/<farmácia>/admin` | Operador da farmácia | Alteração de preço à mão e controle da **simulação programada** (ligar, pausar, intervalo) |

Três farmácias simuladas alimentam o sistema, cada uma com um perfil de integração diferente:

| Farmácia | Site | Integração | Formato |
|---|---|---|---|
| BioFarma Verde | `/loja/biofarma/` | Webhook assinado (HMAC) | camelCase, preço em reais |
| FarmaAzul Confiança | `/loja/farmaazul/` | Webhook assinado (HMAC) | API paginada, snake_case, preço em centavos |
| DrogaPopular Express | `/loja/drogapopular/` | **Sem webhook**: polling a cada 5 s com ETag em `GET /api/v1/produtos` | arquivo legado, texto em maiúsculas |

### Simulação programada de preços

Cada farmácia tem uma tabela com **100 preços por produto** (`farmacias/app/sementes/precos_programados.json`, gerada por
`scripts/gerar_precos_programados.py`): um passeio aleatório com semente fixa, passos de 0,5% a 4%, no máximo 22% acima ou
abaixo do preço base e finais comerciais (,09 ,29 ,49 ,69 ,89 ,99). Em 6 dos 10 medicamentos a farmácia mais barata muda
ao longo da tabela.

A loja aplica **um reajuste por vez** (um produto por rodada, em rodízio) pelo mesmo caminho da edição manual da tela
`/admin`. Para o PriceHub é uma alteração feita pela farmácia: o Observer avisa por webhook ou o arquivo legado muda.

| Farmácia | Intervalo | Por quê |
|---|---|---|
| BioFarma e FarmaAzul | 5 s | Dá tempo de ver o aviso no comparador e a linha no monitor; com 3 s os avisos se sobrepõem |
| DrogaPopular | 15 s | O polling roda a cada 5 s, então nenhuma alteração se perde entre duas consultas |

A simulação começa 20 s depois de a farmácia subir (22 s na FarmaAzul, para os reajustes não coincidirem com os da BioFarma)
e pode ser pausada ou acelerada no `/admin`.

Cada preço carrega a sua **origem**: `carga-inicial` (o catálogo com que a loja sobe), `manual` (edição na tela `/admin`)
ou `programada` (simulação). A farmácia informa a origem no seu próprio formato (`origemDoPreco`, `origem_preco` ou `ORIGEM`),
o adaptador a traduz para o modelo canônico e o `ms-catalogo` a grava no histórico.

## 3. Tecnologias

| Camada | Tecnologias |
|---|---|
| Backend | Python 3.12, FastAPI (Swagger em `/docs` de cada serviço), Pydantic, SQLAlchemy assíncrono, aio-pika |
| Mensageria | RabbitMQ 4, exchange *topic* `pricehub.eventos`, filas duráveis com `.retry` e `.dlq` |
| Banco | PostgreSQL 16, **um contêiner por microsserviço** (`pg-ingestao`, `pg-catalogo`, `pg-log`) |
| Frontend | React 19, Tailwind CSS 4, Vite, TypeScript, dois micro-frontends (comparador e monitor) em npm workspaces |
| Gateway | Nginx: serve os micro-frontends e roteia `/api/*` e `/loja/*` por prefixo |
| Infraestrutura | Docker e Docker Compose |

## 4. Arquitetura

```mermaid
flowchart LR
  subgraph Externos["Farmácias simuladas (sistemas externos, dados em memória)"]
    BIO["farmacia-biofarma<br/>webhook · camelCase · R$"]
    AZUL["farmacia-farmaazul<br/>webhook · paginada · centavos"]
    POP["farmacia-drogapopular<br/>sem webhook · arquivo legado"]
  end

  BIO -- "POST /webhooks (HMAC)" --> ING
  AZUL -- "POST /webhooks (HMAC)" --> ING
  ING -- "GET a cada 5 s (ETag)" --> POP

  ING["ms-ingestao<br/>Adapter"] --- DBI[("pg-ingestao")]
  ING -- "ingestao.*" --> MQ{{"RabbitMQ<br/>exchange pricehub.eventos (topic)"}}
  MQ -- "fila ms-catalogo.eventos-de-ingestao" --> CAT["ms-catalogo<br/>Strategy · Outbox"]
  CAT --- DBC[("pg-catalogo")]
  CAT -- "catalogo.* (via outbox)" --> MQ
  MQ -- "fila ms-log.todos-os-eventos (#)" --> LOG["ms-log<br/>serviço de log"]
  LOG --- DBL[("pg-log")]

  GW["gateway :8080<br/>/ · /monitor/ · /api/* · /loja/*"]
  GW --> CAT
  GW --> LOG
  GW --> Externos
```

### Caminho de uma alteração de preço

1. A farmácia altera um preço: pela tela `/loja/<farmácia>/admin` ou pela simulação programada.
2. A farmácia aplica o **Observer**: o observador de webhook envia a alteração assinada com HMAC para o `ms-ingestao`
   (no caso da DrogaPopular, o `ms-ingestao` percebe a mudança no próximo polling).
3. O `ms-ingestao` usa o **Adapter** da farmácia para converter o formato dela no modelo canônico, grava a coleta bruta,
   publica `ingestao.oferta.recebida` no RabbitMQ e **responde na hora** (esse é o *tempo de aceite*).
4. O `ms-catalogo` consome o evento, associa a oferta a um medicamento único (**Strategy**), atualiza preço e histórico
   (com a origem da alteração) e grava os eventos de saída na **outbox** na mesma transação. Um relay publica
   `catalogo.oferta.atualizada` e, se outra farmácia passou a ter o menor preço, `catalogo.menor-preco.alterado`.
5. O comparador recebe a mudança por SSE, destaca o cartão e reordena o mais barato. O `ms-log` registrou cada passo com o
   mesmo `correlationId` e calcula a *janela de convergência*.

### Serviços, bancos e portas

| Contêiner | Porta no host | Responsabilidade | Banco |
|---|---|---|---|
| `gateway` | **8080** | Comparador, monitor e roteamento por prefixo | - |
| `ms-ingestao` | 8001 (`/api/ingestao`) | Recebe webhooks, faz polling, adapta cada formato ao modelo canônico e publica eventos | `pg-ingestao` (5441) |
| `ms-catalogo` | 8002 (`/api/catalogo`) | Associa ofertas a medicamentos únicos, mantém preço e histórico, publica eventos do catálogo, serve a busca e o SSE | `pg-catalogo` (5442) |
| `ms-log` | 8003 (`/api/log`) | Assina **todos** os eventos (`#`), rastreia por `correlationId`, mede aceite x convergência, lê as filas | `pg-log` (5443) |
| `farmacia-*` | 8101-8103 (`/loja/<farmácia>/`) | Farmácias simuladas (pasta `farmacias/`, fora do PriceHub): site, `/admin`, API nativa e simulação programada; padrão Observer | memória |
| `rabbitmq` | 5672 / 15672 | Broker AMQP e painel de gerenciamento | - |

As portas 8001-8003 e 8101-8103 ficam abertas só para o Swagger; as telas usam o gateway.

### Redes do Docker

| Rede | Quem participa | Para quê |
|---|---|---|
| `rede-pricehub` | ms-ingestao, ms-catalogo, ms-log, rabbitmq, gateway | Comunicação interna do PriceHub |
| `rede-farmacias` | farmácias, ms-ingestao, ms-log, gateway | Webhooks, polling, saúde e o prefixo `/loja` |
| `rede-banco-ingestao`, `rede-banco-catalogo`, `rede-banco-log` | cada banco com o seu serviço | Nenhum serviço alcança o banco de outro |

As farmácias são sistemas externos: não enxergam o RabbitMQ nem os bancos do PriceHub.

Para ver as tabelas de cada banco: `docker compose --profile ferramentas up -d adminer` e abra http://localhost:8090
(sistema PostgreSQL, servidor `pg-catalogo`, `pg-ingestao` ou `pg-log`, usuário e senha `pricehub`).

## 5. Como rodar (Docker)

### Pré-requisitos

* [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e aberto.
* Portas livres: 8080, 8001-8003, 8101-8103, 5441-5443, 5672 e 15672 (veja [Problemas comuns](#13-problemas-comuns)).
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
docker compose ps        # 11 contêineres; todos "healthy", menos o gateway, que fica só "Up"
docker compose logs -f ms-ingestao ms-catalogo ms-log
```

Em poucos segundos as farmácias enviam a carga inicial e o comparador mostra 10 medicamentos com 3 preços cada. Depois
de 20 s a simulação programada começa a mudar os preços.

### Endereços

| O quê | Endereço |
|---|---|
| Comparador | http://localhost:8080 |
| Detalhe e histórico de um medicamento | http://localhost:8080/medicamento/{id} (clique em "Histórico de preços") |
| Farmácias parceiras | http://localhost:8080/parceiras |
| Monitor de eventos | http://localhost:8080/monitor/ |
| Sites das farmácias | http://localhost:8080/loja/biofarma/ · `/loja/farmaazul/` · `/loja/drogapopular/` |
| Administração de cada farmácia | http://localhost:8080/loja/biofarma/admin · `/loja/farmaazul/admin` · `/loja/drogapopular/admin` |
| Swagger do ms-ingestao / ms-catalogo / ms-log | http://localhost:8001/docs · http://localhost:8002/docs · http://localhost:8003/docs |
| Swagger das farmácias | http://localhost:8101/docs · http://localhost:8102/docs · http://localhost:8103/docs |
| Painel do RabbitMQ | http://localhost:15672 (usuário `pricehub`, senha `pricehub`) |

### Configuração (`.env`)

| Variável | Padrão | Para quê |
|---|---|---|
| `POSTGRES_USUARIO` / `POSTGRES_SENHA` | `pricehub` / `pricehub` | Credenciais dos três PostgreSQL |
| `RABBITMQ_USUARIO` / `RABBITMQ_SENHA` | `pricehub` / `pricehub` | Credenciais do RabbitMQ |
| `SEGREDO_DO_WEBHOOK_BIOFARMA` / `SEGREDO_DO_WEBHOOK_FARMAAZUL` | `segredo-*-dev` | Chave HMAC que assina os webhooks |
| `INTERVALO_DE_POLLING_S` | `5` | Intervalo do polling da DrogaPopular |
| `SIMULACAO_ATIVA` | `true` | Liga a simulação programada ao subir as farmácias |
| `INTERVALO_DA_SIMULACAO_S` | `5` | Intervalo entre reajustes na BioFarma e na FarmaAzul |
| `INTERVALO_DA_SIMULACAO_DROGAPOPULAR_S` | `15` | Intervalo entre reajustes na DrogaPopular |
| `ATRASO_INICIAL_DA_SIMULACAO_S` | `20` | Espera antes do primeiro reajuste |
| `URL_PUBLICA_DAS_LOJAS` | `http://localhost:8080/loja` | Base dos links "Ver na farmácia" |
| `PORTA_DO_GATEWAY` | `8080` | Porta do gateway no host |
| `NIVEL_DE_LOG` | `INFO` | Nível dos logs JSON dos serviços |

Os valores são só para uso local.

### Parar e limpar

```bash
docker compose down        # para tudo e mantém os dados
docker compose down -v     # para tudo e apaga os três bancos (volta ao "PriceHub vazio")
```

## 6. Tour pela aplicação, com prints

As capturas abaixo são geradas por `python scripts/capturas_de_tela.py` com o ambiente rodando (17/11/2026). O script
também confere que o console do navegador fica sem erros e que nenhuma tela tem rolagem horizontal no celular.

### 6.1 Comparador: os três preços e o mais barato em destaque

Cada cartão mostra as três farmácias sempre na mesma ordem, para o olho comparar cartões lado a lado. O menor preço fica
em verde; os outros mostram quanto custam a mais. Clicar num preço abre o produto no site da farmácia. Quando um preço muda,
aparece um aviso no canto da tela; quando outra farmácia passa a ser a mais barata, o aviso é "Menor preço agora na ...".

![Comparador](docs/capturas/01-lista.png)

No celular a lista vira uma coluna e cada preço continua sendo um link:

<img src="docs/capturas/07-celular.png" alt="Comparador no celular" width="320" />

### 6.2 Detalhe do medicamento: resumo, histórico e origem de cada preço

Cada farmácia mostra o preço atual, a **data e a hora** em que ele foi alterado e o link para o produto. O **resumo dos
preços** traz o menor e o maior preço já cobrados, o preço médio atual, a economia de hoje e o número de alterações por
farmácia. O gráfico em degraus mostra o preço de cada farmácia ao longo do tempo, e a tabela lista cada alteração com a
variação, a **origem** (carga inicial, manual ou programada) e o código de rastreio, que abre a operação no monitor.

![Detalhe e histórico](docs/capturas/02-detalhe.png)

### 6.3 Farmácias: três sites, três identidades

As farmácias são sistemas externos ao PriceHub, cada uma com site, API e tela de gestão próprios, publicados pelo gateway
em `/loja/<farmácia>/`. O selo "Preços ao vivo" no canto mostra que o preço da vitrine vem da API da própria loja.

| BioFarma Verde (`/loja/biofarma/`) | FarmaAzul Confiança (`/loja/farmaazul/`) |
|---|---|
| ![BioFarma Verde](docs/capturas/10-loja-biofarma.png) | ![FarmaAzul Confiança](docs/capturas/11-loja-farmaazul.png) |

| DrogaPopular Express (`/loja/drogapopular/`) | Página de um produto (FarmaAzul) |
|---|---|
| ![DrogaPopular Express](docs/capturas/12-loja-drogapopular.png) | ![Produto na FarmaAzul](docs/capturas/05-loja-produto.png) |

Na **gestão de preços** de cada loja (`/loja/<farmácia>/admin`) o operador altera um preço à mão e controla a simulação
programada (ligar, pausar, intervalo). Toda alteração, manual ou programada, segue o mesmo caminho: o Observer da loja
notifica o webhook (ou o arquivo de polling muda).

![Gestão de preços da BioFarma](docs/capturas/06-admin.png)

A página **Farmácias parceiras** (`/parceiras`) resume a forma de integração e o formato de cada uma:

![Parceiras](docs/capturas/03-parceiras.png)

### 6.4 Monitor de eventos (`/monitor/eventos`, `/monitor/filas`, `/monitor/metricas`)

**Eventos.** Todos os eventos que passam pelo RabbitMQ, filtráveis por família e farmácia. Ao clicar em um evento, a
**linha do tempo da operação** reúne os eventos com o mesmo `correlationId`, o serviço que produziu cada um e o tempo
decorrido. No exemplo, um reajuste programado da BioFarma levou 12 ms do recebimento no `ms-ingestao` até o catálogo.

![Linha do tempo de uma alteração](docs/capturas/13-linha-do-tempo.png)

**Filas e serviços.** Filas do RabbitMQ (com `.retry` e `.dlq`), saúde de cada serviço, Swagger e os links da loja e da
gestão de cada farmácia. O botão **Pausar consumo do ms-catalogo** simula o catálogo fora do ar: as farmácias continuam
sendo atendidas e os eventos ficam retidos na fila. Ao retomar, a fila esvazia e nada se perde.

| Funcionamento normal | Consumo do catálogo pausado: 8 eventos retidos |
|---|---|
| ![Filas e serviços](docs/capturas/08-monitor-filas.png) | ![Fila retida](docs/capturas/14-fila-retida.png) |

**Métricas.** Só o que foi medido nesta execução: aceite x convergência, webhook x polling, alterações por farmácia e por
origem e as trocas da farmácia mais barata (evento `catalogo.menor-preco.alterado`).

![Métricas](docs/capturas/09-monitor-metricas.png)

> As capturas em `docs/passo-a-passo/` e `docs/telas/` são da versão anterior (com vendas e vitrines) e ficam só como
> registro.

## 7. Roteiro da demonstração e validação ponta a ponta

O script `scripts/validacao_ponta_a_ponta.py` reproduz a demonstração pelo gateway e grava evidências (JSON e um
`resumo.md`) em `docs/evidencias/<data-hora>/`. Ele precisa de `pip install httpx`. As etapas que alteram preço à mão
pausam a simulação programada enquanto rodam.

```bash
# 0. do zero
docker compose down -v

# 1. PriceHub sem farmácias: o comparador mostra "Nenhuma farmácia conectada ainda"
docker compose up -d --build gateway
python scripts/validacao_ponta_a_ponta.py etapa1

# 2. Sobe uma farmácia de cada vez e observe o monitor (http://localhost:8080/monitor/)
docker compose up -d farmacia-biofarma
docker compose up -d farmacia-farmaazul
docker compose up -d farmacia-drogapopular
python scripts/validacao_ponta_a_ponta.py etapa2

# 3. Alteração de preço numa farmácia de cada tipo
python scripts/validacao_ponta_a_ponta.py etapa3

# 4. Resiliência (ms-catalogo pausado) e rajada de alterações
python scripts/validacao_ponta_a_ponta.py resiliencia
python scripts/validacao_ponta_a_ponta.py rajada --quantidade 60

# 5. Simulação programada: um reajuste de cada farmácia chega ao catálogo
python scripts/validacao_ponta_a_ponta.py simulacao

# ou as etapas 3 a 5 de uma vez
python scripts/validacao_ponta_a_ponta.py tudo
```

Resultado de uma execução local (16/11/2026, `tudo --quantidade 40`): as três alterações chegaram ao catálogo em ~10 ms
desde o primeiro evento; com o catálogo pausado a fila reteve as mensagens e nada se perdeu ao retomar; na rajada, aceite
de 32 ms e convergência de 281 ms (medianas); os reajustes programados chegaram ao catálogo pelos dois caminhos (webhook
na hora, polling em até 5 s).

Desempenho da consulta (RNF-03), lendo o catálogo pelo gateway com 20 conexões simultâneas por 15 s:

```bash
python scripts/benchmark_escalabilidade.py --concorrencia 20 --duracao 15
```

Resultado local (17/11/2026): 3.013 requisições, 200 por segundo, nenhuma falha; latência p50 de 91 ms e p95 de 130 ms
(`docs/evidencias/2026-11-17-benchmark-leitura.json`).

Capturas de tela do README e do TCC: `python scripts/capturas_de_tela.py` (precisa de `pip install playwright httpx` e
`playwright install chromium`).

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
| `catalogo.menor-preco.alterado` | ms-catalogo | ms-log, comparador (SSE: aviso "Menor preço agora na ...") |

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
O `ms-catalogo` é um consumidor idempotente: guarda o `idDoEvento` na tabela `eventos_processados` e ignora repetições.

## 9. Onde cada conceito está no código

| Conceito | Arquivo |
|---|---|
| Observer (sujeito e observadores) | `farmacias/app/dominio/catalogo.py`, `farmacias/app/observadores/` |
| Adapter + Template Method | `backend/services/ms-ingestao/app/adaptadores/base.py` e um arquivo por farmácia |
| Strategy (correspondência de medicamentos) | `backend/services/ms-catalogo/app/dominio/correspondencia.py` |
| Transactional Outbox | `backend/services/ms-catalogo/app/servicos/relay_da_outbox.py` |
| Consumidor idempotente | `backend/services/ms-catalogo/app/servicos/processador.py` (tabela `eventos_processados`) |
| Envelope dos eventos | `backend/libs/pricehub_common/pricehub_common/eventos/envelope.py` |
| Contratos dos eventos | `backend/libs/pricehub_common/pricehub_common/eventos/contratos.py` |
| Retry e DLQ no RabbitMQ | `backend/libs/pricehub_common/pricehub_common/mensageria/rabbitmq.py` |
| Validadores da Web API | `esquemas.py` de cada serviço (Pydantic) e `pricehub_common/http.py` (respostas `problem+json`) |
| Polling com ETag e redução de eventos inúteis | `ms-ingestao/app/adaptadores/drogapopular.py`, `.../servicos/memoria_de_ofertas.py` |
| Webhook assinado (HMAC-SHA256) | `farmacias/app/observadores/webhook.py`, `ms-ingestao/app/api/rotas.py` |
| Troca da farmácia mais barata | `backend/services/ms-catalogo/app/servicos/processador.py` (`_troca_da_mais_barata`) |
| Métricas aceite x convergência | `backend/services/ms-log/app/servicos/metricas.py` |
| Simulação programada de preços | `farmacias/app/dominio/simulacao.py`, `scripts/gerar_precos_programados.py` |
| Roteamento por prefixo (gateway) | `frontend/nginx.conf` |

## 10. Desenvolvimento sem Docker

Com os bancos e o RabbitMQ rodando (`docker compose up -d pg-ingestao pg-catalogo pg-log rabbitmq`):

```bash
cd backend
python -m venv .venv && . .venv/bin/activate      # no Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt

# um terminal por serviço (cada banco tem a sua porta: 5441, 5442, 5443)
cd services/ms-ingestao && URL_DO_BANCO=postgresql+asyncpg://pricehub:pricehub@localhost:5441/ingestao URL_PUBLICA_DAS_LOJAS=http://localhost:5173/loja uvicorn app.main:app --port 8001
cd services/ms-catalogo && URL_DO_BANCO=postgresql+asyncpg://pricehub:pricehub@localhost:5442/catalogo uvicorn app.main:app --port 8002
cd services/ms-log      && URL_DO_BANCO=postgresql+asyncpg://pricehub:pricehub@localhost:5443/auditoria uvicorn app.main:app --port 8003

# farmácias (projeto separado, sem dependência do backend)
cd ../farmacias && pip install -r requirements.txt
FARMACIA_ID=biofarma SEGREDO_DO_WEBHOOK=segredo-biofarma-dev uvicorn app.main:app --port 8101
```

Frontend:

```bash
cd frontend
npm install
npm run dev            # comparador em :5173 e monitor em :5175/monitor/; o proxy do Vite imita o gateway (/api e /loja)
```

## 11. Testes

```bash
cd backend
./executar_testes.sh   # 45 testes (inclui ../farmacias): contratos, Observer, Adapter, origem, menor preço, outbox, métricas
ruff check .
cd ../frontend && npm run verificar-tipos && npm run build
```

## 12. Estrutura de pastas

```
farmacias/                   farmácias simuladas, fora do PriceHub (uma base de código, três instâncias): site, /admin,
                             simulação; Dockerfile e dependências próprias, sem usar o pricehub_common
backend/
  libs/pricehub_common/      contratos de eventos, barramento RabbitMQ, logs JSON, fábrica FastAPI, SSE
  services/ms-ingestao/      adaptadores, webhooks, polling, coletas brutas
  services/ms-catalogo/      catálogo, correspondência, outbox, consultas, tempo real
  services/ms-log/           serviço de log, rastreamento, métricas, filas, saúde
frontend/
  packages/api/              clientes tipados de cada microsserviço e hooks (consulta, SSE)
  packages/ui/               componentes e formatadores compartilhados
  apps/comparador/           lista, /medicamento/{id} e /parceiras
  apps/monitor/              abas Eventos, Filas e serviços e Métricas (/monitor/eventos, /monitor/filas, /monitor/metricas)
  nginx.conf, Dockerfile     gateway: serve os micro-frontends e roteia /api e /loja por prefixo
scripts/                     validação ponta a ponta, gerador dos 100 preços por produto, capturas de tela e benchmark
docs/
  capturas/                  capturas da versão atual (usadas neste README)
  plano/                     plano da reestruturação e prompt usado
  passo-a-passo/, telas/     capturas da versão anterior
  evidencias/                execuções do script de validação
  GUIA-OVERLEAF.md           guia de ajustes do texto do TCC
docker-compose.yml           sobe tudo: bancos, RabbitMQ, microsserviços, farmácias, gateway (e o adminer opcional)
AGENTS.md, CLAUDE.md         instruções para agentes de IA (Codex e Claude Code)
.agents/skills/              skills para o Codex (commit-pr, tdd, implement, grilling, domain-modeling, playwright)
.claude/skills/              as mesmas skills para o Claude Code
.githooks/                   hook commit-msg que remove coautoria de IA
.github/workflows/           verificação de coautoria de IA nos PRs e na main
```

## 13. Problemas comuns

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
As farmácias com webhook enviam a carga ao iniciar (se o PriceHub ainda não estava pronto, o `ms-ingestao` busca o
catálogo delas a cada 5 s até recebê-lo); a DrogaPopular entra no próximo polling. Confira
`docker compose ps` e a aba **Filas e serviços** do monitor (http://localhost:8080/monitor/filas).

**`502 Bad Gateway` em `/loja/<farmácia>/`**
A farmácia está desligada (normal na demonstração em etapas). Suba com `docker compose up -d farmacia-<nome>`; o gateway
volta a encaminhar sem reiniciar.

**Swagger em branco**
O Swagger e o ReDoc carregam a interface de uma CDN, então é preciso estar com internet.

## 14. Decisões de arquitetura

* **RabbitMQ, não Kafka nem Redis Pub/Sub:** o PriceHub precisa de roteamento por tópico, confirmação de processamento (ACK),
  retentativa e fila de mensagens mortas. O Redis Pub/Sub não guarda a mensagem se o consumidor estiver fora do ar, e o Kafka
  traz um log retido em disco que este escopo não usa.
* **Um banco por serviço:** cada microsserviço tem o seu contêiner PostgreSQL; nenhum lê o banco de outro e a integração
  entre eles é feita por eventos.
* **Gateway com prefixos:** uma porta só para o visitante; cada farmácia continua sendo um sistema à parte, com site e
  API próprios, alcançado pelo prefixo `/loja/<farmácia>/`.
* **Sem vendas:** o PriceHub é um agregador de preços. Pedidos, carrinho e vitrines de compra saíram do escopo.
* **Transactional Outbox no catálogo:** o estado e o evento de saída são gravados na mesma transação, então nenhum evento
  se perde se o RabbitMQ cair entre o commit e a publicação.
* **Farmácias sem banco e fora do PriceHub:** a orientação foi manter os dados delas em memória. Reiniciar uma farmácia volta
  à carga inicial. O código delas fica em `farmacias/`, com imagem e rede próprias, como um sistema de terceiros.
* **Sem reconciliação periódica:** depois da carga inicial, os preços chegam só por webhook (BioFarma e FarmaAzul) ou
  polling (DrogaPopular). Isso deixa cada alteração no monitor ligada a uma única causa.
* **Consistência eventual:** o catálogo fica correto alguns milissegundos depois da farmácia. O monitor mede essa janela.
* **Sem autenticação:** uso local e acadêmico. Os webhooks são assinados com HMAC para mostrar a integridade da origem.

---

Licença: veja [LICENSE](LICENSE).
