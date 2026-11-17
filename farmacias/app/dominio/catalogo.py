"""Catálogo em memória da farmácia simulada: o *subject* do padrão Observer.

Conforme a orientação do trabalho, a farmácia não tem banco de dados. Os
produtos ficam em memória: alterou o preço, o novo valor já vale na hora e os
observadores são avisados imediatamente. A única operação de negócio da loja é
alterar o preço, feita pela tela de administração ou pela simulação programada.
"""

from __future__ import annotations

from app.dominio.eventos import CatalogoCarregado, EventoDoCatalogo, PrecoAlterado
from app.dominio.observador import ObservadorDoCatalogo
from app.dominio.produto import Produto, RegraDeNegocioVioladaError
from app.suporte.logs import obter_logger

logger = obter_logger("farmacia.catalogo")


class ProdutoInexistenteError(LookupError):
    pass


class CatalogoDaFarmacia:
    def __init__(self, farmacia_id: str) -> None:
        self.farmacia_id = farmacia_id
        self._produtos: dict[int, Produto] = {}
        self._observadores: list[ObservadorDoCatalogo] = []
        self._versao = 0

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

    def buscar_por_codigo(self, codigo: str) -> Produto:
        for produto in self._produtos.values():
            if produto.codigo.upper() == codigo.upper():
                return produto
        raise ProdutoInexistenteError(f"produto {codigo} não existe nesta farmácia")

    # ----- comandos (cada um notifica os observadores) -----------------------------
    async def carregar(self, produtos: list[Produto]) -> None:
        for produto in produtos:
            produto.origem_do_preco = "carga-inicial"
        self._produtos = {produto.id: produto for produto in produtos}
        await self._notificar(CatalogoCarregado(produtos=[produto.copiar() for produto in self.listar()]))
        logger.info("catálogo carregado", farmaciaId=self.farmacia_id, produtos=len(produtos))

    async def alterar_preco(self, produto_id: int, novo_preco_centavos: int, *, origem: str = "manual") -> tuple[Produto, int]:
        """Evento de negócio da farmácia: o preço de um produto mudou."""
        produto = self.buscar(produto_id)
        if novo_preco_centavos == produto.preco_centavos:
            raise RegraDeNegocioVioladaError("o novo preço é igual ao preço atual")
        preco_anterior = produto.alterar_preco(novo_preco_centavos, origem=origem)
        await self._notificar(PrecoAlterado(produto=produto.copiar(), preco_anterior_centavos=preco_anterior, origem=origem))
        return produto, preco_anterior
