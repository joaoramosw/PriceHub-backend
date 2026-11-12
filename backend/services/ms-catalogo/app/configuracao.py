from pricehub_common.configuracao import ConfiguracaoBase


class ConfiguracaoDoCatalogo(ConfiguracaoBase):
    url_do_banco: str = "postgresql+asyncpg://pricehub:pricehub@localhost:5432/catalogo"
    intervalo_do_relay_da_outbox_s: float = 1.0
    lote_do_relay_da_outbox: int = 100
