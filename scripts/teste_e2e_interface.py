"""Demonstra a propagação de uma alteração iniciada pela interface."""

from __future__ import annotations

import argparse
import re

from playwright.sync_api import expect, sync_playwright


def executar(url_base: str, farmacia: str, cabecalho: bool) -> None:
    with sync_playwright() as playwright:
        navegador = playwright.chromium.launch()
        contexto = navegador.new_context(viewport={"width": 1400, "height": 900})
        gestao = contexto.new_page()
        comparador = contexto.new_page()
        gestao.goto(f"{url_base}:5174")
        comparador.goto(f"{url_base}:5173")

        nomes = {"biofarma": "BioFarma Verde", "farmaazul": "FarmaAzul Confiança", "drogapopular": "DrogaPopular Express"}
        gestao.get_by_role("button", name=re.compile(nomes[farmacia])).click()

        pular = comparador.get_by_role("button", name="Pular apresentação")
        if pular.is_visible():
            pular.click()

        expect(gestao.get_by_role("heading", name="Gestão das lojas")).to_be_visible()
        expect(gestao.get_by_label("Preço de", exact=False).first).to_be_visible(timeout=15000)
        campo = gestao.get_by_label("Preço de", exact=False).first
        texto = campo.input_value().replace(".", "").replace(",", ".")
        novo_preco = f"{float(texto) + 0.37:.2f}".replace(".", ",")
        campo.fill(novo_preco)
        gestao.get_by_role("button", name="Salvar").first.click()
        painel = gestao.get_by_text("Propagação ao vivo").locator("..")
        expect(painel.get_by_text("correlationId", exact=False)).to_be_visible(timeout=10000)
        correlation_id = painel.locator("code").inner_text()
        expect(painel.get_by_text("Projeção atualizada", exact=False)).to_be_visible(timeout=30000)

        if cabecalho:
            comparador.screenshot(path="docs/evidencias/fluxo-bff-cqrs-comparador.png", full_page=True)
        monitor = contexto.new_page()
        monitor.goto(f"{url_base}:5175/?correlationId={correlation_id}")
        expect(monitor.get_by_text(correlation_id, exact=False).first).to_be_visible(timeout=15000)
        expect(monitor.get_by_text("catalogo.visao.atualizada", exact=False).first).to_be_visible(timeout=15000)
        if cabecalho:
            monitor.screenshot(path="docs/evidencias/fluxo-bff-cqrs-monitor.png", full_page=True)
        navegador.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url-base", default="http://localhost")
    parser.add_argument("--farmacia", default="biofarma", choices=["biofarma", "farmaazul", "drogapopular"])
    parser.add_argument("--capturas", action="store_true")
    argumentos = parser.parse_args()
    executar(argumentos.url_base.rstrip(":"), argumentos.farmacia, argumentos.capturas)


if __name__ == "__main__":
    main()
