"""Consumidor dos eventos de ingestão: é aqui que o catálogo centralizado muda.

Cada evento é aplicado em **uma** transação que inclui:

1. o registro de idempotência (``eventos_processados``);
2. a alteração dos dados (medicamento, oferta, histórico);
3. os eventos de saída gravados na ``outbox``.

Se qualquer passo falhar, nada é gravado e o RabbitMQ entrega o evento de novo
(retry). Se o mesmo evento chegar duas vezes, a segunda entrega é ignorada.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import UTC, datetime

from app.dominio.correspondencia import OfertaNormalizada, ServicoDeCorrespondencia
from app.dominio.normalizacao import descrever_apresentacao
from app.persistencia.modelos import Medicamento, Oferta
from app.persistencia.repositorios import RepositorioDoCatalogo
from pricehub_common.eventos import (
    CatalogoMedicamentoCadastrado,
    CatalogoOfertaAtualizada,
    CatalogoOfertaIndisponivel,
    CatalogoOfertaNaoCorrespondida,
    Envelope,
    IngestaoColetaRealizada,
    IngestaoOfertaRecebida,
    IngestaoOfertaRemovida,
    ModeloDeContrato,
    TipoDeEvento,
    ler_dados,
)
from pricehub_common.logs import obter_logger
from pricehub_common.mensageria import BarramentoDeEventos
from pricehub_common.persistencia import BancoDeDados
from pricehub_common.tempo import agora_utc

logger = obter_logger("catalogo.processador")

EVENTOS_CONSUMIDOS = [
    TipoDeEvento.INGESTAO_OFERTA_RECEBIDA.value,
    TipoDeEvento.INGESTAO_OFERTA_REMOVIDA.value,
    TipoDeEvento.INGESTAO_COLETA_REALIZADA.value,
]


def _variacao_percentual(anterior: int | None, atual: int) -> float | None:
    if not anterior:
        return None
    return round((atual - anterior) / anterior * 100, 2)


def _em_utc(instante: datetime) -> datetime:
    # Alguns bancos (ex.: SQLite nos testes) devolvem datas sem fuso; o PriceHub grava sempre em UTC.
    return instante if instante.tzinfo else instante.replace(tzinfo=UTC)


def _mais_antigo(recebido: datetime | None, atual: datetime | None) -> bool:
    return recebido is not None and atual is not None and _em_utc(recebido) < _em_utc(atual)


class ProcessadorDeEventosDeIngestao:
    def __init__(
        self,
        banco: BancoDeDados,
        barramento: BarramentoDeEventos,
        correspondencia: ServicoDeCorrespondencia | None = None,
        ao_gravar_na_outbox: Callable[[], None] | None = None,
    ) -> None:
        self._banco = banco
        self._barramento = barramento
        self._correspondencia = correspondencia or ServicoDeCorrespondencia()
        self._ao_gravar_na_outbox = ao_gravar_na_outbox or (lambda: None)

    async def __call__(self, envelope: Envelope) -> None:
        async with self._banco.transacao() as sessao:
            repositorio = RepositorioDoCatalogo(sessao)
            if await repositorio.evento_ja_processado(str(envelope.id_do_evento)):
                logger.info("evento repetido ignorado (idempotência)", tipo=envelope.tipo, idDoEvento=str(envelope.id_do_evento))
                return
            repositorio.marcar_evento_processado(envelope)
            dados = ler_dados(envelope.tipo, envelope.dados)
            saidas: list[Envelope] = []
            if isinstance(dados, IngestaoOfertaRecebida):
                saidas = await self._registrar_oferta(repositorio, dados, envelope)
            elif isinstance(dados, IngestaoOfertaRemovida):
                saidas = await self._retirar_oferta(
                    repositorio, dados.farmacia_id, dados.codigo_externo, "removida pela farmácia", envelope
                )
            elif isinstance(dados, IngestaoColetaRealizada):
                saidas = await self._conciliar_coleta(repositorio, dados, envelope)
            for saida in saidas:
                repositorio.enfileirar_na_outbox(saida)
        if saidas:
            self._ao_gravar_na_outbox()

    def _evento(self, tipo: TipoDeEvento, dados: ModeloDeContrato, origem: Envelope) -> Envelope:
        return self._barramento.montar_envelope(tipo, dados, origem.correlation_id)

    async def _registrar_oferta(
        self, repositorio: RepositorioDoCatalogo, dados: IngestaoOfertaRecebida, envelope: Envelope
    ) -> list[Envelope]:
        oferta_recebida = dados.oferta
        normalizada = OfertaNormalizada.de(oferta_recebida)
        resultado = await self._correspondencia.corresponder(normalizada, repositorio)
        saidas: list[Envelope] = []

        if resultado.tipo == "nao-correspondido" or resultado.medicamento is None:
            motivo = resultado.motivo or "sem correspondência"
            repositorio.registrar_nao_correspondida(
                oferta_recebida.farmacia_id, oferta_recebida.codigo_externo, motivo, oferta_recebida.para_json()
            )
            logger.aviso(
                "oferta sem correspondência", farmaciaId=oferta_recebida.farmacia_id, codigo=oferta_recebida.codigo_externo, motivo=motivo
            )
            return [
                self._evento(
                    TipoDeEvento.CATALOGO_OFERTA_NAO_CORRESPONDIDA,
                    CatalogoOfertaNaoCorrespondida(
                        farmacia_id=oferta_recebida.farmacia_id, codigo_externo=oferta_recebida.codigo_externo, motivo=motivo
                    ),
                    envelope,
                )
            ]

        medicamento: Medicamento = resultado.medicamento
        if resultado.tipo == "novo":
            repositorio.adicionar(medicamento)
            saidas.append(
                self._evento(
                    TipoDeEvento.CATALOGO_MEDICAMENTO_CADASTRADO,
                    CatalogoMedicamentoCadastrado(
                        medicamento_id=medicamento.id,
                        nome=medicamento.nome,
                        principio_ativo=medicamento.principio_ativo,
                        apresentacao=descrever_apresentacao(
                            medicamento.forma, medicamento.quantidade_valor, medicamento.quantidade_unidade
                        ),
                        chave_canonica=medicamento.chave_canonica,
                    ),
                    envelope,
                )
            )
        medicamento.atualizado_em = agora_utc()

        farmacia = await repositorio.garantir_farmacia(oferta_recebida.farmacia_id, oferta_recebida.farmacia_nome)
        oferta = await repositorio.oferta_por_codigo(farmacia.id, oferta_recebida.codigo_externo)

        if oferta is not None and _mais_antigo(oferta_recebida.atualizado_na_origem_em, oferta.atualizado_na_origem_em):
            logger.info("evento obsoleto ignorado (chegou fora de ordem)", codigo=oferta.codigo_externo)
            return saidas

        if oferta is None:
            situacao, preco_anterior = "nova", None
            oferta = Oferta(
                id=str(uuid.uuid4()),
                medicamento_id=medicamento.id,
                farmacia_id=farmacia.id,
                codigo_externo=oferta_recebida.codigo_externo,
                nome_na_farmacia=oferta_recebida.nome,
                preco_centavos=oferta_recebida.preco_centavos,
                url_do_produto=oferta_recebida.url_do_produto,
                disponivel=True,
                atualizado_na_origem_em=oferta_recebida.atualizado_na_origem_em,
                atualizado_em=agora_utc(),
            )
            repositorio.adicionar(oferta)
        else:
            preco_anterior = oferta.preco_centavos
            if not oferta.disponivel:
                situacao = "reativada"
            elif oferta.preco_centavos != oferta_recebida.preco_centavos:
                situacao = "preco-alterado"
            else:
                situacao = "inalterada"
            oferta.medicamento_id = medicamento.id
            oferta.nome_na_farmacia = oferta_recebida.nome
            oferta.preco_centavos = oferta_recebida.preco_centavos
            oferta.url_do_produto = oferta_recebida.url_do_produto
            oferta.disponivel = True
            oferta.atualizado_na_origem_em = oferta_recebida.atualizado_na_origem_em
            oferta.atualizado_em = agora_utc()

        logger.info(
            "oferta aplicada ao catálogo",
            farmaciaId=farmacia.id,
            codigo=oferta.codigo_externo,
            situacao=situacao,
            estrategia=resultado.estrategia,
            precoAnteriorCentavos=preco_anterior,
            precoAtualCentavos=oferta.preco_centavos,
        )
        if situacao == "inalterada":
            return saidas

        await repositorio.sessao.flush()
        repositorio.registrar_historico(oferta, envelope.correlation_id)
        saidas.append(
            self._evento(
                TipoDeEvento.CATALOGO_OFERTA_ATUALIZADA,
                CatalogoOfertaAtualizada(
                    oferta_id=oferta.id,
                    medicamento_id=medicamento.id,
                    medicamento_nome=medicamento.nome,
                    farmacia_id=farmacia.id,
                    farmacia_nome=farmacia.nome,
                    situacao=situacao,
                    preco_anterior_centavos=preco_anterior,
                    preco_atual_centavos=oferta.preco_centavos,
                    variacao_percentual=_variacao_percentual(preco_anterior, oferta.preco_centavos),
                    estrategia_de_correspondencia=resultado.estrategia,
                    atualizado_na_origem_em=oferta.atualizado_na_origem_em,
                ),
                envelope,
            )
        )
        return saidas

    async def _retirar_oferta(
        self, repositorio: RepositorioDoCatalogo, farmacia_id: str, codigo_externo: str, motivo: str, envelope: Envelope
    ) -> list[Envelope]:
        oferta = await repositorio.oferta_por_codigo(farmacia_id, codigo_externo)
        if oferta is None or not oferta.disponivel:
            return []
        return [self._marcar_indisponivel(oferta, motivo, envelope)]

    def _marcar_indisponivel(self, oferta: Oferta, motivo: str, envelope: Envelope) -> Envelope:
        oferta.disponivel = False
        oferta.atualizado_em = agora_utc()
        logger.info("oferta marcada como indisponível", farmaciaId=oferta.farmacia_id, codigo=oferta.codigo_externo, motivo=motivo)
        return self._evento(
            TipoDeEvento.CATALOGO_OFERTA_INDISPONIVEL,
            CatalogoOfertaIndisponivel(
                oferta_id=oferta.id, medicamento_id=oferta.medicamento_id, farmacia_id=oferta.farmacia_id, motivo=motivo
            ),
            envelope,
        )

    async def _conciliar_coleta(
        self, repositorio: RepositorioDoCatalogo, dados: IngestaoColetaRealizada, envelope: Envelope
    ) -> list[Envelope]:
        """Coleta completa: ofertas que sumiram do catálogo da farmácia ficam indisponíveis."""
        if not dados.catalogo_completo:
            return []
        ausentes = await repositorio.ofertas_disponiveis_fora_da_lista(dados.farmacia_id, dados.codigos_presentes)
        return [self._marcar_indisponivel(oferta, "ausente na coleta completa", envelope) for oferta in ausentes]
