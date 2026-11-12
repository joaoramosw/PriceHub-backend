"""Biblioteca compartilhada pelos microsserviços do PriceHub.

Reúne apenas o que é transversal (infraestrutura e contratos). Nenhuma regra de
negócio de um serviço específico mora aqui, para não recriar um monólito
distribuído por meio de uma biblioteca comum.
"""

__version__ = "1.0.0"
