from typing import Literal

from app.suporte.configuracao import ConfiguracaoBase

IdentificadorDeFarmacia = Literal["biofarma", "farmaazul", "drogapopular"]


class ConfiguracaoDaFarmacia(ConfiguracaoBase):
    """Uma mesma base de código sobe as três farmácias; ``FARMACIA_ID`` escolhe qual."""

    farmacia_id: IdentificadorDeFarmacia = "biofarma"
    url_do_ms_ingestao: str = "http://localhost:8001"
    segredo_do_webhook: str | None = None
    timeout_do_webhook_s: float = 3.0
    tentativas_do_webhook: int = 4
    simulacao_ativa: bool = True
    intervalo_da_simulacao_s: float = 5.0
    atraso_inicial_da_simulacao_s: float = 20.0
