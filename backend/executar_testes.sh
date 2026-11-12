#!/usr/bin/env bash
# Executa os testes de cada microsserviço separadamente (cada um tem o seu pacote "app").
set -e
cd "$(dirname "$0")"
for pasta in libs/pricehub_common services/ms-farmacia services/ms-ingestao services/ms-catalogo services/ms-log; do
  echo "==> $pasta"
  (cd "$pasta" && python3 -m pytest -q)
done
