import httpx
from starlette.requests import Request

from app.configuracao import ConfiguracaoDoBff
from app.main import criar_app
from app.roteador import destino


def requisicao() -> Request:
    app = type("Aplicacao", (), {"state": type("Estado", (), {"configuracao": ConfiguracaoDoBff()})()})()
    return Request({"type": "http", "app": app, "headers": [], "method": "GET", "path": "/"})


def test_bff_encaminha_consulta_e_escrita_para_o_servico_dono() -> None:
    request = requisicao()
    assert destino(request, "catalogo/medicamentos") == ("http://localhost:8004", "/medicamentos")
    assert destino(request, "catalogo/admin/consumo/pausar") == ("http://localhost:8002", "/admin/consumo/pausar")
    assert destino(request, "farmacias/biofarma/admin/produtos/1/preco") == (
        "http://localhost:8101",
        "/admin/produtos/1/preco",
    )
    assert destino(request, "ingestao/farmacias") == ("http://localhost:8001", "/farmacias")
    assert destino(request, "log/registros/tempo-real") == ("http://localhost:8003", "/registros/tempo-real")
    assert destino(request, "consulta/openapi.json") == ("http://localhost:8004", "/openapi.json")


def test_bff_nao_encaminha_rotas_desconhecidas() -> None:
    assert destino(requisicao(), "rota-inexistente") == ("", "")


async def test_bff_encaminha_requisicao_e_preserva_correlation_id() -> None:
    recebidas = []

    async def responder(request: httpx.Request) -> httpx.Response:
        recebidas.append(request)
        return httpx.Response(200, json=[{"id": "med-1"}], headers={"x-correlation-id": "corr-123"})

    app = criar_app(ConfiguracaoDoBff(url_da_consulta="http://consulta.test"))
    app.state.cliente_http = httpx.AsyncClient(transport=httpx.MockTransport(responder))
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://bff.test") as cliente:
            resposta = await cliente.get(
                "/catalogo/medicamentos",
                params={"busca": "losartana"},
                headers={"x-correlation-id": "corr-123"},
            )
        assert resposta.status_code == 200
        assert resposta.json() == [{"id": "med-1"}]
        assert resposta.headers["x-correlation-id"] == "corr-123"
        assert str(recebidas[0].url) == "http://consulta.test/medicamentos?busca=losartana"
        assert recebidas[0].headers["x-correlation-id"] == "corr-123"
    finally:
        await app.state.cliente_http.aclose()


async def test_documentacao_encaminhada_usa_openapi_com_prefixo_do_servico() -> None:
    async def responder(request: httpx.Request) -> httpx.Response:
        assert request.url == "http://consulta.test/docs"
        return httpx.Response(200, text='<script>url: "/openapi.json"</script>', headers={"content-type": "text/html"})

    app = criar_app(ConfiguracaoDoBff(url_da_consulta="http://consulta.test"))
    app.state.cliente_http = httpx.AsyncClient(transport=httpx.MockTransport(responder))
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://bff.test") as cliente:
            resposta = await cliente.get("/consulta/docs")
        assert "/consulta/openapi.json" in resposta.text
    finally:
        await app.state.cliente_http.aclose()
