# Guia de uso de IA no PriceHub

O grupo usa agentes diferentes (Claude Code, Cursor, Codex, OpenCode). Este guia vale para **todos** e para as pessoas que revisam o que eles produzem. As regras de projeto estão em [`AGENTS.md`](../../AGENTS.md), que todo agente deve carregar.

## Fluxo obrigatório

```
investigar → planejar → implementar → validar → documentar
```

1. **Investigar:** o agente lê o código, os testes e os `docs/` relevantes antes de propor mudanças. Nada de suposições sobre o que existe.
2. **Planejar:** o agente apresenta um plano curto (arquivos afetados, ordem, riscos, dúvidas) e espera a confirmação humana em tarefas não triviais.
3. **Implementar:** em passos pequenos, seguindo `docs/padroes/`. Um commit por unidade lógica.
4. **Validar:** o próprio agente sobe o ambiente (`docker compose up -d --build --wait`), confere `healthy`, roda lint e testes e faz smoke test nos `/health`. Ele não pede à pessoa para rodar comandos que ele mesmo pode executar.
5. **Documentar:** atualiza `docs/` no mesmo commit (eventos, serviços, ADR quando houver decisão) e reporta o que fez, como validou e o que ficou pendente.

## Regras inegociáveis

- **Nenhum código gerado por IA entra sem os testes passando e o ambiente validado.** "Deve funcionar" não é validação: a saída dos comandos precisa estar no relatório.
- **Toda mudança de contrato** (schema de evento, API pública, formato de farmácia) **atualiza `docs/arquitetura/eventos.md`** (ou o doc correspondente) **no mesmo commit**.
- **Bug:** o agente deve **reportar a causa raiz antes de corrigir**: o que aconteceu, por que aconteceu e qual evidência (log, teste) comprova. Correção sem causa raiz é rejeitada.
- **Segredos nunca entram em prompts nem em arquivos versionados.** Use `.env` (fora do git) e `.env.example` com valores fictícios. Não cole tokens, senhas ou `.env` real em conversas com agentes.
- Sem comentários no código, sem `any` sem ADR, sem `git push` sem pedido explícito.
- O agente não altera `frontend/`, `infra/` ou contratos fora do escopo pedido sem avisar.

## Como pedir uma tarefa

Use o [template de prompt](template-prompt.md). Um bom pedido tem contexto, objetivo, restrições, critérios de aceite e a forma de validar.

## Como aceitar o resultado

Aplique o [checklist de revisão](checklist-revisao.md). No Claude Code, `/revisar` faz isso no diff atual. A pessoa que aceita o código é responsável por ele, não o agente.

## Manutenção do contexto

Veja [contexto para agentes](contexto-para-agentes.md) para saber quando e como atualizar `AGENTS.md` e `CLAUDE.md`.
