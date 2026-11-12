"""Esquemas de entrada e saída da API administrativa da farmácia (validadores da Web API)."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

FormaDaFarmacia = Literal[
    "comprimido",
    "comprimido revestido",
    "comprimido de liberação prolongada",
    "cápsula dura",
    "solução oral em gotas",
    "emulsão oral em gotas",
    "suspensão oral",
]
Tarja = Literal["Venda Livre", "Tarja Vermelha (Sob Prescrição)", "Tarja Preta (Controlado)"]

PADRAO_DE_CONCENTRACAO = re.compile(r"^(\d+(?:[.,]\d+)?)\s*(mg/ml|mcg|mg|g|ml)$", re.IGNORECASE)
PRECO_MAXIMO_CENTAVOS = 10_000_000


class EsquemaCamelCase(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ProdutoEntrada(EsquemaCamelCase):
    """Dados para cadastrar ou substituir um produto na farmácia."""

    codigo: str = Field(description="Código interno da farmácia (ex.: BIO-0011)", examples=["BIO-0011"])
    nome_comercial: str = Field(min_length=2, max_length=120, examples=["Paracetamol"])
    principio_ativo: str = Field(min_length=2, max_length=120, examples=["Paracetamol"])
    concentracao: str = Field(description="Dose com unidade: mg, mg/ml, mcg, g ou ml", examples=["750mg"])
    forma_farmaceutica: FormaDaFarmacia = Field(examples=["comprimido"])
    quantidade_embalagem: int = Field(ge=1, le=500, description="Unidades (ou ml, se líquido)", examples=[20])
    apresentacao: str | None = Field(default=None, max_length=120, description="Opcional; gerada a partir da forma")
    fabricante: str = Field(min_length=2, max_length=80, examples=["EMS S/A"])
    registro_ms: str | None = Field(default=None, examples=["1.0235.0560.001-2"])
    categoria: str = Field(min_length=2, max_length=60, examples=["Dores & Febre"])
    tarja: Tarja = "Venda Livre"
    descricao: str = Field(default="", max_length=500)
    imagem: str | None = Field(default=None, max_length=200)
    preco_centavos: int = Field(ge=1, le=PRECO_MAXIMO_CENTAVOS, description="Preço em centavos", examples=[899])

    @field_validator("codigo", mode="before")
    @classmethod
    def normalizar_codigo(cls, valor: str) -> str:
        codigo = str(valor).strip().upper()
        if not re.fullmatch(r"[A-Z0-9][A-Z0-9-]{2,19}", codigo):
            raise ValueError("use de 3 a 20 caracteres: letras, números e hífen")
        return codigo

    @field_validator("nome_comercial", "principio_ativo", "fabricante", "categoria", mode="before")
    @classmethod
    def aparar_espacos(cls, valor: str) -> str:
        return re.sub(r"\s+", " ", str(valor)).strip()

    @field_validator("principio_ativo")
    @classmethod
    def principio_sem_dose(cls, valor: str) -> str:
        if re.search(r"\d", valor):
            raise ValueError("informe a dose no campo 'concentracao', não no princípio ativo")
        return valor

    @field_validator("concentracao", mode="before")
    @classmethod
    def validar_concentracao(cls, valor: str) -> str:
        encontrado = PADRAO_DE_CONCENTRACAO.match(str(valor).strip())
        if not encontrado:
            raise ValueError("formato esperado: número + unidade (ex.: 500mg, 75mg/ml)")
        numero, unidade = encontrado.groups()
        return f"{numero.replace(',', '.')}{unidade.lower()}"

    @field_validator("registro_ms")
    @classmethod
    def validar_registro(cls, valor: str | None) -> str | None:
        if valor is None or not valor.strip():
            return None
        digitos = re.sub(r"\D", "", valor)
        if not 9 <= len(digitos) <= 13:
            raise ValueError("o registro na Anvisa deve ter de 9 a 13 dígitos")
        return valor.strip()

    @model_validator(mode="after")
    def coerencia_entre_forma_e_concentracao(self) -> ProdutoEntrada:
        liquido = "gotas" in self.forma_farmaceutica or "suspensão" in self.forma_farmaceutica
        if liquido and not self.concentracao.endswith("/ml"):
            raise ValueError("formas líquidas exigem concentração por ml (ex.: 500mg/ml)")
        if not liquido and self.concentracao.endswith("/ml"):
            raise ValueError("concentração por ml só é aceita em formas líquidas")
        return self


class NovoPreco(EsquemaCamelCase):
    preco_centavos: int = Field(ge=1, le=PRECO_MAXIMO_CENTAVOS, description="Novo preço em centavos", examples=[1290])


class ProdutoSaida(EsquemaCamelCase):
    id: int
    codigo: str
    nome_comercial: str
    principio_ativo: str
    concentracao: str
    forma_farmaceutica: str
    quantidade_embalagem: int
    apresentacao: str
    fabricante: str
    registro_ms: str | None
    categoria: str
    tarja: str
    descricao: str
    imagem: str | None
    preco_centavos: int
    atualizado_em: datetime


class ResultadoDaOperacao(EsquemaCamelCase):
    produto: ProdutoSaida | None
    preco_anterior_centavos: int | None = None
    notificacao: Literal["webhook-agendado", "aguardando-polling"]
    correlation_id: str = Field(description="Use no painel de eventos para seguir a propagação")


class InformacoesDaLoja(EsquemaCamelCase):
    farmacia_id: str
    nome: str
    modo_de_integracao: Literal["webhook", "polling"]
    perfil_de_preco: str
    tema: dict[str, str]
    total_de_produtos: int
    versao_do_catalogo: int
    rotas_nativas: list[str]


class ResultadoDaRestauracao(EsquemaCamelCase):
    produtos: int
    notificacao: Literal["webhook-agendado", "aguardando-polling"]
    correlation_id: str
