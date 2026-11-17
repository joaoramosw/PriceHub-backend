"""Gera a tabela de preços programados de cada farmácia (simulação de alterações).

Para cada produto de cada farmácia são gerados N preços (padrão: 100) em sequência,
como se a loja fosse reajustando o preço ao longo do dia. A farmácia aplica um por vez,
pelo mesmo caminho da edição manual na tela /admin, e o PriceHub capta cada mudança.

Regras para as mudanças fazerem sentido:

* passeio aleatório com semente fixa (a simulação é reproduzível);
* cada passo varia de 0,5 % a 4 %, para cima ou para baixo, nunca repete o valor anterior;
* o preço fica dentro de +-22 % do preço inicial da farmácia (tende a voltar ao centro);
* final comercial: ,09 ,29 ,49 ,69 ,89 ou ,99.

Com +-22 % as faixas das farmácias se cruzam, então a farmácia mais barata de um
medicamento troca de vez em quando durante a demonstração.

Uso: python scripts/gerar_precos_programados.py [--quantidade 100] [--semente 2026]
"""

from __future__ import annotations

import argparse
import itertools
import json
import random
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
SEMENTES = RAIZ / "farmacias" / "app" / "sementes"
DESTINO = SEMENTES / "precos_programados.json"
FARMACIAS = ("biofarma", "farmaazul", "drogapopular")
FINAIS = (9, 29, 49, 69, 89, 99)
VARIACAO_MINIMA, VARIACAO_MAXIMA, AMPLITUDE = 0.005, 0.04, 0.22


def arredondar_comercial(centavos: float) -> int:
    reais = int(centavos // 100)
    candidatos = [r * 100 + final for r in (reais - 1, reais, reais + 1) for final in FINAIS if r >= 0]
    return min(candidatos, key=lambda candidato: abs(candidato - centavos))


def gerar_sequencia(preco_inicial: int, quantidade: int, sorteio: random.Random) -> list[int]:
    minimo, maximo = preco_inicial * (1 - AMPLITUDE), preco_inicial * (1 + AMPLITUDE)
    precos, atual = [], preco_inicial
    while len(precos) < quantidade:
        # acima do preço inicial a chance de cair é maior (e vice-versa): o preço oscila em torno dele
        chance_de_subir = 0.5 - 0.35 * (atual - preco_inicial) / (preco_inicial * AMPLITUDE)
        sinal = 1 if sorteio.random() < chance_de_subir else -1
        alvo = atual * (1 + sinal * sorteio.uniform(VARIACAO_MINIMA, VARIACAO_MAXIMA))
        alvo = min(max(alvo, minimo), maximo)
        novo = arredondar_comercial(alvo)
        if novo == atual or not minimo <= novo <= maximo:
            continue
        precos.append(novo)
        atual = novo
    return precos


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--quantidade", type=int, default=100, help="preços por produto (padrão: 100)")
    parser.add_argument("--semente", type=int, default=2026)
    args = parser.parse_args()

    tabela: dict[str, dict[str, list[int]]] = {}
    por_medicamento: dict[int, dict[str, list[int]]] = {}
    for farmacia in FARMACIAS:
        produtos = json.loads((SEMENTES / f"{farmacia}.json").read_text(encoding="utf-8"))["produtos"]
        tabela[farmacia] = {}
        for produto in produtos:
            sorteio = random.Random(f"{args.semente}-{farmacia}-{produto['codigo']}")
            sequencia = gerar_sequencia(produto["preco_centavos"], args.quantidade, sorteio)
            tabela[farmacia][produto["codigo"]] = sequencia
            por_medicamento.setdefault(produto["id"], {})[farmacia] = sequencia

    documento = {
        "descricao": "Preços programados (em centavos) aplicados um a um pela simulação de cada farmácia.",
        "semente": args.semente,
        "quantidadePorProduto": args.quantidade,
        "farmacias": tabela,
    }
    DESTINO.write_text(json.dumps(documento, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"gravado: {DESTINO.relative_to(RAIZ)}")

    print("\nMedicamento  faixa por farmácia (R$)                                    trocas da mais barata*")
    for medicamento_id, sequencias in sorted(por_medicamento.items()):
        faixas = "  ".join(f"{f[:4]} {min(s) / 100:6.2f}-{max(s) / 100:6.2f}" for f, s in sequencias.items())
        mais_baratas = [min(sequencias, key=lambda f, i=i: sequencias[f][i]) for i in range(args.quantidade)]
        trocas = sum(1 for anterior, atual in itertools.pairwise(mais_baratas) if anterior != atual)
        print(f"{medicamento_id:>11}  {faixas}  {trocas}")
    print("* comparando os preços de mesma posição; na execução real as farmácias andam em ritmos diferentes.")


if __name__ == "__main__":
    main()
