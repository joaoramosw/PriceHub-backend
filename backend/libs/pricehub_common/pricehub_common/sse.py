"""Difusão de mensagens em tempo real para o navegador via Server-Sent Events (SSE).

O navegador abre uma conexão HTTP longa e o serviço empurra cada novo evento.
É o que permite ao painel mostrar, sem recarregar a página, a alteração de preço
chegando ao catálogo segundos depois de ter sido feita na farmácia.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import Request
from fastapi.responses import StreamingResponse

INTERVALO_DE_PULSACAO_S = 15
TAMANHO_DA_FILA_POR_CLIENTE = 200


class DifusorDeEventos:
    """Mantém um conjunto de clientes conectados e entrega a cada um as mensagens publicadas."""

    def __init__(self) -> None:
        self._clientes: set[asyncio.Queue[dict[str, Any]]] = set()

    @property
    def total_de_clientes(self) -> int:
        return len(self._clientes)

    def difundir(self, nome_do_evento: str, dados: dict[str, Any]) -> None:
        mensagem = {"evento": nome_do_evento, "dados": dados}
        for fila_do_cliente in list(self._clientes):
            if fila_do_cliente.full():
                # Cliente lento: descarta a mensagem mais antiga em vez de travar o serviço.
                fila_do_cliente.get_nowait()
            fila_do_cliente.put_nowait(mensagem)

    async def _gerar_fluxo(self, request: Request) -> AsyncIterator[str]:
        fila_do_cliente: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=TAMANHO_DA_FILA_POR_CLIENTE)
        self._clientes.add(fila_do_cliente)
        try:
            yield "retry: 3000\n\n"
            while not await request.is_disconnected():
                try:
                    mensagem = await asyncio.wait_for(fila_do_cliente.get(), timeout=INTERVALO_DE_PULSACAO_S)
                except TimeoutError:
                    yield ": pulsacao\n\n"
                    continue
                corpo = json.dumps(mensagem["dados"], ensure_ascii=False, default=str)
                yield f"event: {mensagem['evento']}\ndata: {corpo}\n\n"
        finally:
            self._clientes.discard(fila_do_cliente)

    def resposta(self, request: Request) -> StreamingResponse:
        return StreamingResponse(
            self._gerar_fluxo(request),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
