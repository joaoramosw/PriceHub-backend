# Template de prompt de tarefa

Copie, preencha e envie ao agente. Remova as seções que não se aplicam.

```markdown
## Contexto
- Leia AGENTS.md e os arquivos: <lista de arquivos/docs relevantes>
- Situação atual: <o que existe hoje e qual o problema>

## Objetivo
<uma frase: o que deve existir/funcionar ao final>

## Restrições
- Não altere: <pastas/contratos fora do escopo>
- Siga docs/padroes/<arquivos relevantes>
- <limites técnicos: sem novas dependências, manter contrato v1, etc.>

## Critérios de aceite
- [ ] <comportamento observável 1>
- [ ] <comportamento observável 2>
- [ ] docs atualizadas: <quais>

## Validação (o agente executa)
- docker compose up -d --build --wait <servico>
- curl -fsS http://localhost:<porta>/health
- pnpm -C backend test <filtro>
- <cenário manual: PATCH de preço, conferir SSE, etc.>

## Forma de trabalho
1. Investigue e apresente um plano curto. Aguarde meu OK.
2. Implemente em commits pequenos (Conventional Commits em português).
3. Se encontrar um bug, explique a causa raiz antes de corrigir.
4. Relatório final: o que fez, comandos de validação com resultado, commits, pendências.
```

## Exemplo

```markdown
## Contexto
- Leia AGENTS.md, docs/arquitetura/matching.md e backend/apps/catalog-service/src/modules/matching/.
- A farmácia nova manda "AMOXICILINA TRI-HIDRATADA" e não casa com "Amoxicilina".

## Objetivo
Ofertas de amoxicilina tri-hidratada casam com o medicamento canônico existente.

## Restrições
- Só altere o dicionário de sinônimos e os testes do matching.

## Critérios de aceite
- [ ] Teste unitário com a descrição real da farmácia passa.
- [ ] Os 10 medicamentos do seed continuam casando 100%.
- [ ] docs/arquitetura/matching.md lista o novo sinônimo.

## Validação
- pnpm -C backend test:unit
- docker compose up -d --build --wait catalog-service
```
