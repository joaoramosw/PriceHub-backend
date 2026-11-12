"""Catálogo de eventos do PriceHub e seus contratos de dados.

Os eventos são fatos que já aconteceram, por isso os nomes estão no particípio
passado. A chave de roteamento no RabbitMQ é o próprio nome do evento, o que
permite assinaturas por padrão (``catalogo.#``, ``ingestao.oferta.*``, ``#``).

| Evento                              | Produtor     | Consumidores               |
|-------------------------------------|--------------|----------------------------|
| ingestao.oferta.recebida            | ms-ingestao  | ms-catalogo, ms-log        |
| ingestao.oferta.removida            | ms-ingestao  | ms-catalogo, ms-log        |
| ingestao.oferta.descartada          | ms-ingestao  | ms-log                     |
| ingestao.coleta.realizada           | ms-ingestao  | ms-catalogo, ms-log        |
| ingestao.farmacia.indisponivel      | ms-ingestao  | ms-log                     |
| catalogo.medicamento.cadastrado     | ms-catalogo  | ms-log, painel (SSE)       |
| catalogo.oferta.atualizada          | ms-catalogo  | ms-log, painel (SSE)       |
| catalogo.oferta.indisponivel        | ms-catalogo  | ms-log, painel (SSE)       |
| catalogo.oferta.nao-correspondida   | ms-catalogo  | ms-log                     |
"""

from __future__ import annotations

import re
from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import Field, field_validator

from pricehub_common.eventos.envelope import ModeloDeContrato


class TipoDeEvento(StrEnum):
    INGESTAO_OFERTA_RECEBIDA = "ingestao.oferta.recebida"
    INGESTAO_OFERTA_REMOVIDA = "ingestao.oferta.removida"
    INGESTAO_OFERTA_DESCARTADA = "ingestao.oferta.descartada"
    INGESTAO_COLETA_REALIZADA = "ingestao.coleta.realizada"
    INGESTAO_FARMACIA_INDISPONIVEL = "ingestao.farmacia.indisponivel"
    CATALOGO_MEDICAMENTO_CADASTRADO = "catalogo.medicamento.cadastrado"
    CATALOGO_OFERTA_ATUALIZADA = "catalogo.oferta.atualizada"
    CATALOGO_OFERTA_INDISPONIVEL = "catalogo.oferta.indisponivel"
    CATALOGO_OFERTA_NAO_CORRESPONDIDA = "catalogo.oferta.nao-correspondida"


UnidadeDeConcentracao = Literal["mg", "mg/ml", "g", "ml", "mcg"]
UnidadeDeQuantidade = Literal["unidade", "ml"]
FormaFarmaceutica = Literal[
    "comprimido",
    "comprimido revestido",
    "comprimido liberacao prolongada",
    "capsula",
    "gotas",
    "suspensao",
    "outro",
]
OrigemDaColeta = Literal["webhook", "polling", "sincronizacao"]


class Concentracao(ModeloDeContrato):
    valor: float = Field(gt=0)
    unidade: UnidadeDeConcentracao

    def descrever(self) -> str:
        valor = int(self.valor) if float(self.valor).is_integer() else round(self.valor, 4)
        return f"{valor}{self.unidade}"


class Quantidade(ModeloDeContrato):
    valor: float = Field(gt=0)
    unidade: UnidadeDeQuantidade

    def descrever(self) -> str:
        valor = int(self.valor) if float(self.valor).is_integer() else round(self.valor, 4)
        return f"{valor}ml" if self.unidade == "ml" else f"{valor}un"


class OfertaCanonica(ModeloDeContrato):
    """Modelo canônico de oferta: o formato único que o PriceHub entende.

    Os adaptadores do ms-ingestao convertem o formato próprio de cada farmácia
    para este contrato (padrão Adapter).
    """

    farmacia_id: str = Field(min_length=2, max_length=40)
    farmacia_nome: str = Field(min_length=2, max_length=120)
    codigo_externo: str = Field(min_length=1, max_length=60, description="Código do produto na farmácia de origem")
    nome: str = Field(min_length=2, max_length=200)
    principio_ativo: str = Field(min_length=2, max_length=160)
    concentracao: Concentracao
    forma: FormaFarmaceutica
    quantidade: Quantidade
    fabricante: str | None = None
    registro_ms: str | None = Field(default=None, description="Registro na Anvisa, somente dígitos")
    categoria: str | None = None
    preco_centavos: int = Field(gt=0, le=10_000_000)
    url_do_produto: str | None = None
    atualizado_na_origem_em: datetime | None = None
    coletado_em: datetime

    @field_validator("nome", "principio_ativo", "farmacia_nome")
    @classmethod
    def remover_espacos_excedentes(cls, valor: str) -> str:
        return re.sub(r"\s+", " ", valor).strip()

    @field_validator("registro_ms")
    @classmethod
    def validar_registro_ms(cls, valor: str | None) -> str | None:
        if valor is None:
            return None
        if not re.fullmatch(r"\d{9,13}", valor):
            raise ValueError("registro MS deve ter de 9 a 13 dígitos")
        return valor


