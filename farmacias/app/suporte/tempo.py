"""Funções de data e hora da farmácia.

Todo instante trafega em UTC (ISO 8601). A conversão para o horário de Brasília
fica a cargo de quem exibe a informação.
"""

from datetime import UTC, datetime, timedelta, timezone

FUSO_DE_BRASILIA = timezone(timedelta(hours=-3), name="America/Bahia")


def agora_utc() -> datetime:
    return datetime.now(UTC)

