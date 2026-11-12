from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy import delete, select

from app.persistencia.modelos import RegistroDeEvento
from app.servicos.infraestrutura import SituacaoDaFila, SituacaoDoServico
from app.servicos.metricas import Metricas
from app.servicos.registrador import registro_para_json
from pricehub_common.erros import RecursoNaoEncontrado

roteador = APIRouter()


class Saida(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class EventoNaLinhaDoTempo(Saida):
    tipo: str
    servico_de_origem: str
    farmacia_id: str | None
    ocorrido_em: datetime
    desde_o_inicio_ms: float
    desde_o_anterior_ms: float
    dados: dict


class Rastreamento(Saida):
    correlation_id: str
    total_de_eventos: int
    duracao_total_ms: float
    servicos_envolvidos: list[str]
    eventos: list[EventoNaLinhaDoTempo]


@roteador.get("/registros", tags=["registros"], summary="Eventos registrados, do mais recente ao mais antigo")
async def listar_registros(
    request: Request,
    tipo: str | None = Query(default=None, description="Prefixo do tipo, ex.: catalogo.oferta"),
    correlation_id: str | None = Query(default=None, alias="correlationId"),
    farmacia_id: str | None = Query(default=None, alias="farmaciaId"),
    limite: int = Query(default=100, ge=1, le=1000),
) -> list[dict]:
    consulta = select(RegistroDeEvento).order_by(RegistroDeEvento.ocorrido_em.desc(), RegistroDeEvento.id.desc()).limit(limite)
    if tipo:
        consulta = consulta.where(RegistroDeEvento.tipo.startswith(tipo))
    if correlation_id:
        consulta = consulta.where(RegistroDeEvento.correlation_id == correlation_id)
    if farmacia_id:
        consulta = consulta.where(RegistroDeEvento.farmacia_id == farmacia_id)
    async with request.app.state.banco.sessao() as sessao:
        registros = (await sessao.scalars(consulta)).all()
    return [registro_para_json(registro) for registro in registros]


@roteador.get(
    "/registros/rastreamento/{correlation_id}",
    response_model=Rastreamento,
    tags=["registros"],
    summary="Linha do tempo de uma operação, atravessando todos os serviços",
)
async def rastrear(correlation_id: str, request: Request) -> Rastreamento:
    consulta = (
        select(RegistroDeEvento)
        .where(RegistroDeEvento.correlation_id == correlation_id)
        .order_by(RegistroDeEvento.ocorrido_em, RegistroDeEvento.id)
    )
    async with request.app.state.banco.sessao() as sessao:
        registros = (await sessao.scalars(consulta)).all()
    if not registros:
        raise RecursoNaoEncontrado(f"nenhum evento com correlationId {correlation_id}")
    inicio = registros[0].ocorrido_em
    eventos, anterior = [], inicio
    for registro in registros:
        eventos.append(
            EventoNaLinhaDoTempo(
                tipo=registro.tipo,
                servico_de_origem=registro.servico_de_origem,
                farmacia_id=registro.farmacia_id,
                ocorrido_em=registro.ocorrido_em,
                desde_o_inicio_ms=round((registro.ocorrido_em - inicio).total_seconds() * 1000, 2),
                desde_o_anterior_ms=round((registro.ocorrido_em - anterior).total_seconds() * 1000, 2),
                dados=registro.dados,
            )
        )
        anterior = registro.ocorrido_em
    return Rastreamento(
        correlation_id=correlation_id,
        total_de_eventos=len(eventos),
        duracao_total_ms=eventos[-1].desde_o_inicio_ms,
        servicos_envolvidos=sorted({registro.servico_de_origem for registro in registros}),
        eventos=eventos,
    )


@roteador.get(
    "/registros/tempo-real",
    tags=["registros"],
    summary="Fluxo SSE com cada evento assim que é registrado",
    response_class=StreamingResponse,
)
async def registros_em_tempo_real(request: Request) -> StreamingResponse:
    return request.app.state.difusor.resposta(request)


@roteador.delete("/registros", tags=["experimento"], summary="Apaga o log (para começar uma demonstração do zero)")
async def limpar_registros(request: Request) -> dict:
    async with request.app.state.banco.transacao() as sessao:
        resultado = await sessao.execute(delete(RegistroDeEvento))
    return {"removidos": resultado.rowcount}


@roteador.get("/metricas", response_model=Metricas, tags=["metricas"], summary="Aceite x convergência: o ganho do modelo assíncrono medido")
async def metricas(
    request: Request,
    desde: datetime | None = Query(default=None, description="Considera só eventos a partir deste instante (ISO 8601)"),
) -> Metricas:
    return await request.app.state.calculadora.calcular(desde)


@roteador.get(
    "/filas",
    response_model=list[SituacaoDaFila],
    tags=["infraestrutura"],
    summary="Filas do RabbitMQ (mensagens retidas, consumidores, vazão)",
)
async def filas(request: Request) -> list[SituacaoDaFila]:
    return await request.app.state.leitor_de_filas.listar()


@roteador.get(
    "/servicos",
    response_model=list[SituacaoDoServico],
    tags=["infraestrutura"],
    summary="Saúde de cada microsserviço e link da documentação",
)
async def servicos(request: Request) -> list[SituacaoDoServico]:
    return await request.app.state.verificador.verificar()
