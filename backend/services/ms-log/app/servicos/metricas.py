"""Métricas calculadas a partir do log de eventos.

Duas medidas mostram, com dados do próprio sistema, o que a arquitetura
orientada a eventos traz:

* **Tempo de aceite** (``ingestao.coleta.realizada.duracaoMs``): quanto a
  farmácia esperou para ser liberada. No modelo assíncrono ela espera só a
  ingestão publicar o evento.
* **Janela de convergência**: tempo entre o primeiro evento da operação e o
  ``catalogo.oferta.atualizada``. É a consistência eventual: o catálogo fica
  correto pouco depois, sem bloquear quem produziu o dado.

Em um fluxo síncrono (monolito ou cadeia HTTP), a farmácia esperaria a soma das
duas etapas, e qualquer falha no catálogo voltaria para ela como erro.
"""

from __future__ import annotations

import statistics
from collections import Counter, defaultdict
from datetime import datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy import func, select

from app.persistencia.modelos import RegistroDeEvento
from pricehub_common.persistencia import BancoDeDados

JANELA_DE_REGISTROS = 5000


class Saida(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class AmostraDePropagacao(Saida):
    correlation_id: str
    farmacia_id: str | None
    origem: str | None
    aceite_ms: float | None
    convergencia_ms: float
    ofertas_atualizadas: int
    ocorrido_em: datetime


class Distribuicao(Saida):
    amostras: int
    media_ms: float | None
    mediana_ms: float | None
    p95_ms: float | None
    maximo_ms: float | None


class Metricas(Saida):
    total_de_eventos: int
    por_tipo: dict[str, int]
    por_servico: dict[str, int]
    aceite: Distribuicao
    convergencia: Distribuicao
    equivalente_sincrono: Distribuicao
    ultimas_propagacoes: list[AmostraDePropagacao]


def distribuir(valores: list[float]) -> Distribuicao:
    if not valores:
        return Distribuicao(amostras=0, media_ms=None, mediana_ms=None, p95_ms=None, maximo_ms=None)
    ordenados = sorted(valores)
    indice_p95 = max(0, round(0.95 * len(ordenados)) - 1)
    return Distribuicao(
        amostras=len(ordenados),
        media_ms=round(statistics.fmean(ordenados), 2),
        mediana_ms=round(statistics.median(ordenados), 2),
        p95_ms=round(ordenados[indice_p95], 2),
        maximo_ms=round(ordenados[-1], 2),
    )


def _ms(inicio: datetime, fim: datetime) -> float:
    return round((fim - inicio).total_seconds() * 1000, 2)


class CalculadoraDeMetricas:
    def __init__(self, banco: BancoDeDados) -> None:
        self._banco = banco

    async def calcular(self, desde: datetime | None = None) -> Metricas:
        async with self._banco.sessao() as sessao:
            total = int(await sessao.scalar(select(func.count()).select_from(RegistroDeEvento)) or 0)
            consulta = select(RegistroDeEvento).order_by(RegistroDeEvento.ocorrido_em.desc()).limit(JANELA_DE_REGISTROS)
            if desde is not None:
                consulta = consulta.where(RegistroDeEvento.ocorrido_em >= desde)
            recentes = (await sessao.scalars(consulta)).all()

        por_tipo = Counter(registro.tipo for registro in recentes)
        por_servico = Counter(registro.servico_de_origem for registro in recentes)

        por_correlacao: dict[str, list[RegistroDeEvento]] = defaultdict(list)
        for registro in recentes:
            por_correlacao[registro.correlation_id].append(registro)

        amostras: list[AmostraDePropagacao] = []
        for correlation_id, registros in por_correlacao.items():
            registros.sort(key=lambda registro: registro.ocorrido_em)
            atualizacoes = [r for r in registros if r.tipo == "catalogo.oferta.atualizada"]
            ingestoes = [r for r in registros if r.tipo.startswith("ingestao.")]
            if not atualizacoes or not ingestoes:
                continue
            coleta = next((r for r in registros if r.tipo == "ingestao.coleta.realizada"), None)
            amostras.append(
                AmostraDePropagacao(
                    correlation_id=correlation_id,
                    farmacia_id=atualizacoes[0].farmacia_id,
                    origem=(coleta.dados or {}).get("origem") if coleta else None,
                    aceite_ms=(coleta.dados or {}).get("duracaoMs") if coleta else None,
                    convergencia_ms=_ms(ingestoes[0].ocorrido_em, atualizacoes[-1].ocorrido_em),
                    ofertas_atualizadas=len(atualizacoes),
                    ocorrido_em=atualizacoes[-1].ocorrido_em,
                )
            )
        amostras.sort(key=lambda amostra: amostra.ocorrido_em, reverse=True)

        aceites = [a.aceite_ms for a in amostras if a.aceite_ms is not None]
        convergencias = [a.convergencia_ms for a in amostras]
        sincronos = [a.aceite_ms + a.convergencia_ms for a in amostras if a.aceite_ms is not None]
        return Metricas(
            total_de_eventos=total,
            por_tipo=dict(por_tipo),
            por_servico=dict(por_servico),
            aceite=distribuir(aceites),
            convergencia=distribuir(convergencias),
            equivalente_sincrono=distribuir(sincronos),
            ultimas_propagacoes=amostras[:30],
        )
