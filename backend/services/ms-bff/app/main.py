from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from pricehub_common.http import criar_aplicacao, registrar_saude
from pricehub_common.logs import configurar_logs

from app.configuracao import ConfiguracaoDoBff
from app.roteador import roteador


def criar_app(configuracao: ConfiguracaoDoBff | None = None) -> FastAPI:
    configuracao = configuracao or ConfiguracaoDoBff()
    configurar_logs("ms-bff", configuracao.nivel_de_log)

    @asynccontextmanager
    async def ciclo_de_vida(app: FastAPI) -> AsyncIterator[None]:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30, connect=3)) as cliente:
            app.state.cliente_http = cliente
            yield

    app = criar_aplicacao(
        titulo="ms-bff - API dos micro-frontends",
        descricao=(
            "Fachada HTTP dos micro-frontends. Mantém contratos existentes e encaminha chamadas ao serviço responsável."
        ),
        servico="ms-bff",
        origens_cors=configuracao.lista_de_origens_cors,
        ciclo_de_vida=ciclo_de_vida,
        tags=[{"name": "fachada", "description": "Encaminhamento das APIs existentes para os micro-frontends."}],
    )
    app.state.configuracao = configuracao
    app.include_router(roteador)
    registrar_saude(app, {})
    return app


app = criar_app()
