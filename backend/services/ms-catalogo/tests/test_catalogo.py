from datetime import UTC, datetime, timedelta

import pytest

from app.dominio.normalizacao import normalizar_principio_ativo
from app.persistencia.modelos import Base, proteger_historico_precos
from app.servicos.consultas import ConsultasDoCatalogo
from app.servicos.processador import ProcessadorDeEventosDeIngestao
from app.servicos.relay_da_outbox import RelayDaOutbox
from pricehub_common.eventos import (
    Concentracao,
    ConsultaProjecaoSolicitada,
    IngestaoColetaRealizada,
    IngestaoOfertaRecebida,
    OfertaCanonica,
    Quantidade,
    TipoDeEvento,
)
from pricehub_common.mensageria import BarramentoEmMemoria
from pricehub_common.persistencia import BancoDeDados

AGORA = datetime(2026, 11, 11, 12, 0, tzinfo=UTC)


def oferta(farmacia: str, codigo: str, principio: str, preco: int, registro: str | None = None, quando: datetime = AGORA) -> OfertaCanonica:
    return OfertaCanonica(
        farmacia_id=farmacia,
        farmacia_nome=farmacia.title(),
        codigo_externo=codigo,
        nome=f"{principio} 50mg",
        principio_ativo=principio,
        concentracao=Concentracao(valor=50, unidade="mg"),
        forma="comprimido revestido",
        quantidade=Quantidade(valor=30, unidade="unidade"),
        registro_ms=registro,
        preco_centavos=preco,
        atualizado_na_origem_em=quando,
        coletado_em=quando,
    )


@pytest.fixture
async def ambiente(tmp_path):
    banco = BancoDeDados(f"sqlite+aiosqlite:///{tmp_path}/catalogo.db")
    await banco.criar_tabelas(Base.metadata)
    await proteger_historico_precos(banco.engine)
    barramento = BarramentoEmMemoria("ms-catalogo")
    relay = RelayDaOutbox(banco, barramento, intervalo_s=1, lote=100)
    processador = ProcessadorDeEventosDeIngestao(banco, barramento)
    yield processador, barramento, relay, ConsultasDoCatalogo(banco)
    await banco.fechar()


async def receber(processador, barramento, dados, tipo=TipoDeEvento.INGESTAO_OFERTA_RECEBIDA):
    envelope = barramento.montar_envelope(tipo, dados, correlation_id="teste")
    await processador(envelope)
    return envelope


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("Cloridrato de Metformina", "metformina"),
        ("DIPIRONA SODICA", "dipirona"),
        ("Omeprazol Microgrânulos", "omeprazol"),
        ("Metamizol Sódico", "dipirona"),
    ],
)
def test_normalizacao_do_principio_ativo(texto: str, esperado: str) -> None:
    assert normalizar_principio_ativo(texto) == esperado


async def test_tres_farmacias_viram_um_unico_medicamento_ordenado_por_preco(ambiente) -> None:
    processador, barramento, _, consultas = ambiente
    await receber(
        processador,
        barramento,
        IngestaoOfertaRecebida(coleta_id="1", origem="polling", oferta=oferta("drogapopular", "DP-2", "LOSARTANA POTASSICA", 749)),
    )
    await receber(
        processador,
        barramento,
        IngestaoOfertaRecebida(
            coleta_id="2", origem="webhook", oferta=oferta("biofarma", "BIO-2", "Losartana Potássica", 1150, "1018104210023")
        ),
    )
    await receber(
        processador,
        barramento,
        IngestaoOfertaRecebida(
            coleta_id="3", origem="webhook", oferta=oferta("farmaazul", "FA-2", "Losartana Potássica", 890, "1018104210023")
        ),
    )

    medicamentos = await consultas.listar_medicamentos(busca="losartana", categoria=None)
    assert len(medicamentos) == 1
    detalhe = await consultas.detalhar_medicamento(medicamentos[0].id)
    assert [o.preco_centavos for o in detalhe.ofertas] == [749, 890, 1150]
    assert detalhe.ofertas[0].farmacia_id == "drogapopular"
    assert detalhe.nome == "Losartana Potássica 50mg"  # enriquecido pela fonte com registro MS
    assert detalhe.economia_maxima_centavos == 401


async def test_evento_repetido_nao_e_aplicado_duas_vezes(ambiente) -> None:
    processador, barramento, relay, consultas = ambiente
    envelope = await receber(
        processador,
        barramento,
        IngestaoOfertaRecebida(coleta_id="1", origem="webhook", oferta=oferta("biofarma", "BIO-2", "Losartana", 1150)),
    )
    await processador(envelope)  # mesma entrega de novo
    estatisticas = await consultas.estatisticas()
    assert estatisticas.registros_de_historico == 1
    assert estatisticas.eventos_processados == 1
    assert estatisticas.eventos_na_outbox_pendentes == 3  # cadastro, atualização da oferta e snapshot CQRS


