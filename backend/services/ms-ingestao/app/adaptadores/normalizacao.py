"""Funções puras de interpretação de textos das farmácias.

São reaproveitadas pelos adaptadores para extrair concentração, forma
farmacêutica, quantidade e preço de representações diferentes do mesmo dado.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import UTC, datetime, timedelta, timezone

from pricehub_common.eventos import Concentracao, FormaFarmaceutica, Quantidade

FUSO_DE_BRASILIA = timezone(timedelta(hours=-3))
PADRAO_DE_CONCENTRACAO = re.compile(r"(\d+(?:[.,]\d+)?)\s*(mg/ml|mcg|mg|g|ml)(?![a-z])", re.IGNORECASE)

# Ordem importa: as regras mais específicas vêm antes das genéricas.
REGRAS_DE_FORMA: tuple[tuple[re.Pattern[str], FormaFarmaceutica], ...] = (
    (re.compile(r"lib(eracao)?\.?\s*prol(ongada)?"), "comprimido liberacao prolongada"),
    (re.compile(r"comp(rimidos?)?\.?\s*rev(estidos?)?"), "comprimido revestido"),
    (re.compile(r"\bcaps(ula|ulas)?\b"), "capsula"),
    (re.compile(r"\b(gts|gotas|conta-gotas)\b"), "gotas"),
    (re.compile(r"\bsusp(ensao)?\b"), "suspensao"),
    (re.compile(r"\bcomp(rimidos?)?\b"), "comprimido"),
)


class ValorNaoInterpretadoError(ValueError):
    pass


def sem_acentos(texto: str) -> str:
    decomposto = unicodedata.normalize("NFD", texto)
    return "".join(caractere for caractere in decomposto if unicodedata.category(caractere) != "Mn")


def normalizar_espacos(texto: str) -> str:
    return re.sub(r"\s+", " ", texto).strip()


def interpretar_concentracao(texto: str) -> Concentracao:
    encontrado = PADRAO_DE_CONCENTRACAO.search(sem_acentos(texto))
    if not encontrado:
        raise ValorNaoInterpretadoError(f'concentração não identificada em "{texto}"')
    valor_numerico = float(encontrado.group(1).replace(",", "."))
    return Concentracao(valor=valor_numerico, unidade=encontrado.group(2).lower())


def interpretar_forma(texto: str) -> FormaFarmaceutica:
    normalizado = sem_acentos(texto).lower()
    for padrao, forma in REGRAS_DE_FORMA:
        if padrao.search(normalizado):
            return forma
    return "outro"


def unidade_de_quantidade_para(forma: FormaFarmaceutica) -> str:
    return "ml" if forma in ("gotas", "suspensao") else "unidade"


def interpretar_apresentacao(texto: str) -> tuple[FormaFarmaceutica, Quantidade]:
    """Ex.: '30 comprimidos revestidos' -> (comprimido revestido, 30 unidades)."""
    normalizado = sem_acentos(texto).lower()
    forma = interpretar_forma(normalizado)
    unidade = unidade_de_quantidade_para(forma)
    if unidade == "ml":
        encontrado = re.search(r"(\d+(?:[.,]\d+)?)\s*ml\b", normalizado)
    else:
        encontrado = re.search(r"^(\d+)\s", normalizado) or re.search(r"c/\s*(\d+)", normalizado)
    if not encontrado:
        raise ValorNaoInterpretadoError(f'quantidade não identificada em "{texto}"')
    return forma, Quantidade(valor=float(encontrado.group(1).replace(",", ".")), unidade=unidade)


def principio_sem_dose(texto: str) -> str:
    return normalizar_espacos(PADRAO_DE_CONCENTRACAO.sub("", texto))


def registro_ms_somente_digitos(texto: str | None) -> str | None:
    digitos = re.sub(r"\D", "", texto or "")
    return digitos if 9 <= len(digitos) <= 13 else None


def reais_para_centavos(valor_em_reais: float) -> int:
    return round(valor_em_reais * 100)


def texto_em_reais_para_centavos(texto: str) -> int:
    """'1.234,56' ou 'R$ 9,99' -> centavos."""
    limpo = re.sub(r"[^\d,.-]", "", texto).replace(".", "").replace(",", ".")
    if not limpo:
        raise ValorNaoInterpretadoError(f'preço inválido: "{texto}"')
    return round(float(limpo) * 100)


def data_brasileira_para_utc(texto: str) -> datetime | None:
    """'21/10/2026 22:23' (horário de Brasília) -> datetime em UTC."""
    try:
        local = datetime.strptime(texto.strip(), "%d/%m/%Y %H:%M").replace(tzinfo=FUSO_DE_BRASILIA)
    except ValueError:
        return None
    return local.astimezone(UTC)
