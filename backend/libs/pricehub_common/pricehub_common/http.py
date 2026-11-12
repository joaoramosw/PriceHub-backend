"""Fábrica de aplicações FastAPI usada por todos os microsserviços.

Centraliza o que precisa ser igual em todos os serviços:

* documentação interativa (Swagger em ``/docs`` e ReDoc em ``/redoc``);
* CORS para os micro-frontends;
* propagação do cabeçalho ``x-correlation-id``;
* conversão de erros de validação e de negócio em ``problem+json``;
* rota de saúde ``/saude`` com verificação das dependências.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from contextlib import AbstractAsyncContextManager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

from pricehub_common.erros import ProblemaHttp
from pricehub_common.logs import correlation_id_atual, novo_correlation_id, obter_logger
from pricehub_common.tempo import agora_utc

CABECALHO_DE_CORRELACAO = "x-correlation-id"
TIPO_PROBLEMA = "application/problem+json"

VerificacaoDeSaude = Callable[[], Awaitable[bool]]

logger = obter_logger("pricehub.http")


class RespostaDeSaude(BaseModel):
    status: str
    servico: str
    instante: str
    verificacoes: dict[str, bool]


MENSAGENS_DE_VALIDACAO = {
    "missing": "campo obrigatório",
    "greater_than": "deve ser maior que {gt}",
    "greater_than_equal": "deve ser maior ou igual a {ge}",
    "less_than": "deve ser menor que {lt}",
    "less_than_equal": "deve ser menor ou igual a {le}",
    "string_too_short": "deve ter ao menos {min_length} caractere(s)",
    "string_too_long": "deve ter no máximo {max_length} caracteres",
    "int_parsing": "deve ser um número inteiro",
    "int_from_float": "deve ser um número inteiro",
    "float_parsing": "deve ser um número",
    "literal_error": "valor não permitido; opções: {expected}",
    "string_type": "deve ser um texto",
    "json_invalid": "JSON inválido",
}


def _traduzir_erro_de_validacao(erro: dict[str, Any]) -> dict[str, Any]:
    campo = ".".join(str(parte) for parte in erro.get("loc", []) if parte not in ("body", "query", "path"))
    tipo = erro.get("type", "")
    mensagem = erro.get("msg", "valor inválido")
    if tipo == "value_error":
        mensagem = mensagem.removeprefix("Value error, ")
    elif tipo in MENSAGENS_DE_VALIDACAO:
        try:
            mensagem = MENSAGENS_DE_VALIDACAO[tipo].format(**(erro.get("ctx") or {}))
        except (KeyError, IndexError):
            mensagem = MENSAGENS_DE_VALIDACAO[tipo]
    return {"campo": campo or "(raiz)", "mensagem": mensagem, "tipo": tipo}


def criar_aplicacao(
    *,
    titulo: str,
    descricao: str,
    servico: str,
    origens_cors: list[str],
    ciclo_de_vida: Callable[[FastAPI], AbstractAsyncContextManager[None]] | None = None,
    tags: list[dict[str, str]] | None = None,
    versao: str = "1.0.0",
) -> FastAPI:
    app = FastAPI(
        title=titulo,
        description=descricao,
        version=versao,
        lifespan=ciclo_de_vida,
        openapi_tags=tags,
        docs_url="/docs",
        redoc_url="/redoc",
        swagger_ui_parameters={"docExpansion": "list", "displayRequestDuration": True, "tryItOutEnabled": True},
    )
    app.state.nome_do_servico = servico

    @app.get("/", include_in_schema=False)
    async def raiz() -> RedirectResponse:
        return RedirectResponse(url="/docs")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origens_cors,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[CABECALHO_DE_CORRELACAO],
    )

    @app.middleware("http")
    async def propagar_correlacao(request: Request, chamar_proximo):  # type: ignore[no-untyped-def]
        correlation_id = request.headers.get(CABECALHO_DE_CORRELACAO) or novo_correlation_id()
        token = correlation_id_atual.set(correlation_id)
        inicio = time.perf_counter()
        try:
            resposta = await chamar_proximo(request)
        finally:
            correlation_id_atual.reset(token)
        duracao_ms = round((time.perf_counter() - inicio) * 1000, 2)
        resposta.headers[CABECALHO_DE_CORRELACAO] = correlation_id
        rota_silenciosa = request.url.path in ("/saude", "/openapi.json") or request.url.path.startswith("/docs")
        if not rota_silenciosa:
            token = correlation_id_atual.set(correlation_id)
            logger.info(
                "requisição atendida",
                metodo=request.method,
                caminho=request.url.path,
                status=resposta.status_code,
                duracaoMs=duracao_ms,
            )
            correlation_id_atual.reset(token)
        return resposta

    @app.exception_handler(ProblemaHttp)
    async def tratar_problema(request: Request, erro: ProblemaHttp) -> JSONResponse:
        return JSONResponse(
            status_code=erro.status,
            content=erro.como_dicionario(request.url.path),
            media_type=TIPO_PROBLEMA,
        )

    @app.exception_handler(RequestValidationError)
    async def tratar_validacao(request: Request, erro: RequestValidationError) -> JSONResponse:
        erros = [_traduzir_erro_de_validacao(item) for item in erro.errors()]
        return JSONResponse(
            status_code=422,
            content={
                "type": "https://pricehub.dev/problemas/validacao",
                "title": "Dados inválidos",
                "status": 422,
                "detail": "A requisição não passou nos validadores da API.",
                "instance": request.url.path,
                "erros": erros,
            },
            media_type=TIPO_PROBLEMA,
        )

    @app.exception_handler(Exception)
    async def tratar_inesperado(request: Request, erro: Exception) -> JSONResponse:
        logger.erro("erro não tratado", excecao=True, caminho=request.url.path)
        return JSONResponse(
            status_code=500,
            content={
                "type": "about:blank",
                "title": "Erro interno",
                "status": 500,
                "detail": "Erro inesperado no servidor. Consulte os logs pelo correlationId.",
                "instance": request.url.path,
            },
            media_type=TIPO_PROBLEMA,
        )

    return app


def registrar_saude(app: FastAPI, verificacoes: dict[str, VerificacaoDeSaude]) -> None:
    """Expõe ``GET /saude``. Responde 503 se alguma dependência falhar."""

    @app.get("/saude", tags=["saude"], summary="Situação do serviço e de suas dependências", response_model=RespostaDeSaude)
    async def saude() -> JSONResponse:
        resultados: dict[str, bool] = {}
        for nome, verificar in verificacoes.items():
            try:
                resultados[nome] = await asyncio.wait_for(verificar(), timeout=2)
            except Exception:  # noqa: BLE001 - qualquer falha conta como indisponível
                resultados[nome] = False
        todas_ok = all(resultados.values())
        corpo = RespostaDeSaude(
            status="ok" if todas_ok else "degradado",
            servico=app.state.nome_do_servico,
            instante=agora_utc().isoformat(),
            verificacoes=resultados,
        )
        return JSONResponse(status_code=200 if todas_ok else 503, content=corpo.model_dump())
