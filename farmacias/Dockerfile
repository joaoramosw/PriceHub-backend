# Farmácia simulada: sistema externo ao PriceHub, com imagem e dependências próprias.
# A mesma imagem sobe as três farmácias; FARMACIA_ID escolhe qual.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORTA=8101

WORKDIR /opt/farmacia
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app ./app

RUN useradd --create-home --uid 1000 farmacia
USER farmacia

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORTA\"]}/saude', timeout=2)" || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORTA} --no-access-log"]
