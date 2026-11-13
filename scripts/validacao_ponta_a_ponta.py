"""Roteiro de validação do PriceHub com geração de evidências para o capítulo de resultados.

Cada etapa consulta as APIs dos microsserviços, confere o resultado esperado e grava
os dados brutos (JSON) e um resumo em Markdown em ``docs/evidencias/<data-hora>/``.

Uso (com o docker compose no ar):

    pip install httpx
    python scripts/validacao_ponta_a_ponta.py etapa1          # PriceHub vazio (sem farmácias)
    python scripts/validacao_ponta_a_ponta.py etapa2          # depois de subir as farmácias
    python scripts/validacao_ponta_a_ponta.py etapa3          # alteração de preço em cada farmácia
    python scripts/validacao_ponta_a_ponta.py resiliencia     # catálogo pausado, nada se perde
    python scripts/validacao_ponta_a_ponta.py rajada --quantidade 60
    python scripts/validacao_ponta_a_ponta.py tudo            # etapa3 + resiliencia + rajada

Para a demonstração completa das três etapas, siga o README (seção "Roteiro da demonstração").
"""

from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx

CATALOGO = "http://localhost:8002"
INGESTAO = "http://localhost:8001"
LOG = "http://localhost:8003"
FARMACIAS = {
    "biofarma": "http://localhost:8101",
    "farmaazul": "http://localhost:8102",
    "drogapopular": "http://localhost:8103",
}
TEMPO_MAXIMO_DE_ESPERA_S = 40

PASTA_DE_EVIDENCIAS = Path(__file__).resolve().parent.parent / "docs" / "evidencias" / datetime.now().strftime("%Y-%m-%d_%H-%M-%S")


class Evidencias:
    def __init__(self) -> None:
        PASTA_DE_EVIDENCIAS.mkdir(parents=True, exist_ok=True)
        self.linhas_do_resumo: list[str] = [f"# Evidências da validação ({datetime.now():%d/%m/%Y %H:%M:%S})", ""]

    def salvar(self, nome: str, conteudo: object) -> None:
        (PASTA_DE_EVIDENCIAS / f"{nome}.json").write_text(json.dumps(conteudo, ensure_ascii=False, indent=2), encoding="utf-8")

    def registrar(self, linha: str = "") -> None:
        print(linha)
        self.linhas_do_resumo.append(linha)

    def concluir(self) -> None:
        (PASTA_DE_EVIDENCIAS / "resumo.md").write_text("\n".join(self.linhas_do_resumo) + "\n", encoding="utf-8")
        print(f"\nEvidências gravadas em {PASTA_DE_EVIDENCIAS}")


def verificar(condicao: bool, mensagem: str, evidencias: Evidencias) -> None:
    evidencias.registrar(f"- [{'x' if condicao else ' '}] {mensagem}")
    if not condicao:
        evidencias.concluir()
        sys.exit(f"FALHOU: {mensagem}")


async def esperar(condicao, descricao: str, limite_s: float = TEMPO_MAXIMO_DE_ESPERA_S):  # type: ignore[no-untyped-def]
    inicio = time.monotonic()
    while time.monotonic() - inicio < limite_s:
        resultado = await condicao()
        if resultado:
            return resultado
        await asyncio.sleep(0.5)
    raise TimeoutError(f"tempo esgotado esperando: {descricao}")


async def etapa1(cliente: httpx.AsyncClient, evidencias: Evidencias) -> None:
    evidencias.registrar("## Etapa 1 - PriceHub sem nenhuma farmácia integrada")
    estatisticas = (await cliente.get(f"{CATALOGO}/estatisticas")).json()
    medicamentos = (await cliente.get(f"{CATALOGO}/medicamentos")).json()
    integracoes = (await cliente.get(f"{INGESTAO}/farmacias")).json()
    evidencias.salvar("etapa1-estatisticas-do-catalogo", estatisticas)
    evidencias.salvar("etapa1-medicamentos", medicamentos)
    evidencias.salvar("etapa1-integracoes", integracoes)
    verificar(estatisticas["medicamentos"] == 0 and medicamentos == [], "catálogo vazio: 0 medicamentos, 0 ofertas", evidencias)
    situacoes = {item["farmaciaId"]: item["situacao"] for item in integracoes}
    evidencias.registrar(f"- situação das integrações vista pelo ms-ingestao: {situacoes}")


