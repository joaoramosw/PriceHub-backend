"""BioFarma Verde: API REST em camelCase, preço em reais (float), envia webhooks."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.dominio.catalogo import CatalogoDaFarmacia, ProdutoInexistenteError
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


class ProdutoBioFarma(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: int
    sku: str
    nome: str
    dosagem: str
    apresentacao: str
    principio_ativo: str = Field(description="Princípio ativo com a dose, ex.: 'Losartana Potássica 50mg'")
    laboratorio: str
    registro_ms: str | None = Field(default=None, serialization_alias="registroMS")
    categoria: str
    preco: float = Field(description="Preço em reais")
    atualizado_em: datetime


def para_biofarma(produto: Produto) -> dict[str, Any]:
    return ProdutoBioFarma(
        id=produto.id,
        sku=produto.codigo,
        nome=produto.nome_comercial,
        dosagem=produto.concentracao,
        apresentacao=produto.apresentacao,
        principio_ativo=f"{produto.principio_ativo} {produto.concentracao}",
        laboratorio=produto.fabricante,
        registro_ms=produto.registro_ms,
        categoria=produto.categoria,
        preco=round(produto.preco_centavos / 100, 2),
        atualizado_em=produto.atualizado_em,
    ).model_dump(mode="json", by_alias=True)


class FormatoBioFarma(FormatoDaFarmacia):
    farmacia_id = "biofarma"
    nome = "BioFarma Verde"
    modo_de_integracao = "webhook"
    perfil_de_preco = "caro"
    tema = {"cor": "verde", "primaria": "#15803d", "clara": "#dcfce7"}
    rotas_nativas = ["GET /api/produtos", "GET /api/produtos/{id}"]

    def registrar_rotas(self, roteador: APIRouter, catalogo: CatalogoDaFarmacia) -> None:
        @roteador.get(
            "/api/produtos",
            tags=["api-nativa"],
            summary="Catálogo completo no formato BioFarma (camelCase, preço em reais)",
            response_model=list[dict[str, Any]],
        )
        async def listar_produtos() -> list[dict[str, Any]]:
            return [para_biofarma(produto) for produto in catalogo.listar()]

        @roteador.get("/api/produtos/{produto_id}", tags=["api-nativa"], summary="Um produto no formato BioFarma")
        async def detalhar_produto(produto_id: int) -> dict[str, Any]:
            try:
                return para_biofarma(catalogo.buscar(produto_id))
            except ProdutoInexistenteError as erro:
                raise HTTPException(status_code=404, detail=str(erro)) from erro

    def payload_de_webhook(self, evento: EventoDoCatalogo) -> dict[str, Any] | None:
        if isinstance(evento, CatalogoCarregado):
            return {"evento": "carga_completa", "produtos": [para_biofarma(produto) for produto in evento.produtos]}
        if isinstance(evento, PrecoAlterado):
            return {
                "evento": "preco_alterado",
                "precoAnterior": round(evento.preco_anterior_centavos / 100, 2),
                "produto": para_biofarma(evento.produto),
            }
        if isinstance(evento, ProdutoCadastrado | ProdutoAtualizado):
            return {"evento": "produto_atualizado", "produto": para_biofarma(evento.produto)}
        if isinstance(evento, ProdutoRemovido):
            return {"evento": "produto_removido", "produto": para_biofarma(evento.produto)}
        return None
