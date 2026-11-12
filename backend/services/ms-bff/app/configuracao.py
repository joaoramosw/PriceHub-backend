from pricehub_common.configuracao import ConfiguracaoBase


class ConfiguracaoDoBff(ConfiguracaoBase):
    url_do_catalogo: str = "http://localhost:8002"
    url_da_consulta: str = "http://localhost:8004"
    url_da_ingestao: str = "http://localhost:8001"
    url_do_log: str = "http://localhost:8003"
    url_da_biofarma: str = "http://localhost:8101"
    url_da_farmaazul: str = "http://localhost:8102"
    url_da_drogapopular: str = "http://localhost:8103"

    @property
    def farmacias(self) -> dict[str, str]:
        return {
            "biofarma": self.url_da_biofarma,
            "farmaazul": self.url_da_farmaazul,
            "drogapopular": self.url_da_drogapopular,
        }
