"""Adaptador da BioFarma Verde: camelCase, preço em reais, dose junto do princípio ativo."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from pydantic.alias_generators import to_camel

from app.adaptadores.base import (
    AdaptadorDeFarmacia,
    CatalogoBaixado,
    NotificacaoInterpretada,
    PayloadInvalidoError,
)
from app.adaptadores.normalizacao import (
    ValorNaoInterpretadoError,
    interpretar_apresentacao,
    interpretar_concentracao,
    normalizar_espacos,
    principio_sem_dose,
    reais_para_centavos,
    registro_ms_somente_digitos,
)
from pricehub_common.eventos import OfertaCanonica


class ProdutoBioFarma(BaseModel):
    """Contrato da API nativa da BioFarma (o "adaptee")."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: int
    sku: str = Field(min_length=1)
    nome: str = Field(min_length=1)
    dosagem: str
    apresentacao: str
    principio_ativo: str
    laboratorio: str | None = None
    registro_ms: str | None = Field(default=None, alias="registroMS")
    categoria: str | None = None
    preco: float = Field(gt=0)
    atualizado_em: datetime | None = None


class WebhookBioFarma(BaseModel):
    evento: str
    produto: dict[str, Any] | None = None
    produtos: list[dict[str, Any]] | None = None


class AdaptadorBioFarma(AdaptadorDeFarmacia):
    farmacia_id = "biofarma"
    farmacia_nome = "BioFarma Verde"
    modo = "webhook"
    modelo_nativo = ProdutoBioFarma

    async def baixar_catalogo(self, etag: str | None = None) -> CatalogoBaixado:
        resposta = await self.cliente.buscar_json(f"{self.url_base}/api/produtos")
        if not isinstance(resposta.corpo, list):
            raise PayloadInvalidoError(self.farmacia_id, "esperada uma lista de produtos")
        return CatalogoBaixado(itens=resposta.corpo, paginas_brutas=[resposta.corpo])

    def identificar(self, item_bruto: dict[str, Any]) -> str:
        return item_bruto["sku"]

    def adaptar(self, item: ProdutoBioFarma, coletado_em: datetime) -> OfertaCanonica:
        forma, quantidade = interpretar_apresentacao(item.apresentacao)
        try:
            concentracao = interpretar_concentracao(item.dosagem)
        except ValorNaoInterpretadoError:
            concentracao = interpretar_concentracao(item.principio_ativo)
        return OfertaCanonica(
            farmacia_id=self.farmacia_id,
            farmacia_nome=self.farmacia_nome,
            codigo_externo=item.sku,
            nome=normalizar_espacos(f"{item.nome} {item.dosagem}"),
            principio_ativo=principio_sem_dose(item.principio_ativo),
            concentracao=concentracao,
            forma=forma,
            quantidade=quantidade,
            fabricante=item.laboratorio,
            registro_ms=registro_ms_somente_digitos(item.registro_ms),
            categoria=item.categoria,
            preco_centavos=reais_para_centavos(item.preco),
            url_do_produto=self.url_do_produto(item.sku),
            atualizado_na_origem_em=item.atualizado_em,
            coletado_em=coletado_em,
        )

    def interpretar_webhook(self, payload: Any) -> NotificacaoInterpretada:
        try:
            webhook = WebhookBioFarma.model_validate(payload)
        except ValidationError as erro:
            raise PayloadInvalidoError(self.farmacia_id, "esperado { evento, produto | produtos }") from erro
        if webhook.evento == "carga_completa" and webhook.produtos is not None:
            return NotificacaoInterpretada("catalogo-completo", itens=webhook.produtos)
        if webhook.evento in ("preco_alterado", "produto_atualizado") and webhook.produto:
            return NotificacaoInterpretada("atualizacao", itens=[webhook.produto])
        if webhook.evento == "produto_removido" and webhook.produto:
            return NotificacaoInterpretada("remocao", codigos_removidos=[str(webhook.produto.get("sku"))])
        return NotificacaoInterpretada("ignorar")
