"""Leva os eventos do catálogo ao navegador (Server-Sent Events).

Cada instância do ms-catalogo cria uma fila temporária e exclusiva ligada a
``catalogo.#``. Assim, com várias instâncias, todas recebem os eventos e cada
uma avisa os navegadores conectados a ela.
"""

from __future__ import annotations

from pricehub_common.eventos import Envelope
from pricehub_common.mensageria import BarramentoDeEventos
from pricehub_common.sse import DifusorDeEventos


class NotificadorEmTempoReal:
    def __init__(self, barramento: BarramentoDeEventos) -> None:
        self._barramento = barramento
        self.difusor = DifusorDeEventos()

    async def iniciar(self) -> None:
        await self._barramento.assinar(None, ["catalogo.#"], self._repassar, exclusiva=True)

    async def _repassar(self, envelope: Envelope) -> None:
        self.difusor.difundir(
            envelope.tipo,
            {
                "idDoEvento": str(envelope.id_do_evento),
                "tipo": envelope.tipo,
                "ocorridoEm": envelope.ocorrido_em.isoformat(),
                "correlationId": envelope.correlation_id,
                "dados": envelope.dados,
            },
        )
