"""ms-catalogo: catálogo centralizado e comparação de preços (núcleo do PriceHub).

Consome os eventos de ingestão, associa cada oferta a um medicamento único,
mantém o preço vigente e o histórico e publica os eventos do catálogo.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.rotas import roteador
from app.configuracao import ConfiguracaoDoCatalogo
from app.persistencia.modelos import Base, proteger_historico_precos
from app.servicos.consultas import ConsultasDoCatalogo
from app.servicos.processador import EVENTOS_CONSUMIDOS, ProcessadorDeEventosDeIngestao
from app.servicos.relay_da_outbox import RelayDaOutbox
from app.servicos.tempo_real import NotificadorEmTempoReal
from pricehub_common.http import criar_aplicacao, registrar_saude
from pricehub_common.logs import configurar_logs
from pricehub_common.mensageria import BarramentoDeEventos, BarramentoRabbitMQ
from pricehub_common.persistencia import BancoDeDados

NOME_DO_SERVICO = "ms-catalogo"
FILA_DE_INGESTAO = "ms-catalogo.eventos-de-ingestao"


def criar_app(configuracao: ConfiguracaoDoCatalogo | None = None, barramento: BarramentoDeEventos | None = None) -> FastAPI:
    configuracao = configuracao or ConfiguracaoDoCatalogo()
    configurar_logs(NOME_DO_SERVICO, configuracao.nivel_de_log)

    banco = BancoDeDados(configuracao.url_do_banco)
    barramento = barramento or BarramentoRabbitMQ(
        configuracao.rabbitmq_url,
        NOME_DO_SERVICO,
        prefetch=configuracao.rabbitmq_prefetch,
        tentativas_maximas=configuracao.rabbitmq_tentativas_maximas,
        atraso_do_retry_ms=configuracao.rabbitmq_atraso_do_retry_ms,
    )
    relay = RelayDaOutbox(banco, barramento, configuracao.intervalo_do_relay_da_outbox_s, configuracao.lote_do_relay_da_outbox)
    processador = ProcessadorDeEventosDeIngestao(banco, barramento, ao_gravar_na_outbox=relay.avisar)
    tempo_real = NotificadorEmTempoReal(barramento)

    @asynccontextmanager
    async def ciclo_de_vida(app: FastAPI) -> AsyncIterator[None]:
        await banco.aguardar_disponibilidade()
        await banco.criar_tabelas(Base.metadata)
        await proteger_historico_precos(banco.engine)
        await barramento.conectar()
        relay.iniciar()
        await tempo_real.iniciar()
        app.state.assinatura = await barramento.assinar(FILA_DE_INGESTAO, EVENTOS_CONSUMIDOS, processador, sequencial=True)
        yield
        await relay.parar()
        await barramento.fechar()
        await banco.fechar()

    app = criar_aplicacao(
        titulo="ms-catalogo - Catálogo e comparação de preços",
        descricao=(
            "Núcleo do PriceHub. Consome `ingestao.*` da fila `ms-catalogo.eventos-de-ingestao`, mantém o catálogo "
            "padronizado (medicamentos, farmácias, ofertas, histórico de preços) e publica `catalogo.*` via outbox.\n\n"
            "As consultas não dependem das farmácias: leem apenas o banco próprio do serviço."
        ),
        servico=NOME_DO_SERVICO,
        origens_cors=configuracao.lista_de_origens_cors,
        ciclo_de_vida=ciclo_de_vida,
        tags=[
            {"name": "comparacao", "description": "Busca e comparação para o visitante."},
            {"name": "catalogo", "description": "Visão administrativa do catálogo."},
            {"name": "tempo-real", "description": "Eventos do catálogo via Server-Sent Events."},
            {"name": "experimento", "description": "Simulação de indisponibilidade do consumidor."},
            {"name": "saude", "description": "Verificação de funcionamento."},
        ],
    )
    app.state.consultas = ConsultasDoCatalogo(banco)
    app.state.tempo_real = tempo_real
    app.include_router(roteador)
    registrar_saude(app, {"postgres": banco.verificar_conexao, "rabbitmq": barramento.esta_saudavel})
    return app


app = criar_app()
