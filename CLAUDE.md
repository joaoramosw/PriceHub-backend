@AGENTS.md

# Específico do Claude Code

## Containers

Sempre que alterar código de um serviço, rebuild e suba com `docker compose up -d --build --wait <servico>`, verifique `/health` e rode os testes afetados antes de dizer que terminou. Nunca peça ao usuário para subir containers.

- O `catalog-service` não publica porta no host: `docker compose exec catalog-service wget -qO- http://localhost:3002/health`.
- Diagnóstico: `docker compose logs <servico> --tail 100`. Para seguir uma requisição, filtre pelo `correlationId`.

## Hooks (`.claude/settings.json`)

- **SessionStart** (`startup|resume`): roda `.claude/hooks/subir-ambiente.sh`, que sobe o compose com `--wait`. Se o Docker estiver parado, avisa e segue; use `/subir` depois.
- **PostToolUse** (`Edit|Write`): roda `.claude/hooks/formatar-biome.mjs`, que formata com Biome o `.ts` editado dentro de `backend/`.
- Permissões: `docker compose`, `pnpm`, `curl` e git local liberados; `git push` e `docker system prune` negados.

## Slash commands (`.claude/commands/`)

| Comando | Uso |
|---|---|
| `/subir` | sobe o ambiente, checa healthchecks, lista URLs e diagnostica falhas |
| `/demo` | roda `demo:preco` e reporta a latência por etapa |
| `/nova-farmacia <descrição>` | passo a passo para uma nova fonte de dados |
| `/novo-evento <descrição>` | passo a passo para um novo evento |
| `/revisar` | aplica `docs/ia/checklist-revisao.md` ao diff atual |
