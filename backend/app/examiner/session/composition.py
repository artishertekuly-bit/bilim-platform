"""Сессия құрамы (bagalau §2.3, §2.4; README D62).

ЖИ форматтары (5-қадам) іске қосылғанша сессия тек код форматтарынан тұрады: ЖИ мен гибрид
форматтарының орны басқа форматпен толтырылмайды (bagalau §2.4), сондықтан құрамнан шығады.
Құрам сессияға жазылады (`sessions.composition`, Т4): кейін конфигурация өзгерсе де, бұрынғы
сессия өз құрамымен бағаланады.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass

from ..bank.formats import CODE_FORMATS
from ..bank.planner import effective_composition

COMPOSITION_VERSION = "2026-11-19.1"

# 4-қадамда тек 1–2-деңгей ашық: 3-деңгейдің D блогы мен 4-деңгей ЖИ бағасын талап етеді (D62).
AVAILABLE_LEVELS: frozenset[int] = frozenset({1, 2})

# «Меңгерілді» шегі (bagalau §4.3).
THRESHOLDS: dict[int, int] = {1: 80, 2: 85, 3: 75, 4: 75}

# Экранға арналған бастапқы уақыт (bagalau §2.3). Код тапсырмасына ≈ 1.5 мин.
MINUTES_PER_CODE_TASK = 1.5

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


@dataclass(frozen=True)
class Composition:
    level: int
    slots: tuple[Slot, ...]          # X1 мен X2, сессиядағы ретімен
    formats: dict[str, int]          # формат → тапсырма саны
    excluded: tuple[str, ...]        # 4-қадамда құрамнан шыққан ЖИ/гибрид форматтары

    @property
    def n(self) -> int:
        return len(self.slots)

    @property
    def minutes(self) -> int:
        return max(1, math.ceil((self.n + 1) * MINUTES_PER_CODE_TASK))

    def to_json(self) -> dict:
        return {
            "version": COMPOSITION_VERSION,
            "level": self.level,
            "slots": [{"tier": slot.tier, "format": slot.format} for slot in self.slots],
            "formats": self.formats,
            "excluded": list(self.excluded),
            "x3": 1,
        }


def x1_count(count: int) -> int:
    """Формат санының X1 үлесі, жартысынан жоғары дөңгелектеледі: 5 → 2, 3 → 1, 1 → 0."""
    return math.floor(count * X1_SHARE + 0.5)


def build_composition(level: int, applicable: Mapping[str, bool]) -> Composition:
    if level not in AVAILABLE_LEVELS:
        raise ValueError(f"{level}-деңгей әзірге ашылмаған")
    full = effective_composition(level, applicable)
    formats = {name: count for name, count in full.items() if name in CODE_FORMATS}
    excluded = tuple(name for name in full if name not in CODE_FORMATS)
    x1 = [Slot("X1", name) for name, count in formats.items() for _ in range(x1_count(count))]
    x2 = [Slot("X2", name) for name, count in formats.items() for _ in range(count - x1_count(count))]
    return Composition(level=level, slots=tuple(x1 + x2), formats=formats, excluded=excluded)


def level_formats(level: int, applicable: Mapping[str, bool]) -> list[str]:
    """Деңгейдің пәнге қолданылатын код форматтары: алмастыру мен X3 осылардан алынады."""
    return [name for name in build_composition(level, applicable).formats]
