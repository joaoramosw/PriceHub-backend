from datetime import UTC, datetime

import pytest
from pricehub_common.eventos import Envelope
from pricehub_common.mensageria import BarramentoEmMemoria
from pricehub_common.persistencia import BancoDeDados

from app.persistencia import Base, ProjecaoDeMedicamento, aplicar_snapshot, carregar_projecoes
from app.servicos import ProjecoesDeConsulta


@pytest.fixture
async def banco(tmp_path):
    banco = BancoDeDados(f"sqlite+aiosqlite:///{tmp_path}/consulta.db")
    await banco.criar_tabelas(Base.metadata)
    yield banco
    await banco.fechar()


def envelope(id_evento: str = "10000000-0000-0000-0000-000000000001") -> Envelope:
    return Envelope(
        id_do_evento=id_evento,
        tipo="catalogo.visao.atualizada",
        versao=1,
        ocorrido_em=datetime(2026, 11, 12, tzinfo=UTC),
        correlation_id="rastreio-1",
        servico_de_origem="ms-catalogo",
        dados={
            "medicamentoId": "med-1",
            "resumo": {"id": "med-1", "nome": "Losartana", "principioAtivo": "Losartana", "categoria": "Genérico"},
            "detalhe": {"id": "med-1", "nome": "Losartana", "ofertas": []},
            "historico": [],
        },
    )


async def test_projecao_atualiza_leitura_e_ignora_evento_duplicado(banco) -> None:
    async with banco.transacao() as sessao:
        assert await aplicar_snapshot(sessao, envelope()) is True
    async with banco.transacao() as sessao:
        assert await aplicar_snapshot(sessao, envelope()) is False
    async with banco.sessao() as sessao:
        assert (await carregar_projecoes(sessao, busca="losar", categoria="Genérico"))[0]["id"] == "med-1"
        assert await sessao.get(ProjecaoDeMedicamento, "med-1") is not None


async def test_projecao_nao_regride_com_snapshot_atrasado(banco) -> None:
    async with banco.transacao() as sessao:
        await aplicar_snapshot(sessao, envelope())
    antigo = envelope("10000000-0000-0000-0000-000000000002").model_copy(
        update={
            "ocorrido_em": datetime(2026, 11, 11, tzinfo=UTC),
            "dados": {
                "medicamentoId": "med-1",
                "resumo": {"id": "med-1", "nome": "Nome obsoleto"},
                "detalhe": {"id": "med-1", "nome": "Nome obsoleto", "ofertas": []},
                "historico": [],
            },
        }
    )
    async with banco.transacao() as sessao:
        assert await aplicar_snapshot(sessao, antigo) is False
    async with banco.sessao() as sessao:
        linha = await sessao.get(ProjecaoDeMedicamento, "med-1")
        assert linha is not None and linha.detalhe["nome"] == "Losartana"


async def test_projecao_vazia_solicita_reconstrucao_ao_catalogo(banco) -> None:
    barramento = BarramentoEmMemoria("ms-consulta")
    await ProjecoesDeConsulta(banco, barramento).iniciar("ms-consulta.eventos-do-catalogo")
    assert barramento.tipos_publicados() == ["consulta.projecao.solicitada"]
