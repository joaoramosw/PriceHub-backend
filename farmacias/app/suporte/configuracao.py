"""Configuração lida de variáveis de ambiente (12-factor)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class ConfiguracaoBase(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    nivel_de_log: str = "INFO"
    cors_origens: str = "*"

    @property
    def lista_de_origens_cors(self) -> list[str]:
        return [origem.strip() for origem in self.cors_origens.split(",") if origem.strip()]
