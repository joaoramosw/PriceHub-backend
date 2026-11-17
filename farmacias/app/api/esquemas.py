"""Esquemas de entrada e saída da API de gestão da farmácia (validadores da Web API)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

PRECO_MAXIMO_CENTAVOS = 10_000_000


class EsquemaCamelCase(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class NovoPreco(EsquemaCamelCase):
    preco_centavos: int = Field(ge=1, le=PRECO_MAXIMO_CENTAVOS, description="Novo preço em centavos", examples=[1290])


class ProdutoSaida(EsquemaCamelCase):
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
    atualizado_em: datetime


class ResultadoDaOperacao(EsquemaCamelCase):
    produto: ProdutoSaida | None
    preco_anterior_centavos: int | None = None
    notificacao: Literal["webhook-agendado", "aguardando-polling"]
    correlation_id: str = Field(description="Use no painel de eventos para seguir a propagação")


class InformacoesDaLoja(EsquemaCamelCase):
    farmacia_id: str
    nome: str
    modo_de_integracao: Literal["webhook", "polling"]
    perfil_de_preco: str
    tema: dict[str, str]
    total_de_produtos: int
    versao_do_catalogo: int
    rotas_nativas: list[str]


class ResultadoDaRestauracao(EsquemaCamelCase):
    produtos: int
    notificacao: Literal["webhook-agendado", "aguardando-polling"]
    correlation_id: str


class ConfiguracaoDaSimulacao(EsquemaCamelCase):
    ativa: bool | None = Field(default=None, description="Liga ou desliga as alterações programadas")
    intervalo_s: float | None = Field(default=None, ge=0.5, le=600, description="Segundos entre duas alterações", examples=[5])
