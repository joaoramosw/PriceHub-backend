"""Implementação do barramento de eventos sobre o RabbitMQ (protocolo AMQP 0-9-1).

Topologia criada por esta classe::

    produtor ──► exchange "pricehub.eventos" (topic, durável)
                   │  binding por chave de roteamento (ex.: "ingestao.oferta.*")
                   ▼
                 fila "<servico>.<finalidade>" (durável) ──► consumidor (ACK manual)
                   │ falhou?                        ▲
                   ▼                                │ volta após o TTL
                 fila "<fila>.retry" (TTL) ─────────┘
                   │ estourou o limite de tentativas
                   ▼
                 fila "<fila>.dlq" (mensagens mortas, para análise)

A mensagem só sai da fila depois do ACK, ou seja, quando o consumidor terminou
de processá-la. Se o serviço cair no meio, o RabbitMQ entrega de novo.
"""

from __future__ import annotations

import asyncio
import json

import aio_pika
from aio_pika.abc import (
    AbstractChannel,
    AbstractExchange,
    AbstractIncomingMessage,
    AbstractQueue,
    AbstractRobustConnection,
)
from pydantic import ValidationError

from pricehub_common.eventos import Envelope
from pricehub_common.logs import correlation_id_atual, obter_logger
from pricehub_common.mensageria.barramento import Assinatura, BarramentoDeEventos, ManipuladorDeEvento

NOME_DA_EXCHANGE = "pricehub.eventos"
CABECALHO_DE_TENTATIVA = "x-tentativa"
CABECALHO_DE_ERRO = "x-ultimo-erro"

logger = obter_logger("pricehub.mensageria")


def nome_da_fila_de_retry(fila: str) -> str:
    return f"{fila}.retry"


def nome_da_fila_de_mortas(fila: str) -> str:
    return f"{fila}.dlq"


class AssinaturaRabbitMQ(Assinatura):
    def __init__(self, fila: AbstractQueue, processar: ManipuladorDeEvento | object) -> None:
        self._fila = fila
        self._processar = processar
        self._tag: str | None = None
        self.nome_da_fila = fila.name

    @property
    def pausada(self) -> bool:
        return self._tag is None

    async def iniciar(self) -> None:
        self._tag = await self._fila.consume(self._processar)  # type: ignore[arg-type]

    async def pausar(self) -> None:
        if self._tag is not None:
            await self._fila.cancel(self._tag)
            self._tag = None
            logger.aviso("consumo pausado; mensagens novas ficarão retidas na fila", fila=self.nome_da_fila)

    async def retomar(self) -> None:
        if self._tag is None:
            await self.iniciar()
            logger.info("consumo retomado", fila=self.nome_da_fila)


