"""FarmaAzul Confiança: API paginada em snake_case, preço em centavos, data com fuso -03:00, envia webhooks."""

from __future__ import annotations

import math
import re
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.dominio.catalogo import CatalogoDaFarmacia
from app.dominio.eventos import (
    CatalogoCarregado,
    EventoDoCatalogo,
    PrecoAlterado,
    ProdutoAtualizado,
    ProdutoCadastrado,
    ProdutoRemovido,
)
from app.dominio.produto import Produto
from app.formatos.base import FormatoDaFarmacia
from pricehub_common.tempo import FUSO_DE_BRASILIA


class ItemFarmaAzul(BaseModel):
    codigo: str
    descricao: str
    principio_ativo: str
    concentracao: str
    forma_farmaceutica: str
    quantidade_embalagem: int
    fabricante: str
    registro_anvisa: str | None
    preco_centavos: int
    ultima_atualizacao: str


class PaginaFarmaAzul(BaseModel):
    items: list[ItemFarmaAzul]
    page: int
    page_size: int
    total_pages: int
    total_items: int


def para_farmaazul(produto: Produto) -> dict[str, Any]:
    registro_somente_digitos = re.sub(r"\D", "", produto.registro_ms or "") or None
    return ItemFarmaAzul(
        codigo=produto.codigo,
        descricao=f"{produto.principio_ativo} {produto.concentracao} - {produto.apresentacao}",
        principio_ativo=produto.principio_ativo,
        concentracao=produto.concentracao,
        forma_farmaceutica=produto.forma_farmaceutica,
        quantidade_embalagem=produto.quantidade_embalagem,
        fabricante=produto.fabricante,
        registro_anvisa=registro_somente_digitos,
        preco_centavos=produto.preco_centavos,
        ultima_atualizacao=produto.atualizado_em.astimezone(FUSO_DE_BRASILIA).isoformat(timespec="seconds"),
    ).model_dump()


class FormatoFarmaAzul(FormatoDaFarmacia):
    farmacia_id = "farmaazul"
    nome = "FarmaAzul Confiança"
    modo_de_integracao = "webhook"
    perfil_de_preco = "mediano"
    tema = {"cor": "azul", "primaria": "#1d4ed8", "clara": "#dbeafe"}
    rotas_nativas = ["GET /v1/catalogo?page=1&page_size=5"]

    def registrar_rotas(self, roteador: APIRouter, catalogo: CatalogoDaFarmacia) -> None:
        @roteador.get(
            "/v1/catalogo",
            tags=["api-nativa"],
            summary="Catálogo paginado no formato FarmaAzul (snake_case, preço em centavos)",
            response_model=PaginaFarmaAzul,
        )
        async def listar_catalogo(
            page: int = Query(default=1, ge=1, description="Página (começa em 1)"),
            page_size: int = Query(default=5, ge=1, le=50, description="Itens por página"),
        ) -> PaginaFarmaAzul:
            produtos = catalogo.listar()
            inicio = (page - 1) * page_size
            pagina = produtos[inicio : inicio + page_size]
            return PaginaFarmaAzul(
                items=[ItemFarmaAzul(**para_farmaazul(produto)) for produto in pagina],
                page=page,
                page_size=page_size,
                total_pages=max(1, math.ceil(len(produtos) / page_size)),
                total_items=len(produtos),
            )

    def payload_de_webhook(self, evento: EventoDoCatalogo) -> dict[str, Any] | None:
        if isinstance(evento, CatalogoCarregado):
            return {"type": "catalog.snapshot", "data": {"items": [para_farmaazul(produto) for produto in evento.produtos]}}
        if isinstance(evento, PrecoAlterado):
            return {"type": "price.updated", "data": para_farmaazul(evento.produto)}
        if isinstance(evento, ProdutoCadastrado | ProdutoAtualizado):
            return {"type": "product.upserted", "data": para_farmaazul(evento.produto)}
        if isinstance(evento, ProdutoRemovido):
            return {"type": "product.deleted", "data": {"codigo": evento.produto.codigo}}
        return None
