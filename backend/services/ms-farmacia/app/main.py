"""Ponto de entrada da farmácia simulada (produto secundário do trabalho).

Exemplo: ``FARMACIA_ID=farmaazul uvicorn app.main:app --port 8102``
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI

from app.api.admin import roteador as roteador_admin
from app.configuracao import ConfiguracaoDaFarmacia
from app.dominio.catalogo import CatalogoDaFarmacia
from app.formatos import FORMATOS_POR_FARMACIA
from app.observadores.registro import RegistradorDeAlteracoes
from app.observadores.webhook import NotificadorDeWebhook
from app.sementes import carregar_semente
from pricehub_common.http import criar_aplicacao, registrar_saude
from pricehub_common.logs import configurar_logs, obter_logger

logger = obter_logger("farmacia.main")


def criar_app(configuracao: ConfiguracaoDaFarmacia | None = None) -> FastAPI:
    configuracao = configuracao or ConfiguracaoDaFarmacia()
    formato = FORMATOS_POR_FARMACIA[configuracao.farmacia_id]
    nome_do_servico = f"ms-farmacia-{configuracao.farmacia_id}"
    configurar_logs(nome_do_servico, configuracao.nivel_de_log)

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

    @asynccontextmanager
    async def ciclo_de_vida(app: FastAPI) -> AsyncIterator[None]:
        await catalogo.carregar(carregar_semente(configuracao.farmacia_id))
        yield
        if notificador is not None:
            await notificador.fechar()

    app = criar_aplicacao(
        titulo=f"{formato.nome} (farmácia simulada)",
        descricao=(
            f"Sistema **externo** ao PriceHub que simula a farmácia {formato.nome}.\n\n"
            f"* Integração com o PriceHub: **{formato.modo_de_integracao}**\n"
            f"* Perfil de preço: **{formato.perfil_de_preco}**\n"
            "* `api-nativa`: formato próprio da loja, consumido pelo adaptador do ms-ingestao.\n"
            "* `gestao-da-loja`: API usada pelo painel para gerir os produtos (os dados ficam em memória)."
        ),
        servico=nome_do_servico,
        origens_cors=configuracao.lista_de_origens_cors,
        ciclo_de_vida=ciclo_de_vida,
        tags=[
            {"name": "api-nativa", "description": "Formato próprio desta farmácia (heterogêneo de propósito)."},
            {"name": "gestao-da-loja", "description": "Gestão dos produtos; toda alteração notifica os observadores."},
            {"name": "saude", "description": "Verificação de funcionamento."},
        ],
    )
    app.state.catalogo = catalogo
    app.state.formato = formato
    app.state.notificador = notificador

    roteador_nativo = APIRouter()
    formato.registrar_rotas(roteador_nativo, catalogo)
    app.include_router(roteador_nativo)
    app.include_router(roteador_admin)

    async def catalogo_carregado() -> bool:
        return len(catalogo.listar()) >= 0

    registrar_saude(app, {"catalogo-em-memoria": catalogo_carregado})
    return app


app = criar_app()
