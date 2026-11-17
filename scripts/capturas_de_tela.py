"""Gera as capturas de tela do README e do TCC a partir do ambiente rodando no gateway.

Uso (com `docker compose up -d` e alguns minutos de simulação rodando):

    pip install playwright httpx && playwright install chromium
    python scripts/capturas_de_tela.py            # grava em docs/capturas/

Além de tirar as capturas, confere o que cada tela precisa mostrar, que o console do navegador
fica sem erros e que nenhuma página tem rolagem horizontal no celular (390 px).
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

import httpx
from playwright.sync_api import Page, expect, sync_playwright

GATEWAY = "http://localhost:8080"
RAIZ = Path(__file__).resolve().parent.parent


def largura_sem_rolagem(pagina: Page, caminho: str) -> None:
    pagina.goto(GATEWAY + caminho)
    pagina.wait_for_timeout(1500)
    largura = pagina.evaluate("document.documentElement.scrollWidth")
    situacao = "ok" if largura <= 390 else "ROLAGEM HORIZONTAL"
    print(f"celular {caminho}: {largura}px {situacao}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--saida", type=Path, default=RAIZ / "docs" / "capturas")
    args = parser.parse_args()
    saida: Path = args.saida
    saida.mkdir(parents=True, exist_ok=True)

    metricas = httpx.get(f"{GATEWAY}/api/log/metricas", timeout=10).json()
    rastreio = next((a["correlationId"] for a in metricas["ultimasPropagacoes"] if a["origem"] == "webhook"), None)

    erros: list[str] = []
    with sync_playwright() as playwright:
        navegador = playwright.chromium.launch()
        pagina = navegador.new_page(viewport={"width": 1400, "height": 900})
        pagina.on("console", lambda mensagem: erros.append(mensagem.text) if mensagem.type == "error" else None)
        pagina.on("pageerror", lambda erro: erros.append(str(erro)))

        pagina.goto(GATEWAY + "/")
        expect(pagina.get_by_text("menor preço").first).to_be_visible()
        pagina.screenshot(path=saida / "01-lista.png")

        pagina.get_by_role("link", name="Histórico de preços").first.click()
        expect(pagina.get_by_role("heading", name="Resumo dos preços")).to_be_visible()
        expect(pagina.get_by_role("columnheader", name="Origem")).to_be_visible()
        expect(pagina.get_by_text("Atualizado em").first).to_be_visible()
        pagina.wait_for_timeout(500)
        pagina.screenshot(path=saida / "02-detalhe.png", full_page=True)

        pagina.goto(GATEWAY + "/parceiras")
        pagina.wait_for_timeout(800)
        pagina.screenshot(path=saida / "03-parceiras.png")

        pagina.goto(GATEWAY + "/monitor/eventos")
        expect(pagina.get_by_text("Monitor de eventos").first).to_be_visible()
        pagina.wait_for_timeout(1500)
        pagina.screenshot(path=saida / "04-monitor.png")

        pagina.goto(GATEWAY + "/loja/farmaazul/produto/FA-MET-500")
        pagina.wait_for_timeout(1500)
        pagina.screenshot(path=saida / "05-loja-produto.png")

        pagina.goto(GATEWAY + "/loja/biofarma/admin")
        expect(pagina.get_by_text("Simulação programada de preços")).to_be_visible()
        pagina.wait_for_timeout(2500)
        pagina.screenshot(path=saida / "06-admin.png")

        pagina.goto(GATEWAY + "/monitor/filas")
        expect(pagina.get_by_text("Gestão de preços").first).to_be_visible()
        pagina.wait_for_timeout(1500)
        pagina.screenshot(path=saida / "08-monitor-filas.png", full_page=True)

        pagina.goto(GATEWAY + "/monitor/metricas")
        expect(pagina.get_by_role("heading", name="Trocas da farmácia mais barata")).to_be_visible()
        pagina.wait_for_timeout(1500)
        pagina.screenshot(path=saida / "09-monitor-metricas.png", full_page=True)

        for numero, farmacia in ((10, "biofarma"), (11, "farmaazul"), (12, "drogapopular")):
            pagina.goto(f"{GATEWAY}/loja/{farmacia}/")
            pagina.wait_for_timeout(1500)
            pagina.screenshot(path=saida / f"{numero}-loja-{farmacia}.png")

        if rastreio:
            pagina.goto(f"{GATEWAY}/monitor/eventos?correlationId={rastreio}")
            pagina.wait_for_timeout(2500)
            pagina.screenshot(path=saida / "13-linha-do-tempo.png", full_page=True)

        # Resiliência: com o consumo do ms-catalogo pausado, a fila retém os reajustes programados.
        httpx.post(f"{GATEWAY}/api/catalogo/admin/consumo/pausar", timeout=10)
        try:
            time.sleep(16)
            pagina.goto(GATEWAY + "/monitor/filas")
            pagina.wait_for_timeout(2500)
            pagina.screenshot(path=saida / "14-fila-retida.png")
        finally:
            httpx.post(f"{GATEWAY}/api/catalogo/admin/consumo/retomar", timeout=10)

        celular = navegador.new_page(viewport={"width": 390, "height": 844})
        celular.goto(GATEWAY + "/")
        expect(celular.get_by_text("menor preço").first).to_be_visible()
        celular.screenshot(path=saida / "07-celular.png")
        for caminho in ("/", "/parceiras", "/monitor/eventos", "/monitor/filas", "/monitor/metricas"):
            largura_sem_rolagem(celular, caminho)
        navegador.close()

    print("erros de console:", erros or "nenhum")


if __name__ == "__main__":
    main()
