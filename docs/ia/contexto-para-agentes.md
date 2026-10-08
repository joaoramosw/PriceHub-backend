# Contexto para agentes: AGENTS.md e CLAUDE.md

## Papel de cada arquivo
- **`AGENTS.md`** é a **fonte única** de regras para qualquer agente (Claude Code, Cursor, Codex, OpenCode) e para pessoas. Resumo do projeto, mapa do repositório, comandos, regras de ouro, Definition of Done e links. Máximo de ~150 linhas.
- **`CLAUDE.md`** começa com `@AGENTS.md` (import) e adiciona **apenas** o que é específico do Claude Code: hooks, slash commands e a regra de subir e validar containers.
- Outras ferramentas: Cursor e Codex leem `AGENTS.md` nativamente. Se alguma ferramenta exigir arquivo próprio (ex.: `.cursor/rules/`), ele deve só apontar para `AGENTS.md`, nunca duplicar regras.

## Quando atualizar
Atualize no **mesmo commit** da mudança quando:
- um serviço, pacote ou pasta de primeiro nível for criado, renomeado ou removido (mapa do repositório);
- um comando essencial mudar (scripts do `package.json`, portas, compose);
- uma regra de ouro ou a Definition of Done mudar (combine com o grupo antes);
- um hook, permissão ou slash command do Claude Code mudar (`CLAUDE.md`).

## O que colocar
- Regras estáveis e verificáveis ("ack só depois do commit"), não preferências vagas.
- Links para `docs/` em vez de copiar conteúdo longo.
- Comandos exatos que funcionam a partir da raiz do repositório.

## O que nunca colocar
- **Segredos**: senhas, tokens, conteúdo do `.env`, URLs com credenciais.
- Dados pessoais de integrantes ou de terceiros.
- Instruções temporárias de uma tarefa ("hoje corrija o bug X"): isso vai no prompt, não no contexto permanente.
- Conteúdo duplicado de `docs/`, que fica desatualizado.
- Detalhes que mudam a cada commit (contagem de testes, versões de patch).

## Revisão
Na Fase 8 e a cada marco, releia os dois arquivos com o código real e remova o que ficou obsoleto. Arquivo de contexto errado é pior que arquivo ausente.