async def etapa2(cliente: httpx.AsyncClient, evidencias: Evidencias) -> None:
    evidencias.registrar("\n## Etapa 2 - Carga inicial enviada pelas farmácias")

    async def todas_carregadas():  # type: ignore[no-untyped-def]
        farmacias = (await cliente.get(f"{CATALOGO}/farmacias")).json()
        prontas = [f for f in farmacias if f["ofertasDisponiveis"] >= 10]
        return farmacias if len(prontas) == 3 else None

    farmacias = await esperar(todas_carregadas, "as três farmácias com 10 ofertas")
    medicamentos = (await cliente.get(f"{CATALOGO}/medicamentos")).json()
    coletas = (await cliente.get(f"{LOG}/registros", params={"tipo": "ingestao.coleta.realizada", "limite": 50})).json()
    evidencias.salvar("etapa2-farmacias-no-catalogo", farmacias)
    evidencias.salvar("etapa2-medicamentos-consolidados", medicamentos)
    evidencias.salvar("etapa2-log-das-coletas", coletas)
    verificar(len(medicamentos) == 10, "10 medicamentos únicos, mesmo vindo de 3 formatos diferentes", evidencias)
    verificar(all(m["totalDeOfertas"] == 3 for m in medicamentos), "cada medicamento com 3 ofertas (uma por farmácia)", evidencias)
    evidencias.registrar("\n| Medicamento | Menor preço | Farmácia mais barata | Maior preço |")
    evidencias.registrar("|---|---|---|---|")
    for m in medicamentos:
        evidencias.registrar(
            f"| {m['nome']} | R$ {m['menorPrecoCentavos'] / 100:.2f} | {m['farmaciaMaisBarata']} | R$ {m['maiorPrecoCentavos'] / 100:.2f} |"
        )


async def alterar_e_rastrear(cliente: httpx.AsyncClient, farmacia: str, produto_id: int, novo_preco: int) -> dict:
    resposta = await cliente.patch(f"{FARMACIAS[farmacia]}/admin/produtos/{produto_id}/preco", json={"precoCentavos": novo_preco})
    resposta.raise_for_status()
    corpo = resposta.json()
    codigo = corpo["produto"]["codigo"]

    async def atualizado_no_catalogo():  # type: ignore[no-untyped-def]
        registros = (
            await cliente.get(f"{LOG}/registros", params={"tipo": "catalogo.oferta.atualizada", "farmaciaId": farmacia, "limite": 20})
        ).json()
        for registro in registros:
            if registro["dados"].get("precoAtualCentavos") == novo_preco and registro["ocorridoEm"] >= corpo["produto"]["atualizadoEm"][:19]:
                return registro
        return None

    registro = await esperar(atualizado_no_catalogo, f"{farmacia}/{codigo} no catálogo")
    rastreamento = (await cliente.get(f"{LOG}/registros/rastreamento/{registro['correlationId']}")).json()
    return {"farmacia": farmacia, "codigo": codigo, "alteracao": corpo, "rastreamento": rastreamento}


async def etapa3(cliente: httpx.AsyncClient, evidencias: Evidencias) -> None:
    evidencias.registrar("\n## Etapa 3 - Alteração de preço propagada por eventos")
    resultados = []
    for farmacia, url in FARMACIAS.items():
        produtos = (await cliente.get(f"{url}/admin/produtos")).json()
        produto = produtos[1]
        novo_preco = produto["precoCentavos"] - 37
        resultados.append(await alterar_e_rastrear(cliente, farmacia, produto["id"], novo_preco))
    evidencias.salvar("etapa3-rastreamentos", resultados)
    evidencias.registrar("\n| Farmácia | Produto | Integração | Eventos | Do 1º evento ao catálogo |")
    evidencias.registrar("|---|---|---|---|---|")
    for item in resultados:
        trilha = item["rastreamento"]
        evidencias.registrar(
            f"| {item['farmacia']} | {item['codigo']} | {item['alteracao']['notificacao']} | "
            f"{' → '.join(e['tipo'] for e in trilha['eventos'])} | {trilha['duracaoTotalMs']} ms |"
        )
    verificar(len(resultados) == 3, "as 3 alterações chegaram ao catálogo e foram rastreadas pelo correlationId", evidencias)


