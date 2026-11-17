"""API de gestão da farmácia: usada pelo site da loja e pela tela /admin.

Todas as farmácias expõem esta mesma API de gestão, mas cada uma mantém a sua
API nativa e diferente (é dela que o PriceHub lê, com um adaptador por farmácia).
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.esquemas import (
    ConfiguracaoDaSimulacao,
    InformacoesDaLoja,
    NovoPreco,
    ProdutoSaida,
    ResultadoDaOperacao,
    ResultadoDaRestauracao,
)
from app.dominio.catalogo import CatalogoDaFarmacia, ProdutoInexistenteError
from app.dominio.produto import Produto, RegraDeNegocioVioladaError
from app.dominio.simulacao import SimulacaoDePrecos
from app.formatos.base import FormatoDaFarmacia
from app.sementes import carregar_semente
from app.suporte.erros import RecursoNaoEncontrado, RequisicaoInvalida
from app.suporte.logs import obter_correlation_id

roteador = APIRouter(prefix="/gestao", tags=["gestao-da-loja"])


def _catalogo(request: Request) -> CatalogoDaFarmacia:
    return request.app.state.catalogo


def _formato(request: Request) -> FormatoDaFarmacia:
    return request.app.state.formato


def _simulacao(request: Request) -> SimulacaoDePrecos:
    return request.app.state.simulacao


def _tipo_de_notificacao(request: Request) -> str:
    return "webhook-agendado" if _formato(request).modo_de_integracao == "webhook" else "aguardando-polling"


def _saida(produto: Produto) -> ProdutoSaida:
    return ProdutoSaida.model_validate(produto, from_attributes=True)


@roteador.get("/loja", response_model=InformacoesDaLoja, summary="Identidade e modo de integração da loja")
async def informacoes_da_loja(request: Request) -> InformacoesDaLoja:
    formato, catalogo = _formato(request), _catalogo(request)
    return InformacoesDaLoja(
        farmacia_id=formato.farmacia_id,
        nome=formato.nome,
        modo_de_integracao=formato.modo_de_integracao,
        perfil_de_preco=formato.perfil_de_preco,
        tema=formato.tema,
        total_de_produtos=len(catalogo.listar()),
        versao_do_catalogo=catalogo.versao,
        rotas_nativas=formato.rotas_nativas,
    )


@roteador.get("/produtos", response_model=list[ProdutoSaida], summary="Produtos da loja com o preço atual")
async def listar_produtos(request: Request) -> list[ProdutoSaida]:
    return [_saida(produto) for produto in _catalogo(request).listar()]


@roteador.patch(
    "/produtos/{produto_id}/preco",
    response_model=ResultadoDaOperacao,
    summary="Altera o preço (evento de negócio que dispara o fluxo do PriceHub)",
)
async def alterar_preco(produto_id: int, novo_preco: NovoPreco, request: Request) -> ResultadoDaOperacao:
    try:
        produto, preco_anterior = await _catalogo(request).alterar_preco(produto_id, novo_preco.preco_centavos)
    except ProdutoInexistenteError as erro:
        raise RecursoNaoEncontrado(str(erro)) from erro
    except RegraDeNegocioVioladaError as erro:
        raise RequisicaoInvalida(str(erro)) from erro
    return ResultadoDaOperacao(
        produto=_saida(produto),
        preco_anterior_centavos=preco_anterior,
        notificacao=_tipo_de_notificacao(request),
        correlation_id=obter_correlation_id(),
    )


@roteador.post("/restaurar", response_model=ResultadoDaRestauracao, summary="Volta aos preços iniciais (carga completa)")
async def restaurar_carga_inicial(request: Request) -> ResultadoDaRestauracao:
    catalogo = _catalogo(request)
    produtos = carregar_semente(catalogo.farmacia_id)
    await catalogo.carregar(produtos)
    return ResultadoDaRestauracao(produtos=len(produtos), notificacao=_tipo_de_notificacao(request), correlation_id=obter_correlation_id())


@roteador.get("/simulacao", summary="Situação da simulação programada de preços")
async def situacao_da_simulacao(request: Request) -> dict:
    return _simulacao(request).situacao()


@roteador.put("/simulacao", summary="Liga, desliga ou muda o intervalo da simulação programada")
async def configurar_simulacao(configuracao: ConfiguracaoDaSimulacao, request: Request) -> dict:
    simulacao = _simulacao(request)
    simulacao.configurar(ativa=configuracao.ativa, intervalo_s=configuracao.intervalo_s)
    return simulacao.situacao()


@roteador.get("/webhooks", summary="Últimas entregas de webhook ao PriceHub (vazio para lojas de polling)")
async def ultimas_entregas(request: Request) -> list[dict]:
    notificador = getattr(request.app.state, "notificador", None)
    if notificador is None:
        return []
    return [entrega.__dict__ for entrega in notificador.ultimas_entregas]
