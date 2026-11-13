from __future__ import annotations

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse
from pricehub_common.erros import RecursoNaoEncontrado
from sqlalchemy import func, select

from app.persistencia import EventoProcessado, ProjecaoDeMedicamento, carregar_projecoes

roteador = APIRouter()


@roteador.get("/medicamentos")
async def listar_medicamentos(
    request: Request,
    busca: str | None = Query(default=None, min_length=2, max_length=60),
    categoria: str | None = Query(default=None, max_length=60),
) -> list[dict]:
    async with request.app.state.banco.sessao() as sessao:
        return await carregar_projecoes(sessao, busca, categoria)


@roteador.get("/medicamentos/{medicamento_id}")
async def detalhar_medicamento(medicamento_id: str, request: Request) -> dict:
    async with request.app.state.banco.sessao() as sessao:
        linha = await sessao.get(ProjecaoDeMedicamento, medicamento_id)
        if linha is None:
            raise RecursoNaoEncontrado(f"medicamento {medicamento_id} não encontrado")
        return linha.detalhe


@roteador.get("/medicamentos/{medicamento_id}/historico")
async def historico(medicamento_id: str, request: Request) -> list[dict]:
    async with request.app.state.banco.sessao() as sessao:
        linha = await sessao.get(ProjecaoDeMedicamento, medicamento_id)
        return linha.historico if linha else []


@roteador.get("/categorias")
async def categorias(request: Request) -> list[str]:
    async with request.app.state.banco.sessao() as sessao:
        linhas = (await sessao.scalars(select(ProjecaoDeMedicamento.resumo["categoria"].as_string()).distinct())).all()
        return sorted({valor for valor in linhas if valor})


@roteador.get("/estatisticas")
async def estatisticas(request: Request) -> dict[str, int]:
    async with request.app.state.banco.sessao() as sessao:
        projecoes = (await sessao.scalars(select(ProjecaoDeMedicamento))).all()
        total_eventos = int(await sessao.scalar(select(func.count()).select_from(EventoProcessado)) or 0)
    ofertas = [oferta for linha in projecoes for oferta in linha.detalhe.get("ofertas", [])]
    return {
        "medicamentos": len(projecoes),
        "farmacias": len({oferta["farmaciaId"] for oferta in ofertas}),
        "ofertas": len(ofertas),
        "ofertasDisponiveis": sum(1 for oferta in ofertas if oferta.get("disponivel")),
        "registrosDeHistorico": sum(len(linha.historico) for linha in projecoes),
        "eventosProcessados": total_eventos,
        "eventosNaOutboxPendentes": 0,
    }


@roteador.get("/tempo-real", response_class=StreamingResponse)
async def tempo_real(request: Request) -> StreamingResponse:
    return request.app.state.projecoes.difusor.resposta(request)
