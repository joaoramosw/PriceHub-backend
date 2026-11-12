from datetime import timedelta

from app.persistencia.modelos import Base
from app.servicos.metricas import CalculadoraDeMetricas, distribuir
from app.servicos.registrador import RegistradorDeEventos
from pricehub_common.eventos import Envelope
from pricehub_common.persistencia import BancoDeDados
from pricehub_common.sse import DifusorDeEventos
from pricehub_common.tempo import agora_utc


def test_distribuicao_calcula_media_mediana_e_p95() -> None:
    resultado = distribuir([10, 20, 30, 40, 100])
    assert resultado.amostras == 5
    assert resultado.media_ms == 40
    assert resultado.mediana_ms == 30
    assert resultado.maximo_ms == 100


async def test_registrador_e_idempotente_e_metricas_medem_aceite_e_convergencia(tmp_path) -> None:
    banco = BancoDeDados(f"sqlite+aiosqlite:///{tmp_path}/auditoria.db")
    await banco.criar_tabelas(Base.metadata)
    registrador = RegistradorDeEventos(banco, DifusorDeEventos())
    inicio = agora_utc()

    def evento(tipo: str, ms: int, dados: dict) -> Envelope:
        return Envelope(
            tipo=tipo, correlation_id="op-1", servico_de_origem="teste", ocorrido_em=inicio + timedelta(milliseconds=ms), dados=dados
        )

    recebida = evento("ingestao.oferta.recebida", 0, {"oferta": {"farmaciaId": "farmaazul"}})
    await registrador(recebida)
    await registrador(recebida)  # entrega duplicada
    await registrador(evento("ingestao.coleta.realizada", 5, {"farmaciaId": "farmaazul", "origem": "webhook", "duracaoMs": 6.0}))
    await registrador(evento("catalogo.oferta.atualizada", 40, {"farmaciaId": "farmaazul"}))

    metricas = await CalculadoraDeMetricas(banco).calcular()
    assert metricas.total_de_eventos == 3
    assert metricas.aceite.media_ms == 6.0
    assert metricas.convergencia.media_ms == 40.0
    assert metricas.equivalente_sincrono.media_ms == 46.0
    assert metricas.ultimas_propagacoes[0].farmacia_id == "farmaazul"
    await banco.fechar()
