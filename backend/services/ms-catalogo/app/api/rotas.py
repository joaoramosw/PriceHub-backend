from __future__ import annotations

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.servicos.consultas import (
    ConsultasDoCatalogo,
    DetalheDoMedicamento,
    EstatisticasDoCatalogo,
    OfertaNaoCorrespondidaSaida,
    PontoDoHistorico,
    ResumoDaFarmacia,
    ResumoDoMedicamento,
)
from pricehub_common.erros import RecursoNaoEncontrado
from pricehub_common.mensageria import Assinatura

roteador = APIRouter()


def _consultas(request: Request) -> ConsultasDoCatalogo:
    return request.app.state.consultas


@roteador.get(
    "/medicamentos",
    response_model=list[ResumoDoMedicamento],
    response_model_by_alias=True,
    tags=["comparacao"],
    summary="Busca medicamentos e mostra o menor preço entre as farmácias",
)
async def listar_medicamentos(
    request: Request,
    busca: str | None = Query(default=None, min_length=2, max_length=60, description="Nome comercial, princípio ativo ou fabricante"),
    categoria: str | None = Query(default=None, max_length=60),
) -> list[ResumoDoMedicamento]:
    return await _consultas(request).listar_medicamentos(busca, categoria)


@roteador.get(
    "/medicamentos/{medicamento_id}",
    response_model=DetalheDoMedicamento,
    tags=["comparacao"],
    summary="Ofertas de um medicamento em ordem crescente de preço",
)
async def detalhar_medicamento(medicamento_id: str, request: Request) -> DetalheDoMedicamento:
    detalhe = await _consultas(request).detalhar_medicamento(medicamento_id)
    if detalhe is None:
        raise RecursoNaoEncontrado(f"medicamento {medicamento_id} não encontrado")
    return detalhe


@roteador.get(
    "/medicamentos/{medicamento_id}/historico",
    response_model=list[PontoDoHistorico],
    tags=["comparacao"],
    summary="Histórico de preços por farmácia",
)
async def historico_de_precos(medicamento_id: str, request: Request) -> list[PontoDoHistorico]:
    return await _consultas(request).historico(medicamento_id)


@roteador.get("/categorias", response_model=list[str], tags=["comparacao"], summary="Categorias existentes no catálogo")
async def listar_categorias(request: Request) -> list[str]:
    return await _consultas(request).categorias()


@roteador.get("/farmacias", response_model=list[ResumoDaFarmacia], tags=["catalogo"], summary="Farmácias com ofertas no catálogo")
async def listar_farmacias(request: Request) -> list[ResumoDaFarmacia]:
    return await _consultas(request).farmacias()


@roteador.get(
    "/ofertas-nao-correspondidas",
    response_model=list[OfertaNaoCorrespondidaSaida],
    tags=["catalogo"],
    summary="Ofertas que não puderam ser associadas a um medicamento",
)
async def listar_nao_correspondidas(request: Request, limite: int = Query(default=50, ge=1, le=500)) -> list[OfertaNaoCorrespondidaSaida]:
    return await _consultas(request).nao_correspondidas(limite)


@roteador.get("/estatisticas", response_model=EstatisticasDoCatalogo, tags=["catalogo"], summary="Contagens do banco do catálogo")
async def estatisticas(request: Request) -> EstatisticasDoCatalogo:
    return await _consultas(request).estatisticas()


@roteador.get(
    "/tempo-real",
    tags=["tempo-real"],
    summary="Fluxo SSE com os eventos do catálogo (catalogo.#)",
    response_class=StreamingResponse,
)
async def fluxo_em_tempo_real(request: Request) -> StreamingResponse:
    return request.app.state.tempo_real.difusor.resposta(request)


class SituacaoDoConsumo(BaseModel):
    fila: str
    pausado: bool
    explicacao: str


def _situacao(assinatura: Assinatura) -> SituacaoDoConsumo:
    return SituacaoDoConsumo(
        fila=assinatura.nome_da_fila,
        pausado=assinatura.pausada,
        explicacao=(
            "Consumo pausado: as farmácias continuam sendo atendidas e os eventos ficam retidos na fila do RabbitMQ."
            if assinatura.pausada
            else "Consumindo normalmente."
        ),
    )


@roteador.get(
    "/admin/consumo", response_model=SituacaoDoConsumo, tags=["experimento"], summary="Situação do consumidor de eventos de ingestão"
)
async def situacao_do_consumo(request: Request) -> SituacaoDoConsumo:
    return _situacao(request.app.state.assinatura)


@roteador.post(
    "/admin/consumo/pausar",
    response_model=SituacaoDoConsumo,
    tags=["experimento"],
    summary="Simula o ms-catalogo fora do ar (para de consumir a fila)",
    description="Útil para demonstrar o desacoplamento temporal: altere preços nas farmácias e veja a fila crescer no monitor.",
)
async def pausar_consumo(request: Request) -> SituacaoDoConsumo:
    await request.app.state.assinatura.pausar()
    return _situacao(request.app.state.assinatura)


@roteador.post(
    "/admin/consumo/retomar",
    response_model=SituacaoDoConsumo,
    tags=["experimento"],
    summary="Volta a consumir; a fila acumulada é processada",
)
async def retomar_consumo(request: Request) -> SituacaoDoConsumo:
    await request.app.state.assinatura.retomar()
    return _situacao(request.app.state.assinatura)
