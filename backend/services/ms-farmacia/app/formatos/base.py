"""Cada farmácia fala "a sua língua": rotas, nomes de campos, unidades e datas próprios.

Essa heterogeneidade é proposital. Ela reproduz o problema real de integrar
fontes independentes e é o que justifica o padrão Adapter no ms-ingestao.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Literal

from fastapi import APIRouter

from app.dominio.catalogo import CatalogoDaFarmacia
from app.dominio.eventos import EventoDoCatalogo

ModoDeIntegracao = Literal["webhook", "polling"]


class FormatoDaFarmacia(ABC):
    farmacia_id: str
    nome: str
    modo_de_integracao: ModoDeIntegracao
    perfil_de_preco: str
    tema: dict[str, str]
    rotas_nativas: list[str]

    @abstractmethod
    def registrar_rotas(self, roteador: APIRouter, catalogo: CatalogoDaFarmacia) -> None:
        """Registra as rotas públicas no formato próprio desta farmácia."""

    def payload_de_webhook(self, evento: EventoDoCatalogo) -> dict[str, Any] | None:
        """Corpo do webhook para o evento; ``None`` quando a farmácia não envia webhooks."""
        return None
