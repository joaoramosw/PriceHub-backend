"""Repositórios do catálogo. Todos recebem a sessão da transação em andamento (unidade de trabalho)."""

from __future__ import annotations

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.persistencia.modelos import (
    EventoProcessado,
    Farmacia,
    HistoricoPreco,
    Medicamento,
    Oferta,
    OfertaNaoCorrespondida,
    RegistroDeOutbox,
)
from pricehub_common.eventos import Envelope
from pricehub_common.tempo import agora_utc


class RepositorioDoCatalogo:
    def __init__(self, sessao: AsyncSession) -> None:
        self.sessao = sessao

    # ----- idempotência -----------------------------------------------------------
    async def evento_ja_processado(self, id_do_evento: str) -> bool:
        return await self.sessao.get(EventoProcessado, id_do_evento) is not None

    def marcar_evento_processado(self, envelope: Envelope) -> None:
        self.sessao.add(EventoProcessado(id_do_evento=str(envelope.id_do_evento), tipo=envelope.tipo))

    # ----- medicamentos (usado pelas estratégias de correspondência) -------------
    async def por_registro_ms(self, registro_ms: str) -> Medicamento | None:
        return await self.sessao.scalar(select(Medicamento).where(Medicamento.registro_ms == registro_ms))

    async def por_chave_canonica(self, chave: str) -> Medicamento | None:
        return await self.sessao.scalar(select(Medicamento).where(Medicamento.chave_canonica == chave))

    def adicionar(self, entidade: object) -> None:
        self.sessao.add(entidade)

    # ----- farmácias ----------------------------------------------------------------
    async def garantir_farmacia(self, farmacia_id: str, nome: str) -> Farmacia:
        farmacia = await self.sessao.get(Farmacia, farmacia_id)
        if farmacia is None:
            farmacia = Farmacia(id=farmacia_id, nome=nome)
            self.sessao.add(farmacia)
        farmacia.atualizada_em = agora_utc()
        farmacia.disponivel = True
        return farmacia

    # ----- ofertas ------------------------------------------------------------------
    async def oferta_por_codigo(self, farmacia_id: str, codigo_externo: str) -> Oferta | None:
        return await self.sessao.scalar(select(Oferta).where(Oferta.farmacia_id == farmacia_id, Oferta.codigo_externo == codigo_externo))

    async def ofertas_disponiveis_fora_da_lista(self, farmacia_id: str, codigos_presentes: list[str]) -> list[Oferta]:
        consulta = select(Oferta).where(Oferta.farmacia_id == farmacia_id, Oferta.disponivel.is_(True))
        if codigos_presentes:
            consulta = consulta.where(Oferta.codigo_externo.not_in(codigos_presentes))
        return list((await self.sessao.scalars(consulta)).all())

    def registrar_historico(self, oferta: Oferta, correlation_id: str) -> None:
        self.sessao.add(
            HistoricoPreco(
                oferta_id=oferta.id,
                preco_centavos=oferta.preco_centavos,
                registrado_em=agora_utc(),
                correlation_id=correlation_id,
            )
        )

    def registrar_nao_correspondida(self, farmacia_id: str, codigo_externo: str, motivo: str, dados: dict) -> None:
        self.sessao.add(OfertaNaoCorrespondida(farmacia_id=farmacia_id, codigo_externo=codigo_externo, motivo=motivo, dados=dados))

    # ----- outbox -------------------------------------------------------------------
    def enfileirar_na_outbox(self, envelope: Envelope) -> None:
        self.sessao.add(
            RegistroDeOutbox(
                id_do_evento=str(envelope.id_do_evento),
                tipo=envelope.tipo,
                correlation_id=envelope.correlation_id,
                dados=envelope.dados,
                ocorrido_em=envelope.ocorrido_em,
            )
        )


class RepositorioDaOutbox:
    def __init__(self, sessao: AsyncSession) -> None:
        self.sessao = sessao

    async def pendentes(self, limite: int, travar: bool) -> list[RegistroDeOutbox]:
        consulta = select(RegistroDeOutbox).where(RegistroDeOutbox.publicado_em.is_(None)).order_by(RegistroDeOutbox.id).limit(limite)
        if travar:
            # Com mais de uma instância do ms-catalogo, cada uma pega um lote diferente.
            consulta = consulta.with_for_update(skip_locked=True)
        return list((await self.sessao.scalars(consulta)).all())

    async def marcar_publicados(self, ids: list[int]) -> None:
        if ids:
            await self.sessao.execute(update(RegistroDeOutbox).where(RegistroDeOutbox.id.in_(ids)).values(publicado_em=agora_utc()))
