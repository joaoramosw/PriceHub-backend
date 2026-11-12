"""Consumidor de **todos** os eventos (binding ``#``): o serviço de log do PriceHub.

É a fonte das evidências do capítulo de resultados: cada evento é gravado com o
instante em que ocorreu, o serviço que o produziu e o ``correlationId``, o que
permite reconstituir a linha do tempo de uma alteração de preço.
"""

from __future__ import annotations

from sqlalchemy import select

from app.persistencia.modelos import RegistroDeEvento
from pricehub_common.eventos import Envelope
from pricehub_common.logs import obter_logger
from pricehub_common.persistencia import BancoDeDados
from pricehub_common.sse import DifusorDeEventos

logger = obter_logger("log.registrador")

FILA_DE_AUDITORIA = "ms-log.todos-os-eventos"


def extrair_farmacia(dados: dict) -> str | None:
    if "farmaciaId" in dados:
        return dados["farmaciaId"]
    oferta = dados.get("oferta")
    if isinstance(oferta, dict):
        return oferta.get("farmaciaId")
    return None


def registro_para_json(registro: RegistroDeEvento) -> dict:
    return {
        "id": registro.id,
        "idDoEvento": registro.id_do_evento,
        "tipo": registro.tipo,
        "servicoDeOrigem": registro.servico_de_origem,
        "correlationId": registro.correlation_id,
        "farmaciaId": registro.farmacia_id,
        "ocorridoEm": registro.ocorrido_em.isoformat(),
        "recebidoEm": registro.recebido_em.isoformat() if registro.recebido_em else None,
        "dados": registro.dados,
    }


class RegistradorDeEventos:
    def __init__(self, banco: BancoDeDados, difusor: DifusorDeEventos) -> None:
        self._banco = banco
        self._difusor = difusor

    async def __call__(self, envelope: Envelope) -> None:
        id_do_evento = str(envelope.id_do_evento)
        async with self._banco.transacao() as sessao:
            ja_registrado = await sessao.scalar(select(RegistroDeEvento.id).where(RegistroDeEvento.id_do_evento == id_do_evento))
            if ja_registrado:
                return
            registro = RegistroDeEvento(
                id_do_evento=id_do_evento,
                tipo=envelope.tipo,
                servico_de_origem=envelope.servico_de_origem,
                correlation_id=envelope.correlation_id,
                farmacia_id=extrair_farmacia(envelope.dados),
                ocorrido_em=envelope.ocorrido_em,
                dados=envelope.dados,
            )
            sessao.add(registro)
            await sessao.flush()
            corpo = registro_para_json(registro)
        self._difusor.difundir(envelope.tipo, corpo)
        logger.debug("evento registrado", tipo=envelope.tipo, idDoEvento=id_do_evento)
