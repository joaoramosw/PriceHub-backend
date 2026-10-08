# Checklist de revisão de código gerado por IA

Aplique a cada diff antes de aceitar. No Claude Code: `/revisar`.

## Correção
- [ ] O código faz o que o pedido pedia, e só isso (sem escopo extra não solicitado)?
- [ ] Casos de borda tratados: lista vazia, `null`, preço zero, duplicidade, timeout, broker ou banco fora?
- [ ] Erros esperados viram `problem+json` (HTTP) ou vão para retry/DLQ (eventos) corretamente?
- [ ] Nenhuma API, função ou opção inventada (verifique na documentação da biblioteca e na versão instalada)?

## Arquitetura
- [ ] Serviços continuam sem chamar uns aos outros por HTTP?
- [ ] Nenhum serviço acessa o banco de outro?
- [ ] Efeito + `eventos_processados` (+ `outbox`) na mesma transação; ack só depois do commit?
- [ ] Consumidor idempotente para eventos duplicados?
- [ ] Contrato de evento mudou? `docs/arquitetura/eventos.md` atualizado no mesmo commit e `version` correta?
- [ ] Valores monetários em centavos inteiros?
- [ ] `correlationId` propagado em logs, eventos e respostas?

## Qualidade
- [ ] Sem comentários no código; nomes claros, em português sem acento para domínio?
- [ ] Sem `any`, sem `as` desnecessário, sem `!` para esconder `undefined` real?
- [ ] Sem duplicação de utilitários que já existem em `backend/packages/`?
- [ ] Funções pequenas, camadas respeitadas (routes → service → repository)?
- [ ] Dependências novas justificadas e com versão fixada?

## Testes e validação
- [ ] Testes novos cobrem o comportamento (não só a implementação)?
- [ ] Bug corrigido tem teste que falhava antes?
- [ ] `pnpm -C backend lint` e `pnpm -C backend test` verdes (saída anexada)?
- [ ] `docker compose up -d --build --wait` healthy e `/health` respondendo (saída anexada)?

## Segurança
- [ ] Nenhum segredo, token ou `.env` real no diff ou em logs?
- [ ] Entradas externas (webhooks, query strings) validadas por schema? HMAC comparado em tempo constante?
- [ ] SQL cru parametrizado?

## Documentação
- [ ] `docs/` reflete o que mudou (serviços, eventos, runbook, ADR para decisões)?
- [ ] Commits pequenos, semânticos e em português?
