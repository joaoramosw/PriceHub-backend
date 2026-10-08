#!/usr/bin/env bash
set -o pipefail
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
if ! docker info >/dev/null 2>&1; then
  echo "AVISO: Docker não está rodando — inicie o Docker Desktop e rode /subir"
  exit 0
fi
[ -f .env ] || cp .env.example .env
docker compose up -d --wait 2>&1 | tail -n 20 || echo "AVISO: ambiente docker não subiu — rode /subir"
exit 0
