"""Simulação programada de alterações de preço.

A cada ``intervalo_s`` a farmácia pega o próximo produto (em rodízio) e aplica o
próximo preço da tabela ``precos_programados.json``. A alteração passa pelo mesmo
``CatalogoDaFarmacia.alterar_preco`` usado na tela /admin: para o PriceHub é
exatamente uma edição feita pela loja, e o Observer avisa o PriceHub do mesmo jeito.

Ao chegar ao fim da lista de um produto, a simulação volta percorrendo a lista ao
contrário (vai e volta), para não haver salto do último preço para o primeiro.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections import deque
from dataclasses import asdict, dataclass
from pathlib import Path

from app.dominio.catalogo import CatalogoDaFarmacia
from app.dominio.produto import RegraDeNegocioVioladaError
from app.suporte.logs import correlation_id_atual, novo_correlation_id, obter_logger
from app.suporte.tempo import agora_utc

ARQUIVO_DE_PRECOS = Path(__file__).resolve().parents[1] / "sementes" / "precos_programados.json"
INTERVALO_MINIMO_S = 0.5

logger = obter_logger("farmacia.simulacao")


def carregar_precos_programados(farmacia_id: str, arquivo: Path = ARQUIVO_DE_PRECOS) -> dict[str, list[int]]:
    return json.loads(arquivo.read_text(encoding="utf-8"))["farmacias"][farmacia_id]


def indice_vai_e_volta(passo: int, tamanho: int) -> int:
    """0, 1, ..., n-1, n-2, ..., 1, 0, 1, ... (sem repetir as pontas)."""
    if tamanho <= 1:
        return 0
    periodo = 2 * tamanho - 2
    posicao = passo % periodo
    return posicao if posicao < tamanho else periodo - posicao


@dataclass
class AlteracaoProgramada:
    instante: str
    codigo: str
    nome: str
    preco_anterior_centavos: int
    preco_atual_centavos: int
    correlation_id: str


class SimulacaoDePrecos:
    def __init__(
        self,
        catalogo: CatalogoDaFarmacia,
        precos_por_codigo: dict[str, list[int]],
        *,
        intervalo_s: float = 5.0,
        ativa: bool = True,
        atraso_inicial_s: float = 0.0,
    ) -> None:
        self._catalogo = catalogo
        self._precos = precos_por_codigo
        self.intervalo_s = max(INTERVALO_MINIMO_S, intervalo_s)
        self.ativa = ativa
        self._atraso_inicial_s = atraso_inicial_s
        self._passo = 0
        self._passos_por_codigo: dict[str, int] = {}
        self._tarefa: asyncio.Task[None] | None = None
        self._acordar = asyncio.Event()
        self.ultimas: deque[AlteracaoProgramada] = deque(maxlen=20)

    @property
    def total_de_alteracoes(self) -> int:
        return self._passo

    async def aplicar_proxima(self) -> AlteracaoProgramada | None:
        produtos = [produto for produto in self._catalogo.listar() if self._precos.get(produto.codigo)]
        if not produtos:
            return None
        produto = produtos[self._passo % len(produtos)]
        self._passo += 1
        sequencia = self._precos[produto.codigo]
        passo_do_produto = self._passos_por_codigo.get(produto.codigo, 0)
        novo_preco = sequencia[indice_vai_e_volta(passo_do_produto, len(sequencia))]
        self._passos_por_codigo[produto.codigo] = passo_do_produto + 1
        if novo_preco == produto.preco_centavos:  # ex.: depois de um "restaurar"; segue para o próximo valor
            novo_preco = sequencia[indice_vai_e_volta(passo_do_produto + 1, len(sequencia))]
            self._passos_por_codigo[produto.codigo] = passo_do_produto + 2

        correlation_id_atual.set(novo_correlation_id())  # cada alteração é uma operação rastreável
        try:
            _, preco_anterior = await self._catalogo.alterar_preco(produto.id, novo_preco, origem="programada")
        except RegraDeNegocioVioladaError:
            return None
        alteracao = AlteracaoProgramada(
            instante=agora_utc().isoformat(),
            codigo=produto.codigo,
            nome=produto.nome_comercial,
            preco_anterior_centavos=preco_anterior,
            preco_atual_centavos=novo_preco,
            correlation_id=correlation_id_atual.get() or "",
        )
        self.ultimas.appendleft(alteracao)
        return alteracao

    def configurar(self, *, ativa: bool | None = None, intervalo_s: float | None = None) -> None:
        if ativa is not None:
            self.ativa = ativa
        if intervalo_s is not None:
            self.intervalo_s = max(INTERVALO_MINIMO_S, intervalo_s)
        self._acordar.set()  # aplica o novo intervalo sem esperar o tick atual terminar
        logger.info("simulação reconfigurada", ativa=self.ativa, intervaloS=self.intervalo_s)

    def situacao(self) -> dict:
        tamanho = max((len(lista) for lista in self._precos.values()), default=0)
        return {
            "ativa": self.ativa,
            "intervaloS": self.intervalo_s,
            "alteracoesAplicadas": self._passo,
            "precosPorProduto": tamanho,
            "ultimas": [asdict(alteracao) for alteracao in self.ultimas],
        }

    def iniciar(self) -> None:
        if self._tarefa is None:
            self._tarefa = asyncio.create_task(self._laco())

    async def parar(self) -> None:
        if self._tarefa is not None:
            self._tarefa.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._tarefa
            self._tarefa = None

    async def _laco(self) -> None:
        await asyncio.sleep(self._atraso_inicial_s)
        while True:
            if self.ativa:
                try:
                    await self.aplicar_proxima()
                except Exception:  # noqa: BLE001 - a simulação não pode parar por um erro pontual
                    logger.erro("falha ao aplicar preço programado", excecao=True)
            self._acordar.clear()
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._acordar.wait(), timeout=self.intervalo_s)
