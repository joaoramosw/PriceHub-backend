"""Relay da outbox: publica no RabbitMQ os eventos gravados junto com os dados.

Sem a outbox haveria duas operações independentes (gravar no banco e publicar no
broker). Se o serviço caísse entre elas, o catálogo mudaria sem ninguém ser
avisado, ou o contrário. Com a outbox, o evento é gravado na mesma transação dos
dados e este relay garante a publicação (entrega pelo menos uma vez).
"""

from __future__ import annotations

import asyncio
import contextlib

from app.persistencia.repositorios import RepositorioDaOutbox
from pricehub_common.eventos import Envelope
from pricehub_common.logs import obter_logger
from pricehub_common.mensageria import BarramentoDeEventos
from pricehub_common.persistencia import BancoDeDados

logger = obter_logger("catalogo.outbox")


class RelayDaOutbox:
    def __init__(self, banco: BancoDeDados, barramento: BarramentoDeEventos, intervalo_s: float, lote: int) -> None:
        self._banco = banco
        self._barramento = barramento
        self._intervalo_s = intervalo_s
        self._lote = lote
        self._ha_pendencias = asyncio.Event()
        self._tarefa: asyncio.Task[None] | None = None
        self._travar_linhas = not banco.url.startswith("sqlite")

    def avisar(self) -> None:
        """Chamado após gravar na outbox: publica logo, sem esperar o próximo ciclo."""
        self._ha_pendencias.set()

    def iniciar(self) -> None:
        self._tarefa = asyncio.create_task(self._executar())

    async def parar(self) -> None:
        if self._tarefa:
            self._tarefa.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._tarefa

    async def _executar(self) -> None:
        while True:
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._ha_pendencias.wait(), timeout=self._intervalo_s)
            self._ha_pendencias.clear()
            try:
                while await self.publicar_pendentes() == self._lote:
                    pass
            except Exception:  # noqa: BLE001 - tenta de novo no próximo ciclo
                logger.erro("falha ao publicar a outbox", excecao=True)

    async def publicar_pendentes(self) -> int:
        async with self._banco.transacao() as sessao:
            repositorio = RepositorioDaOutbox(sessao)
            pendentes = await repositorio.pendentes(self._lote, self._travar_linhas)
            publicados: list[int] = []
            for registro in pendentes:
                envelope = Envelope(
                    id_do_evento=registro.id_do_evento,
                    tipo=registro.tipo,
                    correlation_id=registro.correlation_id,
                    servico_de_origem=self._barramento.servico_de_origem,
                    ocorrido_em=registro.ocorrido_em,
                    dados=registro.dados,
                )
                await self._barramento.publicar_envelope(envelope)
                publicados.append(registro.id)
            await repositorio.marcar_publicados(publicados)
        if publicados:
            logger.debug("eventos da outbox publicados", quantidade=len(publicados))
        return len(publicados)
