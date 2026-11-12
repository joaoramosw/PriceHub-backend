"""Banco próprio do ms-ingestao (``ingestao``): guarda a coleta bruta recebida de cada farmácia.

Guardar o payload original permite auditar o que a farmácia mandou e reprocessar
se um adaptador tiver um defeito, sem depender da farmácia de novo.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from pricehub_common.tempo import agora_utc


class Base(DeclarativeBase):
    pass


class ColetaBruta(Base):
    __tablename__ = "coletas_brutas"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    farmacia_id: Mapped[str] = mapped_column(String(40), index=True)
    origem: Mapped[str] = mapped_column(String(20))
    situacao: Mapped[str] = mapped_column(String(20), comment="publicada | falhou")
    correlation_id: Mapped[str] = mapped_column(String(64), index=True)
    itens_recebidos: Mapped[int] = mapped_column(Integer, default=0)
    ofertas_publicadas: Mapped[int] = mapped_column(Integer, default=0)
    ofertas_sem_alteracao: Mapped[int] = mapped_column(Integer, default=0)
    descartadas: Mapped[int] = mapped_column(Integer, default=0)
    removidas: Mapped[int] = mapped_column(Integer, default=0)
    duracao_ms: Mapped[float] = mapped_column(Float, default=0)
    erro: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[Any] = mapped_column(JSON)
    recebida_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora_utc, index=True)
