"""Envelope padrão de todos os eventos publicados no RabbitMQ.

O envelope separa os metadados (quem publicou, quando, qual versão do contrato,
qual operação de origem) do conteúdo de negócio (``dados``). Assim qualquer
consumidor, inclusive o serviço de log, consegue registrar e rastrear um evento
sem conhecer o significado dos dados.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from pricehub_common.tempo import agora_utc


class ModeloDeContrato(BaseModel):
    """Base dos contratos trafegados: atributos em snake_case no Python e camelCase no JSON."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    def para_json(self) -> dict[str, Any]:
        return self.model_dump(mode="json", by_alias=True)


class Envelope(ModeloDeContrato):
    id_do_evento: uuid.UUID = Field(default_factory=uuid.uuid4, description="Identificador único (usado na idempotência)")
    tipo: str = Field(description="Nome do evento no particípio passado, ex.: catalogo.oferta.atualizada")
    versao: int = Field(default=1, ge=1, description="Versão do contrato dos dados")
    ocorrido_em: datetime = Field(default_factory=agora_utc)
    correlation_id: str = Field(description="Identificador da operação que originou o evento")
    servico_de_origem: str = Field(description="Microsserviço produtor")
    dados: dict[str, Any] = Field(default_factory=dict)
