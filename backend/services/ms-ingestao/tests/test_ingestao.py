import hashlib
import hmac
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.adaptadores import RegistroDeAdaptadores
from app.adaptadores.biofarma import AdaptadorBioFarma
from app.adaptadores.drogapopular import AdaptadorDrogaPopular, decompor_descricao
from app.adaptadores.farmaazul import AdaptadorFarmaAzul
from app.adaptadores.normalizacao import interpretar_apresentacao, texto_em_reais_para_centavos
from app.configuracao import ConfiguracaoDaIngestao
from app.main import criar_app
from app.persistencia.modelos import Base
from app.persistencia.repositorio import RepositorioDeColetas
from app.servicos.estado_das_farmacias import EstadoDasFarmacias
from app.servicos.ingestao import ServicoDeIngestao
from app.servicos.memoria_de_ofertas import MemoriaDeOfertas
from pricehub_common.mensageria import BarramentoEmMemoria
from pricehub_common.persistencia import BancoDeDados

AMOSTRAS = Path(__file__).parent / "amostras"


def amostra(nome: str):
    return json.loads((AMOSTRAS / f"{nome}.json").read_text(encoding="utf-8"))


def adaptadores():
    return {
        "biofarma": AdaptadorBioFarma("http://bio", "http://vitrines", None),
        "farmaazul": AdaptadorFarmaAzul("http://azul", "http://vitrines", None),
        "drogapopular": AdaptadorDrogaPopular("http://pop", "http://vitrines", None),
    }


def test_tres_formatos_diferentes_viram_o_mesmo_modelo_canonico() -> None:
    biofarma = adaptadores()["biofarma"].converter(amostra("biofarma")).ofertas[1]
    farmaazul = adaptadores()["farmaazul"].converter(amostra("farmaazul")["items"]).ofertas[1]
    drogapopular = adaptadores()["drogapopular"].converter(amostra("drogapopular")["produtos"]).ofertas[1]

    for oferta in (biofarma, farmaazul, drogapopular):
        assert oferta.concentracao.descrever() == "50mg"
        assert oferta.forma == "comprimido revestido"
        assert oferta.quantidade.descrever() == "30un"
    assert (biofarma.preco_centavos, farmaazul.preco_centavos, drogapopular.preco_centavos) == (1150, 890, 749)
    assert biofarma.registro_ms == farmaazul.registro_ms == "1018104210023"
    assert drogapopular.url_do_produto == "http://vitrines/drogapopular/produto/DP-0002"


def test_item_fora_do_contrato_e_descartado_sem_derrubar_o_lote() -> None:
    itens = amostra("biofarma")[:2]
    itens.append({"id": 99, "sku": "BIO-X", "nome": "Sem preço"})
    resultado = adaptadores()["biofarma"].converter(itens)
    assert len(resultado.ofertas) == 2
    assert resultado.descartados[0].codigo_externo == "BIO-X"


@pytest.mark.parametrize(
    ("texto", "forma", "quantidade"),
    [
        ("30 comprimidos de liberação prolongada", "comprimido liberacao prolongada", "30un"),
        ("Frasco conta-gotas 20ml", "gotas", "20ml"),
        ("C/28 CAPS", "capsula", "28un"),
    ],
)
def test_interpretacao_da_apresentacao(texto: str, forma: str, quantidade: str) -> None:
    forma_lida, quantidade_lida = interpretar_apresentacao(texto)
    assert forma_lida == forma
    assert quantidade_lida.descrever() == quantidade


def test_decomposicao_da_descricao_legada_e_preco_com_virgula() -> None:
    partes = decompor_descricao("DIPIRONA SODICA 500MG/ML GTS FR 20ML")
    assert partes["principio_ativo"] == "Dipirona Sodica"
    assert partes["concentracao"].descrever() == "500mg/ml"
    assert texto_em_reais_para_centavos("1.234,56") == 123456


