"""Tarefas periódicas do ms-ingestao.

* **Polling** (a cada ~15 s) das farmácias que não enviam webhooks, com ETag.
* **Reconciliação** (a cada ~2 min) de todas as farmácias: cobre webhooks que se
  perderam enquanto o PriceHub estava fora do ar e detecta farmácias que
  acabaram de subir (a primeira coleta delas povoa o catálogo).
"""

from __future__ import annotations

import asyncio

from app.servicos.ingestao import ServicoDeIngestao
from pricehub_common.erros import ServicoIndisponivel
from pricehub_common.logs import correlation_id_atual, novo_correlation_id, obter_logger

logger = obter_logger("ingestao.agendador")


class AgendadorDeColetas:
    def __init__(
        self,
        servico: ServicoDeIngestao,
        intervalo_de_polling_s: float,
        intervalo_de_reconciliacao_s: float,
        atraso_inicial_s: float,
    ) -> None:
        self._servico = servico
        self._intervalo_de_polling_s = intervalo_de_polling_s
        self._intervalo_de_reconciliacao_s = intervalo_de_reconciliacao_s
        self._atraso_inicial_s = atraso_inicial_s
        self._tarefas: list[asyncio.Task[None]] = []

    def iniciar(self) -> None:
        for adaptador in self._servico.adaptadores.todos():
            if adaptador.modo == "polling":
                self._tarefas.append(asyncio.create_task(self._repetir(adaptador.farmacia_id, "polling", self._intervalo_de_polling_s)))
            else:
                self._tarefas.append(
                    asyncio.create_task(self._repetir(adaptador.farmacia_id, "sincronizacao", self._intervalo_de_reconciliacao_s))
                )
        logger.info(
            "agendador iniciado",
            pollingS=self._intervalo_de_polling_s,
            reconciliacaoS=self._intervalo_de_reconciliacao_s,
        )

    async def _repetir(self, farmacia_id: str, origem: str, intervalo_s: float) -> None:
        await asyncio.sleep(self._atraso_inicial_s)
        while True:
            correlation_id_atual.set(novo_correlation_id())
            try:
                await self._servico.sincronizar(farmacia_id, origem)  # type: ignore[arg-type]
            except ServicoIndisponivel:
                pass  # já registrado pelo serviço; tenta de novo no próximo ciclo
            except Exception:  # noqa: BLE001
                logger.erro("tarefa agendada falhou", excecao=True, farmaciaId=farmacia_id)
            estado = self._servico.estado.de(farmacia_id)
            # Farmácia fora do ar (ou que ainda não entregou o catálogo) é sondada no ritmo do polling,
            # para que o PriceHub perceba logo quando ela subir.
            disponivel_e_carregada = estado.situacao == "disponivel" and estado.catalogo_recebido
            espera = intervalo_s if disponivel_e_carregada else min(intervalo_s, self._intervalo_de_polling_s)
            await asyncio.sleep(espera)

    async def parar(self) -> None:
        for tarefa in self._tarefas:
            tarefa.cancel()
        await asyncio.gather(*self._tarefas, return_exceptions=True)
        self._tarefas.clear()
