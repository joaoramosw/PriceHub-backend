from __future__ import annotations

from pricehub_common.eventos import ConsultaProjecaoSolicitada, Envelope, TipoDeEvento
from pricehub_common.mensageria import BarramentoDeEventos
from pricehub_common.persistencia import BancoDeDados
from pricehub_common.sse import DifusorDeEventos
from sqlalchemy import func, select

from app.persistencia import EventoProcessado, aplicar_snapshot


class ProjecoesDeConsulta:
    def __init__(self, banco: BancoDeDados, barramento: BarramentoDeEventos) -> None:
        self._banco = banco
        self._barramento = barramento
        self.difusor = DifusorDeEventos()

    async def iniciar(self, nome_da_fila: str) -> None:
        await self._barramento.assinar(nome_da_fila, ["catalogo.#"], self.processar, sequencial=True)
        # Cada réplica tem uma fila efêmera própria para avisar seus navegadores;
        # a fila durável de projeção é compartilhada e distribui o trabalho.
        await self._barramento.assinar(None, ["catalogo.#"], self._repassar_sse, exclusiva=True)
        async with self._banco.sessao() as sessao:
            total = int(await sessao.scalar(select(func.count()).select_from(EventoProcessado)) or 0)
        if total == 0:
            await self._barramento.publicar(
                TipoDeEvento.CONSULTA_PROJECAO_SOLICITADA,
                ConsultaProjecaoSolicitada(motivo="projecao-vazia"),
            )

    async def processar(self, envelope: Envelope) -> None:
        if envelope.tipo == "catalogo.visao.atualizada":
            async with self._banco.transacao() as sessao:
                await aplicar_snapshot(sessao, envelope)

    async def _repassar_sse(self, envelope: Envelope) -> None:
        self.difusor.difundir(
            envelope.tipo,
            {
                "idDoEvento": str(envelope.id_do_evento),
                "tipo": envelope.tipo,
                "ocorridoEm": envelope.ocorrido_em.isoformat(),
                "correlationId": envelope.correlation_id,
                "dados": envelope.dados,
            },
        )
