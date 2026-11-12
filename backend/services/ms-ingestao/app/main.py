"""ms-ingestao: porta de entrada dos dados das farmácias no PriceHub.

Responsabilidades: receber webhooks, consultar farmácias por polling, aplicar o
padrão Adapter e publicar eventos no RabbitMQ. Não grava nada no catálogo.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.adaptadores import criar_registro
from app.adaptadores.cliente_http import ClienteDaFarmacia
from app.api.rotas import roteador
from app.configuracao import ConfiguracaoDaIngestao
from app.persistencia.modelos import Base
from app.persistencia.repositorio import RepositorioDeColetas
from app.servicos.agendador import AgendadorDeColetas
from app.servicos.estado_das_farmacias import EstadoDasFarmacias
from app.servicos.ingestao import ServicoDeIngestao
from app.servicos.memoria_de_ofertas import MemoriaDeOfertas
from pricehub_common.http import criar_aplicacao, registrar_saude
from pricehub_common.logs import configurar_logs
from pricehub_common.mensageria import BarramentoDeEventos, BarramentoRabbitMQ
from pricehub_common.persistencia import BancoDeDados

NOME_DO_SERVICO = "ms-ingestao"


def criar_app(
    configuracao: ConfiguracaoDaIngestao | None = None,
    barramento: BarramentoDeEventos | None = None,
    cliente: ClienteDaFarmacia | None = None,
) -> FastAPI:
    configuracao = configuracao or ConfiguracaoDaIngestao()
    configurar_logs(NOME_DO_SERVICO, configuracao.nivel_de_log)

    banco = BancoDeDados(configuracao.url_do_banco)
    barramento = barramento or BarramentoRabbitMQ(
        configuracao.rabbitmq_url,
        NOME_DO_SERVICO,
        prefetch=configuracao.rabbitmq_prefetch,
        tentativas_maximas=configuracao.rabbitmq_tentativas_maximas,
        atraso_do_retry_ms=configuracao.rabbitmq_atraso_do_retry_ms,
    )
    cliente = cliente or ClienteDaFarmacia(configuracao.timeout_http_s)
    adaptadores = criar_registro(configuracao, cliente)
    repositorio = RepositorioDeColetas(banco)
    estado = EstadoDasFarmacias([adaptador.farmacia_id for adaptador in adaptadores.todos()])
    servico = ServicoDeIngestao(adaptadores, repositorio, barramento, MemoriaDeOfertas(), estado)
    agendador = AgendadorDeColetas(
        servico,
        configuracao.intervalo_de_polling_s,
        configuracao.intervalo_de_reconciliacao_s,
        configuracao.atraso_da_primeira_sincronizacao_s,
    )

    @asynccontextmanager
    async def ciclo_de_vida(app: FastAPI) -> AsyncIterator[None]:
        await banco.aguardar_disponibilidade()
        await banco.criar_tabelas(Base.metadata)
        await barramento.conectar()
        if configuracao.agendador_ativo:
            agendador.iniciar()
        yield
        await agendador.parar()
        await barramento.fechar()
        await cliente.fechar()
        await banco.fechar()

    app = criar_aplicacao(
        titulo="ms-ingestao - Ingestão e padronização",
        descricao=(
            "Recebe dados das farmácias (webhook e polling), converte cada formato para o modelo canônico "
            "com o **padrão Adapter** e publica eventos no RabbitMQ (exchange `pricehub.eventos`).\n\n"
            "Eventos publicados: `ingestao.oferta.recebida`, `ingestao.oferta.removida`, "
            "`ingestao.oferta.descartada`, `ingestao.coleta.realizada`, `ingestao.farmacia.indisponivel`."
        ),
        servico=NOME_DO_SERVICO,
        origens_cors=configuracao.lista_de_origens_cors,
        ciclo_de_vida=ciclo_de_vida,
        tags=[
            {"name": "webhooks", "description": "Notificações enviadas pelas farmácias."},
            {"name": "sincronizacoes", "description": "Coleta sob demanda (pull)."},
            {"name": "farmacias", "description": "Situação das integrações."},
            {"name": "coletas", "description": "Histórico das coletas e payloads brutos."},
            {"name": "saude", "description": "Verificação de funcionamento."},
        ],
    )
    app.state.servico = servico
    app.state.repositorio = repositorio
    app.include_router(roteador)
    registrar_saude(app, {"postgres": banco.verificar_conexao, "rabbitmq": barramento.esta_saudavel})
    return app


app = criar_app()
