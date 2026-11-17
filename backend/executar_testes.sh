#!/usr/bin/env bash
# Executa os testes de cada microsserviço separadamente (cada um tem o seu pacote "app").
set -e
cd "$(dirname "$0")"
PYTHON="${PYTHON:-python3}"
"$PYTHON" -c "import sys" 2>/dev/null || PYTHON=python
for pasta in libs/pricehub_common ../farmacias services/ms-ingestao services/ms-catalogo services/ms-log; do
  echo "==> $pasta"
  (cd "$pasta" && "$PYTHON" -m pytest -q)
done
