# ADR 0006 — Banco por serviço

- **Status:** aceita
- **Data:** 2026-10-08

## Contexto
Microsserviços que compartilham tabelas ficam acoplados pelo schema e não evoluem de forma independente.

## Decisão
Cada serviço tem seu **banco lógico** (`ingestion`, `catalog`, `query`, `farmacia_<id>`) e seu schema Prisma com migrações próprias. Um único container PostgreSQL 16 hospeda todos os bancos para simplificar o ambiente local; nenhum serviço recebe a `DATABASE_URL` de outro.

## Consequências
- Schemas evoluem sem coordenação; o read model é desnormalizado sem afetar o catálogo.
- Dados replicados entre serviços (ex.: nome do medicamento no query) são mantidos por eventos.
- Um único Postgres é ponto único de falha no ambiente local (aceitável; em produção seriam instâncias e credenciais separadas).

## Alternativas consideradas
- **Banco compartilhado:** simples, mas anula a independência dos serviços.
- **Um container por banco:** mais fiel à produção, porém pesado para os notebooks dos integrantes.
