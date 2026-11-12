from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import Response, StreamingResponse
from pricehub_common.erros import ServicoIndisponivel

roteador = APIRouter()

_METODOS = ["GET", "POST", "PUT", "PATCH", "DELETE"]
_CABECALHOS_REQUISICAO_IGNORADOS = {"host", "content-length", "connection"}
_CABECALHOS_RESPOSTA_IGNORADOS = {"content-length", "transfer-encoding", "connection", "keep-alive"}


def destino(request: Request, caminho: str) -> tuple[str, str]:
    """Seleciona serviço de destino e caminho, sem acoplar os domínios entre si."""
    configuracao = request.app.state.configuracao
    partes = caminho.split("/", 1)
    raiz = partes[0]
    restante = partes[1] if len(partes) > 1 else ""

    if raiz == "farmacias":
        farmacia, separador, rota = restante.partition("/")
        url = configuracao.farmacias.get(farmacia)
        if url and separador:
            return url, f"/{rota}"
        return configuracao.url_da_ingestao, f"/{caminho}"
    if raiz == "catalogo":
        caminho = restante
        raiz = caminho.split("/", 1)[0]
        if raiz in {"medicamentos", "categorias", "estatisticas", "tempo-real", "ofertas-nao-correspondidas"}:
            return configuracao.url_da_consulta, f"/{caminho}"
        return configuracao.url_do_catalogo, f"/{caminho}"
    if raiz == "ingestao":
        return configuracao.url_da_ingestao, f"/{restante}"
    if raiz == "log":
        return configuracao.url_do_log, f"/{restante}"
    if raiz == "consulta":
        return configuracao.url_da_consulta, f"/{restante}"
    if raiz in {"medicamentos", "categorias", "estatisticas", "tempo-real", "ofertas-nao-correspondidas"}:
        return configuracao.url_da_consulta, f"/{caminho}"
    if raiz == "admin":
        return configuracao.url_do_catalogo, f"/{caminho}"
    if raiz in {"registros", "metricas", "filas", "servicos"}:
        return configuracao.url_do_log, f"/{caminho}"
    if raiz in {"sincronizacoes", "coletas"}:
        return configuracao.url_da_ingestao, f"/{caminho}"
    return "", ""


async def encaminhar(request: Request, caminho: str) -> Response:
    base, rota = destino(request, caminho)
    if not base:
        return Response(status_code=404)
    cliente: httpx.AsyncClient = request.app.state.cliente_http
    url = f"{base.rstrip('/')}{rota}"
    cabecalhos = {k: v for k, v in request.headers.items() if k.lower() not in _CABECALHOS_REQUISICAO_IGNORADOS}
    requisicao = cliente.build_request(
        request.method,
        url,
        params=request.query_params,
        headers=cabecalhos,
        content=await request.body(),
    )
    try:
        resposta = await cliente.send(requisicao, stream=True)
    except httpx.HTTPError as erro:
        raise ServicoIndisponivel(f"Não foi possível alcançar o serviço de destino: {base}") from erro
    cabecalhos_resposta = {k: v for k, v in resposta.headers.items() if k.lower() not in _CABECALHOS_RESPOSTA_IGNORADOS}
    if "text/event-stream" in resposta.headers.get("content-type", ""):
        async def transmitir() -> AsyncIterator[bytes]:
            try:
                async for bloco in resposta.aiter_raw():
                    yield bloco
            finally:
                await resposta.aclose()

        return StreamingResponse(transmitir(), status_code=resposta.status_code, headers=cabecalhos_resposta)
    corpo = await resposta.aread()
    if "text/html" in resposta.headers.get("content-type", "") and caminho.endswith(("/docs", "/redoc")):
        prefixo = f"/{caminho.rsplit('/', 1)[0]}"
        corpo = corpo.replace(b"/openapi.json", f"{prefixo}/openapi.json".encode())
        corpo = corpo.replace(b"/docs/oauth2-redirect", f"{prefixo}/docs/oauth2-redirect".encode())
    await resposta.aclose()
    return Response(corpo, status_code=resposta.status_code, headers=cabecalhos_resposta)


@roteador.api_route("/{caminho:path}", methods=_METODOS, include_in_schema=False)
async def encaminhar_com_caminho(caminho: str, request: Request) -> Response:
    return await encaminhar(request, caminho)
