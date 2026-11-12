"""Carga inicial (semente) de cada farmácia: os 10 medicamentos do escopo do trabalho."""

from __future__ import annotations

import json
from pathlib import Path

from app.dominio.produto import Produto
from pricehub_common.tempo import agora_utc

DIRETORIO_DAS_SEMENTES = Path(__file__).parent


def carregar_semente(farmacia_id: str) -> list[Produto]:
    conteudo = json.loads((DIRETORIO_DAS_SEMENTES / f"{farmacia_id}.json").read_text(encoding="utf-8"))
    instante = agora_utc()
    return [Produto(**dados, atualizado_em=instante) for dados in conteudo["produtos"]]
