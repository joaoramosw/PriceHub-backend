"""Logs estruturados em JSON com propagação do identificador de correlação.

Cada linha de log carrega o nome do serviço e o ``correlationId`` da operação em
andamento. É esse identificador que permite seguir uma alteração de preço desde
a farmácia até o catálogo, atravessando HTTP e RabbitMQ.
"""

from __future__ import annotations

import json
import logging
import sys
import uuid
from contextvars import ContextVar
from typing import Any

from pricehub_common.tempo import agora_utc

correlation_id_atual: ContextVar[str | None] = ContextVar("correlation_id_atual", default=None)

_nome_do_servico = "pricehub"


def novo_correlation_id() -> str:
    return str(uuid.uuid4())


def obter_correlation_id() -> str:
    """Devolve o correlationId do contexto atual ou cria um novo."""
    atual = correlation_id_atual.get()
    if atual:
        return atual
    gerado = novo_correlation_id()
    correlation_id_atual.set(gerado)
    return gerado


class FormatadorJson(logging.Formatter):
    """Converte cada registro em uma linha JSON (formato adequado para coleta e busca)."""

    def format(self, registro: logging.LogRecord) -> str:
        linha: dict[str, Any] = {
            "nivel": registro.levelname.lower(),
            "instante": agora_utc().isoformat(),
            "servico": _nome_do_servico,
            "modulo": registro.name,
            "mensagem": registro.getMessage(),
        }
        correlation_id = correlation_id_atual.get()
        if correlation_id:
            linha["correlationId"] = correlation_id
        campos_extras = getattr(registro, "campos", None)
        if isinstance(campos_extras, dict):
            linha.update(campos_extras)
        if registro.exc_info:
            linha["erro"] = self.formatException(registro.exc_info)
        return json.dumps(linha, ensure_ascii=False, default=str)


class LoggerEstruturado:
    """Pequeno invólucro que aceita campos nomeados: ``logger.info("msg", farmaciaId="x")``."""

    def __init__(self, nome: str) -> None:
        self._logger = logging.getLogger(nome)

    def _registrar(self, nivel: int, mensagem: str, campos: dict[str, Any], exc_info: bool = False) -> None:
        self._logger.log(nivel, mensagem, extra={"campos": campos}, exc_info=exc_info)

    def debug(self, mensagem: str, **campos: Any) -> None:
        self._registrar(logging.DEBUG, mensagem, campos)

    def info(self, mensagem: str, **campos: Any) -> None:
        self._registrar(logging.INFO, mensagem, campos)

    def aviso(self, mensagem: str, **campos: Any) -> None:
        self._registrar(logging.WARNING, mensagem, campos)

    def erro(self, mensagem: str, excecao: bool = False, **campos: Any) -> None:
        self._registrar(logging.ERROR, mensagem, campos, exc_info=excecao)


def configurar_logs(nome_do_servico: str, nivel: str = "INFO") -> None:
    global _nome_do_servico
    _nome_do_servico = nome_do_servico

    saida_padrao = logging.StreamHandler(sys.stdout)
    saida_padrao.setFormatter(FormatadorJson())

    raiz = logging.getLogger()
    raiz.handlers.clear()
    raiz.addHandler(saida_padrao)
    raiz.setLevel(nivel.upper())

    # Bibliotecas muito verbosas ficam em WARNING para não poluir a evidência.
    for ruidoso in ("aio_pika", "aiormq", "httpx", "httpcore", "uvicorn.access", "sqlalchemy.engine"):
        logging.getLogger(ruidoso).setLevel(logging.WARNING)


def obter_logger(nome: str) -> LoggerEstruturado:
    return LoggerEstruturado(nome)
