"""Eventos internos da farmácia: o que o *sujeito* (catálogo) avisa aos observadores."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from app.dominio.produto import Produto
from pricehub_common.logs import obter_correlation_id
from pricehub_common.tempo import agora_utc


@dataclass(frozen=True)
class EventoDoCatalogo:
    instante: datetime = field(default_factory=agora_utc, kw_only=True)
    correlation_id: str = field(default_factory=obter_correlation_id, kw_only=True)

    @property
    def nome(self) -> str:
        return type(self).__name__


@dataclass(frozen=True)
class CatalogoCarregado(EventoDoCatalogo):
    """Catálogo inteiro (re)carregado: na subida da loja ou ao restaurar a carga inicial."""

    produtos: list[Produto]


@dataclass(frozen=True)
class ProdutoCadastrado(EventoDoCatalogo):
    produto: Produto


@dataclass(frozen=True)
class ProdutoAtualizado(EventoDoCatalogo):
    produto: Produto


@dataclass(frozen=True)
class PrecoAlterado(EventoDoCatalogo):
    produto: Produto
    preco_anterior_centavos: int


@dataclass(frozen=True)
class ProdutoRemovido(EventoDoCatalogo):
    produto: Produto
