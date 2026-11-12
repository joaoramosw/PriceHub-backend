"""Erros de aplicação convertidos em respostas ``application/problem+json`` (RFC 9457)."""

from __future__ import annotations

from typing import Any


class ProblemaHttp(Exception):
    """Erro esperado que vira uma resposta HTTP padronizada."""

    status: int = 500
    titulo: str = "Erro interno"
    tipo: str = "about:blank"

    def __init__(self, detalhe: str, **extensoes: Any) -> None:
        super().__init__(detalhe)
        self.detalhe = detalhe
        self.extensoes = extensoes

    def como_dicionario(self, instancia: str) -> dict[str, Any]:
        return {
            "type": self.tipo,
            "title": self.titulo,
            "status": self.status,
            "detail": self.detalhe,
            "instance": instancia,
            **self.extensoes,
        }


class RequisicaoInvalida(ProblemaHttp):
    status = 400
    titulo = "Requisição inválida"
    tipo = "https://pricehub.dev/problemas/requisicao-invalida"


class NaoAutorizado(ProblemaHttp):
    status = 401
    titulo = "Não autorizado"
    tipo = "https://pricehub.dev/problemas/nao-autorizado"


class RecursoNaoEncontrado(ProblemaHttp):
    status = 404
    titulo = "Recurso não encontrado"
    tipo = "https://pricehub.dev/problemas/nao-encontrado"


class Conflito(ProblemaHttp):
    status = 409
    titulo = "Conflito"
    tipo = "https://pricehub.dev/problemas/conflito"


class ServicoIndisponivel(ProblemaHttp):
    status = 503
    titulo = "Dependência indisponível"
    tipo = "https://pricehub.dev/problemas/servico-indisponivel"
