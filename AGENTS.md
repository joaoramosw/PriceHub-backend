# Instruções para agentes (Codex, Claude e outros)

Projeto: PriceHub, objeto de estudo do TCC. Visão geral, arquitetura e como rodar estão no `README.md`.

## Skills do repositório

As mesmas skills existem em `.agents/skills/` (Codex) e `.claude/skills/` (Claude Code). Ao editar uma,
copie para a outra pasta.

| Skill | Quando usar |
|---|---|
| `commit-pr` | commitar, fazer push, abrir PR |
| `tdd` | criar funcionalidade, corrigir bug, refatorar |
| `implement` | implementar uma mudança de ponta a ponta |
| `grilling` | sabatinar um plano ou ensaiar a banca |
| `domain-modeling` | termos, entidades, eventos e regras de negócio |
| `playwright` | testar as telas e gerar prints |

## Regras que valem sempre

- Commits semânticos (Conventional Commits) em português, com o corpo em tópicos.
- **Nunca** adicionar `Co-Authored-By` de IA nem "Generated with ..." em commits ou PRs.
- Escrever código, nomes e documentação em português, seguindo o estilo do código vizinho.
- Serviços só se comunicam por eventos no RabbitMQ; um banco por serviço; preços em centavos.
- Não commitar `.env`, nem fazer push direto ou forçado na `main` sem o usuário pedir.
