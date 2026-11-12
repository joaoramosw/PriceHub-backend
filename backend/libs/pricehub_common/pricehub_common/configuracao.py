"""Configuração comum lida de variáveis de ambiente (12-factor)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class ConfiguracaoBase(BaseSettings):
    """Campos que todo microsserviço do PriceHub precisa.

    Cada serviço estende esta classe com o que é só dele. Os nomes das variáveis
    de ambiente são os nomes dos campos em maiúsculas (ex.: ``RABBITMQ_URL``).
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    nivel_de_log: str = "INFO"
    rabbitmq_url: str = "amqp://pricehub:pricehub@localhost:5672/"
    rabbitmq_prefetch: int = 10
    rabbitmq_tentativas_maximas: int = 5
    rabbitmq_atraso_do_retry_ms: int = 2000
    cors_origens: str = "*"

    @property
    def lista_de_origens_cors(self) -> list[str]:
        return [origem.strip() for origem in self.cors_origens.split(",") if origem.strip()]