async def test_alteracao_de_preco_gera_historico_e_evento_pela_outbox(ambiente) -> None:
    processador, barramento, relay, consultas = ambiente
    await receber(
        processador,
        barramento,
        IngestaoOfertaRecebida(coleta_id="1", origem="webhook", oferta=oferta("biofarma", "BIO-2", "Losartana", 1150)),
    )
    await receber(
        processador,
        barramento,
        IngestaoOfertaRecebida(
            coleta_id="2", origem="webhook", oferta=oferta("biofarma", "BIO-2", "Losartana", 999, quando=AGORA + timedelta(minutes=1))
        ),
    )

    assert await relay.publicar_pendentes() == 5
    atualizacoes = [e for e in barramento.publicados if e.tipo == "catalogo.oferta.atualizada"]
    assert atualizacoes[-1].dados["situacao"] == "preco-alterado"
    assert atualizacoes[-1].dados["precoAnteriorCentavos"] == 1150
    assert atualizacoes[-1].correlation_id == "teste"
    snapshots = [e for e in barramento.publicados if e.tipo == "catalogo.visao.atualizada"]
    assert len(snapshots) == 2
    assert snapshots[-1].dados["farmaciaId"] == "biofarma"
    assert snapshots[-1].dados["detalhe"]["ofertas"][0]["precoCentavos"] == 999
    medicamento = (await consultas.listar_medicamentos(None, None))[0]
    assert [p.preco_centavos for p in await consultas.historico(medicamento.id)] == [1150, 999]


async def test_historico_rejeita_update_e_delete_direto_no_banco(ambiente) -> None:
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError

    processador, barramento, _, _ = ambiente
    await receber(
        processador,
        barramento,
        IngestaoOfertaRecebida(coleta_id="1", origem="webhook", oferta=oferta("biofarma", "BIO-2", "Losartana", 1150)),
    )
    banco = processador._banco
    with pytest.raises(IntegrityError, match="imutavel"):
        async with banco.transacao() as sessao:
            await sessao.execute(text("UPDATE historico_precos SET preco_centavos = 1"))
    with pytest.raises(IntegrityError, match="imutavel"):
        async with banco.transacao() as sessao:
            await sessao.execute(text("DELETE FROM historico_precos"))


async def test_solicitacao_reconstroi_projecao_a_partir_do_catalogo(ambiente) -> None:
    processador, barramento, relay, _ = ambiente
    await receber(
        processador,
        barramento,
        IngestaoOfertaRecebida(coleta_id="1", origem="webhook", oferta=oferta("biofarma", "BIO-2", "Losartana", 1150)),
    )
    solicitacao = barramento.montar_envelope(
        TipoDeEvento.CONSULTA_PROJECAO_SOLICITADA,
        ConsultaProjecaoSolicitada(motivo="projecao-vazia"),
        correlation_id="reconstrucao-1",
    )
    await processador(solicitacao)
    await relay.publicar_pendentes()
    snapshot = [evento for evento in barramento.publicados if evento.tipo == "catalogo.visao.atualizada"][-1]
    assert snapshot.correlation_id == "reconstrucao-1"
    assert snapshot.dados["detalhe"]["nome"] == "Losartana 50mg"


async def test_evento_fora_de_ordem_e_ignorado(ambiente) -> None:
    processador, barramento, _, consultas = ambiente
    await receber(
        processador,
        barramento,
        IngestaoOfertaRecebida(coleta_id="1", origem="webhook", oferta=oferta("biofarma", "BIO-2", "Losartana", 999, quando=AGORA)),
    )
    await receber(
        processador,
        barramento,
        IngestaoOfertaRecebida(
            coleta_id="0", origem="webhook", oferta=oferta("biofarma", "BIO-2", "Losartana", 1500, quando=AGORA - timedelta(hours=1))
        ),
    )
    medicamento = (await consultas.listar_medicamentos(None, None))[0]
    assert medicamento.menor_preco_centavos == 999


async def test_coleta_completa_marca_como_indisponivel_o_que_sumiu(ambiente) -> None:
    processador, barramento, _, consultas = ambiente
    await receber(
        processador,
        barramento,
        IngestaoOfertaRecebida(coleta_id="1", origem="polling", oferta=oferta("drogapopular", "DP-1", "Losartana", 749)),
    )
    await receber(
        processador,
        barramento,
        IngestaoOfertaRecebida(coleta_id="1", origem="polling", oferta=oferta("drogapopular", "DP-2", "Sinvastatina", 1299)),
    )
    coleta = IngestaoColetaRealizada(
        coleta_id="2",
        farmacia_id="drogapopular",
        origem="polling",
        itens_recebidos=1,
        ofertas_publicadas=0,
        ofertas_sem_alteracao=1,
        descartadas=0,
        removidas=0,
        duracao_ms=3,
        catalogo_completo=True,
        codigos_presentes=["DP-1"],
    )
    await receber(processador, barramento, coleta, TipoDeEvento.INGESTAO_COLETA_REALIZADA)
    estatisticas = await consultas.estatisticas()
    assert (estatisticas.ofertas, estatisticas.ofertas_disponiveis) == (2, 1)
