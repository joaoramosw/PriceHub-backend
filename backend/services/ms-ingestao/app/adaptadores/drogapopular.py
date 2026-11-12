"""Adaptador da DrogaPopular Express: arquivo legado consultado por polling.

Tudo vem em uma descrição abreviada ("LOSARTANA POTASSICA 50MG C/30 COMP REV"),
então o adaptador precisa decompor o texto em princípio ativo, dose, forma e
quantidade. O ETag evita reprocessar um arquivo que não mudou.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from app.adaptadores.base import AdaptadorDeFarmacia, CatalogoBaixado, PayloadInvalidoError
from app.adaptadores.normalizacao import (
    ValorNaoInterpretadoError,
    data_brasileira_para_utc,
    interpretar_apresentacao,
    interpretar_concentracao,
    normalizar_espacos,
    texto_em_reais_para_centavos,
)
from pricehub_common.eventos import OfertaCanonica

PADRAO_DA_DESCRICAO = re.compile(
    r"^(?P<principio>.+?)\s+(?P<dose>\d+(?:[.,]\d+)?\s*(?:MG/ML|MCG|MG|G|ML))(?![A-Z])\s*(?P<resto>.*)$",
    re.IGNORECASE,
)


class ProdutoDrogaPopular(BaseModel):
    COD: str = Field(min_length=1)
    DESCRICAO: str = Field(min_length=1)
    LAB: str | None = None
    PRECO: str = Field(min_length=1)
    gerado_em: datetime | None = None


class ArquivoDrogaPopular(BaseModel):
    loja: str
    gerado_em: str
    produtos: list[dict[str, Any]]


def decompor_descricao(descricao: str) -> dict[str, Any]:
    texto = normalizar_espacos(descricao)
    partes = PADRAO_DA_DESCRICAO.match(texto)
    if not partes:
        raise ValorNaoInterpretadoError(f'descrição "{descricao}" sem concentração reconhecível')
    forma, quantidade = interpretar_apresentacao(partes.group("resto"))
    return {
        "principio_ativo": partes.group("principio").title(),
        "concentracao": interpretar_concentracao(partes.group("dose")),
        "forma": forma,
        "quantidade": quantidade,
    }


class AdaptadorDrogaPopular(AdaptadorDeFarmacia):
    farmacia_id = "drogapopular"
    farmacia_nome = "DrogaPopular Express"
    modo = "polling"
    modelo_nativo = ProdutoDrogaPopular

    async def baixar_catalogo(self, etag: str | None = None) -> CatalogoBaixado:
        resposta = await self.cliente.buscar_json(f"{self.url_base}/legacy/precos.json", etag=etag)
        if resposta.nao_modificado:
            return CatalogoBaixado(itens=[], paginas_brutas=[], etag=etag, nao_modificado=True)
        try:
            arquivo = ArquivoDrogaPopular.model_validate(resposta.corpo)
        except ValidationError as erro:
            raise PayloadInvalidoError(self.farmacia_id, "arquivo de preços fora do contrato") from erro
        gerado_em = data_brasileira_para_utc(arquivo.gerado_em)
        itens = [{**produto, "gerado_em": gerado_em} for produto in arquivo.produtos]
        return CatalogoBaixado(itens=itens, paginas_brutas=[resposta.corpo], etag=resposta.etag)

    def identificar(self, item_bruto: dict[str, Any]) -> str:
        return item_bruto["COD"]

    def adaptar(self, item: ProdutoDrogaPopular, coletado_em: datetime) -> OfertaCanonica:
        decomposta = decompor_descricao(item.DESCRICAO)
        return OfertaCanonica(
            farmacia_id=self.farmacia_id,
            farmacia_nome=self.farmacia_nome,
            codigo_externo=item.COD,
            nome=item.DESCRICAO,
            fabricante=item.LAB,
            registro_ms=None,
            categoria=None,
            preco_centavos=texto_em_reais_para_centavos(item.PRECO),
            url_do_produto=self.url_do_produto(item.COD),
            atualizado_na_origem_em=item.gerado_em,
            coletado_em=coletado_em,
            **decomposta,
        )
