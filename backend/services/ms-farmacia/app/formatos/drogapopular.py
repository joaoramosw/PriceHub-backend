"""DrogaPopular Express: sistema legado. Publica um arquivo JSON com campos em
MAIÚSCULAS, descrição abreviada, preço em texto com vírgula e data no padrão
brasileiro. Não envia webhooks: o PriceHub precisa consultar periodicamente
(polling). O ETag evita baixar e processar de novo um arquivo que não mudou.
"""

from __future__ import annotations

import unicodedata
from typing import Any

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from app.dominio.catalogo import CatalogoDaFarmacia
from app.dominio.produto import Produto
from app.formatos.base import FormatoDaFarmacia
from pricehub_common.tempo import FUSO_DE_BRASILIA, agora_utc

ABREVIACOES_DE_FORMA = (
    ("liberação prolongada", "COMP LIB PROL"),
    ("revestido", "COMP REV"),
    ("cápsula", "CAPS"),
    ("comprimido", "COMP"),
)


def _maiusculas_sem_acento(texto: str) -> str:
    decomposto = unicodedata.normalize("NFD", texto)
    return "".join(caractere for caractere in decomposto if unicodedata.category(caractere) != "Mn").upper()


def descricao_legada(produto: Produto) -> str:
    principio = _maiusculas_sem_acento(produto.principio_ativo)
    concentracao = produto.concentracao.upper().replace(" ", "")
    if produto.eh_liquido:
        return f"{principio} {concentracao} GTS FR {produto.quantidade_embalagem}ML"
    forma = produto.forma_farmaceutica.lower()
    abreviacao = next((sigla for termo, sigla in ABREVIACOES_DE_FORMA if termo in forma), "UN")
    return f"{principio} {concentracao} C/{produto.quantidade_embalagem} {abreviacao}"


def para_drogapopular(produto: Produto) -> dict[str, Any]:
    reais, centavos = divmod(produto.preco_centavos, 100)
    return {
        "COD": produto.codigo,
        "DESCRICAO": descricao_legada(produto),
        "LAB": _maiusculas_sem_acento(produto.fabricante),
        "PRECO": f"{reais},{centavos:02d}",
    }


class FormatoDrogaPopular(FormatoDaFarmacia):
    farmacia_id = "drogapopular"
    nome = "DrogaPopular Express"
    modo_de_integracao = "polling"
    perfil_de_preco = "barato"
    tema = {"cor": "vermelho", "primaria": "#b91c1c", "clara": "#fee2e2"}
    rotas_nativas = ["GET /legacy/precos.json"]

    def registrar_rotas(self, roteador: APIRouter, catalogo: CatalogoDaFarmacia) -> None:
        @roteador.get(
            "/legacy/precos.json",
            tags=["api-nativa"],
            summary="Arquivo legado de preços (sem webhook; consultado por polling, com ETag)",
            responses={304: {"description": "Catálogo não mudou desde o ETag informado"}},
        )
        async def arquivo_de_precos(request: Request) -> Response:
            etag = f'W/"v{catalogo.versao}"'
            if request.headers.get("if-none-match") == etag:
                return Response(status_code=304, headers={"ETag": etag})
            agora_em_brasilia = agora_utc().astimezone(FUSO_DE_BRASILIA)
            corpo = {
                "loja": "DROGAPOPULAR EXPRESS",
                "gerado_em": agora_em_brasilia.strftime("%d/%m/%Y %H:%M"),
                "produtos": [para_drogapopular(produto) for produto in catalogo.listar()],
            }
            return JSONResponse(corpo, headers={"ETag": etag})
