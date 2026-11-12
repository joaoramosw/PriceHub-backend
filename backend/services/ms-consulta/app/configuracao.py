from pricehub_common.configuracao import ConfiguracaoBase


class ConfiguracaoDaConsulta(ConfiguracaoBase):
    url_do_banco: str = "postgresql+asyncpg://pricehub:pricehub@localhost:5432/consulta"
    fila_de_eventos: str = "ms-consulta.eventos-do-catalogo"
