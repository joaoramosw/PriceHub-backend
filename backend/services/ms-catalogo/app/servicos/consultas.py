"""Lado de leitura do catálogo: busca e comparação de preços para o visitante.

As consultas leem apenas o banco local do ms-catalogo. Mesmo que uma farmácia
esteja fora do ar, o visitante continua vendo os últimos preços conhecidos.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.dominio.normalizacao import descrever_apresentacao, sem_acentos
from app.persistencia.modelos import (
    EventoProcessado,
    Farmacia,
    HistoricoPreco,
    Medicamento,
    Oferta,
    OfertaNaoCorrespondida,
    RegistroDeOutbox,
)
from pricehub_common.persistencia import BancoDeDados


class Saida(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class OfertaComparada(Saida):
    oferta_id: str
    farmacia_id: str
    farmacia_nome: str
    codigo_externo: str
    nome_na_farmacia: str
    preco_centavos: int
    disponivel: bool
    posicao: int | None
    diferenca_para_o_menor_centavos: int | None
    url_do_produto: str | None
    atualizado_na_origem_em: datetime | None
    atualizado_em: datetime


class ResumoDoMedicamento(Saida):
    id: str
    nome: str
    principio_ativo: str
    apresentacao: str
    categoria: str | None
    fabricante: str | None
    total_de_ofertas: int
    menor_preco_centavos: int | None
    maior_preco_centavos: int | None
    farmacia_mais_barata: str | None
    farmacia_mais_barata_id: str | None
    economia_maxima_centavos: int | None
    atualizado_em: datetime


class DetalheDoMedicamento(ResumoDoMedicamento):
    registro_ms: str | None
    chave_canonica: str | None
    ofertas: list[OfertaComparada]


class PontoDoHistorico(Saida):
    farmacia_id: str
    farmacia_nome: str
    preco_centavos: int
    registrado_em: datetime
    correlation_id: str


class ResumoDaFarmacia(Saida):
    id: str
    nome: str
    total_de_ofertas: int
    ofertas_disponiveis: int
    atualizada_em: datetime


class OfertaNaoCorrespondidaSaida(Saida):
    farmacia_id: str
    codigo_externo: str
    motivo: str
    registrada_em: datetime


class EstatisticasDoCatalogo(Saida):
    medicamentos: int
    farmacias: int
    ofertas: int
    ofertas_disponiveis: int
    registros_de_historico: int
    eventos_processados: int
    eventos_na_outbox_pendentes: int


def _comparar_ofertas(medicamento: Medicamento, nomes_das_farmacias: dict[str, str]) -> list[OfertaComparada]:
    disponiveis = sorted((o for o in medicamento.ofertas if o.disponivel), key=lambda o: o.preco_centavos)
    indisponiveis = [o for o in medicamento.ofertas if not o.disponivel]
    menor = disponiveis[0].preco_centavos if disponiveis else None
    comparadas: list[OfertaComparada] = []
    for posicao, oferta in enumerate(disponiveis + indisponiveis, start=1):
        comparadas.append(
            OfertaComparada(
                oferta_id=oferta.id,
                farmacia_id=oferta.farmacia_id,
                farmacia_nome=nomes_das_farmacias.get(oferta.farmacia_id, oferta.farmacia_id),
                codigo_externo=oferta.codigo_externo,
                nome_na_farmacia=oferta.nome_na_farmacia,
                preco_centavos=oferta.preco_centavos,
                disponivel=oferta.disponivel,
                posicao=posicao if oferta.disponivel else None,
                diferenca_para_o_menor_centavos=(oferta.preco_centavos - menor) if (oferta.disponivel and menor) else None,
                url_do_produto=oferta.url_do_produto,
                atualizado_na_origem_em=oferta.atualizado_na_origem_em,
                atualizado_em=oferta.atualizado_em,
            )
        )
    return comparadas


def _resumir(medicamento: Medicamento, comparadas: list[OfertaComparada]) -> dict:
    disponiveis = [oferta for oferta in comparadas if oferta.disponivel]
    menor = disponiveis[0] if disponiveis else None
    maior = disponiveis[-1] if disponiveis else None
    ultima_atualizacao = max([medicamento.atualizado_em, *[oferta.atualizado_em for oferta in comparadas]])
    return {
        "id": medicamento.id,
        "nome": medicamento.nome,
        "principio_ativo": medicamento.principio_ativo,
        "apresentacao": descrever_apresentacao(medicamento.forma, medicamento.quantidade_valor, medicamento.quantidade_unidade),
        "categoria": medicamento.categoria,
        "fabricante": medicamento.fabricante,
        "total_de_ofertas": len(disponiveis),
        "menor_preco_centavos": menor.preco_centavos if menor else None,
        "maior_preco_centavos": maior.preco_centavos if maior else None,
        "farmacia_mais_barata": menor.farmacia_nome if menor else None,
        "farmacia_mais_barata_id": menor.farmacia_id if menor else None,
        "economia_maxima_centavos": (maior.preco_centavos - menor.preco_centavos) if menor and maior else None,
        "atualizado_em": ultima_atualizacao,
    }


class ConsultasDoCatalogo:
    def __init__(self, banco: BancoDeDados) -> None:
        self._banco = banco

    async def _nomes_das_farmacias(self, sessao) -> dict[str, str]:  # type: ignore[no-untyped-def]
        return {farmacia.id: farmacia.nome for farmacia in (await sessao.scalars(select(Farmacia))).all()}

    async def listar_medicamentos(self, busca: str | None, categoria: str | None) -> list[ResumoDoMedicamento]:
        consulta = select(Medicamento).options(selectinload(Medicamento.ofertas)).order_by(Medicamento.nome)
        if busca:
            termo = f"%{sem_acentos(busca).lower().strip()}%"
            consulta = consulta.where(or_(Medicamento.termos_de_busca.like(termo), Medicamento.principio_normalizado.like(termo)))
        if categoria:
            consulta = consulta.where(Medicamento.categoria == categoria)
        async with self._banco.sessao() as sessao:
            nomes = await self._nomes_das_farmacias(sessao)
            medicamentos = (await sessao.scalars(consulta)).all()
            return [ResumoDoMedicamento(**_resumir(m, _comparar_ofertas(m, nomes))) for m in medicamentos]

    async def detalhar_medicamento(self, medicamento_id: str) -> DetalheDoMedicamento | None:
        async with self._banco.sessao() as sessao:
            medicamento = await sessao.scalar(
                select(Medicamento).options(selectinload(Medicamento.ofertas)).where(Medicamento.id == medicamento_id)
            )
            if medicamento is None:
                return None
            comparadas = _comparar_ofertas(medicamento, await self._nomes_das_farmacias(sessao))
            return DetalheDoMedicamento(
                **_resumir(medicamento, comparadas),
                registro_ms=medicamento.registro_ms,
                chave_canonica=medicamento.chave_canonica,
                ofertas=comparadas,
            )

    async def historico(self, medicamento_id: str) -> list[PontoDoHistorico]:
        consulta = (
            select(HistoricoPreco, Oferta.farmacia_id, Farmacia.nome)
            .join(Oferta, Oferta.id == HistoricoPreco.oferta_id)
            .join(Farmacia, Farmacia.id == Oferta.farmacia_id)
            .where(Oferta.medicamento_id == medicamento_id)
            .order_by(HistoricoPreco.registrado_em)
        )
        async with self._banco.sessao() as sessao:
            linhas = (await sessao.execute(consulta)).all()
        return [
            PontoDoHistorico(
                farmacia_id=farmacia_id,
                farmacia_nome=farmacia_nome,
                preco_centavos=registro.preco_centavos,
                registrado_em=registro.registrado_em,
                correlation_id=registro.correlation_id,
            )
            for registro, farmacia_id, farmacia_nome in linhas
        ]

    async def categorias(self) -> list[str]:
        async with self._banco.sessao() as sessao:
            valores = await sessao.scalars(select(Medicamento.categoria).where(Medicamento.categoria.is_not(None)).distinct())
            return sorted(valor for valor in valores.all() if valor)

    async def farmacias(self) -> list[ResumoDaFarmacia]:
        async with self._banco.sessao() as sessao:
            farmacias = (await sessao.scalars(select(Farmacia).order_by(Farmacia.nome))).all()
            ofertas = (await sessao.execute(select(Oferta.farmacia_id, Oferta.disponivel))).all()
        contagem: dict[str, list[int]] = defaultdict(lambda: [0, 0])
        for farmacia_id, disponivel in ofertas:
            contagem[farmacia_id][0] += 1
            contagem[farmacia_id][1] += int(disponivel)
        return [
            ResumoDaFarmacia(
                id=farmacia.id,
                nome=farmacia.nome,
                total_de_ofertas=contagem[farmacia.id][0],
                ofertas_disponiveis=contagem[farmacia.id][1],
                atualizada_em=farmacia.atualizada_em,
            )
            for farmacia in farmacias
        ]

    async def nao_correspondidas(self, limite: int) -> list[OfertaNaoCorrespondidaSaida]:
        consulta = select(OfertaNaoCorrespondida).order_by(OfertaNaoCorrespondida.registrada_em.desc()).limit(limite)
        async with self._banco.sessao() as sessao:
            registros = (await sessao.scalars(consulta)).all()
        return [OfertaNaoCorrespondidaSaida.model_validate(registro, from_attributes=True) for registro in registros]

    async def estatisticas(self) -> EstatisticasDoCatalogo:
        async with self._banco.sessao() as sessao:

            async def contar(consulta) -> int:  # type: ignore[no-untyped-def]
                return int(await sessao.scalar(consulta) or 0)

            return EstatisticasDoCatalogo(
                medicamentos=await contar(select(func.count()).select_from(Medicamento)),
                farmacias=await contar(select(func.count()).select_from(Farmacia)),
                ofertas=await contar(select(func.count()).select_from(Oferta)),
                ofertas_disponiveis=await contar(select(func.count()).select_from(Oferta).where(Oferta.disponivel.is_(True))),
                registros_de_historico=await contar(select(func.count()).select_from(HistoricoPreco)),
                eventos_processados=await contar(select(func.count()).select_from(EventoProcessado)),
                eventos_na_outbox_pendentes=await contar(
                    select(func.count()).select_from(RegistroDeOutbox).where(RegistroDeOutbox.publicado_em.is_(None))
                ),
            )
