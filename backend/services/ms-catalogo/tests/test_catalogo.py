from datetime import UTC, datetime, timedelta

import pytest

from app.dominio.normalizacao import normalizar_principio_ativo
from app.persistencia.modelos import Base
from app.servicos.consultas import ConsultasDoCatalogo
from app.servicos.processador import ProcessadorDeEventosDeIngestao
from app.servicos.relay_da_outbox import RelayDaOutbox
from pricehub_common.eventos import (
    Concentracao,
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
    assert estatisticas.eventos_na_outbox_pendentes == 2  # medicamento cadastrado + oferta atualizada


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

    assert await relay.publicar_pendentes() == 3
    atualizacoes = [e for e in barramento.publicados if e.tipo == "catalogo.oferta.atualizada"]
    assert atualizacoes[-1].dados["situacao"] == "preco-alterado"
    assert atualizacoes[-1].dados["precoAnteriorCentavos"] == 1150
    assert atualizacoes[-1].correlation_id == "teste"
    medicamento = (await consultas.listar_medicamentos(None, None))[0]
    assert [p.preco_centavos for p in await consultas.historico(medicamento.id)] == [1150, 999]


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


async def test_historico_guarda_a_origem_e_troca_da_mais_barata_vira_evento(ambiente) -> None:
    processador, barramento, relay, consultas = ambiente
    depois = AGORA + timedelta(minutes=1)

    def recebida(farmacia: str, codigo: str, preco: int, origem: str, quando=AGORA) -> IngestaoOfertaRecebida:
        dados = oferta(farmacia, codigo, "Losartana", preco, "1018104210023", quando=quando)
        return IngestaoOfertaRecebida(
            coleta_id=codigo, origem="webhook", oferta=dados.model_copy(update={"origem_da_alteracao": origem})
        )

    await receber(processador, barramento, recebida("biofarma", "BIO-2", 1150, "carga-inicial"))
    await receber(processador, barramento, recebida("farmaazul", "FA-2", 890, "carga-inicial"))
    # A BioFarma baixa o preço e passa a ser a mais barata.
    await receber(processador, barramento, recebida("biofarma", "BIO-2", 849, "programada", quando=depois))
    await relay.publicar_pendentes()

    medicamento = (await consultas.listar_medicamentos(None, None))[0]
    historico = await consultas.historico(medicamento.id)
    assert [(p.farmacia_id, p.preco_centavos, p.origem) for p in historico] == [
        ("biofarma", 1150, "carga-inicial"),
        ("farmaazul", 890, "carga-inicial"),
        ("biofarma", 849, "programada"),
    ]
    trocas = [e for e in barramento.publicados if e.tipo == "catalogo.menor-preco.alterado"]
    # Duas trocas: a FarmaAzul chega mais barata (1150 -> 890) e depois a BioFarma baixa (890 -> 849).
    assert [(t.dados["farmaciaAnteriorId"], t.dados["farmaciaAtualId"]) for t in trocas] == [
        ("biofarma", "farmaazul"),
        ("farmaazul", "biofarma"),
    ]
    assert trocas[-1].dados["precoAnteriorCentavos"] == 890 and trocas[-1].dados["precoAtualCentavos"] == 849
    atualizada = [e for e in barramento.publicados if e.tipo == "catalogo.oferta.atualizada"][-1]
    assert atualizada.dados["origemDaAlteracao"] == "programada"
