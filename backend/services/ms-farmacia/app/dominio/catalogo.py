"""Catálogo em memória da farmácia simulada: o *subject* do padrão Observer.

Conforme a orientação do trabalho, a farmácia não tem banco de dados. Os
produtos ficam em memória: alterou o preço, o novo valor já vale na hora e os
observadores são avisados imediatamente.
"""

from __future__ import annotations

from dataclasses import fields

from app.dominio.eventos import (
    CatalogoCarregado,
    EventoDoCatalogo,
    PrecoAlterado,
    ProdutoAtualizado,
    ProdutoCadastrado,
    ProdutoRemovido,
)
from app.dominio.observador import ObservadorDoCatalogo
from app.dominio.produto import Produto, RegraDeNegocioVioladaError
from pricehub_common.logs import obter_logger
from pricehub_common.tempo import agora_utc

logger = obter_logger("farmacia.catalogo")

CAMPOS_EDITAVEIS = {campo.name for campo in fields(Produto)} - {"id", "atualizado_em", "preco_centavos"}


class ProdutoInexistenteError(LookupError):
    pass


class CodigoDuplicadoError(ValueError):
    pass


class CatalogoDaFarmacia:
    def __init__(self, farmacia_id: str) -> None:
        self.farmacia_id = farmacia_id
        self._produtos: dict[int, Produto] = {}
        self._observadores: list[ObservadorDoCatalogo] = []
        self._versao = 0
        self._ultimo_id = 0

    # ----- gestão dos observadores -------------------------------------------------
    def anexar(self, observador: ObservadorDoCatalogo) -> None:
        if observador not in self._observadores:
            self._observadores.append(observador)

    def desanexar(self, observador: ObservadorDoCatalogo) -> None:
        self._observadores.remove(observador)

    async def _notificar(self, evento: EventoDoCatalogo) -> None:
        self._versao += 1
        for observador in self._observadores:
            try:
                await observador.atualizar(evento)
            except Exception:  # noqa: BLE001 - um observador com defeito não derruba os demais
                logger.erro("observador falhou", excecao=True, observador=type(observador).__name__, evento=evento.nome)

    # ----- consultas ---------------------------------------------------------------
    @property
    def versao(self) -> int:
        """Muda a cada alteração. Usada como ETag para o polling da DrogaPopular."""
        return self._versao

    def listar(self) -> list[Produto]:
        return sorted(self._produtos.values(), key=lambda produto: produto.id)

    def buscar(self, produto_id: int) -> Produto:
        produto = self._produtos.get(produto_id)
        if produto is None:
            raise ProdutoInexistenteError(f"produto {produto_id} não existe nesta farmácia")
        return produto

    def _garantir_codigo_unico(self, codigo: str, ignorar_id: int | None = None) -> None:
        for produto in self._produtos.values():
            if produto.codigo == codigo and produto.id != ignorar_id:
                raise CodigoDuplicadoError(f"já existe um produto com o código {codigo}")

    # ----- comandos (cada um notifica os observadores) -----------------------------
    async def carregar(self, produtos: list[Produto]) -> None:
        self._produtos = {produto.id: produto for produto in produtos}
        self._ultimo_id = max([self._ultimo_id, *self._produtos])
        await self._notificar(CatalogoCarregado(produtos=[produto.copiar() for produto in self.listar()]))
        logger.info("catálogo carregado", farmaciaId=self.farmacia_id, produtos=len(produtos))

    async def cadastrar(self, dados: dict) -> Produto:
        self._garantir_codigo_unico(dados["codigo"])
        self._ultimo_id += 1  # identificadores nunca são reaproveitados
        produto = Produto(id=self._ultimo_id, atualizado_em=agora_utc(), **dados)
        self._produtos[produto.id] = produto
        await self._notificar(ProdutoCadastrado(produto=produto.copiar()))
        return produto

    async def atualizar(self, produto_id: int, dados: dict) -> Produto:
        produto = self.buscar(produto_id)
        self._garantir_codigo_unico(dados.get("codigo", produto.codigo), ignorar_id=produto_id)
        novo_preco = dados.pop("preco_centavos", None)
        for campo, valor in dados.items():
            if campo in CAMPOS_EDITAVEIS:
                setattr(produto, campo, valor)
        produto.atualizado_em = agora_utc()
        if novo_preco is not None and novo_preco != produto.preco_centavos:
            preco_anterior = produto.alterar_preco(novo_preco)
            await self._notificar(PrecoAlterado(produto=produto.copiar(), preco_anterior_centavos=preco_anterior))
        else:
            await self._notificar(ProdutoAtualizado(produto=produto.copiar()))
        return produto

    async def alterar_preco(self, produto_id: int, novo_preco_centavos: int) -> tuple[Produto, int]:
        produto = self.buscar(produto_id)
        if novo_preco_centavos == produto.preco_centavos:
            raise RegraDeNegocioVioladaError("o novo preço é igual ao preço atual")
        preco_anterior = produto.alterar_preco(novo_preco_centavos)
        await self._notificar(PrecoAlterado(produto=produto.copiar(), preco_anterior_centavos=preco_anterior))
        return produto, preco_anterior

    async def remover(self, produto_id: int) -> Produto:
        produto = self.buscar(produto_id)
        del self._produtos[produto_id]
        await self._notificar(ProdutoRemovido(produto=produto.copiar()))
        return produto
