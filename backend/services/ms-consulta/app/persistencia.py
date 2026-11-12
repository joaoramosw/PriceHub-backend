from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pricehub_common.eventos import Envelope
from pricehub_common.tempo import agora_utc
from sqlalchemy import JSON, DateTime, String, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class ProjecaoDeMedicamento(Base):
    __tablename__ = "projecoes_medicamentos"

    medicamento_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    resumo: Mapped[dict[str, Any]] = mapped_column(JSON)
    detalhe: Mapped[dict[str, Any]] = mapped_column(JSON)
    historico: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    atualizada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora_utc)


class EventoProcessado(Base):
    __tablename__ = "eventos_processados_consulta"

    id_do_evento: Mapped[str] = mapped_column(String(36), primary_key=True)
    processado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora_utc)


async def aplicar_snapshot(sessao: AsyncSession, envelope: Envelope) -> bool:
    if await sessao.get(EventoProcessado, str(envelope.id_do_evento)):
        return False
    dados = envelope.dados
    id_medicamento = str(dados["medicamentoId"])
    projecao = await sessao.scalar(
        select(ProjecaoDeMedicamento).where(ProjecaoDeMedicamento.medicamento_id == id_medicamento).with_for_update()
    )
    valores = {
        "resumo": dados["resumo"],
        "detalhe": dados["detalhe"],
        "historico": dados["historico"],
        "atualizada_em": envelope.ocorrido_em,
    }
    if projecao is None:
        sessao.add(ProjecaoDeMedicamento(medicamento_id=id_medicamento, **valores))
    else:
        atualizada_em = projecao.atualizada_em
        ocorrido_em = envelope.ocorrido_em
        if atualizada_em.tzinfo is None:
            atualizada_em = atualizada_em.replace(tzinfo=UTC)
        if ocorrido_em.tzinfo is None:
            ocorrido_em = ocorrido_em.replace(tzinfo=UTC)
        if ocorrido_em < atualizada_em:
            sessao.add(EventoProcessado(id_do_evento=str(envelope.id_do_evento)))
            return False
        for chave, valor in valores.items():
            setattr(projecao, chave, valor)
    sessao.add(EventoProcessado(id_do_evento=str(envelope.id_do_evento)))
    return True


async def carregar_projecoes(sessao: AsyncSession, busca: str | None = None, categoria: str | None = None) -> list[dict]:
    consulta = select(ProjecaoDeMedicamento).order_by(ProjecaoDeMedicamento.resumo["nome"].as_string())
    linhas = (await sessao.scalars(consulta)).all()
    resultado = [linha.resumo for linha in linhas]
    if categoria:
        resultado = [item for item in resultado if item.get("categoria") == categoria]
    if busca:
        termo = busca.casefold().strip()
        resultado = [
            item for item in resultado
            if termo in item.get("nome", "").casefold()
            or termo in item.get("principioAtivo", "").casefold()
            or termo in (item.get("fabricante") or "").casefold()
        ]
    return resultado
