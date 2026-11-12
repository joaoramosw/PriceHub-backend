"""Situação de cada integração (disponível, indisponível, última coleta) vista pelo ms-ingestao."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

from pricehub_common.tempo import agora_utc

SituacaoDaIntegracao = Literal["desconhecida", "disponivel", "indisponivel"]


@dataclass
class EstadoDaFarmacia:
    farmacia_id: str
    situacao: SituacaoDaIntegracao = "desconhecida"
    ultima_coleta_em: datetime | None = None
    ultima_verificacao_em: datetime | None = None
    ultimo_erro: str | None = None
    etag: str | None = None
    falhas_consecutivas: int = 0
    coletas_realizadas: int = 0
    catalogo_recebido: bool = field(default=False)


class EstadoDasFarmacias:
    def __init__(self, farmacia_ids: list[str]) -> None:
        self._estados = {farmacia_id: EstadoDaFarmacia(farmacia_id) for farmacia_id in farmacia_ids}

    def de(self, farmacia_id: str) -> EstadoDaFarmacia:
        return self._estados[farmacia_id]

    def todos(self) -> list[EstadoDaFarmacia]:
        return list(self._estados.values())

    def registrar_verificacao_sem_mudanca(self, farmacia_id: str) -> None:
        estado = self.de(farmacia_id)
        estado.situacao = "disponivel"
        estado.ultima_verificacao_em = agora_utc()
        estado.falhas_consecutivas = 0

    def registrar_coleta(self, farmacia_id: str, catalogo_completo: bool, etag: str | None = None) -> None:
        estado = self.de(farmacia_id)
        agora = agora_utc()
        estado.situacao = "disponivel"
        estado.ultima_coleta_em = agora
        estado.ultima_verificacao_em = agora
        estado.ultimo_erro = None
        estado.falhas_consecutivas = 0
        estado.coletas_realizadas += 1
        estado.catalogo_recebido = estado.catalogo_recebido or catalogo_completo
        if etag:
            estado.etag = etag

    def registrar_falha(self, farmacia_id: str, erro: str) -> bool:
        """Registra a falha e devolve True só na transição para indisponível.

        Assim o evento ``ingestao.farmacia.indisponivel`` é publicado uma vez por
        queda, e não a cada tentativa de polling.
        """
        estado = self.de(farmacia_id)
        mudou_agora = estado.situacao != "indisponivel"
        estado.situacao = "indisponivel"
        estado.ultima_verificacao_em = agora_utc()
        estado.ultimo_erro = erro
        estado.falhas_consecutivas += 1
        estado.etag = None
        return mudou_agora
