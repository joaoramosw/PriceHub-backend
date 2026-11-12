"""Banco próprio do ms-log (``auditoria``): uma linha por evento que passou pelo broker."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Index, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from pricehub_common.tempo import agora_utc


class Base(DeclarativeBase):
    pass


class RegistroDeEvento(Base):
    __tablename__ = "registros_de_evento"
    __table_args__ = (Index("ix_registro_tipo_data", "tipo", "ocorrido_em"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_do_evento: Mapped[str] = mapped_column(String(36), unique=True)
    tipo: Mapped[str] = mapped_column(String(80))
    servico_de_origem: Mapped[str] = mapped_column(String(60))
    correlation_id: Mapped[str] = mapped_column(String(64), index=True)
    farmacia_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    ocorrido_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    recebido_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora_utc)
    dados: Mapped[Any] = mapped_column(JSON)