class BarramentoRabbitMQ(BarramentoDeEventos):
    def __init__(
        self,
        url: str,
        servico_de_origem: str,
        *,
        prefetch: int = 10,
        tentativas_maximas: int = 5,
        atraso_do_retry_ms: int = 2000,
    ) -> None:
        super().__init__(servico_de_origem)
        self._url = url
        self._prefetch = prefetch
        self._tentativas_maximas = tentativas_maximas
        self._atraso_do_retry_ms = atraso_do_retry_ms
        self._conexao: AbstractRobustConnection | None = None
        self._canal_de_publicacao: AbstractChannel | None = None
        self._exchange: AbstractExchange | None = None
        self._assinaturas: list[AssinaturaRabbitMQ] = []

    async def conectar(self, tentativas: int = 30, intervalo_s: float = 2.0) -> None:
        for tentativa in range(1, tentativas + 1):
            try:
                self._conexao = await aio_pika.connect_robust(self._url, client_properties={"connection_name": self.servico_de_origem})
                break
            except Exception as erro:  # noqa: BLE001
                logger.aviso("RabbitMQ indisponível; nova tentativa", tentativa=tentativa, erro=str(erro))
                await asyncio.sleep(intervalo_s)
        else:
            raise RuntimeError("não foi possível conectar ao RabbitMQ")

        self._canal_de_publicacao = await self._conexao.channel(publisher_confirms=True)
        self._exchange = await self._canal_de_publicacao.declare_exchange(NOME_DA_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True)
        logger.info("conectado ao RabbitMQ", exchange=NOME_DA_EXCHANGE)

    async def fechar(self) -> None:
        if self._conexao and not self._conexao.is_closed:
            await self._conexao.close()

    async def esta_saudavel(self) -> bool:
        return self._conexao is not None and not self._conexao.is_closed

    async def publicar_envelope(self, envelope: Envelope) -> None:
        if self._exchange is None:
            raise RuntimeError("barramento não conectado")
        mensagem = aio_pika.Message(
            body=json.dumps(envelope.para_json(), ensure_ascii=False).encode("utf-8"),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            message_id=str(envelope.id_do_evento),
            correlation_id=envelope.correlation_id,
            type=envelope.tipo,
            app_id=envelope.servico_de_origem,
            timestamp=envelope.ocorrido_em,
        )
        # Com publisher confirms, o await só retorna depois que o broker aceitou a mensagem.
        await self._exchange.publish(mensagem, routing_key=envelope.tipo)
        logger.debug("evento publicado", tipo=envelope.tipo, idDoEvento=str(envelope.id_do_evento))

    async def assinar(
        self,
        nome_da_fila: str | None,
        chaves_de_roteamento: list[str],
        manipulador: ManipuladorDeEvento,
        *,
        exclusiva: bool = False,
        sequencial: bool = True,
    ) -> Assinatura:
        if self._conexao is None or self._exchange is None:
            raise RuntimeError("barramento não conectado")

        canal = await self._conexao.channel()
        await canal.set_qos(prefetch_count=1 if sequencial else self._prefetch)
        exchange = await canal.get_exchange(NOME_DA_EXCHANGE)

        if exclusiva:
            fila = await canal.declare_queue("", exclusive=True, auto_delete=True)
        else:
            if not nome_da_fila:
                raise ValueError("fila durável precisa de nome")
            await canal.declare_queue(nome_da_fila_de_mortas(nome_da_fila), durable=True)
            await canal.declare_queue(
                nome_da_fila_de_retry(nome_da_fila),
                durable=True,
                arguments={
                    "x-message-ttl": self._atraso_do_retry_ms,
                    "x-dead-letter-exchange": "",
                    "x-dead-letter-routing-key": nome_da_fila,
                },
            )
            fila = await canal.declare_queue(
                nome_da_fila,
                durable=True,
                arguments={
                    "x-dead-letter-exchange": "",
                    "x-dead-letter-routing-key": nome_da_fila_de_mortas(nome_da_fila),
                },
            )

        for chave in chaves_de_roteamento:
            await fila.bind(exchange, routing_key=chave)

        trava = asyncio.Lock()

        async def processar(mensagem: AbstractIncomingMessage) -> None:
            if sequencial:
                async with trava:
                    await self._processar_mensagem(canal, fila.name, mensagem, manipulador, exclusiva)
            else:
                await self._processar_mensagem(canal, fila.name, mensagem, manipulador, exclusiva)

        assinatura = AssinaturaRabbitMQ(fila, processar)
        await assinatura.iniciar()
        self._assinaturas.append(assinatura)
        logger.info("assinatura criada", fila=fila.name, chaves=chaves_de_roteamento)
        return assinatura

    async def _processar_mensagem(
        self,
        canal: AbstractChannel,
        nome_da_fila: str,
        mensagem: AbstractIncomingMessage,
        manipulador: ManipuladorDeEvento,
        exclusiva: bool,
    ) -> None:
        try:
            envelope = Envelope.model_validate_json(mensagem.body)
        except ValidationError as erro:
            logger.erro("mensagem fora do contrato; enviada para a DLQ", fila=nome_da_fila, erro=str(erro))
            await mensagem.reject(requeue=False)
            return

        tentativa = int((mensagem.headers or {}).get(CABECALHO_DE_TENTATIVA, 0))
        token = correlation_id_atual.set(envelope.correlation_id)
        try:
            await manipulador(envelope)
            await mensagem.ack()
        except Exception as erro:  # noqa: BLE001
            if exclusiva:
                logger.aviso("falha em consumidor temporário; mensagem ignorada", tipo=envelope.tipo, erro=str(erro))
                await mensagem.ack()
                return
            await self._encaminhar_falha(canal, nome_da_fila, mensagem, envelope, tentativa, erro)
        finally:
            correlation_id_atual.reset(token)

    async def _encaminhar_falha(
        self,
        canal: AbstractChannel,
        nome_da_fila: str,
        mensagem: AbstractIncomingMessage,
        envelope: Envelope,
        tentativa: int,
        erro: Exception,
    ) -> None:
        proxima_tentativa = tentativa + 1
        esgotou = proxima_tentativa >= self._tentativas_maximas
        destino = nome_da_fila_de_mortas(nome_da_fila) if esgotou else nome_da_fila_de_retry(nome_da_fila)
        copia = aio_pika.Message(
            body=mensagem.body,
            content_type=mensagem.content_type,
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            message_id=mensagem.message_id,
            correlation_id=mensagem.correlation_id,
            type=mensagem.type,
            app_id=mensagem.app_id,
            headers={CABECALHO_DE_TENTATIVA: proxima_tentativa, CABECALHO_DE_ERRO: str(erro)[:500]},
        )
        await canal.default_exchange.publish(copia, routing_key=destino)
        await mensagem.ack()
        if esgotou:
            logger.erro("tentativas esgotadas; evento enviado para a DLQ", tipo=envelope.tipo, fila=destino, erro=str(erro))
        else:
            logger.aviso(
                "falha ao processar evento; nova tentativa agendada",
                tipo=envelope.tipo,
                tentativa=proxima_tentativa,
                atrasoMs=self._atraso_do_retry_ms,
                erro=str(erro),
            )
