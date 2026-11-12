"""API administrativa da farmácia: é por ela que o painel gere os produtos de cada loja.

Todas as farmácias expõem esta mesma API de gestão (para o painel), mas cada
uma mantém a sua API pública nativa e diferente (para o PriceHub).
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.esquemas import (
    InformacoesDaLoja,
    NovoPreco,
    ProdutoEntrada,
    ProdutoSaida,
    ResultadoDaOperacao,
    ResultadoDaRestauracao,
)
from app.dominio.catalogo import CatalogoDaFarmacia, CodigoDuplicadoError, ProdutoInexistenteError
from app.dominio.produto import Produto, RegraDeNegocioVioladaError, apresentacao_padrao
from app.formatos.base import FormatoDaFarmacia
from app.sementes import carregar_semente
from pricehub_common.erros import Conflito, RecursoNaoEncontrado, RequisicaoInvalida
from pricehub_common.logs import obter_correlation_id

roteador = APIRouter(prefix="/admin", tags=["gestao-da-loja"])


def _catalogo(request: Request) -> CatalogoDaFarmacia:
    return request.app.state.catalogo


def _formato(request: Request) -> FormatoDaFarmacia:
    return request.app.state.formato


def _tipo_de_notificacao(request: Request) -> str:
    return "webhook-agendado" if _formato(request).modo_de_integracao == "webhook" else "aguardando-polling"


def _saida(produto: Produto) -> ProdutoSaida:
    return ProdutoSaida.model_validate(produto, from_attributes=True)


def _dados_do_produto(entrada: ProdutoEntrada) -> dict:
    dados = entrada.model_dump()
    if not dados.get("apresentacao"):
        dados["apresentacao"] = apresentacao_padrao(entrada.forma_farmaceutica, entrada.quantidade_embalagem)
    return dados


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


@roteador.get("/produtos", response_model=list[ProdutoSaida], summary="Lista os produtos da loja")
async def listar_produtos(request: Request) -> list[ProdutoSaida]:
    return [_saida(produto) for produto in _catalogo(request).listar()]


@roteador.get("/produtos/{produto_id}", response_model=ProdutoSaida, summary="Detalha um produto")
async def detalhar_produto(produto_id: int, request: Request) -> ProdutoSaida:
    try:
        return _saida(_catalogo(request).buscar(produto_id))
    except ProdutoInexistenteError as erro:
        raise RecursoNaoEncontrado(str(erro)) from erro


@roteador.post("/produtos", status_code=201, response_model=ResultadoDaOperacao, summary="Cadastra um produto")
async def cadastrar_produto(entrada: ProdutoEntrada, request: Request) -> ResultadoDaOperacao:
    try:
        produto = await _catalogo(request).cadastrar(_dados_do_produto(entrada))
    except CodigoDuplicadoError as erro:
        raise Conflito(str(erro)) from erro
    return ResultadoDaOperacao(produto=_saida(produto), notificacao=_tipo_de_notificacao(request), correlation_id=obter_correlation_id())


@roteador.put("/produtos/{produto_id}", response_model=ResultadoDaOperacao, summary="Substitui os dados de um produto")
async def atualizar_produto(produto_id: int, entrada: ProdutoEntrada, request: Request) -> ResultadoDaOperacao:
    try:
        produto = await _catalogo(request).atualizar(produto_id, _dados_do_produto(entrada))
    except ProdutoInexistenteError as erro:
        raise RecursoNaoEncontrado(str(erro)) from erro
    except CodigoDuplicadoError as erro:
        raise Conflito(str(erro)) from erro
    return ResultadoDaOperacao(produto=_saida(produto), notificacao=_tipo_de_notificacao(request), correlation_id=obter_correlation_id())


@roteador.patch(
    "/produtos/{produto_id}/preco",
    response_model=ResultadoDaOperacao,
    summary="Altera o preço (dispara o fluxo orientado a eventos)",
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


@roteador.delete("/produtos/{produto_id}", response_model=ResultadoDaOperacao, summary="Remove um produto da loja")
async def remover_produto(produto_id: int, request: Request) -> ResultadoDaOperacao:
    try:
        produto = await _catalogo(request).remover(produto_id)
    except ProdutoInexistenteError as erro:
        raise RecursoNaoEncontrado(str(erro)) from erro
    return ResultadoDaOperacao(produto=_saida(produto), notificacao=_tipo_de_notificacao(request), correlation_id=obter_correlation_id())


@roteador.post("/restaurar", response_model=ResultadoDaRestauracao, summary="Volta o catálogo à carga inicial")
async def restaurar_carga_inicial(request: Request) -> ResultadoDaRestauracao:
    catalogo = _catalogo(request)
    produtos = carregar_semente(catalogo.farmacia_id)
    await catalogo.carregar(produtos)
    return ResultadoDaRestauracao(produtos=len(produtos), notificacao=_tipo_de_notificacao(request), correlation_id=obter_correlation_id())


@roteador.get("/webhooks", summary="Últimas entregas de webhook ao PriceHub (vazio para lojas de polling)")
async def ultimas_entregas(request: Request) -> list[dict]:
    notificador = getattr(request.app.state, "notificador", None)
    if notificador is None:
        return []
    return [entrega.__dict__ for entrega in notificador.ultimas_entregas]
