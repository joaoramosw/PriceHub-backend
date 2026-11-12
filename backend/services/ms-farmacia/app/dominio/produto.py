"""Modelo interno de produto da farmácia simulada.

Este é o modelo da *farmácia* (sistema externo), não do PriceHub. Cada farmácia
expõe esse mesmo conteúdo em um formato próprio, e é essa diferença de formato
que o PriceHub precisa resolver com o padrão Adapter.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import datetime

from pricehub_common.tempo import agora_utc

FORMAS_LIQUIDAS = ("gotas", "suspensão", "suspensao", "xarope")


class RegraDeNegocioVioladaError(ValueError):
    """Operação que o domínio da farmácia não aceita (ex.: preço zerado)."""


@dataclass
class Produto:
    id: int
    codigo: str
    nome_comercial: str
    principio_ativo: str
    concentracao: str
    forma_farmaceutica: str
    quantidade_embalagem: int
    apresentacao: str
    fabricante: str
    registro_ms: str | None
    categoria: str
    tarja: str
    descricao: str
    imagem: str | None
    preco_centavos: int
    atualizado_em: datetime = field(default_factory=agora_utc)

    @property
    def eh_liquido(self) -> bool:
        forma_minuscula = self.forma_farmaceutica.lower()
        return any(termo in forma_minuscula for termo in FORMAS_LIQUIDAS)

    def alterar_preco(self, novo_preco_centavos: int, instante: datetime | None = None) -> int:
        """Altera o preço e devolve o preço anterior."""
        if novo_preco_centavos <= 0:
            raise RegraDeNegocioVioladaError("o preço deve ser maior que zero")
        preco_anterior = self.preco_centavos
        self.preco_centavos = novo_preco_centavos
        self.atualizado_em = instante or agora_utc()
        return preco_anterior

    def copiar(self) -> Produto:
        return replace(self)


def apresentacao_padrao(forma_farmaceutica: str, quantidade_embalagem: int) -> str:
    forma_minuscula = forma_farmaceutica.lower()
    if any(termo in forma_minuscula for termo in FORMAS_LIQUIDAS):
        return f"Frasco com {quantidade_embalagem}ml"
    plural = "s" if quantidade_embalagem > 1 else ""
    return f"{quantidade_embalagem} unidade{plural} ({forma_farmaceutica})"
