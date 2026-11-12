"""Abstração do barramento de eventos.

Os serviços dependem desta interface, não do RabbitMQ diretamente (princípio da
inversão de dependência). Em produção a implementação é ``BarramentoRabbitMQ``;
nos testes, ``BarramentoEmMemoria``.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable

from pricehub_common.eventos import Envelope, ModeloDeContrato, TipoDeEvento
from pricehub_common.logs import obter_correlation_id

ManipuladorDeEvento = Callable[[Envelope], Awaitable[None]]


def corresponde_ao_padrao(padrao: str, chave: str) -> bool:
    """Implementa as regras de roteamento de uma exchange do tipo *topic*.

    ``*`` substitui exatamente uma palavra e ``#`` substitui zero ou mais palavras.
    """
    partes_do_padrao = padrao.split(".")
    partes_da_chave = chave.split(".")

    def comparar(i: int, j: int) -> bool:
        if i == len(partes_do_padrao):
            return j == len(partes_da_chave)
        atual = partes_do_padrao[i]
        if atual == "#":
            return any(comparar(i + 1, k) for k in range(j, len(partes_da_chave) + 1))
        if j == len(partes_da_chave):
            return False
        return (atual == "*" or atual == partes_da_chave[j]) and comparar(i + 1, j + 1)

    return comparar(0, 0)


class Assinatura(ABC):
    """Representa um consumidor ativo de uma fila. Pode ser pausado e retomado."""

    nome_da_fila: str

    @property
    @abstractmethod
    def pausada(self) -> bool: ...

    @abstractmethod
    async def pausar(self) -> None: ...

    @abstractmethod
    async def retomar(self) -> None: ...


class BarramentoDeEventos(ABC):
    def __init__(self, servico_de_origem: str) -> None:
        self.servico_de_origem = servico_de_origem

    def montar_envelope(self, tipo: TipoDeEvento, dados: ModeloDeContrato, correlation_id: str | None = None) -> Envelope:
        return Envelope(
            tipo=tipo.value,
            correlation_id=correlation_id or obter_correlation_id(),
            servico_de_origem=self.servico_de_origem,
            dados=dados.para_json(),
        )

    async def publicar(self, tipo: TipoDeEvento, dados: ModeloDeContrato, correlation_id: str | None = None) -> Envelope:
        envelope = self.montar_envelope(tipo, dados, correlation_id)
        await self.publicar_envelope(envelope)
        return envelope

    @abstractmethod
    async def conectar(self) -> None: ...

    @abstractmethod
    async def fechar(self) -> None: ...

    @abstractmethod
    async def publicar_envelope(self, envelope: Envelope) -> None: ...

    @abstractmethod
    async def assinar(
        self,
        nome_da_fila: str | None,
        chaves_de_roteamento: list[str],
        manipulador: ManipuladorDeEvento,
        *,
        exclusiva: bool = False,
        sequencial: bool = True,
    ) -> Assinatura:
        """Cria (se preciso) a fila, liga às chaves e começa a consumir.

        ``exclusiva=True`` cria uma fila temporária só desta instância, usada para
        difundir eventos ao navegador. ``sequencial=True`` processa uma mensagem por
        vez, preservando a ordem de publicação.
        """

    @abstractmethod
    async def esta_saudavel(self) -> bool: ...
