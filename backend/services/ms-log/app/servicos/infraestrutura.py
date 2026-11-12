"""Leitura da situação da infraestrutura: filas do RabbitMQ e saúde dos microsserviços."""

from __future__ import annotations

import asyncio
import time

import httpx
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from pricehub_common.erros import ServicoIndisponivel


class Saida(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class SituacaoDaFila(Saida):
    nome: str
    mensagens_prontas: int
    mensagens_sem_ack: int
    consumidores: int
    taxa_de_publicacao: float
    taxa_de_entrega: float
    temporaria: bool


class SituacaoDoServico(Saida):
    nome: str
    url: str
    documentacao: str
    status: str
    latencia_ms: float | None
    detalhes: dict | None


class LeitorDeFilas:
    def __init__(self, url_da_api: str, usuario: str, senha: str) -> None:
        self._url_da_api = url_da_api.rstrip("/")
        self._autenticacao = (usuario, senha)

    async def listar(self) -> list[SituacaoDaFila]:
        try:
            async with httpx.AsyncClient(timeout=3, auth=self._autenticacao) as cliente:
                resposta = await cliente.get(f"{self._url_da_api}/queues/%2F")
                resposta.raise_for_status()
        except httpx.HTTPError as erro:
            raise ServicoIndisponivel(f"API de gerenciamento do RabbitMQ indisponível: {erro}") from erro
        filas = []
        for fila in resposta.json():
            estatisticas = fila.get("message_stats") or {}
            filas.append(
                SituacaoDaFila(
                    nome=fila["name"],
                    mensagens_prontas=fila.get("messages_ready", 0),
                    mensagens_sem_ack=fila.get("messages_unacknowledged", 0),
                    consumidores=fila.get("consumers", 0),
                    taxa_de_publicacao=(estatisticas.get("publish_details") or {}).get("rate", 0.0),
                    taxa_de_entrega=(estatisticas.get("deliver_get_details") or {}).get("rate", 0.0),
                    temporaria=bool(fila.get("exclusive") or fila.get("auto_delete")),
                )
            )
        return sorted(filas, key=lambda fila: (fila.temporaria, fila.nome))


class VerificadorDeServicos:
    def __init__(self, servicos_internos: dict[str, str], servicos_publicos: dict[str, str]) -> None:
        self._internos = servicos_internos
        self._publicos = servicos_publicos

    async def verificar(self) -> list[SituacaoDoServico]:
        async with httpx.AsyncClient(timeout=2) as cliente:
            return await asyncio.gather(*(self._verificar_um(cliente, nome, url) for nome, url in self._internos.items()))

    async def _verificar_um(self, cliente: httpx.AsyncClient, nome: str, url: str) -> SituacaoDoServico:
        url_publica = self._publicos.get(nome, url)
        inicio = time.perf_counter()
        try:
            resposta = await cliente.get(f"{url}/saude")
            latencia = round((time.perf_counter() - inicio) * 1000, 2)
            corpo = resposta.json()
            status = corpo.get("status", "desconhecido") if resposta.status_code in (200, 503) else "erro"
            return SituacaoDoServico(
                nome=nome,
                url=url_publica,
                documentacao=f"{url_publica}/docs",
                status=status,
                latencia_ms=latencia,
                detalhes=corpo.get("verificacoes"),
            )
        except (httpx.HTTPError, ValueError):
            return SituacaoDoServico(
                nome=nome, url=url_publica, documentacao=f"{url_publica}/docs", status="fora-do-ar", latencia_ms=None, detalhes=None
            )
