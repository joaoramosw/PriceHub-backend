# Imagem única para os microsserviços Python. O argumento SERVICO escolhe qual pasta entra na imagem.
# Ex.: docker build --build-arg SERVICO=ms-catalogo -t pricehub/ms-catalogo backend
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORTA=8000

WORKDIR /opt/pricehub
COPY libs/pricehub_common ./libs/pricehub_common
RUN pip install ./libs/pricehub_common

ARG SERVICO
COPY services/${SERVICO}/app ./servico/app
WORKDIR /opt/pricehub/servico

RUN useradd --create-home --uid 1000 pricehub
USER pricehub

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORTA\"]}/saude', timeout=2)" || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORTA} --no-access-log"]
