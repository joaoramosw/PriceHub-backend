from app.formatos.base import FormatoDaFarmacia
from app.formatos.biofarma import FormatoBioFarma
from app.formatos.drogapopular import FormatoDrogaPopular
from app.formatos.farmaazul import FormatoFarmaAzul

FORMATOS_POR_FARMACIA: dict[str, FormatoDaFarmacia] = {
    formato.farmacia_id: formato for formato in (FormatoBioFarma(), FormatoFarmaAzul(), FormatoDrogaPopular())
}

__all__ = ["FORMATOS_POR_FARMACIA", "FormatoDaFarmacia"]
