"""Registro dos adaptadores: o único lugar que sabe quais farmácias estão integradas."""

from __future__ import annotations

from app.adaptadores.base import AdaptadorDeFarmacia
from app.adaptadores.biofarma import AdaptadorBioFarma
from app.adaptadores.cliente_http import ClienteDaFarmacia
from app.adaptadores.drogapopular import AdaptadorDrogaPopular
from app.adaptadores.farmaazul import AdaptadorFarmaAzul
from app.configuracao import ConfiguracaoDaIngestao


class RegistroDeAdaptadores:
    def __init__(self, adaptadores: list[AdaptadorDeFarmacia], segredos_de_webhook: dict[str, str]) -> None:
        self._adaptadores = {adaptador.farmacia_id: adaptador for adaptador in adaptadores}
        self._segredos_de_webhook = segredos_de_webhook

    def obter(self, farmacia_id: str) -> AdaptadorDeFarmacia | None:
        return self._adaptadores.get(farmacia_id)

    def todos(self) -> list[AdaptadorDeFarmacia]:
        return list(self._adaptadores.values())

    def segredo_do_webhook(self, farmacia_id: str) -> str | None:
        return self._segredos_de_webhook.get(farmacia_id)


def criar_registro(configuracao: ConfiguracaoDaIngestao, cliente: ClienteDaFarmacia) -> RegistroDeAdaptadores:
    vitrines = configuracao.url_das_vitrines
    return RegistroDeAdaptadores(
        adaptadores=[
            AdaptadorBioFarma(configuracao.url_da_biofarma, vitrines, cliente),
            AdaptadorFarmaAzul(configuracao.url_da_farmaazul, vitrines, cliente),
            AdaptadorDrogaPopular(configuracao.url_da_drogapopular, vitrines, cliente),
        ],
        segredos_de_webhook={
            "biofarma": configuracao.segredo_do_webhook_biofarma,
            "farmaazul": configuracao.segredo_do_webhook_farmaazul,
        },
    )
