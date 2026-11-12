from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

IdentificadorDeFarmacia = Literal["biofarma", "farmaazul", "drogapopular"]


class EsquemaCamelCase(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class ItemDescartadoSaida(EsquemaCamelCase):
    codigo_externo: str
    motivo: str


class ResumoDaColetaSaida(EsquemaCamelCase):
    coleta_id: str | None
    farmacia_id: str
    origem: str
    catalogo_completo: bool
    itens_recebidos: int
    ofertas_publicadas: int = Field(description="Ofertas novas ou alteradas que viraram eventos")
    ofertas_sem_alteracao: int = Field(description="Ofertas iguais às já publicadas (não geram evento)")
    descartadas: list[ItemDescartadoSaida]
    removidas: int
    duracao_ms: float = Field(description="Tempo até o ms-ingestao aceitar e publicar a coleta")
    nao_modificado: bool = Field(description="True quando o ETag indicou que nada mudou")
    correlation_id: str


class EstadoDaFarmaciaSaida(EsquemaCamelCase):
    farmacia_id: str
    farmacia_nome: str
    modo: str
    url_base: str
    situacao: str
    ultima_coleta_em: datetime | None
    ultima_verificacao_em: datetime | None
    ultimo_erro: str | None
    coletas_realizadas: int
    falhas_consecutivas: int


class ColetaResumida(EsquemaCamelCase):
    id: str
    farmacia_id: str
    origem: str
    situacao: str
    correlation_id: str
    itens_recebidos: int
    ofertas_publicadas: int
    ofertas_sem_alteracao: int
    descartadas: int
    removidas: int
    duracao_ms: float
    erro: str | None
    recebida_em: datetime


class ColetaDetalhada(ColetaResumida):
    payload: Any = Field(description="Conteúdo bruto enviado pela farmácia, no formato dela")
