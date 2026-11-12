from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import asdict

from fastapi import APIRouter, Header, Query, Request

from app.adaptadores.base import PayloadInvalidoError, WebhookNaoSuportadoError
from app.api.esquemas import (
    ColetaDetalhada,
    ColetaResumida,
    EstadoDaFarmaciaSaida,
    IdentificadorDeFarmacia,
    ResumoDaColetaSaida,
)
from app.persistencia.repositorio import RepositorioDeColetas
from app.servicos.ingestao import ResumoDaColeta, ServicoDeIngestao
from pricehub_common.erros import NaoAutorizado, RecursoNaoEncontrado, RequisicaoInvalida

CABECALHO_DE_ASSINATURA = "x-pricehub-assinatura"

roteador = APIRouter()


def _servico(request: Request) -> ServicoDeIngestao:
    return request.app.state.servico


def _repositorio(request: Request) -> RepositorioDeColetas:
    return request.app.state.repositorio


def assinatura_valida(corpo: bytes, assinatura: str | None, segredo: str) -> bool:
    if not assinatura:
        return False
    esperada = "sha256=" + hmac.new(segredo.encode(), corpo, hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperada, assinatura)


def _saida(resumo: ResumoDaColeta) -> ResumoDaColetaSaida:
    return ResumoDaColetaSaida.model_validate(asdict(resumo))


@roteador.post(
    "/webhooks/{farmacia_id}",
    status_code=202,
    response_model=ResumoDaColetaSaida,
    tags=["webhooks"],
    summary="Recebe a notificação de uma farmácia (assinada com HMAC-SHA256)",
    description=(
        "A farmácia envia o corpo no formato dela e assina com o segredo compartilhado no cabeçalho "
        f"`{CABECALHO_DE_ASSINATURA}: sha256=<hex>`. A resposta 202 significa *aceito*: o catálogo é "
        "atualizado de forma assíncrona, depois, ao consumir os eventos."
    ),
)
async def receber_webhook(
    farmacia_id: IdentificadorDeFarmacia,
    request: Request,
    assinatura: str | None = Header(default=None, alias=CABECALHO_DE_ASSINATURA),
) -> ResumoDaColetaSaida:
    servico = _servico(request)
    adaptador = servico.adaptador(farmacia_id)
    segredo = servico.adaptadores.segredo_do_webhook(farmacia_id)
    if adaptador.modo != "webhook" or not segredo:
        raise RecursoNaoEncontrado(f"a farmácia {farmacia_id} não envia webhooks (integração por {adaptador.modo})")

    corpo = await request.body()
    if not assinatura_valida(corpo, assinatura, segredo):
        raise NaoAutorizado("assinatura do webhook ausente ou inválida")
    try:
        payload = json.loads(corpo)
    except json.JSONDecodeError as erro:
        raise RequisicaoInvalida("o corpo não é um JSON válido") from erro

    try:
        resumo = await servico.receber_webhook(farmacia_id, payload)
    except (PayloadInvalidoError, WebhookNaoSuportadoError) as erro:
        raise RequisicaoInvalida(str(erro)) from erro
    return _saida(resumo)


@roteador.post(
    "/sincronizacoes/{farmacia_id}",
    response_model=ResumoDaColetaSaida,
    tags=["sincronizacoes"],
    summary="Busca agora o catálogo completo de uma farmácia",
)
async def sincronizar_farmacia(
    farmacia_id: IdentificadorDeFarmacia,
    request: Request,
    forcar: bool = Query(default=False, description="Republica todas as ofertas, mesmo as que não mudaram"),
) -> ResumoDaColetaSaida:
    try:
        resumo = await _servico(request).sincronizar(farmacia_id, "sincronizacao", forcar=forcar)
    except PayloadInvalidoError as erro:
        raise RequisicaoInvalida(str(erro)) from erro
    return _saida(resumo)


@roteador.get(
    "/farmacias",
    response_model=list[EstadoDaFarmaciaSaida],
    tags=["farmacias"],
    summary="Farmácias integradas, modo de integração e situação atual",
)
async def listar_farmacias(request: Request) -> list[EstadoDaFarmaciaSaida]:
    servico = _servico(request)
    saida = []
    for adaptador in servico.adaptadores.todos():
        estado = servico.estado.de(adaptador.farmacia_id)
        saida.append(
            EstadoDaFarmaciaSaida(
                farmacia_id=adaptador.farmacia_id,
                farmacia_nome=adaptador.farmacia_nome,
                modo=adaptador.modo,
                url_base=adaptador.url_base,
                situacao=estado.situacao,
                ultima_coleta_em=estado.ultima_coleta_em,
                ultima_verificacao_em=estado.ultima_verificacao_em,
                ultimo_erro=estado.ultimo_erro,
                coletas_realizadas=estado.coletas_realizadas,
                falhas_consecutivas=estado.falhas_consecutivas,
            )
        )
    return saida


@roteador.get("/coletas", response_model=list[ColetaResumida], tags=["coletas"], summary="Últimas coletas recebidas")
async def listar_coletas(
    request: Request,
    farmacia_id: IdentificadorDeFarmacia | None = Query(default=None, alias="farmaciaId"),
    limite: int = Query(default=50, ge=1, le=500),
) -> list[ColetaResumida]:
    coletas = await _repositorio(request).listar(farmacia_id, limite)
    return [ColetaResumida.model_validate(coleta) for coleta in coletas]


@roteador.get(
    "/coletas/{coleta_id}",
    response_model=ColetaDetalhada,
    tags=["coletas"],
    summary="Uma coleta com o payload bruto da farmácia",
)
async def detalhar_coleta(coleta_id: str, request: Request) -> ColetaDetalhada:
    coleta = await _repositorio(request).buscar(coleta_id)
    if coleta is None:
        raise RecursoNaoEncontrado(f"coleta {coleta_id} não encontrada")
    return ColetaDetalhada.model_validate(coleta)
