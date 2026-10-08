# Padrões de Git

## Branches
- `main`: sempre estável (compose sobe healthy, testes verdes).
- Trabalho em `feat/<assunto>`, `fix/<assunto>`, `docs/<assunto>`, `chore/<assunto>`.
- Branch atual do backend: `feat/backend-microsservicos`.

## Commits — Conventional Commits em português
```
<tipo>(<escopo>): <descrição no imperativo, minúscula, sem ponto final>
```
- Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`, `perf`.
- Escopos: `infra`, `contracts`, `messaging`, `observability`, `testing`, `farmacia-sim`, `ingestion`, `catalog`, `query`, `e2e`, `docs`, `claude`.
- Exemplos: `feat(catalog): adiciona matching por registro MS`, `fix(ingestion): corrige parser de preço com vírgula`.
- **Um commit por unidade lógica**; código e testes juntos; mudança de contrato junto com `docs/arquitetura/eventos.md`.

## Pull Requests
- Título no formato de commit. Descrição: o quê, por quê, como validar (comandos), riscos.
- Checklist: compose healthy, `lint` e `test` verdes, docs atualizadas.
- Pelo menos **1 revisão humana** aplicando `docs/ia/checklist-revisao.md`.
- Nada de `git push --force` em branch compartilhada; agentes nunca fazem `git push` sem pedido explícito.
