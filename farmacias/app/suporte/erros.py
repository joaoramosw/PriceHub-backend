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
    tipo = "https://farmacia.local/problemas/requisicao-invalida"


class RecursoNaoEncontrado(ProblemaHttp):
    status = 404
    titulo = "Recurso não encontrado"
    tipo = "https://farmacia.local/problemas/nao-encontrado"
