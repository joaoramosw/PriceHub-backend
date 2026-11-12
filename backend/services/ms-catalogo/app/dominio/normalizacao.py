"""Regras de padronização do catálogo: quando duas ofertas são o mesmo medicamento.

Dois produtos são o mesmo medicamento quando têm o mesmo princípio ativo
(desconsiderando sal, hidratação e grafia), a mesma concentração, a mesma forma
farmacêutica e a mesma quantidade na embalagem. Essa combinação forma a
*chave canônica*. Ex.: ``losartana|50mg|comprimido-revestido|30un``.
"""

from __future__ import annotations

import re
import unicodedata

from pricehub_common.eventos import Concentracao, OfertaCanonica, Quantidade

# Termos que não mudam o fármaco (sal, hidratação, apresentação física).
TERMOS_IGNORADOS = sorted(
    [
        "cloridrato de",
        "cloridrato",
        "bromidrato de",
        "maleato de",
        "besilato de",
        "succinato de",
        "potassica",
        "potassico",
        "potassio",
        "sodica",
        "sodico",
        "sodio",
        "calcica",
        "magnesica",
        "monoidratada",
        "monoidratado",
        "di-hidratada",
        "tri-hidratada",
        "micronizada",
        "micronizado",
        "microgranulos",
        "emulsao",
        "gotas",
        "xr",
    ],
    key=len,
    reverse=True,
)
SINONIMOS = {
    "metamizol": "dipirona",
    "metamizol sodico": "dipirona",
    "glifage": "metformina",
    "acetaminofeno": "paracetamol",
    "dimeticona ativada": "simeticona",
    "acido acetilsalicilico": "aas",
    "hctz": "hidroclorotiazida",
}
PADRAO_DE_DOSE = re.compile(r"\d+(?:[.,]\d+)?\s*(?:mg/ml|mcg|mg|g|ml)(?![a-z])")


def sem_acentos(texto: str) -> str:
    decomposto = unicodedata.normalize("NFD", texto)
    return "".join(caractere for caractere in decomposto if unicodedata.category(caractere) != "Mn")


def texto_de_busca(*partes: str | None) -> str:
    return " ".join(sem_acentos(parte).lower() for parte in partes if parte)


def normalizar_principio_ativo(texto: str) -> str:
    normalizado = sem_acentos(texto).lower().split("/")[0]
    normalizado = PADRAO_DE_DOSE.sub(" ", normalizado)
    normalizado = re.sub(r"[^a-z0-9\s-]", " ", normalizado)
    normalizado = " " + re.sub(r"\s+", " ", normalizado).strip() + " "
    for termo in TERMOS_IGNORADOS:
        normalizado = normalizado.replace(f" {termo} ", " ")
    normalizado = re.sub(r"\s+", " ", normalizado).strip()
    normalizado = SINONIMOS.get(normalizado, normalizado)
    return " ".join(SINONIMOS.get(palavra, palavra) for palavra in normalizado.split(" ")).strip()


def slug(texto: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", sem_acentos(texto).lower()).strip("-")


def gerar_chave_canonica(principio_normalizado: str, concentracao: Concentracao, forma: str, quantidade: Quantidade) -> str | None:
    if not principio_normalizado or forma == "outro":
        return None
    return "|".join([slug(principio_normalizado), concentracao.descrever(), slug(forma), quantidade.descrever()])


def em_titulo_se_maiusculo(texto: str) -> str:
    if texto != texto.upper():
        return texto
    preposicoes = {"de", "da", "do", "e"}
    return " ".join(palavra if palavra in preposicoes else palavra.capitalize() for palavra in texto.lower().split())


def nome_de_exibicao(oferta: OfertaCanonica) -> tuple[str, str]:
    """Devolve (nome, princípio ativo) legíveis para o catálogo."""
    principio = em_titulo_se_maiusculo(oferta.principio_ativo.strip())
    return f"{principio} {oferta.concentracao.descrever()}", principio


ROTULOS_DE_FORMA = {
    "comprimido": "comprimido",
    "comprimido revestido": "comprimido revestido",
    "comprimido liberacao prolongada": "comprimido de liberação prolongada",
    "capsula": "cápsula",
    "gotas": "gotas",
    "suspensao": "suspensão",
    "outro": "outra forma",
}


def descrever_apresentacao(forma: str, quantidade_valor: float, quantidade_unidade: str) -> str:
    valor = int(quantidade_valor) if float(quantidade_valor).is_integer() else quantidade_valor
    rotulo = ROTULOS_DE_FORMA.get(forma, forma)
    if quantidade_unidade == "ml":
        return f"{rotulo}, frasco de {valor} ml"
    return f"{rotulo}, {valor} unidades"
