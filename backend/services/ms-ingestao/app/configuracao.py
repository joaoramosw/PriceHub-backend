from pricehub_common.configuracao import ConfiguracaoBase


class ConfiguracaoDaIngestao(ConfiguracaoBase):
    url_do_banco: str = "postgresql+asyncpg://pricehub:pricehub@localhost:5432/ingestao"

    url_da_biofarma: str = "http://localhost:8101"
    url_da_farmaazul: str = "http://localhost:8102"
    url_da_drogapopular: str = "http://localhost:8103"
    url_publica_das_lojas: str = "http://localhost:8080/loja"

    segredo_do_webhook_biofarma: str = "segredo-biofarma-dev"
    segredo_do_webhook_farmaazul: str = "segredo-farmaazul-dev"

    intervalo_de_polling_s: float = 5
    atraso_da_primeira_sincronizacao_s: float = 2
    timeout_http_s: float = 3
    agendador_ativo: bool = True
