"""Contrato do padrão Observer (GAMMA et al., 1994).

``ObservadorDoCatalogo`` é a interface comum (o "observer"). Qualquer classe que
queira reagir a mudanças no catálogo implementa ``atualizar``. O catálogo (o
"subject") não sabe quem são os observadores nem o que eles fazem, apenas os
avisa. Para incluir uma nova reação basta anexar um novo observador, sem mexer
no catálogo (princípio aberto-fechado).
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from app.dominio.eventos import EventoDoCatalogo


class ObservadorDoCatalogo(ABC):
    @abstractmethod
    async def atualizar(self, evento: EventoDoCatalogo) -> None: ...
