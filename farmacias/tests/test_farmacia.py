import hashlib
import hmac
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.configuracao import ConfiguracaoDaFarmacia
from app.dominio.catalogo import CatalogoDaFarmacia
from app.dominio.eventos import EventoDoCatalogo, PrecoAlterado
from app.dominio.observador import ObservadorDoCatalogo
from app.dominio.simulacao import SimulacaoDePrecos, carregar_precos_programados, indice_vai_e_volta
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
    await catalogo.alterar_preco(1, 1000)
    assert isinstance(espiao.eventos[-1], PrecoAlterado)


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
    with TestClient(criar_app(ConfiguracaoDaFarmacia(farmacia_id="drogapopular", simulacao_ativa=False))) as cliente:
        yield cliente


def test_polling_com_etag_responde_304_quando_nada_mudou(cliente_drogapopular: TestClient) -> None:
    primeira = cliente_drogapopular.get("/api/v1/produtos")
    etag = primeira.headers["etag"]
    assert cliente_drogapopular.get("/api/v1/produtos", headers={"if-none-match": etag}).status_code == 304
    # o endereço antigo continua respondendo o mesmo arquivo
    assert cliente_drogapopular.get("/legacy/precos.json", headers={"if-none-match": etag}).status_code == 304

    cliente_drogapopular.patch("/gestao/produtos/1/preco", json={"precoCentavos": 1234})
    depois = cliente_drogapopular.get("/legacy/precos.json", headers={"if-none-match": etag})
    assert depois.status_code == 200
    assert depois.json()["produtos"][0]["PRECO"] == "12,34"


def test_preco_invalido_e_recusado_pelo_validador(cliente_drogapopular: TestClient) -> None:
    resposta = cliente_drogapopular.patch("/gestao/produtos/1/preco", json={"precoCentavos": 0})
    assert resposta.status_code == 422
    assert cliente_drogapopular.patch("/gestao/produtos/99/preco", json={"precoCentavos": 100}).status_code == 404


def test_indice_vai_e_volta_nao_salta_do_fim_para_o_inicio() -> None:
    assert [indice_vai_e_volta(passo, 4) for passo in range(8)] == [0, 1, 2, 3, 2, 1, 0, 1]


def test_precos_programados_tem_100_valores_realistas_por_produto() -> None:
    for farmacia in ("biofarma", "farmaazul", "drogapopular"):
        iniciais = {produto.codigo: produto.preco_centavos for produto in carregar_semente(farmacia)}
        programados = carregar_precos_programados(farmacia)
        assert set(programados) == set(iniciais)
        for codigo, precos in programados.items():
            assert len(precos) == 100
            anteriores = [iniciais[codigo], *precos[:-1]]
            for anterior, atual in zip(anteriores, precos, strict=True):
                assert atual != anterior
                assert abs(atual - anterior) / anterior <= 0.12  # nada de saltos como 20 -> 50 reais


async def test_simulacao_altera_um_preco_por_vez_pelo_mesmo_caminho_da_edicao() -> None:
    catalogo = CatalogoDaFarmacia("biofarma")
    espiao = ObservadorEspiao()
    catalogo.anexar(espiao)
    await catalogo.carregar(carregar_semente("biofarma"))
    programados = carregar_precos_programados("biofarma")
    simulacao = SimulacaoDePrecos(catalogo, programados, ativa=False)

    primeira = await simulacao.aplicar_proxima()
    segunda = await simulacao.aplicar_proxima()

    assert primeira.codigo == "BIO-0001" and segunda.codigo == "BIO-0002"
    assert catalogo.buscar(1).preco_centavos == programados["BIO-0001"][0]
    eventos = [evento for evento in espiao.eventos if isinstance(evento, PrecoAlterado)]
    assert [evento.origem for evento in eventos] == ["programada", "programada"]
    assert eventos[0].correlation_id != eventos[1].correlation_id


def test_simulacao_pode_ser_pausada_e_ter_o_intervalo_alterado(cliente_drogapopular: TestClient) -> None:
    situacao = cliente_drogapopular.put("/gestao/simulacao", json={"ativa": True, "intervaloS": 3}).json()
    assert situacao["ativa"] is True and situacao["intervaloS"] == 3
    assert cliente_drogapopular.put("/gestao/simulacao", json={"intervaloS": 0.1}).status_code == 422


def test_site_da_loja_usa_o_prefixo_do_gateway(cliente_drogapopular: TestClient) -> None:
    pagina = cliente_drogapopular.get("/produto/DP-0001", headers={"x-forwarded-prefix": "/loja/drogapopular"})
    assert pagina.status_code == 200
    assert '<base href="/loja/drogapopular/"' in pagina.text
    assert '<base href="/"' in cliente_drogapopular.get("/admin").text


async def test_os_tres_formatos_informam_a_origem_do_preco() -> None:
    from app.formatos.biofarma import para_biofarma
    from app.formatos.drogapopular import para_drogapopular
    from app.formatos.farmaazul import para_farmaazul

    catalogo = CatalogoDaFarmacia("biofarma")
    await catalogo.carregar(carregar_semente("biofarma"))
    produto = catalogo.buscar(1)
    assert para_biofarma(produto)["origemDoPreco"] == "carga-inicial"

    await catalogo.alterar_preco(1, 1234, origem="programada")
    assert para_biofarma(produto)["origemDoPreco"] == "programada"
    assert para_farmaazul(produto)["origem_preco"] == "programada"
    assert para_drogapopular(produto)["ORIGEM"] == "PROGRAMADA"

    await catalogo.carregar(carregar_semente("biofarma"))
    assert catalogo.buscar(1).origem_do_preco == "carga-inicial"
