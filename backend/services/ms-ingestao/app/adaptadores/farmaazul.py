"""Adaptador da FarmaAzul Confiança: paginação, snake_case, preço em centavos."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from app.adaptadores.base import (
    AdaptadorDeFarmacia,
    CatalogoBaixado,
    NotificacaoInterpretada,
    PayloadInvalidoError,
)
from app.adaptadores.normalizacao import (
    interpretar_concentracao,
    interpretar_forma,
    registro_ms_somente_digitos,
    unidade_de_quantidade_para,
)
from pricehub_common.eventos import OfertaCanonica, Quantidade

TAMANHO_DA_PAGINA = 20
LIMITE_DE_PAGINAS = 100


class ItemFarmaAzul(BaseModel):
    codigo: str = Field(min_length=1)
    descricao: str = Field(min_length=1)
    principio_ativo: str = Field(min_length=1)
    concentracao: str
    forma_farmaceutica: str
    quantidade_embalagem: float = Field(gt=0)
    fabricante: str | None = None
    registro_anvisa: str | None = None
    preco_centavos: int = Field(gt=0)
    ultima_atualizacao: datetime | None = None


class PaginaFarmaAzul(BaseModel):
    items: list[dict[str, Any]]
    page: int = Field(ge=1)
    total_pages: int = Field(ge=0)


class WebhookFarmaAzul(BaseModel):
    type: str
    data: dict[str, Any]


class AdaptadorFarmaAzul(AdaptadorDeFarmacia):
    farmacia_id = "farmaazul"
    farmacia_nome = "FarmaAzul Confiança"
    modo = "webhook"
    modelo_nativo = ItemFarmaAzul

    async def baixar_catalogo(self, etag: str | None = None) -> CatalogoBaixado:
        itens: list[dict[str, Any]] = []
        paginas_brutas: list[Any] = []
        for numero_da_pagina in range(1, LIMITE_DE_PAGINAS + 1):
            url = f"{self.url_base}/v1/catalogo?page={numero_da_pagina}&page_size={TAMANHO_DA_PAGINA}"
            resposta = await self.cliente.buscar_json(url)
            try:
                pagina = PaginaFarmaAzul.model_validate(resposta.corpo)
            except ValidationError as erro:
                raise PayloadInvalidoError(self.farmacia_id, f"página {numero_da_pagina} fora do contrato") from erro
            paginas_brutas.append(resposta.corpo)
            itens.extend(pagina.items)
            if numero_da_pagina >= pagina.total_pages:
                break
        return CatalogoBaixado(itens=itens, paginas_brutas=paginas_brutas)

    def identificar(self, item_bruto: dict[str, Any]) -> str:
        return item_bruto["codigo"]

    def adaptar(self, item: ItemFarmaAzul, coletado_em: datetime) -> OfertaCanonica:
        forma = interpretar_forma(item.forma_farmaceutica)
        quantidade = Quantidade(valor=item.quantidade_embalagem, unidade=unidade_de_quantidade_para(forma))
        return OfertaCanonica(
            farmacia_id=self.farmacia_id,
            farmacia_nome=self.farmacia_nome,
            codigo_externo=item.codigo,
            nome=item.descricao,
            principio_ativo=item.principio_ativo,
            concentracao=interpretar_concentracao(item.concentracao),
            forma=forma,
            quantidade=quantidade,
            fabricante=item.fabricante,
            registro_ms=registro_ms_somente_digitos(item.registro_anvisa),
            categoria=None,
            preco_centavos=item.preco_centavos,
            url_do_produto=self.url_do_produto(item.codigo),
            atualizado_na_origem_em=item.ultima_atualizacao,
            coletado_em=coletado_em,
        )

    def interpretar_webhook(self, payload: Any) -> NotificacaoInterpretada:
        try:
            webhook = WebhookFarmaAzul.model_validate(payload)
        except ValidationError as erro:
            raise PayloadInvalidoError(self.farmacia_id, "esperado { type, data }") from erro
        if webhook.type == "catalog.snapshot":
            return NotificacaoInterpretada("catalogo-completo", itens=list(webhook.data.get("items", [])))
        if webhook.type in ("price.updated", "product.upserted"):
            return NotificacaoInterpretada("atualizacao", itens=[webhook.data])
        if webhook.type == "product.deleted":
            return NotificacaoInterpretada("remocao", codigos_removidos=[str(webhook.data.get("codigo"))])
        return NotificacaoInterpretada("ignorar")
