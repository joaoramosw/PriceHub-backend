---
description: Revisa o diff atual com o checklist de código gerado por IA
---

1. Obtenha o diff: `git diff main...HEAD` (ou o escopo pedido em: $ARGUMENTS) mais `git diff` do que não foi commitado.
2. Aplique **cada item** de `docs/ia/checklist-revisao.md` ao diff.
3. Rode `pnpm -C backend lint` e `pnpm -C backend test`.
4. Reporte uma tabela `item | status (ok / problema) | arquivo:linha | observação`, seguida da lista de correções sugeridas em ordem de severidade.
5. Não aplique correções sem confirmação, a menos que o pedido diga para corrigir.
