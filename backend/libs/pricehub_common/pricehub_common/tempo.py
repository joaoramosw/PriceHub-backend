"""Funções de data e hora usadas por todos os serviços.

Todo instante trafega em UTC (ISO 8601). A conversão para o horário de Brasília
fica a cargo de quem exibe a informação.
"""

from datetime import UTC, datetime, timedelta, timezone

FUSO_DE_BRASILIA = timezone(timedelta(hours=-3), name="America/Bahia")


def agora_utc() -> datetime:
    return datetime.now(UTC)


def milissegundos_entre(inicio: datetime, fim: datetime) -> int:
    diferenca = fim - inicio
    return round(diferenca.total_seconds() * 1000)
