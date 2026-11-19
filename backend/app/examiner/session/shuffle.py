"""Тапсырманы әр сессияда жеке араластыру (D65; ai_examiner §5.2, §5.5).

Банк пакетінде нұсқалардың реті бір рет араластырылған (D59). Бір сұрақ сыныптастарға қайта
берілгенде (Е1-дің 2-сатысы) олардың реті де әртүрлі болуы үшін, клиентке барар алдында рет
тапсырманың `item_id`-інен алынған тұқыммен қайта араластырылады. Тұқым тұрақты, сондықтан бет қайта
ашылғанда рет өзгермейді. Жауап позиция бойынша емес, id бойынша тексеріледі (grading.py), сондықтан
кілт өзгермейді.

Қате қадам (error_step) мен слайдер араластырылмайды: қадамдардың реті пайымдаудың өзі.
"""

from __future__ import annotations

import random
from collections.abc import Mapping
from typing import Any

_ATTEMPTS = 20


def _shuffled(items: list[Any], rng: random.Random, *, bad: Any = None) -> list[Any]:
    """`bad(order)` ақиқат болса (жауапты ашып қоятын рет), қайта араластырады."""
    order = list(items)
    if len(order) < 2:
        return order
    for _ in range(_ATTEMPTS):
        rng.shuffle(order)
        if bad is None or not bad(order):
            return order
    return order


def shuffle_content(fmt: str, content: Mapping[str, Any], key: Mapping[str, Any], seed: str) -> dict[str, Any]:
    """Клиентке баратын `content`-тің көшірмесі, тізімдері осы тапсырмаға тән ретпен."""
    result = dict(content)
    rng = random.Random(f"bilim-item:{seed}")
    if fmt == "mcq":
        result["options"] = _shuffled(list(content.get("options") or []), rng)
    elif fmt == "matching":
        partner = {pair["left_id"]: pair["right_id"] for pair in key.get("pairs") or []}
        left = _shuffled(list(content.get("left") or []), rng)
        right = list(content.get("right") or [])

        def aligned(order: list[Any]) -> bool:
            # Оң жақ сол жақпен қатар тұрса, жұптар экранда дайын тұрып қалады.
            return all(partner.get(item["id"]) == other["id"] for item, other in zip(left, order, strict=False))

        result["left"] = left
        result["right"] = _shuffled(right, rng, bad=aligned)
    elif fmt == "sequence":
        correct = list(key.get("order") or [])
        result["steps"] = _shuffled(list(content.get("steps") or []), rng,
                                    bad=lambda order: [step["id"] for step in order] == correct)
    elif fmt == "formula_builder":
        result["tokens"] = _shuffled(list(content.get("tokens") or []), rng)
    return result
