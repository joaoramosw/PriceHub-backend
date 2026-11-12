---
name: tdd
description: Desenvolvimento guiado por testes (vermelho, verde, refatorar) no PriceHub, com pytest nos microsserviços Python e verificação de tipos e build no frontend. Use ao criar funcionalidade, corrigir bug ou refatorar código do backend ou do frontend.
---

# TDD no PriceHub

Ciclo curto: **vermelho → verde → refatorar**. Um comportamento por vez.

## Onde ficam os testes

| Parte | Pasta de testes | Como rodar |
|---|---|---|
| Biblioteca comum | `backend/libs/pricehub_common/tests/` | `cd backend/libs/pricehub_common && python -m pytest -q` |
| ms-farmacia | `backend/services/ms-farmacia/tests/` | `cd backend/services/ms-farmacia && python -m pytest -q` |
| ms-ingestao | `backend/services/ms-ingestao/tests/` (amostras em `tests/amostras/`) | `cd backend/services/ms-ingestao && python -m pytest -q` |
| ms-catalogo | `backend/services/ms-catalogo/tests/` | `cd backend/services/ms-catalogo && python -m pytest -q` |
| ms-log | `backend/services/ms-log/tests/` | `cd backend/services/ms-log && python -m pytest -q` |
| Tudo do backend | - | `cd backend && ./executar_testes.sh && ruff check .` |
| Frontend | - | `cd frontend && npm run verificar-tipos && npm run build` |
| Ponta a ponta | `scripts/validacao_ponta_a_ponta.py` | com o `docker compose` no ar (ver README) |

Cada serviço tem o próprio pacote `app`, por isso os testes rodam **dentro da pasta do serviço**.
Ambiente: `cd backend && python -m venv .venv && pip install -r requirements-dev.txt`.

## Ciclo

1. **Vermelho**
   - Escrever um teste pequeno que descreve o comportamento esperado, com nome em português
     (`test_oferta_mais_antiga_nao_sobrescreve_preco`).
   - Rodar e **ver falhar pelo motivo certo** (asserção, não erro de import).
2. **Verde**
   - Escrever o mínimo de código para o teste passar.
   - Rodar de novo só aquele teste: `python -m pytest -q -k <trecho_do_nome>`.
3. **Refatorar**
   - Melhorar nomes e remover duplicação com os testes verdes.
   - Rodar a suíte do serviço inteiro e `ruff check .`.
4. Repetir para o próximo comportamento.

## O que testar em cada padrão

- **Adapter (ms-ingestao):** dado o JSON nativo da farmácia (`tests/amostras/*.json`), a oferta canônica sai
  com preço em centavos, código externo e campos normalizados; itens inválidos vão para descartados.
- **Strategy (ms-catalogo):** cada estratégia de correspondência acha (ou não) o medicamento; a ordem das
  estratégias é respeitada.
- **Consumidor idempotente:** o mesmo envelope processado duas vezes não duplica oferta nem histórico.
- **Outbox:** a mudança de estado e o evento de saída são gravados juntos; o relay publica e marca como enviado.
- **Observer (ms-farmacia):** alterar, cadastrar ou remover produto notifica todos os observadores anexados.
- **Validadores da API:** entrada fora do contrato responde 422 no formato `problem+json`.
- **Eventos:** use o barramento em memória (`pricehub_common/mensageria/memoria.py`) em vez do RabbitMQ real.

## Regras

- Nunca apagar ou afrouxar um teste para ele passar; se o teste estiver errado, explicar por quê.
- Bug corrigido sempre ganha um teste que falhava antes da correção.
- Não depender de rede, relógio ou ordem de execução: injete o tempo e use dados fixos.
- Ao terminar, informar quais testes rodaram e o resultado real (com a saída, se algo falhou).
