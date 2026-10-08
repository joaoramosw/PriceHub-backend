# Padrões de banco de dados

- **PostgreSQL 16**, um banco lógico por serviço (ver ADR 0006). Bancos criados em `infra/postgres/init.sql`.
- **Prisma 7** com `prisma.config.ts`, gerador `prisma-client` (ESM, saída em `src/generated/prisma`) e `@prisma/adapter-pg`.
- **Migrações** versionadas em `apps/<servico>/prisma/migrations/`, aplicadas no start do container com `prisma migrate deploy`.
  - Para criar: `pnpm -C backend/apps/<servico> exec prisma migrate dev --name <descricao>` com o compose de pé.
  - Nunca edite uma migração já commitada; crie outra.
- **Convenções de tabela:**
  - Tabelas e colunas em `snake_case` no banco (`@@map`/`@map`), modelos e campos em `camelCase`/`PascalCase` no Prisma.
  - Tabelas no plural (`medicamentos`, `ofertas`).
  - Chaves primárias `uuid` (v7 quando geradas pela aplicação) ou naturais quando fazem sentido (`farmacias.id = 'biofarma'`).
  - Timestamps `timestamptz` (`criado_em`, `atualizado_em`).
  - Dinheiro em `integer` de centavos (`preco_centavos`).
  - Unicidade expressa no schema (`@@unique([farmaciaId, externalId])`).
- **Transações:** efeito + `eventos_processados` + `outbox` sempre na mesma transação (`prisma.$transaction`).
- **SQL cru** só quando o Prisma não expressa (ex.: `FOR UPDATE SKIP LOCKED` no relay do outbox), sempre parametrizado.
- **Repository:** todo acesso a dados passa por um `*.repository.ts`; services não usam o client diretamente.
