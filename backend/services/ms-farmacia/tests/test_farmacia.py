import hashlib
import hmac
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.configuracao import ConfiguracaoDaFarmacia
from app.dominio.catalogo import CatalogoDaFarmacia
from app.dominio.eventos import EventoDoCatalogo, PrecoAlterado, ProdutoRemovido
from app.dominio.observador import ObservadorDoCatalogo
from app.formatos.biofarma import FormatoBioFarma
from app.formatos.drogapopular import descricao_legada
from app.main import criar_app
from app.observadores.webhook import CABECALHO_DE_ASSINATURA, NotificadorDeWebhook
from app.sementes import carregar_semente


class ObservadorEspiao(ObservadorDoCatalogo):
    def __init__(self) -> None:
        self.eventos: list[EventoDoCatalogo] = []

    async def atualizar(self, evento: EventoDoCatalogo) -> None:
        self.eventos.append(evento)


async def test_catalogo_notifica_todos_os_observadores_ao_alterar_preco() -> None:
    catalogo = CatalogoDaFarmacia("biofarma")
    primeiro, segundo = ObservadorEspiao(), ObservadorEspiao()
    catalogo.anexar(primeiro)
    catalogo.anexar(segundo)
    await catalogo.carregar(carregar_semente("biofarma"))

    await catalogo.alterar_preco(2, 999)

    for observador in (primeiro, segundo):
        ultimo = observador.eventos[-1]
        assert isinstance(ultimo, PrecoAlterado)
        assert ultimo.preco_anterior_centavos == 1150
        assert ultimo.produto.preco_centavos == 999


async def test_observador_com_defeito_nao_impede_os_demais() -> None:
    class ObservadorQuebrado(ObservadorDoCatalogo):
        async def atualizar(self, evento: EventoDoCatalogo) -> None:
            raise RuntimeError("falhou")

    catalogo = CatalogoDaFarmacia("farmaazul")
    espiao = ObservadorEspiao()
    catalogo.anexar(ObservadorQuebrado())
    catalogo.anexar(espiao)
    await catalogo.carregar(carregar_semente("farmaazul"))
    await catalogo.remover(1)
    assert isinstance(espiao.eventos[-1], ProdutoRemovido)


async def test_webhook_e_assinado_com_hmac_do_corpo() -> None:
    recebidos: list[httpx.Request] = []

    def responder(request: httpx.Request) -> httpx.Response:
        recebidos.append(request)
        return httpx.Response(202, json={})

    cliente = httpx.AsyncClient(transport=httpx.MockTransport(responder))
    notificador = NotificadorDeWebhook(FormatoBioFarma(), "http://ingestao/webhooks/biofarma", "segredo", cliente_http=cliente)
    catalogo = CatalogoDaFarmacia("biofarma")
    catalogo.anexar(notificador)
    await catalogo.carregar(carregar_semente("biofarma"))
    await catalogo.alterar_preco(1, 1000)
    await notificador.aguardar_envios()

    ultimo = recebidos[-1]
    corpo = ultimo.content
    esperado = "sha256=" + hmac.new(b"segredo", corpo, hashlib.sha256).hexdigest()
    assert ultimo.headers[CABECALHO_DE_ASSINATURA] == esperado
    assert json.loads(corpo)["evento"] == "preco_alterado"
    assert notificador.ultimas_entregas[0].entregue


def test_descricao_legada_da_drogapopular() -> None:
    produtos = carregar_semente("drogapopular")
    assert descricao_legada(produtos[0]) == "METFORMINA 500MG C/30 COMP LIB PROL"
    assert descricao_legada(produtos[2]) == "DIPIRONA SODICA 500MG/ML GTS FR 20ML"


@pytest.fixture
def cliente_drogapopular() -> TestClient:
    with TestClient(criar_app(ConfiguracaoDaFarmacia(farmacia_id="drogapopular"))) as cliente:
        yield cliente


def test_polling_com_etag_responde_304_quando_nada_mudou(cliente_drogapopular: TestClient) -> None:
    primeira = cliente_drogapopular.get("/legacy/precos.json")
    etag = primeira.headers["etag"]
    assert cliente_drogapopular.get("/legacy/precos.json", headers={"if-none-match": etag}).status_code == 304

    cliente_drogapopular.patch("/admin/produtos/1/preco", json={"precoCentavos": 1234})
    depois = cliente_drogapopular.get("/legacy/precos.json", headers={"if-none-match": etag})
    assert depois.status_code == 200
    assert depois.json()["produtos"][0]["PRECO"] == "12,34"


def test_validadores_da_api_administrativa(cliente_drogapopular: TestClient) -> None:
    resposta = cliente_drogapopular.post(
        "/admin/produtos",
        json={
            "codigo": "x",
            "nomeComercial": "Paracetamol",
            "principioAtivo": "Paracetamol 750mg",
            "concentracao": "750mg/ml",
            "formaFarmaceutica": "comprimido",
            "quantidadeEmbalagem": 0,
            "fabricante": "EMS",
            "categoria": "Dores",
            "precoCentavos": 0,
        },
    )
    assert resposta.status_code == 422
    campos = {erro["campo"] for erro in resposta.json()["erros"]}
    assert {"codigo", "principioAtivo", "quantidadeEmbalagem", "precoCentavos"} <= campos


def test_cadastro_valido_e_codigo_duplicado(cliente_drogapopular: TestClient) -> None:
    corpo = {
        "codigo": "dp-0011",
        "nomeComercial": "Paracetamol",
        "principioAtivo": "Paracetamol",
        "concentracao": "750 MG",
        "formaFarmaceutica": "comprimido",
        "quantidadeEmbalagem": 20,
        "fabricante": "EMS",
        "categoria": "Dores & Febre",
        "precoCentavos": 899,
    }
    criado = cliente_drogapopular.post("/admin/produtos", json=corpo)
    assert criado.status_code == 201
    assert criado.json()["produto"]["codigo"] == "DP-0011"
    assert criado.json()["produto"]["concentracao"] == "750mg"
    assert criado.json()["notificacao"] == "aguardando-polling"
    assert cliente_drogapopular.post("/admin/produtos", json=corpo).status_code == 409
