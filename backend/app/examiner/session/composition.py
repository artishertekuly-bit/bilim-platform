"""Сессия құрамы (bagalau §2.3, §2.4; README D62).

5-қадамда барлық 1–4-деңгейлер мен 13 формат толық ашылды (ЖИ мен гибрид форматтарын қоса).
Құрам сессияға жазылады (`sessions.composition`, Т4): кейін конфигурация өзгерсе де, бұрынғы
сессия өз құрамымен бағаланады.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass

from ..bank.formats import CODE_FORMATS
from ..bank.planner import effective_composition

COMPOSITION_VERSION = "2026-11-19.2"

AVAILABLE_LEVELS: frozenset[int] = frozenset({1, 2, 3, 4})

# «Меңгерілді» шегі (bagalau §4.3).
THRESHOLDS: dict[int, int] = {1: 80, 2: 85, 3: 75, 4: 75}

LEVEL_MINUTES: dict[int, int] = {1: 10, 2: 12, 3: 15, 4: 15}
A_BLOCK_COUNT = 6
A_BLOCK_SECONDS = 30

# Е2 коэффициенті λ_q (ai_examiner §5.3).
LAMBDA: dict[int, float] = {1: 0.04, 2: 0.02, 3: 0.01, 4: 0.01}

X1_SHARE = 0.4  # X1/X2 = 40/60 (D60)

LEVEL_TITLES: dict[int, str] = {1: "Білу", 2: "Қолдану", 3: "Пайымдау", 4: "Қолдану + Пайымдау"}
FORMAT_TITLES: dict[str, str] = {
    "mcq": "Тест",
    "matching": "Сәйкестендіру",
    "short_answer": "Қысқа жауап",
    "sequence": "Реттілік",
    "true_false_fix": "Дұрыс/Бұрыс",
    "error_step": "Қате қадам",
    "formula_builder": "Конструктор",
    "slider": "Слайдер",
    "any_code": "Ұшқырлық блогы",
    "socratic": "Сократтық диалог",
    "feynman": "Фейнман",
    "teach_ai": "«ЖИ-ді оқыт»",
    "priority": "Басымдық",
    "case_study": "Кейс",
}


@dataclass(frozen=True)
class Slot:
    tier: str
    format: str
    block: str | None = None


@dataclass(frozen=True)
class Composition:
    level: int
    slots: tuple[Slot, ...]          # X1 мен X2, сессиядағы ретімен
    formats: dict[str, int]          # формат → тапсырма саны
    excluded: tuple[str, ...] = ()

    @property
    def n(self) -> int:
        return len(self.slots)

    @property
    def minutes(self) -> int:
        return LEVEL_MINUTES.get(self.level, max(1, math.ceil((self.n + 1) * 1.5)))

    def to_json(self) -> dict:
        return {
            "version": COMPOSITION_VERSION,
            "level": self.level,
            "slots": [
                {"tier": slot.tier, "format": slot.format, **({"block": slot.block} if slot.block else {})}
                for slot in self.slots
            ],
            "formats": self.formats,
            "excluded": list(self.excluded),
            "x3": 1,
        }


def x1_count(count: int) -> int:
    """Формат санының X1 үлесі, жартысынан жоғары дөңгелектеледі: 5 → 2, 3 → 1, 1 → 0."""
    return math.floor(count * X1_SHARE + 0.5)


def code_formats_for_subject(applicable: Mapping[str, bool]) -> list[str]:
    return [name for name in CODE_FORMATS if applicable.get(name, True)]


def build_composition(level: int, applicable: Mapping[str, bool]) -> Composition:
    if level not in AVAILABLE_LEVELS:
        raise ValueError(f"{level}-деңгей жоқ")
    if level == 3:
        a_x1 = x1_count(A_BLOCK_COUNT)
        a_slots = [Slot("X1", "any_code", "A")] * a_x1 + [Slot("X2", "any_code", "A")] * (A_BLOCK_COUNT - a_x1)
        d_slots = [Slot("X1", "socratic", "D"), Slot("X2", "feynman", "D")]
        formats = {"any_code": A_BLOCK_COUNT, "socratic": 1, "feynman": 1}
        return Composition(level=3, slots=tuple(a_slots + d_slots), formats=formats, excluded=())
    formats = effective_composition(level, applicable)
    x1 = [Slot("X1", name) for name, count in formats.items() for _ in range(x1_count(count))]
    x2 = [Slot("X2", name) for name, count in formats.items() for _ in range(count - x1_count(count))]
    return Composition(level=level, slots=tuple(x1 + x2), formats=formats, excluded=())


def level_formats(level: int, applicable: Mapping[str, bool]) -> list[str]:
    """Деңгейге тән сұрақ банк форматтары (таңдау мен X3 үшін)."""
    if level == 3:
        return ["socratic", "feynman", "teach_ai"]
    return [name for name in build_composition(level, applicable).formats]
