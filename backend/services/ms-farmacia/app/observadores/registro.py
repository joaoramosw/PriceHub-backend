"""Observador que apenas registra em log cada mudança do catálogo da farmácia."""

from __future__ import annotations

from app.dominio.eventos import CatalogoCarregado, EventoDoCatalogo, PrecoAlterado
from app.dominio.observador import ObservadorDoCatalogo
from pricehub_common.logs import obter_logger

logger = obter_logger("farmacia.registro")


class RegistradorDeAlteracoes(ObservadorDoCatalogo):
    def __init__(self, farmacia_id: str) -> None:
        self._farmacia_id = farmacia_id

    async def atualizar(self, evento: EventoDoCatalogo) -> None:
        campos = {"farmaciaId": self._farmacia_id, "evento": evento.nome}
        if isinstance(evento, CatalogoCarregado):
            campos["produtos"] = len(evento.produtos)
        elif isinstance(evento, PrecoAlterado):
            campos |= {
                "codigo": evento.produto.codigo,
                "precoAnteriorCentavos": evento.preco_anterior_centavos,
                "precoAtualCentavos": evento.produto.preco_centavos,
            }
        elif hasattr(evento, "produto"):
            campos["codigo"] = evento.produto.codigo  # type: ignore[attr-defined]
        logger.info("alteração no catálogo da farmácia", **campos)
