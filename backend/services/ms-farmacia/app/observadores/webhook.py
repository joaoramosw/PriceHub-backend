"""Observador que avisa o PriceHub por webhook assinado (HMAC-SHA256).

Quando o preço muda, o catálogo chama ``atualizar`` e este observador agenda o
envio em segundo plano. A farmácia não fica esperando o PriceHub processar
(comunicação desacoplada). Se o PriceHub estiver fora do ar, há novas tentativas
com espera crescente; se ainda assim falhar, a sincronização periódica do
ms-ingestao recupera a diferença.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import time
from collections import deque
from dataclasses import asdict, dataclass

import httpx

from app.dominio.eventos import EventoDoCatalogo
from app.dominio.observador import ObservadorDoCatalogo
from app.formatos.base import FormatoDaFarmacia
from pricehub_common.logs import correlation_id_atual, obter_logger
from pricehub_common.tempo import agora_utc

CABECALHO_DE_ASSINATURA = "x-pricehub-assinatura"
CABECALHO_DE_CORRELACAO = "x-correlation-id"
ESPERA_INICIAL_S = 0.5

logger = obter_logger("farmacia.webhook")


def assinar_corpo(corpo: bytes, segredo: str) -> str:
    return "sha256=" + hmac.new(segredo.encode(), corpo, hashlib.sha256).hexdigest()


@dataclass
class EntregaDeWebhook:
    evento: str
    instante: str
    correlation_id: str
    status_http: int | None
    tentativas: int
    duracao_ms: float
    entregue: bool
    erro: str | None = None


class NotificadorDeWebhook(ObservadorDoCatalogo):
    def __init__(
        self,
        formato: FormatoDaFarmacia,
        url_de_destino: str,
        segredo: str,
        *,
        timeout_s: float = 3.0,
        tentativas_maximas: int = 4,
        cliente_http: httpx.AsyncClient | None = None,
    ) -> None:
        self._formato = formato
        self._url_de_destino = url_de_destino
        self._segredo = segredo
        self._timeout_s = timeout_s
        self._tentativas_maximas = tentativas_maximas
        self._cliente_http = cliente_http or httpx.AsyncClient(timeout=timeout_s)
        self._envios_em_andamento: set[asyncio.Task[None]] = set()
        self.ultimas_entregas: deque[EntregaDeWebhook] = deque(maxlen=50)

    async def atualizar(self, evento: EventoDoCatalogo) -> None:
        corpo_do_webhook = self._formato.payload_de_webhook(evento)
        if corpo_do_webhook is None:
            return
        tarefa = asyncio.create_task(self._entregar(evento, corpo_do_webhook))
        self._envios_em_andamento.add(tarefa)
        tarefa.add_done_callback(self._envios_em_andamento.discard)

    async def aguardar_envios(self) -> None:
        """Usado nos testes e no desligamento para não perder envios em andamento."""
        if self._envios_em_andamento:
            await asyncio.gather(*self._envios_em_andamento, return_exceptions=True)

    async def _entregar(self, evento: EventoDoCatalogo, corpo_do_webhook: dict) -> None:
        correlation_id_atual.set(evento.correlation_id)
        corpo = json.dumps(corpo_do_webhook, ensure_ascii=False).encode("utf-8")
        cabecalhos = {
            "content-type": "application/json",
            CABECALHO_DE_ASSINATURA: assinar_corpo(corpo, self._segredo),
            CABECALHO_DE_CORRELACAO: evento.correlation_id,
        }
        inicio = time.perf_counter()
        espera_s = ESPERA_INICIAL_S
        status_http: int | None = None
        ultimo_erro: str | None = None

        for tentativa in range(1, self._tentativas_maximas + 1):
            try:
                resposta = await self._cliente_http.post(self._url_de_destino, content=corpo, headers=cabecalhos)
                status_http = resposta.status_code
                if resposta.is_success:
                    self._registrar(evento, status_http, tentativa, inicio, entregue=True)
                    return
                ultimo_erro = f"HTTP {status_http}: {resposta.text[:200]}"
                if 400 <= status_http < 500:
                    break  # erro do cliente: repetir não resolve
            except httpx.HTTPError as erro:
                ultimo_erro = f"{type(erro).__name__}: {erro}"
            logger.aviso("webhook não entregue; nova tentativa", tentativa=tentativa, erro=ultimo_erro)
            await asyncio.sleep(espera_s)
            espera_s *= 2

        self._registrar(evento, status_http, self._tentativas_maximas, inicio, entregue=False, erro=ultimo_erro)

    def _registrar(
        self,
        evento: EventoDoCatalogo,
        status_http: int | None,
        tentativas: int,
        inicio: float,
        *,
        entregue: bool,
        erro: str | None = None,
    ) -> None:
        entrega = EntregaDeWebhook(
            evento=evento.nome,
            instante=agora_utc().isoformat(),
            correlation_id=evento.correlation_id,
            status_http=status_http,
            tentativas=tentativas,
            duracao_ms=round((time.perf_counter() - inicio) * 1000, 2),
            entregue=entregue,
            erro=erro,
        )
        self.ultimas_entregas.appendleft(entrega)
        if entregue:
            logger.info("webhook entregue ao PriceHub", **asdict(entrega))
        else:
            logger.erro("webhook não entregue; a sincronização periódica cobrirá a perda", **asdict(entrega))

    async def fechar(self) -> None:
        await self.aguardar_envios()
        await self._cliente_http.aclose()
