from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from pricehub_common.eventos import (
    Concentracao,
    IngestaoOfertaRecebida,
    OfertaCanonica,
    Quantidade,
    TipoDeEvento,
    ler_dados,
)
from pricehub_common.mensageria import BarramentoEmMemoria, corresponde_ao_padrao


@pytest.mark.parametrize(
    ("padrao", "chave", "esperado"),
    [
        ("#", "catalogo.oferta.atualizada", True),
        ("catalogo.#", "catalogo.oferta.atualizada", True),
        ("ingestao.oferta.*", "ingestao.oferta.recebida", True),
        ("ingestao.oferta.*", "ingestao.coleta.realizada", False),
        ("ingestao.*", "ingestao.oferta.recebida", False),
        ("a.#.c", "a.c", True),
    ],
)
def test_roteamento_topic_segue_as_regras_do_rabbitmq(padrao: str, chave: str, esperado: bool) -> None:
    assert corresponde_ao_padrao(padrao, chave) is esperado


def criar_oferta(**alteracoes) -> OfertaCanonica:
    dados = {
        "farmacia_id": "biofarma",
        "farmacia_nome": "BioFarma Verde",
        "codigo_externo": "BIO-0002",
        "nome": "Losartana   Potássica 50mg ",
        "principio_ativo": "Losartana Potássica",
        "concentracao": Concentracao(valor=50, unidade="mg"),
        "forma": "comprimido revestido",
        "quantidade": Quantidade(valor=30, unidade="unidade"),
        "preco_centavos": 1150,
        "coletado_em": datetime.now(UTC),
    }
    dados.update(alteracoes)
    return OfertaCanonica(**dados)


def test_oferta_canonica_normaliza_espacos_e_serializa_em_camel_case() -> None:
    oferta = criar_oferta()
    assert oferta.nome == "Losartana Potássica 50mg"
    assert "precoCentavos" in oferta.para_json()


def test_oferta_canonica_rejeita_preco_zerado_e_registro_invalido() -> None:
    with pytest.raises(ValidationError):
        criar_oferta(preco_centavos=0)
    with pytest.raises(ValidationError):
        criar_oferta(registro_ms="12-34")


async def test_barramento_em_memoria_entrega_por_padrao_e_retem_quando_pausado() -> None:
    barramento = BarramentoEmMemoria("teste")
    recebidos: list[str] = []

    async def manipulador(envelope) -> None:
        recebidos.append(envelope.tipo)

    assinatura = await barramento.assinar("fila", ["ingestao.#"], manipulador)
    dados = IngestaoOfertaRecebida(coleta_id="c1", origem="webhook", oferta=criar_oferta())

    await barramento.publicar(TipoDeEvento.INGESTAO_OFERTA_RECEBIDA, dados, correlation_id="abc")
    await assinatura.pausar()
    await barramento.publicar(TipoDeEvento.INGESTAO_OFERTA_RECEBIDA, dados)
    assert recebidos == ["ingestao.oferta.recebida"]

    await assinatura.retomar()
    assert recebidos == ["ingestao.oferta.recebida", "ingestao.oferta.recebida"]
    assert barramento.publicados[0].correlation_id == "abc"


def test_ler_dados_valida_contra_o_contrato_do_tipo() -> None:
    dados = IngestaoOfertaRecebida(coleta_id="c1", origem="polling", oferta=criar_oferta()).para_json()
    lido = ler_dados("ingestao.oferta.recebida", dados)
    assert isinstance(lido, IngestaoOfertaRecebida)
    assert lido.oferta.preco_centavos == 1150
