from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pricehub_common.http import criar_aplicacao, registrar_saude
from pricehub_common.logs import configurar_logs
from pricehub_common.mensageria import BarramentoDeEventos, BarramentoRabbitMQ
from pricehub_common.persistencia import BancoDeDados

from app.api import roteador
from app.configuracao import ConfiguracaoDaConsulta
from app.persistencia import Base
from app.servicos import ProjecoesDeConsulta


def criar_app(configuracao: ConfiguracaoDaConsulta | None = None, barramento: BarramentoDeEventos | None = None) -> FastAPI:
    configuracao = configuracao or ConfiguracaoDaConsulta()
    configurar_logs("ms-consulta", configuracao.nivel_de_log)
    banco = BancoDeDados(configuracao.url_do_banco)
    barramento = barramento or BarramentoRabbitMQ(configuracao.rabbitmq_url, "ms-consulta")
    projecoes = ProjecoesDeConsulta(banco, barramento)

    @asynccontextmanager
    async def ciclo_de_vida(app: FastAPI) -> AsyncIterator[None]:
        await banco.aguardar_disponibilidade()
        await banco.criar_tabelas(Base.metadata)
        await barramento.conectar()
        await projecoes.iniciar(configuracao.fila_de_eventos)
        yield
        await barramento.fechar()
        await banco.fechar()

    app = criar_aplicacao(
        titulo="ms-consulta - Projeções de leitura",
        descricao=(
            "Lado de leitura CQRS. Projeta eventos do catálogo em banco próprio e não consulta o banco de escrita."
        ),
        servico="ms-consulta",
        origens_cors=configuracao.lista_de_origens_cors,
        ciclo_de_vida=ciclo_de_vida,
        tags=[{"name": "consulta", "description": "Busca e comparação por projeções de leitura."}],
    )
    app.state.banco = banco
    app.state.projecoes = projecoes
    app.include_router(roteador)
    registrar_saude(app, {"postgres": banco.verificar_conexao, "rabbitmq": barramento.esta_saudavel})
    return app


app = criar_app()