async def resiliencia(cliente: httpx.AsyncClient, evidencias: Evidencias, quantidade: int = 10) -> None:
    evidencias.registrar("\n## Resiliência - ms-catalogo fora do ar (consumo pausado)")
    await cliente.post(f"{CATALOGO}/admin/consumo/pausar")
    produtos = (await cliente.get(f"{FARMACIAS['farmaazul']}/admin/produtos")).json()
    tempos_de_aceite = []
    for indice in range(quantidade):
        produto = produtos[indice % len(produtos)]
        inicio = time.perf_counter()
        resposta = await cliente.patch(
            f"{FARMACIAS['farmaazul']}/admin/produtos/{produto['id']}/preco", json={"precoCentavos": produto["precoCentavos"] + indice + 1}
        )
        tempos_de_aceite.append(round((time.perf_counter() - inicio) * 1000, 2))
        resposta.raise_for_status()

    async def fila_com_mensagens():  # type: ignore[no-untyped-def]
        # A API de gerenciamento do RabbitMQ atualiza as contagens a cada ~5 s.
        filas = (await cliente.get(f"{LOG}/filas")).json()
        fila = next(f for f in filas if f["nome"] == "ms-catalogo.eventos-de-ingestao")
        return filas if fila["mensagensProntas"] > 0 else None

    filas_com_catalogo_parado = await esperar(fila_com_mensagens, "mensagens retidas na fila", limite_s=15)
    retidas = next(f for f in filas_com_catalogo_parado if f["nome"] == "ms-catalogo.eventos-de-ingestao")["mensagensProntas"]
    evidencias.salvar("resiliencia-filas-com-catalogo-pausado", filas_com_catalogo_parado)
    evidencias.registrar(f"- farmácia atendida normalmente: mediana de {statistics.median(tempos_de_aceite):.1f} ms por alteração")
    verificar(retidas > 0, f"{retidas} mensagens retidas na fila ms-catalogo.eventos-de-ingestao enquanto o consumidor estava parado", evidencias)

    await cliente.post(f"{CATALOGO}/admin/consumo/retomar")

    async def fila_vazia():  # type: ignore[no-untyped-def]
        filas = (await cliente.get(f"{LOG}/filas")).json()
        fila = next(f for f in filas if f["nome"] == "ms-catalogo.eventos-de-ingestao")
        return filas if fila["mensagensProntas"] == 0 and fila["mensagensSemAck"] == 0 else None

    filas_depois = await esperar(fila_vazia, "fila drenada")
    evidencias.salvar("resiliencia-filas-depois-de-retomar", filas_depois)

    esperados = {produto["codigo"]: produto["precoCentavos"] + indice + 1 for indice, produto in enumerate(produtos[:quantidade])}
    encontrados: dict[str, int] = {}
    for medicamento in (await cliente.get(f"{CATALOGO}/medicamentos")).json():
        detalhe = (await cliente.get(f"{CATALOGO}/medicamentos/{medicamento['id']}")).json()
        for oferta in detalhe["ofertas"]:
            if oferta["farmaciaId"] == "farmaazul" and oferta["codigoExterno"] in esperados:
                encontrados[oferta["codigoExterno"]] = oferta["precoCentavos"]
    evidencias.salvar("resiliencia-precos-esperados-x-catalogo", {"esperados": esperados, "noCatalogo": encontrados})
    verificar(encontrados == esperados, "consumo retomado: a fila foi processada e todas as alterações chegaram ao catálogo", evidencias)


async def rajada(cliente: httpx.AsyncClient, evidencias: Evidencias, quantidade: int) -> None:
    evidencias.registrar(f"\n## Rajada - {quantidade} alterações simultâneas nas farmácias com webhook")
    produtos = {farmacia: (await cliente.get(f"{FARMACIAS[farmacia]}/admin/produtos")).json() for farmacia in ("biofarma", "farmaazul")}

    async def alterar(indice: int) -> float:
        farmacia = ("biofarma", "farmaazul")[indice % 2]
        produto = produtos[farmacia][indice % len(produtos[farmacia])]
        inicio = time.perf_counter()
        resposta = await cliente.patch(
            f"{FARMACIAS[farmacia]}/admin/produtos/{produto['id']}/preco", json={"precoCentavos": 1000 + indice}
        )
        resposta.raise_for_status()
        return (time.perf_counter() - inicio) * 1000

    inicio_da_rajada = datetime.now().astimezone().isoformat()
    tempos = await asyncio.gather(*(alterar(indice) for indice in range(quantidade)))
    await asyncio.sleep(5)
    metricas = (await cliente.get(f"{LOG}/metricas", params={"desde": inicio_da_rajada})).json()
    evidencias.salvar("rajada-metricas", metricas)
    evidencias.registrar(f"- resposta da farmácia ao painel: mediana {statistics.median(tempos):.1f} ms, máximo {max(tempos):.1f} ms")
    for nome in ("aceite", "convergencia", "equivalenteSincrono"):
        d = metricas[nome]
        evidencias.registrar(f"- {nome}: mediana {d['medianaMs']} ms, p95 {d['p95Ms']} ms, máximo {d['maximoMs']} ms ({d['amostras']} amostras)")


async def principal() -> None:
    analisador = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    analisador.add_argument("etapa", choices=["etapa1", "etapa2", "etapa3", "resiliencia", "rajada", "tudo"])
    analisador.add_argument("--quantidade", type=int, default=40, help="alterações na rajada")
    argumentos = analisador.parse_args()
    evidencias = Evidencias()
    async with httpx.AsyncClient(timeout=10) as cliente:
        saude = {nome: (await cliente.get(f"{url}/saude")).json()["status"] for nome, url in (("catalogo", CATALOGO), ("ingestao", INGESTAO), ("log", LOG))}
        evidencias.registrar(f"Serviços: {saude}\n")
        if argumentos.etapa == "etapa1":
            await etapa1(cliente, evidencias)
        elif argumentos.etapa == "etapa2":
            await etapa2(cliente, evidencias)
        elif argumentos.etapa == "etapa3":
            await etapa3(cliente, evidencias)
        elif argumentos.etapa == "resiliencia":
            await resiliencia(cliente, evidencias)
        elif argumentos.etapa == "rajada":
            await rajada(cliente, evidencias, argumentos.quantidade)
        else:
            await etapa3(cliente, evidencias)
            await resiliencia(cliente, evidencias)
            await rajada(cliente, evidencias, argumentos.quantidade)
    evidencias.concluir()


if __name__ == "__main__":
    asyncio.run(principal())
