"""Ponto de entrada da farmácia simulada (sistema externo ao PriceHub).

Uma mesma base de código sobe as três farmácias; ``FARMACIA_ID`` escolhe qual.
Cada farmácia serve:

* ``/``, ``/produto/{codigo}`` e ``/admin``: o site da loja e a tela de alteração de preço;
* ``/gestao/*``: API usada pelo site e pela tela /admin;
* a API nativa (formato próprio), de onde o PriceHub lê com um adaptador.

Exemplo: ``FARMACIA_ID=farmaazul uvicorn app.main:app --port 8102``
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.api.gestao import roteador as roteador_de_gestao
from app.configuracao import ConfiguracaoDaFarmacia
from app.dominio.catalogo import CatalogoDaFarmacia
from app.dominio.simulacao import SimulacaoDePrecos, carregar_precos_programados
from app.formatos import FORMATOS_POR_FARMACIA
from app.observadores.registro import RegistradorDeAlteracoes
from app.observadores.webhook import NotificadorDeWebhook
from app.sementes import carregar_semente
from app.suporte.http import criar_aplicacao, registrar_saude
from app.suporte.logs import configurar_logs, obter_logger

logger = obter_logger("farmacia.main")
DIRETORIO_DOS_SITES = Path(__file__).parent / "sites"
CABECALHO_DO_PREFIXO = "x-forwarded-prefix"


def _pagina(arquivo: Path, request: Request) -> HTMLResponse:
    """Devolve a página com ``<base href>`` ajustado ao prefixo do gateway (ex.: /loja/biofarma/)."""
    prefixo = request.headers.get(CABECALHO_DO_PREFIXO, "").rstrip("/")
    html = arquivo.read_text(encoding="utf-8").replace("__BASE__", f"{prefixo}/")
    return HTMLResponse(html)


def criar_app(configuracao: ConfiguracaoDaFarmacia | None = None) -> FastAPI:
    configuracao = configuracao or ConfiguracaoDaFarmacia()
    formato = FORMATOS_POR_FARMACIA[configuracao.farmacia_id]
    nome_do_servico = f"farmacia-{configuracao.farmacia_id}"
    configurar_logs(nome_do_servico, configuracao.nivel_de_log)
    site = DIRETORIO_DOS_SITES / configuracao.farmacia_id
    comum = DIRETORIO_DOS_SITES / "comum"

    catalogo = CatalogoDaFarmacia(configuracao.farmacia_id)
    catalogo.anexar(RegistradorDeAlteracoes(configuracao.farmacia_id))

    notificador: NotificadorDeWebhook | None = None
    if formato.modo_de_integracao == "webhook":
        if configuracao.segredo_do_webhook:
            notificador = NotificadorDeWebhook(
                formato,
                f"{configuracao.url_do_ms_ingestao}/webhooks/{configuracao.farmacia_id}",
                configuracao.segredo_do_webhook,
                timeout_s=configuracao.timeout_do_webhook_s,
                tentativas_maximas=configuracao.tentativas_do_webhook,
            )
            catalogo.anexar(notificador)
        else:
            logger.aviso("SEGREDO_DO_WEBHOOK ausente: a loja não vai notificar o PriceHub")

    simulacao = SimulacaoDePrecos(
        catalogo,
        carregar_precos_programados(configuracao.farmacia_id),
        intervalo_s=configuracao.intervalo_da_simulacao_s,
        ativa=configuracao.simulacao_ativa,
        atraso_inicial_s=configuracao.atraso_inicial_da_simulacao_s,
    )

    @asynccontextmanager
    async def ciclo_de_vida(app: FastAPI) -> AsyncIterator[None]:
        await catalogo.carregar(carregar_semente(configuracao.farmacia_id))
        simulacao.iniciar()
        yield
        await simulacao.parar()
        if notificador is not None:
            await notificador.fechar()

    app = criar_aplicacao(
        titulo=f"{formato.nome} (farmácia simulada)",
        descricao=(
            f"Sistema **externo** ao PriceHub que simula a farmácia {formato.nome}.\n\n"
            f"* Integração com o PriceHub: **{formato.modo_de_integracao}**\n"
            f"* Perfil de preço: **{formato.perfil_de_preco}**\n"
            "* `api-nativa`: formato próprio da loja, consumido pelo adaptador do ms-ingestao.\n"
            "* `gestao-da-loja`: preços, simulação programada e entregas de webhook (dados em memória)."
        ),
        servico=nome_do_servico,
        origens_cors=configuracao.lista_de_origens_cors,
        ciclo_de_vida=ciclo_de_vida,
        redirecionar_raiz_para_docs=not site.is_dir(),
        tags=[
            {"name": "api-nativa", "description": "Formato próprio desta farmácia (heterogêneo de propósito)."},
            {"name": "gestao-da-loja", "description": "Alteração de preço; toda alteração notifica os observadores."},
            {"name": "saude", "description": "Verificação de funcionamento."},
        ],
    )
    app.state.catalogo = catalogo
    app.state.formato = formato
    app.state.notificador = notificador
    app.state.simulacao = simulacao
    app.state.configuracao = configuracao

    roteador_nativo = APIRouter()
    formato.registrar_rotas(roteador_nativo, catalogo)
    app.include_router(roteador_nativo)
    app.include_router(roteador_de_gestao)

    async def catalogo_carregado() -> bool:
        return len(catalogo.listar()) >= 0

    registrar_saude(app, {"catalogo-em-memoria": catalogo_carregado})

    # ----- site da loja ------------------------------------------------------------
    if site.is_dir():

        @app.get("/", include_in_schema=False)
        @app.get("/index.html", include_in_schema=False)
        async def pagina_inicial(request: Request) -> HTMLResponse:
            return _pagina(site / "index.html", request)

        @app.get("/produto.html", include_in_schema=False)
        @app.get("/produto/{codigo}", include_in_schema=False)
        async def pagina_do_produto(request: Request, codigo: str | None = None) -> HTMLResponse:
            return _pagina(site / "produto.html", request)

        @app.get("/admin", include_in_schema=False)
        async def administracao(request: Request) -> HTMLResponse:
            return _pagina(comum / "admin.html", request)

        app.mount("/comum", StaticFiles(directory=comum), name="comum")
        app.mount("/", StaticFiles(directory=site), name="site")

    return app


app = criar_app()
