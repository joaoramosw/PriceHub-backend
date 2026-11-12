---
name: playwright
description: Testa e inspeciona os micro-frontends do PriceHub no navegador com Playwright (navegar, clicar, verificar atualização em tempo real e tirar prints). Use para validar uma mudança visual, reproduzir bug de interface, testar o fluxo ponta a ponta pela tela ou gerar capturas para o README e o TCC.
---

# Playwright no PriceHub

## Pré-requisitos

1. Sistema no ar: `docker compose up -d --build` e `docker compose ps` com tudo healthy.
2. Playwright (Python, para ficar junto do backend):

```bash
pip install playwright
python -m playwright install chromium
```

(Alternativa em Node: `npx playwright@latest install chromium`. Se houver um servidor MCP de Playwright
configurado no agente, pode usá-lo no lugar do script.)

## Endereços

| Tela | URL |
|---|---|
| Comparador | http://localhost:5173 |
| Gestão das lojas | http://localhost:5174 |
| Monitor de eventos | http://localhost:5175 |
| Vitrines | http://localhost:5176 |

## Script base

Salvar scripts temporários fora do repositório (ou em `scripts/` se forem para ficar).

```python
from playwright.sync_api import sync_playwright, expect

with sync_playwright() as p:
    navegador = p.chromium.launch()
    pagina = navegador.new_page(viewport={"width": 1400, "height": 860})

    pagina.goto("http://localhost:5173")
    expect(pagina.get_by_text("Compare o preço do seu medicamento")).to_be_visible()

    pagina.get_by_placeholder("Buscar por nome").fill("losartana")
    expect(pagina.get_by_text("Losartana Potássica 50mg")).to_be_visible()
    pagina.screenshot(path="docs/telas/comparador-busca.png")

    navegador.close()
```

## Fluxo de tempo real (dois contextos)

Para provar a propagação por eventos, abrir a gestão e o comparador ao mesmo tempo:

1. página A em `:5173` (comparador) e página B em `:5174` (gestão das lojas);
2. na B, escolher a farmácia, alterar o preço de um produto e salvar;
3. na A, esperar o aviso "Preço atualizado" e o novo valor no card (webhook: menos de 2 s;
   DrogaPopular por polling: até 15 s + margem);
4. no monitor (`:5175`), conferir a linha do tempo do `correlationId`.

## Boas práticas

- Preferir seletores por papel e texto (`get_by_role`, `get_by_text`, `get_by_placeholder`) a seletores CSS.
- Usar `expect(...)` com espera automática; não usar `time.sleep`.
- Para prints do README/TCC: viewport 1400x860, `docs/passo-a-passo/NN-descricao.png`, numeração em ordem.
- Antes de prints de "catálogo vazio", rodar `docker compose down -v` e subir sem as farmácias.
- Não clicar em "Remover" ou "Restaurar carga inicial" sem querer alterar os dados da demonstração.
- Relatar o que foi verificado e anexar os caminhos dos prints gerados.
