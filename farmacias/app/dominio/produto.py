"""Modelo interno de produto da farmácia simulada.

Este é o modelo da *farmácia* (sistema externo), não do PriceHub. Cada farmácia
expõe esse mesmo conteúdo em um formato próprio, e é essa diferença de formato
que o PriceHub precisa resolver com o padrão Adapter.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import datetime

from app.suporte.tempo import agora_utc

FORMAS_LIQUIDAS = ("gotas", "suspensão", "suspensao", "xarope")

# De onde veio o preço atual: carga inicial da loja, edição na tela /admin ou simulação programada.
ORIGENS_DO_PRECO = ("carga-inicial", "manual", "programada")


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
    origem_do_preco: str = "carga-inicial"

    @property
    def eh_liquido(self) -> bool:
        forma_minuscula = self.forma_farmaceutica.lower()
        return any(termo in forma_minuscula for termo in FORMAS_LIQUIDAS)

    def alterar_preco(self, novo_preco_centavos: int, instante: datetime | None = None, origem: str = "manual") -> int:
        """Altera o preço e devolve o preço anterior."""
        if novo_preco_centavos <= 0:
            raise RegraDeNegocioVioladaError("o preço deve ser maior que zero")
        preco_anterior = self.preco_centavos
        self.preco_centavos = novo_preco_centavos
        self.atualizado_em = instante or agora_utc()
        self.origem_do_preco = origem
        return preco_anterior

    def copiar(self) -> Produto:
        return replace(self)
