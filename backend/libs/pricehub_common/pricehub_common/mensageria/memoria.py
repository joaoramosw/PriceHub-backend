"""Barramento em memória para testes automatizados (sem RabbitMQ)."""

from __future__ import annotations

from dataclasses import dataclass, field

from pricehub_common.eventos import Envelope
from pricehub_common.logs import correlation_id_atual
from pricehub_common.mensageria.barramento import (
    Assinatura,
    BarramentoDeEventos,
    ManipuladorDeEvento,
    corresponde_ao_padrao,
)


@dataclass
class AssinaturaEmMemoria(Assinatura):
    nome_da_fila: str
    chaves: list[str]
    manipulador: ManipuladorDeEvento
    retidas: list[Envelope] = field(default_factory=list)
    _pausada: bool = False

    @property
    def pausada(self) -> bool:
        return self._pausada

    async def pausar(self) -> None:
        self._pausada = True

    async def retomar(self) -> None:
        self._pausada = False
        pendentes, self.retidas = self.retidas, []
        for envelope in pendentes:
            await self.entregar(envelope)

    async def entregar(self, envelope: Envelope) -> None:
        if self._pausada:
            self.retidas.append(envelope)
            return
        token = correlation_id_atual.set(envelope.correlation_id)
        try:
            await self.manipulador(envelope)
        finally:
            correlation_id_atual.reset(token)


class BarramentoEmMemoria(BarramentoDeEventos):
    def __init__(self, servico_de_origem: str = "testes") -> None:
        super().__init__(servico_de_origem)
        self.publicados: list[Envelope] = []
        self.assinaturas: list[AssinaturaEmMemoria] = []

    async def conectar(self) -> None:
        return None

    async def fechar(self) -> None:
        return None

    async def esta_saudavel(self) -> bool:
        return True

    async def publicar_envelope(self, envelope: Envelope) -> None:
        self.publicados.append(envelope)
        for assinatura in self.assinaturas:
            if any(corresponde_ao_padrao(chave, envelope.tipo) for chave in assinatura.chaves):
                await assinatura.entregar(envelope)

    async def assinar(
        self,
        nome_da_fila: str | None,
        chaves_de_roteamento: list[str],
        manipulador: ManipuladorDeEvento,
        *,
        exclusiva: bool = False,
        sequencial: bool = True,
    ) -> Assinatura:
        assinatura = AssinaturaEmMemoria(nome_da_fila or "temporaria", chaves_de_roteamento, manipulador)
        self.assinaturas.append(assinatura)
        return assinatura

    def tipos_publicados(self) -> list[str]:
        return [envelope.tipo for envelope in self.publicados]