class IngestaoOfertaRecebida(ModeloDeContrato):
    coleta_id: str
    origem: OrigemDaColeta
    oferta: OfertaCanonica


class IngestaoOfertaRemovida(ModeloDeContrato):
    coleta_id: str
    origem: OrigemDaColeta
    farmacia_id: str
    codigo_externo: str


class IngestaoOfertaDescartada(ModeloDeContrato):
    coleta_id: str
    farmacia_id: str
    codigo_externo: str
    motivo: str


class IngestaoColetaRealizada(ModeloDeContrato):
    coleta_id: str
    farmacia_id: str
    origem: OrigemDaColeta
    itens_recebidos: int = Field(ge=0)
    ofertas_publicadas: int = Field(ge=0)
    ofertas_sem_alteracao: int = Field(ge=0)
    descartadas: int = Field(ge=0)
    removidas: int = Field(ge=0)
    duracao_ms: float = Field(ge=0, description="Tempo que o ms-ingestao levou para aceitar a coleta")
    catalogo_completo: bool = Field(description="True quando a coleta trouxe o catálogo inteiro da farmácia")
    codigos_presentes: list[str] = Field(default_factory=list)


class IngestaoFarmaciaIndisponivel(ModeloDeContrato):
    farmacia_id: str
    origem: OrigemDaColeta
    motivo: str


class CatalogoMedicamentoCadastrado(ModeloDeContrato):
    medicamento_id: str
    nome: str
    principio_ativo: str
    apresentacao: str
    chave_canonica: str | None


class CatalogoOfertaAtualizada(ModeloDeContrato):
    oferta_id: str
    medicamento_id: str
    medicamento_nome: str
    farmacia_id: str
    farmacia_nome: str
    situacao: Literal["nova", "preco-alterado", "reativada"]
    preco_anterior_centavos: int | None
    preco_atual_centavos: int
    variacao_percentual: float | None
    estrategia_de_correspondencia: str
    atualizado_na_origem_em: datetime | None


class CatalogoOfertaIndisponivel(ModeloDeContrato):
    oferta_id: str
    medicamento_id: str
    farmacia_id: str
    motivo: str


class CatalogoOfertaNaoCorrespondida(ModeloDeContrato):
    farmacia_id: str
    codigo_externo: str
    motivo: str


CONTRATOS_POR_TIPO: dict[TipoDeEvento, type[ModeloDeContrato]] = {
    TipoDeEvento.INGESTAO_OFERTA_RECEBIDA: IngestaoOfertaRecebida,
    TipoDeEvento.INGESTAO_OFERTA_REMOVIDA: IngestaoOfertaRemovida,
    TipoDeEvento.INGESTAO_OFERTA_DESCARTADA: IngestaoOfertaDescartada,
    TipoDeEvento.INGESTAO_COLETA_REALIZADA: IngestaoColetaRealizada,
    TipoDeEvento.INGESTAO_FARMACIA_INDISPONIVEL: IngestaoFarmaciaIndisponivel,
    TipoDeEvento.CATALOGO_MEDICAMENTO_CADASTRADO: CatalogoMedicamentoCadastrado,
    TipoDeEvento.CATALOGO_OFERTA_ATUALIZADA: CatalogoOfertaAtualizada,
    TipoDeEvento.CATALOGO_OFERTA_INDISPONIVEL: CatalogoOfertaIndisponivel,
    TipoDeEvento.CATALOGO_OFERTA_NAO_CORRESPONDIDA: CatalogoOfertaNaoCorrespondida,
}


def ler_dados(tipo: TipoDeEvento | str, dados: dict) -> ModeloDeContrato:
    """Valida os dados de um evento recebido contra o contrato do seu tipo."""
    contrato = CONTRATOS_POR_TIPO[TipoDeEvento(tipo)]
    return contrato.model_validate(dados)
