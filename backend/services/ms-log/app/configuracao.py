from pricehub_common.configuracao import ConfiguracaoBase

SERVICOS_PADRAO = (
    "ms-ingestao=http://localhost:8001,"
    "ms-catalogo=http://localhost:8002,"
    "ms-log=http://localhost:8003,"
    "ms-consulta=http://localhost:8004,"
    "ms-bff=http://localhost:8000,"
    "farmacia-biofarma=http://localhost:8101,"
    "farmacia-farmaazul=http://localhost:8102,"
    "farmacia-drogapopular=http://localhost:8103"
)


class ConfiguracaoDoLog(ConfiguracaoBase):
    url_do_banco: str = "postgresql+asyncpg://pricehub:pricehub@localhost:5432/auditoria"
    url_da_api_do_rabbitmq: str = "http://localhost:15672/api"
    usuario_do_rabbitmq: str = "pricehub"
    senha_do_rabbitmq: str = "pricehub"
    servicos_monitorados: str = SERVICOS_PADRAO
    url_publica_dos_servicos: str = ""

    @property
    def mapa_de_servicos(self) -> dict[str, str]:
        return _ler_mapa(self.servicos_monitorados)

    @property
    def mapa_publico_de_servicos(self) -> dict[str, str]:
        """URLs vistas pelo navegador (no Docker, os nomes internos não resolvem fora da rede)."""
        return _ler_mapa(self.url_publica_dos_servicos) if self.url_publica_dos_servicos else self.mapa_de_servicos


def _ler_mapa(texto: str) -> dict[str, str]:
    pares = (item.split("=", 1) for item in texto.split(",") if "=" in item)
    return {nome.strip(): url.strip().rstrip("/") for nome, url in pares}
