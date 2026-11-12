"""Evita publicar eventos desnecessários no broker.

A cada consulta periódica a farmácia devolve o catálogo inteiro, mas quase nada
mudou. Publicar um evento por item a cada ciclo encheria as filas de mensagens
inúteis (risco apontado na orientação do trabalho). Esta memória guarda uma
"impressão digital" de cada oferta já publicada e deixa passar só o que mudou.
"""

from __future__ import annotations

import hashlib
import json

from pricehub_common.eventos import OfertaCanonica

CAMPOS_IGNORADOS_NA_COMPARACAO = {"coletado_em", "atualizado_na_origem_em"}


def impressao_digital(oferta: OfertaCanonica) -> str:
    relevante = oferta.model_dump(mode="json", exclude=CAMPOS_IGNORADOS_NA_COMPARACAO)
    serializado = json.dumps(relevante, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(serializado.encode()).hexdigest()


class MemoriaDeOfertas:
    def __init__(self) -> None:
        self._impressoes: dict[tuple[str, str], str] = {}

    def mudou(self, oferta: OfertaCanonica) -> bool:
        chave = (oferta.farmacia_id, oferta.codigo_externo)
        return self._impressoes.get(chave) != impressao_digital(oferta)

    def registrar(self, oferta: OfertaCanonica) -> None:
        self._impressoes[(oferta.farmacia_id, oferta.codigo_externo)] = impressao_digital(oferta)

    def esquecer(self, farmacia_id: str, codigo_externo: str) -> None:
        self._impressoes.pop((farmacia_id, codigo_externo), None)

    def codigos_conhecidos(self, farmacia_id: str) -> set[str]:
        return {codigo for (farmacia, codigo) in self._impressoes if farmacia == farmacia_id}

    def esquecer_farmacia(self, farmacia_id: str) -> None:
        for codigo in self.codigos_conhecidos(farmacia_id):
            self.esquecer(farmacia_id, codigo)
