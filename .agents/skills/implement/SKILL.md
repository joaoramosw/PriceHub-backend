---
name: implement
description: Implementa uma funcionalidade, correção ou item de plano no PriceHub de ponta a ponta, em passos pequenos e verificados, respeitando a arquitetura de microsserviços e eventos. Use quando o usuário pedir para implementar, construir ou aplicar uma mudança no código.
---

# Implementar

## 1. Entender antes de mexer

- Ler o pedido e reescrever em uma frase o resultado esperado.
- Se houver decisão de produto ou de arquitetura em aberto, usar a skill `grilling` antes.
- Localizar o serviço dono da mudança (ver README, seção "Onde cada conceito está no código").
- Ler o código vizinho e seguir o estilo dele: nomes em português, mesma densidade de comentários,
  mesmos padrões (Adapter, Strategy, Observer, Outbox).

## 2. Respeitar a arquitetura

- **Um banco por serviço:** nenhum serviço lê ou escreve no banco de outro.
- **Comunicação entre serviços só por eventos** no RabbitMQ (exchange `pricehub.eventos`).
  Não criar chamada HTTP de um microsserviço para outro.
- Evento novo ou alterado: atualizar o contrato em
  `backend/libs/pricehub_common/pricehub_common/eventos/contratos.py`, manter o envelope
  (`idDoEvento`, `tipo`, `versao`, `ocorridoEm`, `correlationId`, `servicoDeOrigem`, `dados`) e
  subir `versao` se quebrar compatibilidade.
- Eventos publicados pelo `ms-catalogo` passam pela **outbox**, na mesma transação dos dados.
- Consumidores continuam **idempotentes**.
- Preços sempre em **centavos (inteiro)**.
- Mudou um termo do domínio? Atualizar o glossário (skill `domain-modeling`).

## 3. Planejar em passos pequenos

Listar os passos antes de começar, cada um verificável. Exemplo para uma nova farmácia:

1. amostra do formato nativo em `ms-ingestao/tests/amostras/`;
2. teste do adaptador (vermelho);
3. adaptador novo herdando de `AdaptadorDeFarmacia` (verde);
4. registro do adaptador e variáveis no `docker-compose.yml`;
5. instância da farmácia simulada;
6. verificação ponta a ponta.

## 4. Executar com TDD

Seguir a skill `tdd` em cada passo. Não avançar com teste vermelho.

## 5. Verificar de verdade

- Backend: `cd backend && ./executar_testes.sh && ruff check .`
- Frontend: `cd frontend && npm run verificar-tipos && npm run build`
- Sistema rodando: `docker compose up -d --build` e conferir `docker compose ps` (todos healthy).
- Mudança visível na interface: validar com a skill `playwright` (navegar, interagir, tirar print).
- Mudança no fluxo de eventos: conferir no monitor (`http://localhost:5175`) a linha do tempo do
  `correlationId`.

## 6. Fechar

- Atualizar README e docs se o comportamento, uma porta, um evento ou um comando mudou.
- Se a mudança afeta o texto do TCC, anotar em `docs/PENDENCIAS-OVERLEAF.txt`.
- Resumir para o usuário: o que mudou, como foi verificado e o que ficou pendente.
- Commitar e abrir PR só quando o usuário pedir, seguindo a skill `commit-pr`.
