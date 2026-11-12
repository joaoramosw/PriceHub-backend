"""ms-log: serviço de registro e monitoramento das integrações.

Assina todos os eventos do broker (``#``), grava cada um no banco ``auditoria``
e oferece consultas, rastreamento por correlationId, métricas e a situação das
filas e dos serviços para o painel de monitoramento.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.rotas import roteador
from app.configuracao import ConfiguracaoDoLog
from app.persistencia.modelos import Base
from app.servicos.infraestrutura import LeitorDeFilas, VerificadorDeServicos
from app.servicos.metricas import CalculadoraDeMetricas
from app.servicos.registrador import FILA_DE_AUDITORIA, RegistradorDeEventos
from pricehub_common.http import criar_aplicacao, registrar_saude
from pricehub_common.logs import configurar_logs
from pricehub_common.mensageria import BarramentoDeEventos, BarramentoRabbitMQ
from pricehub_common.persistencia import BancoDeDados
from pricehub_common.sse import DifusorDeEventos

NOME_DO_SERVICO = "ms-log"


def criar_app(configuracao: ConfiguracaoDoLog | None = None, barramento: BarramentoDeEventos | None = None) -> FastAPI:
    configuracao = configuracao or ConfiguracaoDoLog()
    configurar_logs(NOME_DO_SERVICO, configuracao.nivel_de_log)

    banco = BancoDeDados(configuracao.url_do_banco)
    barramento = barramento or BarramentoRabbitMQ(
        configuracao.rabbitmq_url,
        NOME_DO_SERVICO,
        prefetch=configuracao.rabbitmq_prefetch,
        tentativas_maximas=configuracao.rabbitmq_tentativas_maximas,
        atraso_do_retry_ms=configuracao.rabbitmq_atraso_do_retry_ms,
    )
    difusor = DifusorDeEventos()
    registrador = RegistradorDeEventos(banco, difusor)

    @asynccontextmanager
    async def ciclo_de_vida(app: FastAPI) -> AsyncIterator[None]:
        await banco.aguardar_disponibilidade()
        await banco.criar_tabelas(Base.metadata)
        await barramento.conectar()
        await barramento.assinar(FILA_DE_AUDITORIA, ["#"], registrador, sequencial=True)
        yield
        await barramento.fechar()
        await banco.fechar()

    app = criar_aplicacao(
        titulo="ms-log - Registro e monitoramento",
        descricao=(
            "Serviço de log do PriceHub. Assina **todos** os eventos da exchange `pricehub.eventos` (binding `#`) "
            "e grava cada um no banco `auditoria`. É a fonte das evidências do capítulo de resultados.\n\n"
            "Também expõe métricas (tempo de aceite x janela de convergência), a situação das filas do RabbitMQ e "
            "a saúde de cada microsserviço."
        ),
        servico=NOME_DO_SERVICO,
        origens_cors=configuracao.lista_de_origens_cors,
        ciclo_de_vida=ciclo_de_vida,
        tags=[
            {"name": "registros", "description": "Consulta e rastreamento dos eventos."},
            {"name": "metricas", "description": "Indicadores calculados a partir do log."},
            {"name": "infraestrutura", "description": "Filas do RabbitMQ e saúde dos serviços."},
            {"name": "experimento", "description": "Apoio às demonstrações."},
            {"name": "saude", "description": "Verificação de funcionamento."},
        ],
    )
    app.state.banco = banco
    app.state.difusor = difusor
    app.state.calculadora = CalculadoraDeMetricas(banco)
    app.state.leitor_de_filas = LeitorDeFilas(
        configuracao.url_da_api_do_rabbitmq, configuracao.usuario_do_rabbitmq, configuracao.senha_do_rabbitmq
    )
    app.state.verificador = VerificadorDeServicos(configuracao.mapa_de_servicos, configuracao.mapa_publico_de_servicos)
    app.include_router(roteador)
    registrar_saude(app, {"postgres": banco.verificar_conexao, "rabbitmq": barramento.esta_saudavel})
    return app


app = criar_app()
