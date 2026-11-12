"""Baseline local concorrente da API de leitura exposta pelo BFF."""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import statistics
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx


def percentil(valores: list[float], p: float) -> float | None:
    if not valores:
        return None
    ordenados = sorted(valores)
    return round(ordenados[max(0, math.ceil(p * len(ordenados)) - 1)], 2)


async def medir(url: str, concorrencia: int, duracao_s: int) -> dict:
    latencias: list[float] = []
    status: dict[str, int] = {}
    inicio = time.perf_counter()
    fim = inicio + duracao_s
    limite = asyncio.Semaphore(concorrencia)
    async with httpx.AsyncClient(timeout=10) as cliente:
        async def solicitar() -> None:
            async with limite:
                instante = time.perf_counter()
                try:
                    resposta = await cliente.get(url)
                    status_chave = str(resposta.status_code)
                except httpx.HTTPError:
                    status_chave = "erro_conexao"
                latencias.append((time.perf_counter() - instante) * 1000)
                status[status_chave] = status.get(status_chave, 0) + 1

        tarefas: set[asyncio.Task] = set()
        while time.perf_counter() < fim:
            tarefa = asyncio.create_task(solicitar())
            tarefas.add(tarefa)
            tarefa.add_done_callback(tarefas.discard)
            if len(tarefas) >= concorrencia:
                await asyncio.wait(tarefas, return_when=asyncio.FIRST_COMPLETED)
        if tarefas:
            await asyncio.gather(*tarefas)
    total_s = time.perf_counter() - inicio
    sucessos = sum(valor for codigo, valor in status.items() if codigo.startswith("2"))
    return {
        "executadoEm": datetime.now(UTC).isoformat(),
        "url": url,
        "concorrencia": concorrencia,
        "duracaoConfiguradaSegundos": duracao_s,
        "duracaoRealSegundos": round(total_s, 2),
        "requisicoes": len(latencias),
        "requisicoesPorSegundo": round(len(latencias) / total_s, 2),
        "sucessosPorSegundo": round(sucessos / total_s, 2),
        "status": status,
        "latenciaMs": {
            "media": round(statistics.mean(latencias), 2) if latencias else None,
            "p50": percentil(latencias, 0.50),
            "p95": percentil(latencias, 0.95),
            "p99": percentil(latencias, 0.99),
            "maximo": round(max(latencias), 2) if latencias else None,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:8000/catalogo/medicamentos")
    parser.add_argument("--concorrencia", type=int, default=10)
    parser.add_argument("--duracao", type=int, default=30)
    parser.add_argument("--saida", type=Path)
    args = parser.parse_args()
    if args.concorrencia < 1 or args.duracao < 1:
        parser.error("concorrência e duração devem ser positivas")
    relatorio = asyncio.run(medir(args.url, args.concorrencia, args.duracao))
    texto = json.dumps(relatorio, ensure_ascii=False, indent=2)
    if args.saida:
        args.saida.parent.mkdir(parents=True, exist_ok=True)
        args.saida.write_text(texto + "\n", encoding="utf-8")
    print(texto)


if __name__ == "__main__":
    main()