def test_webhooks_da_biofarma_e_da_farmaazul_sao_interpretados() -> None:
    lista = adaptadores()
    snapshot = lista["farmaazul"].interpretar_webhook({"type": "catalog.snapshot", "data": {"items": amostra("farmaazul")["items"]}})
    assert snapshot.acao == "catalogo-completo" and len(snapshot.itens) == 10
    remocao = lista["biofarma"].interpretar_webhook({"evento": "produto_removido", "produto": {"sku": "BIO-0001"}})
    assert remocao.acao == "remocao" and remocao.codigos_removidos == ["BIO-0001"]


class ClienteFalso:
    def __init__(self, respostas: dict[str, object]) -> None:
        self.respostas = respostas

    async def buscar_json(self, url: str, etag: str | None = None):
        from app.adaptadores.cliente_http import RespostaJson

        return RespostaJson(corpo=self.respostas[url], etag='W/"v1"', nao_modificado=False)


@pytest.fixture
async def servico_em_memoria(tmp_path):
    banco = BancoDeDados(f"sqlite+aiosqlite:///{tmp_path}/ingestao.db")
    await banco.criar_tabelas(Base.metadata)
    cliente = ClienteFalso({"http://pop/legacy/precos.json": amostra("drogapopular")})
    registro = RegistroDeAdaptadores([AdaptadorDrogaPopular("http://pop", "http://v", cliente)], {})
    barramento = BarramentoEmMemoria("ms-ingestao")
    servico = ServicoDeIngestao(registro, RepositorioDeColetas(banco), barramento, MemoriaDeOfertas(), EstadoDasFarmacias(["drogapopular"]))
    yield servico, barramento, banco
    await banco.fechar()


async def test_segunda_coleta_igual_nao_publica_ofertas_de_novo(servico_em_memoria) -> None:
    servico, barramento, _ = servico_em_memoria
    primeira = await servico.sincronizar("drogapopular", "polling")
    assert primeira.ofertas_publicadas == 10
    barramento.publicados.clear()

    segunda = await servico.sincronizar("drogapopular", "polling")
    assert segunda.ofertas_publicadas == 0
    assert segunda.ofertas_sem_alteracao == 10
    assert barramento.tipos_publicados() == ["ingestao.coleta.realizada"]


async def test_coleta_bruta_e_gravada_no_banco_proprio(servico_em_memoria) -> None:
    servico, _, banco = servico_em_memoria
    resumo = await servico.sincronizar("drogapopular", "sincronizacao")
    coleta = await RepositorioDeColetas(banco).buscar(resumo.coleta_id)
    assert coleta is not None and coleta.situacao == "publicada"
    assert coleta.payload[0]["loja"] == "DROGAPOPULAR EXPRESS"


def test_webhook_com_assinatura_invalida_e_recusado(tmp_path) -> None:
    configuracao = ConfiguracaoDaIngestao(
        url_do_banco=f"sqlite+aiosqlite:///{tmp_path}/webhook.db", agendador_ativo=False, segredo_do_webhook_biofarma="segredo"
    )
    barramento = BarramentoEmMemoria("ms-ingestao")
    with TestClient(criar_app(configuracao, barramento=barramento)) as cliente:
        corpo = json.dumps({"evento": "produto_atualizado", "produto": amostra("biofarma")[0]}).encode()
        recusado = cliente.post("/webhooks/biofarma", content=corpo, headers={"x-pricehub-assinatura": "sha256=errada"})
        assert recusado.status_code == 401
        assert recusado.headers["content-type"].startswith("application/problem+json")

        assinatura = "sha256=" + hmac.new(b"segredo", corpo, hashlib.sha256).hexdigest()
        aceito = cliente.post(
            "/webhooks/biofarma", content=corpo, headers={"x-pricehub-assinatura": assinatura, "x-correlation-id": "rastreio-1"}
        )
        assert aceito.status_code == 202
        assert aceito.json()["ofertasPublicadas"] == 1
        assert {envelope.correlation_id for envelope in barramento.publicados} == {"rastreio-1"}

        assert cliente.post("/webhooks/drogapopular", content=corpo, headers={"x-pricehub-assinatura": assinatura}).status_code == 404
