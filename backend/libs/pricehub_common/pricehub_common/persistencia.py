"""Acesso a banco de dados com SQLAlchemy assíncrono.

Cada microsserviço tem o seu próprio banco (padrão *database per service*).
Esta classe só encapsula a criação do engine, das sessões e a espera pelo
banco na subida do contêiner.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import MetaData, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from pricehub_common.logs import obter_logger

logger = obter_logger("pricehub.persistencia")


class BancoDeDados:
    def __init__(self, url: str) -> None:
        self.url = url
        argumentos = {} if url.startswith("sqlite") else {"pool_size": 10, "max_overflow": 5, "pool_pre_ping": True}
        self.engine: AsyncEngine = create_async_engine(url, **argumentos)
        self._fabrica_de_sessoes = async_sessionmaker(self.engine, expire_on_commit=False)

    @asynccontextmanager
    async def sessao(self) -> AsyncIterator[AsyncSession]:
        async with self._fabrica_de_sessoes() as sessao:
            yield sessao

    @asynccontextmanager
    async def transacao(self) -> AsyncIterator[AsyncSession]:
        """Sessão com commit automático ao final e rollback em caso de erro."""
        async with self._fabrica_de_sessoes() as sessao, sessao.begin():
            yield sessao

    async def aguardar_disponibilidade(self, tentativas: int = 30, intervalo_s: float = 1.0) -> None:
        for tentativa in range(1, tentativas + 1):
            if await self.verificar_conexao():
                return
            logger.aviso("banco ainda indisponível; aguardando", tentativa=tentativa)
            await asyncio.sleep(intervalo_s)
        raise RuntimeError(f"banco de dados indisponível após {tentativas} tentativas")

    async def criar_tabelas(self, metadados: MetaData) -> None:
        async with self.engine.begin() as conexao:
            await conexao.run_sync(metadados.create_all)

    async def verificar_conexao(self) -> bool:
        try:
            async with self.engine.connect() as conexao:
                await conexao.execute(text("SELECT 1"))
            return True
        except Exception:  # noqa: BLE001
            return False

    async def fechar(self) -> None:
        await self.engine.dispose()
