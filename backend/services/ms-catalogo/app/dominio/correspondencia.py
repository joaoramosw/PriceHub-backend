"""Correspondência entre uma oferta recebida e um medicamento do catálogo (padrão Strategy).

Cada estratégia tenta encontrar o medicamento por um critério. A ordem vai do
critério mais confiável (registro na Anvisa) ao menos confiável (chave montada a
partir da descrição). Novas estratégias (por código de barras, por exemplo)
entram na lista sem alterar o serviço.
"""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Literal, Protocol

from app.dominio.normalizacao import gerar_chave_canonica, nome_de_exibicao, normalizar_principio_ativo, texto_de_busca
from app.persistencia.modelos import Medicamento
from pricehub_common.eventos import OfertaCanonica

FONTE_COM_REGISTRO = "registro"
FONTE_SOMENTE_DESCRICAO = "descricao"


class ConsultaDeMedicamentos(Protocol):
    async def por_registro_ms(self, registro_ms: str) -> Medicamento | None: ...
    async def por_chave_canonica(self, chave: str) -> Medicamento | None: ...


@dataclass(frozen=True)
class OfertaNormalizada:
    oferta: OfertaCanonica
    principio_normalizado: str
    chave_canonica: str | None

    @classmethod
    def de(cls, oferta: OfertaCanonica) -> OfertaNormalizada:
        principio = normalizar_principio_ativo(oferta.principio_ativo)
        chave = gerar_chave_canonica(principio, oferta.concentracao, oferta.forma, oferta.quantidade)
        return cls(oferta=oferta, principio_normalizado=principio, chave_canonica=chave)


@dataclass
class ResultadoDaCorrespondencia:
    tipo: Literal["existente", "novo", "nao-correspondido"]
    estrategia: str
    medicamento: Medicamento | None = None
    motivo: str | None = None


class EstrategiaDeCorrespondencia(ABC):
    nome: str

    @abstractmethod
    async def encontrar(self, normalizada: OfertaNormalizada, medicamentos: ConsultaDeMedicamentos) -> Medicamento | None: ...


class PorRegistroMs(EstrategiaDeCorrespondencia):
    nome = "registro-ms"

    async def encontrar(self, normalizada: OfertaNormalizada, medicamentos: ConsultaDeMedicamentos) -> Medicamento | None:
        registro = normalizada.oferta.registro_ms
        return await medicamentos.por_registro_ms(registro) if registro else None


class PorChaveCanonica(EstrategiaDeCorrespondencia):
    nome = "chave-canonica"

    async def encontrar(self, normalizada: OfertaNormalizada, medicamentos: ConsultaDeMedicamentos) -> Medicamento | None:
        chave = normalizada.chave_canonica
        return await medicamentos.por_chave_canonica(chave) if chave else None


class ServicoDeCorrespondencia:
    def __init__(self, estrategias: list[EstrategiaDeCorrespondencia] | None = None) -> None:
        self._estrategias = estrategias or [PorRegistroMs(), PorChaveCanonica()]

    async def corresponder(self, normalizada: OfertaNormalizada, medicamentos: ConsultaDeMedicamentos) -> ResultadoDaCorrespondencia:
        if not normalizada.principio_normalizado:
            return ResultadoDaCorrespondencia("nao-correspondido", "nenhuma", motivo="princípio ativo não identificado")

        for estrategia in self._estrategias:
            medicamento = await estrategia.encontrar(normalizada, medicamentos)
            if medicamento is not None:
                self._enriquecer(medicamento, normalizada)
                return ResultadoDaCorrespondencia("existente", estrategia.nome, medicamento=medicamento)

        if normalizada.chave_canonica is None:
            return ResultadoDaCorrespondencia(
                "nao-correspondido",
                "nenhuma",
                motivo="forma farmacêutica não identificada e nenhum registro MS conhecido",
            )
        return ResultadoDaCorrespondencia("novo", "cadastro-novo", medicamento=self._novo_medicamento(normalizada))

    @staticmethod
    def _novo_medicamento(normalizada: OfertaNormalizada) -> Medicamento:
        oferta = normalizada.oferta
        nome, principio = nome_de_exibicao(oferta)
        return Medicamento(
            id=str(uuid.uuid4()),
            chave_canonica=normalizada.chave_canonica,
            registro_ms=oferta.registro_ms,
            nome=nome,
            principio_ativo=principio,
            principio_normalizado=normalizada.principio_normalizado,
            concentracao_valor=oferta.concentracao.valor,
            concentracao_unidade=oferta.concentracao.unidade,
            forma=oferta.forma,
            quantidade_valor=oferta.quantidade.valor,
            quantidade_unidade=oferta.quantidade.unidade,
            fabricante=oferta.fabricante,
            categoria=oferta.categoria,
            fonte_dos_dados=FONTE_COM_REGISTRO if oferta.registro_ms else FONTE_SOMENTE_DESCRICAO,
            termos_de_busca=texto_de_busca(nome, principio, normalizada.principio_normalizado, oferta.fabricante),
        )

    @staticmethod
    def _enriquecer(medicamento: Medicamento, normalizada: OfertaNormalizada) -> None:
        """Completa dados que faltavam com uma fonte mais rica (ex.: farmácia que informa registro MS)."""
        oferta = normalizada.oferta
        if not medicamento.categoria and oferta.categoria:
            medicamento.categoria = oferta.categoria
        if not medicamento.fabricante and oferta.fabricante:
            medicamento.fabricante = oferta.fabricante
        if medicamento.fonte_dos_dados == FONTE_SOMENTE_DESCRICAO and oferta.registro_ms:
            nome, principio = nome_de_exibicao(oferta)
            medicamento.nome, medicamento.principio_ativo = nome, principio
            medicamento.registro_ms = medicamento.registro_ms or oferta.registro_ms
            medicamento.fonte_dos_dados = FONTE_COM_REGISTRO
            if oferta.fabricante:
                medicamento.fabricante = oferta.fabricante
        if not medicamento.chave_canonica and normalizada.chave_canonica:
            medicamento.chave_canonica = normalizada.chave_canonica
        medicamento.termos_de_busca = texto_de_busca(
            medicamento.nome, medicamento.principio_ativo, medicamento.principio_normalizado, medicamento.fabricante
        )
