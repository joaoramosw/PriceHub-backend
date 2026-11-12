"""Cliente HTTP usado pelos adaptadores para consultar as APIs nativas das farmácias."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from pricehub_common.logs import obter_correlation_id


class FarmaciaIndisponivelError(Exception):
    def __init__(self, url: str, causa: str) -> None:
        super().__init__(f"farmácia indisponível em {url}: {causa}")
        self.url = url
        self.causa = causa


@dataclass
class RespostaJson:
    corpo: Any
    etag: str | None
    nao_modificado: bool


class ClienteDaFarmacia:
    def __init__(self, timeout_s: float = 3.0, cliente: httpx.AsyncClient | None = None) -> None:
        self._cliente = cliente or httpx.AsyncClient(timeout=timeout_s)

    async def buscar_json(self, url: str, etag: str | None = None) -> RespostaJson:
        cabecalhos = {"accept": "application/json", "x-correlation-id": obter_correlation_id()}
        if etag:
            cabecalhos["if-none-match"] = etag
        try:
            resposta = await self._cliente.get(url, headers=cabecalhos)
        except httpx.HTTPError as erro:
            raise FarmaciaIndisponivelError(url, f"{type(erro).__name__}: {erro}") from erro
        if resposta.status_code == 304:
            return RespostaJson(corpo=None, etag=etag, nao_modificado=True)
        if not resposta.is_success:
            raise FarmaciaIndisponivelError(url, f"HTTP {resposta.status_code}")
        return RespostaJson(corpo=resposta.json(), etag=resposta.headers.get("etag"), nao_modificado=False)

    async def fechar(self) -> None:
        await self._cliente.aclose()
