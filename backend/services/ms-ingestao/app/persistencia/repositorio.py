from __future__ import annotations

from sqlalchemy import select

from app.persistencia.modelos import ColetaBruta
from pricehub_common.persistencia import BancoDeDados


class RepositorioDeColetas:
    def __init__(self, banco: BancoDeDados) -> None:
        self._banco = banco

    async def salvar(self, coleta: ColetaBruta) -> None:
        async with self._banco.transacao() as sessao:
            sessao.add(coleta)

    async def listar(self, farmacia_id: str | None, limite: int) -> list[ColetaBruta]:
        consulta = select(ColetaBruta).order_by(ColetaBruta.recebida_em.desc()).limit(limite)
        if farmacia_id:
            consulta = consulta.where(ColetaBruta.farmacia_id == farmacia_id)
        async with self._banco.sessao() as sessao:
            return list((await sessao.scalars(consulta)).all())

    async def buscar(self, coleta_id: str) -> ColetaBruta | None:
        async with self._banco.sessao() as sessao:
            return await sessao.get(ColetaBruta, coleta_id)
