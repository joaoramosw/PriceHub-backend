"""Banco próprio do ms-catalogo (``catalogo``).

Tabelas de negócio (nomes iguais aos da monografia):

* ``medicamentos``: cadastro padronizado e único de cada medicamento;
* ``farmacias``: farmácias que já enviaram ofertas;
* ``ofertas``: preço vigente de um medicamento em uma farmácia;
* ``historico_precos``: registro cumulativo (append-only) de cada preço recebido.

Tabelas de infraestrutura:

* ``eventos_processados``: idempotência (o mesmo evento entregue duas vezes não é aplicado duas vezes);
* ``outbox``: eventos a publicar, gravados na mesma transação dos dados (padrão Transactional Outbox);
* ``ofertas_nao_correspondidas``: ofertas que não puderam ser associadas a um medicamento.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from pricehub_common.tempo import agora_utc


class Base(DeclarativeBase):
    pass


class Farmacia(Base):
    __tablename__ = "farmacias"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    nome: Mapped[str] = mapped_column(String(120))
    criada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora_utc)
    atualizada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora_utc)
    disponivel: Mapped[bool] = mapped_column(Boolean, default=True)


class Medicamento(Base):
    __tablename__ = "medicamentos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    chave_canonica: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True)
    registro_ms: Mapped[str | None] = mapped_column(String(13), unique=True, nullable=True)
    nome: Mapped[str] = mapped_column(String(200))
    principio_ativo: Mapped[str] = mapped_column(String(160))
    principio_normalizado: Mapped[str] = mapped_column(String(160), index=True)
    concentracao_valor: Mapped[float] = mapped_column(Float)
    concentracao_unidade: Mapped[str] = mapped_column(String(10))
    forma: Mapped[str] = mapped_column(String(40))
    quantidade_valor: Mapped[float] = mapped_column(Float)
    quantidade_unidade: Mapped[str] = mapped_column(String(10))
    fabricante: Mapped[str | None] = mapped_column(String(120), nullable=True)
    categoria: Mapped[str | None] = mapped_column(String(80), nullable=True)
    fonte_dos_dados: Mapped[str] = mapped_column(String(20), comment="registro | descricao")
    termos_de_busca: Mapped[str] = mapped_column(Text, default="")
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora_utc)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora_utc)

    ofertas: Mapped[list[Oferta]] = relationship(back_populates="medicamento", lazy="raise")


class Oferta(Base):
    __tablename__ = "ofertas"
    __table_args__ = (UniqueConstraint("farmacia_id", "codigo_externo", name="uq_oferta_por_farmacia"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    medicamento_id: Mapped[str] = mapped_column(ForeignKey("medicamentos.id"), index=True)
    farmacia_id: Mapped[str] = mapped_column(ForeignKey("farmacias.id"), index=True)
    codigo_externo: Mapped[str] = mapped_column(String(60))
    nome_na_farmacia: Mapped[str] = mapped_column(String(200))
    preco_centavos: Mapped[int] = mapped_column(Integer)
    url_do_produto: Mapped[str | None] = mapped_column(String(300), nullable=True)
    disponivel: Mapped[bool] = mapped_column(Boolean, default=True)
    atualizado_na_origem_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora_utc)

    medicamento: Mapped[Medicamento] = relationship(back_populates="ofertas", lazy="raise")
    farmacia: Mapped[Farmacia] = relationship(lazy="raise")


class HistoricoPreco(Base):
    __tablename__ = "historico_precos"
    __table_args__ = (Index("ix_historico_oferta_data", "oferta_id", "registrado_em"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    oferta_id: Mapped[str] = mapped_column(ForeignKey("ofertas.id"))
    preco_centavos: Mapped[int] = mapped_column(Integer)
    registrado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora_utc)
    correlation_id: Mapped[str] = mapped_column(String(64))


async def proteger_historico_precos(engine) -> None:  # type: ignore[no-untyped-def]
    """Instala a proteção no banco, inclusive quando a tabela já existia."""
    async with engine.begin() as conexao:
        if engine.dialect.name == "postgresql":
            await conexao.execute(
                text(
                    "CREATE OR REPLACE FUNCTION impedir_alteracao_historico_precos() "
                    "RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'historico_precos e imutavel'; END; $$ LANGUAGE plpgsql"
                )
            )
            await conexao.execute(text("DROP TRIGGER IF EXISTS trg_historico_precos_imutavel ON historico_precos"))
            await conexao.execute(
                text(
                    "CREATE TRIGGER trg_historico_precos_imutavel BEFORE UPDATE OR DELETE ON historico_precos "
                    "FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_historico_precos()"
                )
            )
        elif engine.dialect.name == "sqlite":
            await conexao.execute(text("DROP TRIGGER IF EXISTS trg_historico_precos_nao_atualiza"))
            await conexao.execute(text("DROP TRIGGER IF EXISTS trg_historico_precos_nao_apaga"))
            await conexao.execute(
                text(
                    "CREATE TRIGGER trg_historico_precos_nao_atualiza BEFORE UPDATE ON historico_precos "
                    "BEGIN SELECT RAISE(ABORT, 'historico_precos e imutavel'); END"
                )
            )
            await conexao.execute(
                text(
                    "CREATE TRIGGER trg_historico_precos_nao_apaga BEFORE DELETE ON historico_precos "
                    "BEGIN SELECT RAISE(ABORT, 'historico_precos e imutavel'); END"
                )
            )


class EventoProcessado(Base):
    __tablename__ = "eventos_processados"

    id_do_evento: Mapped[str] = mapped_column(String(36), primary_key=True)
    tipo: Mapped[str] = mapped_column(String(80))
    processado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora_utc)


class RegistroDeOutbox(Base):
    __tablename__ = "outbox"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_do_evento: Mapped[str] = mapped_column(String(36), unique=True)
    tipo: Mapped[str] = mapped_column(String(80))
    correlation_id: Mapped[str] = mapped_column(String(64))
    dados: Mapped[Any] = mapped_column(JSON)
    ocorrido_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora_utc)
    publicado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)


class OfertaNaoCorrespondida(Base):
    __tablename__ = "ofertas_nao_correspondidas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    farmacia_id: Mapped[str] = mapped_column(String(40))
    codigo_externo: Mapped[str] = mapped_column(String(60))
    motivo: Mapped[str] = mapped_column(String(300))
    dados: Mapped[Any] = mapped_column(JSON)
    registrada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora_utc)
