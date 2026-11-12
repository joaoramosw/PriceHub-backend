"""Padrão Adapter (GAMMA et al., 1994) aplicado à integração com as farmácias.

* **Target** (interface que o PriceHub espera): ``OfertaCanonica``.
* **Adaptee** (interface incompatível): a API própria de cada farmácia.
* **Adapter**: uma subclasse de ``AdaptadorDeFarmacia`` por farmácia.

O núcleo do PriceHub (ms-catalogo) nunca conhece o formato de nenhuma farmácia.
Para integrar uma farmácia nova, cria-se um novo adaptador e o registra; nada
mais no sistema precisa mudar.

``converter`` é um *Template Method*: o algoritmo (validar cada item, adaptar,
separar o que foi descartado) é fixo e as subclasses preenchem só os passos
específicos (``identificar`` e ``adaptar``).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, ClassVar, Literal

from pydantic import BaseModel, ValidationError

from app.adaptadores.cliente_http import ClienteDaFarmacia
from pricehub_common.eventos import OfertaCanonica
from pricehub_common.tempo import agora_utc

ModoDeIntegracao = Literal["webhook", "polling"]
AcaoDoWebhook = Literal["atualizacao", "remocao", "catalogo-completo", "ignorar"]


class PayloadInvalidoError(ValueError):
    def __init__(self, farmacia_id: str, detalhe: str) -> None:
        super().__init__(f"payload inválido da farmácia {farmacia_id}: {detalhe}")


class WebhookNaoSuportadoError(Exception):
    pass


@dataclass
class ItemDescartado:
    codigo_externo: str
    motivo: str


@dataclass
class ResultadoDaConversao:
    ofertas: list[OfertaCanonica] = field(default_factory=list)
    descartados: list[ItemDescartado] = field(default_factory=list)


@dataclass
class NotificacaoInterpretada:
    acao: AcaoDoWebhook
    itens: list[dict[str, Any]] = field(default_factory=list)
    codigos_removidos: list[str] = field(default_factory=list)


@dataclass
class CatalogoBaixado:
    itens: list[dict[str, Any]]
    paginas_brutas: list[Any]
    etag: str | None = None
    nao_modificado: bool = False


class AdaptadorDeFarmacia(ABC):
    farmacia_id: ClassVar[str]
    farmacia_nome: ClassVar[str]
    modo: ClassVar[ModoDeIntegracao]
    modelo_nativo: ClassVar[type[BaseModel]]

    def __init__(self, url_base: str, url_das_vitrines: str, cliente: ClienteDaFarmacia) -> None:
        self.url_base = url_base.rstrip("/")
        self.url_das_vitrines = url_das_vitrines.rstrip("/")
        self.cliente = cliente

    # ----- passos que cada farmácia implementa -----------------------------------
    @abstractmethod
    async def baixar_catalogo(self, etag: str | None = None) -> CatalogoBaixado:
        """Busca o catálogo inteiro na API nativa da farmácia."""

    @abstractmethod
    def identificar(self, item_bruto: dict[str, Any]) -> str:
        """Código do produto na farmácia de origem."""

    @abstractmethod
    def adaptar(self, item: Any, coletado_em: datetime) -> OfertaCanonica:
        """Converte um item nativo (já validado) para o modelo canônico."""

    def interpretar_webhook(self, payload: Any) -> NotificacaoInterpretada:
        raise WebhookNaoSuportadoError(f"a farmácia {self.farmacia_id} não envia webhooks")

    # ----- algoritmo comum (Template Method) -------------------------------------
    def converter(self, itens_brutos: list[dict[str, Any]], coletado_em: datetime | None = None) -> ResultadoDaConversao:
        instante = coletado_em or agora_utc()
        resultado = ResultadoDaConversao()
        for item_bruto in itens_brutos:
            codigo_externo = self._identificar_com_seguranca(item_bruto)
            try:
                item_nativo = self.modelo_nativo.model_validate(item_bruto)
                resultado.ofertas.append(self.adaptar(item_nativo, instante))
            except (ValidationError, ValueError) as erro:
                resultado.descartados.append(ItemDescartado(codigo_externo, _resumir_erro(erro)))
        return resultado

    def url_do_produto(self, codigo_externo: str) -> str:
        return f"{self.url_das_vitrines}/{self.farmacia_id}/produto/{codigo_externo}"

    def _identificar_com_seguranca(self, item_bruto: dict[str, Any]) -> str:
        try:
            return str(self.identificar(item_bruto))
        except Exception:  # noqa: BLE001
            return "(sem código)"


def _resumir_erro(erro: Exception) -> str:
    if isinstance(erro, ValidationError):
        return "; ".join(f"{'.'.join(map(str, item['loc']))}: {item['msg']}" for item in erro.errors())[:300]
    return str(erro)[:300]
