"""Caso de uso central do ms-ingestao: receber dados de uma farmácia e publicar eventos.

Fluxo de uma coleta (webhook, polling ou sincronização):

1. o adaptador da farmácia converte os itens nativos para ``OfertaCanonica``;
2. a memória de ofertas descarta o que não mudou desde a última publicação;
3. cada oferta nova ou alterada vira um evento ``ingestao.oferta.recebida``;
4. itens que não puderam ser interpretados viram ``ingestao.oferta.descartada``;
5. remoções viram ``ingestao.oferta.removida``;
6. o resumo da coleta vira ``ingestao.coleta.realizada`` e o payload bruto é salvo.

O ms-ingestao não sabe quem consome esses eventos. Ele responde à farmácia logo
após publicar, sem esperar o catálogo processar.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from app.adaptadores import RegistroDeAdaptadores
from app.adaptadores.base import AdaptadorDeFarmacia, ItemDescartado
from app.adaptadores.cliente_http import FarmaciaIndisponivelError
from app.persistencia.modelos import ColetaBruta
from app.persistencia.repositorio import RepositorioDeColetas
from app.servicos.estado_das_farmacias import EstadoDasFarmacias
from app.servicos.memoria_de_ofertas import MemoriaDeOfertas
from pricehub_common.erros import RecursoNaoEncontrado, ServicoIndisponivel
from pricehub_common.eventos import (
    IngestaoColetaRealizada,
    IngestaoFarmaciaIndisponivel,
    IngestaoOfertaDescartada,
    IngestaoOfertaRecebida,
    IngestaoOfertaRemovida,
    OrigemDaColeta,
    TipoDeEvento,
)
from pricehub_common.logs import obter_correlation_id, obter_logger
from pricehub_common.mensageria import BarramentoDeEventos

logger = obter_logger("ingestao.servico")


@dataclass
class ResumoDaColeta:
    coleta_id: str | None
    farmacia_id: str
    origem: OrigemDaColeta
    catalogo_completo: bool
    itens_recebidos: int = 0
    ofertas_publicadas: int = 0
    ofertas_sem_alteracao: int = 0
    descartadas: list[ItemDescartado] = field(default_factory=list)
    removidas: int = 0
    duracao_ms: float = 0
    nao_modificado: bool = False
    correlation_id: str = ""


@dataclass
class _EntradaDaColeta:
    itens: list[dict[str, Any]]
    payload_bruto: Any
    catalogo_completo: bool
    codigos_removidos: list[str] = field(default_factory=list)
    etag: str | None = None


class ServicoDeIngestao:
    def __init__(
        self,
        adaptadores: RegistroDeAdaptadores,
        repositorio: RepositorioDeColetas,
        barramento: BarramentoDeEventos,
        memoria: MemoriaDeOfertas,
        estado: EstadoDasFarmacias,
    ) -> None:
        self.adaptadores = adaptadores
        self.estado = estado
        self._repositorio = repositorio
        self._barramento = barramento
        self._memoria = memoria
        self._travas = {adaptador.farmacia_id: asyncio.Lock() for adaptador in adaptadores.todos()}

    def adaptador(self, farmacia_id: str) -> AdaptadorDeFarmacia:
        adaptador = self.adaptadores.obter(farmacia_id)
        if adaptador is None:
            raise RecursoNaoEncontrado(f"a farmácia '{farmacia_id}' não está integrada ao PriceHub")
        return adaptador

    async def receber_webhook(self, farmacia_id: str, payload: Any) -> ResumoDaColeta:
        adaptador = self.adaptador(farmacia_id)
        inicio = time.perf_counter()
        notificacao = adaptador.interpretar_webhook(payload)
        entrada = _EntradaDaColeta(
            itens=notificacao.itens,
            payload_bruto=payload,
            catalogo_completo=notificacao.acao == "catalogo-completo",
            codigos_removidos=notificacao.codigos_removidos,
        )
        async with self._travas[farmacia_id]:
            return await self._processar(adaptador, "webhook", entrada, inicio, forcar=False)

    async def sincronizar(self, farmacia_id: str, origem: OrigemDaColeta = "sincronizacao", *, forcar: bool = False) -> ResumoDaColeta:
        adaptador = self.adaptador(farmacia_id)
        async with self._travas[farmacia_id]:
            inicio = time.perf_counter()
            estado = self.estado.de(farmacia_id)
            etag = estado.etag if (origem == "polling" and not forcar) else None
            try:
                baixado = await adaptador.baixar_catalogo(etag=etag)
            except FarmaciaIndisponivelError as erro:
                await self._registrar_indisponibilidade(farmacia_id, origem, erro)
                raise ServicoIndisponivel(str(erro), farmaciaId=farmacia_id) from erro

            if baixado.nao_modificado:
                self.estado.registrar_verificacao_sem_mudanca(farmacia_id)
                logger.debug("catálogo sem mudança (ETag); nada publicado", farmaciaId=farmacia_id)
                return ResumoDaColeta(
                    coleta_id=None,
                    farmacia_id=farmacia_id,
                    origem=origem,
                    catalogo_completo=True,
                    nao_modificado=True,
                    duracao_ms=_milissegundos_desde(inicio),
                    correlation_id=obter_correlation_id(),
                )
            entrada = _EntradaDaColeta(
                itens=baixado.itens,
                payload_bruto=baixado.paginas_brutas,
                catalogo_completo=True,
                etag=baixado.etag,
            )
            return await self._processar(adaptador, origem, entrada, inicio, forcar=forcar)

    async def _processar(
        self,
        adaptador: AdaptadorDeFarmacia,
        origem: OrigemDaColeta,
        entrada: _EntradaDaColeta,
        inicio: float,
        *,
        forcar: bool,
    ) -> ResumoDaColeta:
        farmacia_id = adaptador.farmacia_id
        coleta_id = str(uuid.uuid4())
        correlation_id = obter_correlation_id()
        resultado = adaptador.converter(entrada.itens)

        alteradas = [oferta for oferta in resultado.ofertas if forcar or self._memoria.mudou(oferta)]
        codigos_presentes = [oferta.codigo_externo for oferta in resultado.ofertas]
        codigos_removidos = list(entrada.codigos_removidos)
        if entrada.catalogo_completo:
            ausentes = self._memoria.codigos_conhecidos(farmacia_id) - set(codigos_presentes)
            codigos_removidos.extend(sorted(ausentes))

        resumo = ResumoDaColeta(
            coleta_id=coleta_id,
            farmacia_id=farmacia_id,
            origem=origem,
            catalogo_completo=entrada.catalogo_completo,
            itens_recebidos=len(entrada.itens) + len(entrada.codigos_removidos),
            ofertas_sem_alteracao=len(resultado.ofertas) - len(alteradas),
            descartadas=resultado.descartados,
            correlation_id=correlation_id,
        )
        situacao, erro_de_publicacao = "publicada", None
        try:
            for oferta in alteradas:
                await self._barramento.publicar(
                    TipoDeEvento.INGESTAO_OFERTA_RECEBIDA,
                    IngestaoOfertaRecebida(coleta_id=coleta_id, origem=origem, oferta=oferta),
                )
                self._memoria.registrar(oferta)
                resumo.ofertas_publicadas += 1
            for descartado in resultado.descartados:
                await self._barramento.publicar(
                    TipoDeEvento.INGESTAO_OFERTA_DESCARTADA,
                    IngestaoOfertaDescartada(
                        coleta_id=coleta_id,
                        farmacia_id=farmacia_id,
                        codigo_externo=descartado.codigo_externo,
                        motivo=descartado.motivo,
                    ),
                )
            for codigo in codigos_removidos:
                await self._barramento.publicar(
                    TipoDeEvento.INGESTAO_OFERTA_REMOVIDA,
                    IngestaoOfertaRemovida(coleta_id=coleta_id, origem=origem, farmacia_id=farmacia_id, codigo_externo=codigo),
                )
                self._memoria.esquecer(farmacia_id, codigo)
                resumo.removidas += 1
            resumo.duracao_ms = _milissegundos_desde(inicio)
            await self._barramento.publicar(
                TipoDeEvento.INGESTAO_COLETA_REALIZADA,
                IngestaoColetaRealizada(
                    coleta_id=coleta_id,
                    farmacia_id=farmacia_id,
                    origem=origem,
                    itens_recebidos=resumo.itens_recebidos,
                    ofertas_publicadas=resumo.ofertas_publicadas,
                    ofertas_sem_alteracao=resumo.ofertas_sem_alteracao,
                    descartadas=len(resumo.descartadas),
                    removidas=resumo.removidas,
                    duracao_ms=resumo.duracao_ms,
                    catalogo_completo=entrada.catalogo_completo,
                    codigos_presentes=codigos_presentes if entrada.catalogo_completo else [],
                ),
            )
        except Exception as erro:
            situacao, erro_de_publicacao = "falhou", str(erro)
            logger.erro("falha ao publicar eventos da coleta", farmaciaId=farmacia_id, erro=str(erro))
            raise ServicoIndisponivel("o broker de mensagens não aceitou os eventos; tente novamente") from erro
        finally:
            resumo.duracao_ms = resumo.duracao_ms or _milissegundos_desde(inicio)
            await self._salvar_coleta(resumo, situacao, entrada.payload_bruto, erro_de_publicacao)

        self.estado.registrar_coleta(farmacia_id, entrada.catalogo_completo, entrada.etag)
        logger.info(
            "coleta processada",
            farmaciaId=farmacia_id,
            origem=origem,
            coletaId=coleta_id,
            ofertasPublicadas=resumo.ofertas_publicadas,
            semAlteracao=resumo.ofertas_sem_alteracao,
            descartadas=len(resumo.descartadas),
            removidas=resumo.removidas,
            duracaoMs=resumo.duracao_ms,
        )
        return resumo

    async def _salvar_coleta(self, resumo: ResumoDaColeta, situacao: str, payload: Any, erro: str | None) -> None:
        try:
            await self._repositorio.salvar(
                ColetaBruta(
                    id=resumo.coleta_id,
                    farmacia_id=resumo.farmacia_id,
                    origem=resumo.origem,
                    situacao=situacao,
                    correlation_id=resumo.correlation_id,
                    itens_recebidos=resumo.itens_recebidos,
                    ofertas_publicadas=resumo.ofertas_publicadas,
                    ofertas_sem_alteracao=resumo.ofertas_sem_alteracao,
                    descartadas=len(resumo.descartadas),
                    removidas=resumo.removidas,
                    duracao_ms=resumo.duracao_ms,
                    erro=erro,
                    payload=payload,
                )
            )
        except Exception:  # noqa: BLE001 - a coleta já foi publicada; a falha de auditoria só é registrada
            logger.erro("não foi possível salvar a coleta bruta", excecao=True, coletaId=resumo.coleta_id)

    async def _registrar_indisponibilidade(self, farmacia_id: str, origem: OrigemDaColeta, erro: Exception) -> None:
        primeira_falha = self.estado.registrar_falha(farmacia_id, str(erro))
        # Ao cair, a farmácia pode voltar com outro estado; por isso o próximo catálogo é publicado por inteiro.
        self._memoria.esquecer_farmacia(farmacia_id)
        if not primeira_falha:
            return
        logger.aviso("farmácia ficou indisponível", farmaciaId=farmacia_id, erro=str(erro))
        try:
            await self._barramento.publicar(
                TipoDeEvento.INGESTAO_FARMACIA_INDISPONIVEL,
                IngestaoFarmaciaIndisponivel(farmacia_id=farmacia_id, origem=origem, motivo=str(erro)[:300]),
            )
        except Exception:  # noqa: BLE001
            logger.erro("não foi possível publicar a indisponibilidade", farmaciaId=farmacia_id)


def _milissegundos_desde(inicio: float) -> float:
    return round((time.perf_counter() - inicio) * 1000, 2)
