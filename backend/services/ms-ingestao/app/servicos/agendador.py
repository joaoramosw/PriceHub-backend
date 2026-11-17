"""Tarefas periódicas do ms-ingestao.

* **Polling** (a cada ~5 s) das farmácias que não enviam webhooks, com ETag.
* **Carga inicial garantida** das farmácias com webhook: enquanto o catálogo de uma
  delas não chegou (por exemplo, a farmácia subiu antes do PriceHub e o webhook da
  carga se perdeu), o ms-ingestao busca o catálogo no ritmo do polling. Depois que
  chegou, só os webhooks atualizam os preços.
"""

from __future__ import annotations

import asyncio

from app.servicos.ingestao import ServicoDeIngestao
from pricehub_common.erros import ServicoIndisponivel
from pricehub_common.logs import correlation_id_atual, novo_correlation_id, obter_logger

logger = obter_logger("ingestao.agendador")


class AgendadorDeColetas:
    def __init__(self, servico: ServicoDeIngestao, intervalo_de_polling_s: float, atraso_inicial_s: float) -> None:
        self._servico = servico
        self._intervalo_de_polling_s = intervalo_de_polling_s
        self._atraso_inicial_s = atraso_inicial_s
        self._tarefas: list[asyncio.Task[None]] = []

    def iniciar(self) -> None:
        for adaptador in self._servico.adaptadores.todos():
            continuar_depois_da_carga = adaptador.modo == "polling"
            origem = "polling" if continuar_depois_da_carga else "sincronizacao"
            self._tarefas.append(asyncio.create_task(self._repetir(adaptador.farmacia_id, origem, continuar_depois_da_carga)))
        logger.info("agendador iniciado", pollingS=self._intervalo_de_polling_s)

    async def _repetir(self, farmacia_id: str, origem: str, continuar_depois_da_carga: bool) -> None:
        await asyncio.sleep(self._atraso_inicial_s)
        while True:
            estado = self._servico.estado.de(farmacia_id)
            if not continuar_depois_da_carga and estado.catalogo_recebido:
                logger.info("catálogo inicial recebido; daqui em diante só por webhook", farmaciaId=farmacia_id)
                return
            correlation_id_atual.set(novo_correlation_id())
            try:
                await self._servico.sincronizar(farmacia_id, origem)  # type: ignore[arg-type]
            except ServicoIndisponivel:
                pass  # já registrado pelo serviço; tenta de novo no próximo ciclo
            except Exception:  # noqa: BLE001
                logger.erro("tarefa agendada falhou", excecao=True, farmaciaId=farmacia_id)
            await asyncio.sleep(self._intervalo_de_polling_s)

    async def parar(self) -> None:
        for tarefa in self._tarefas:
            tarefa.cancel()
        await asyncio.gather(*self._tarefas, return_exceptions=True)
        self._tarefas.clear()
