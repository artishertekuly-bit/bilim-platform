"""Деңгей балы мен сессия нәтижесі (bagalau §4.2–§4.3).

`P = Σs / (4·n) × 100`, мұндағы `n` — X1 мен X2 тапсырмаларының саны. X3 деңгей балына кірмейді:
ол тек X1 мен X2-ден «қатесіз» (әр тапсырмада `s ≥ 3`) өткенге беріледі (D10, D13).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from .composition import THRESHOLDS

PASS_SCORE = 3  # «Қатесіз» шарты: s ≥ 3 (D13)


@dataclass(frozen=True)
class GradedItem:
    tier: str
    format: str
    block: str | None
    s: int | None  # None — әлі бағаланбаған


@dataclass(frozen=True)
class FormatScore:
    format: str
    block: str | None
    tasks: int
    score: int
    max: int


@dataclass(frozen=True)
class LevelScore:
    p: float
    mastered: bool
    threshold: int
    breakdown: tuple[FormatScore, ...]
    score: int
    max: int
    x3_status: str
    x3_reason: str | None


def x3_eligible(items: Sequence[GradedItem]) -> bool:
    base = [item for item in items if item.tier != "X3"]
    return bool(base) and all(item.s is not None and item.s >= PASS_SCORE for item in base)


def level_score(level: int, items: Sequence[GradedItem], *, x3_available: bool = True) -> LevelScore:
    base = [item for item in items if item.tier != "X3"]
    if not base or any(item.s is None for item in base):
        raise ValueError("Барлық X1/X2 тапсырмасы бағаланбаған")
    score = sum(item.s or 0 for item in base)
    maximum = 4 * len(base)
    p = round(score / maximum * 100, 2)
    threshold = THRESHOLDS[level]

    breakdown: dict[tuple[str, str | None], list[int]] = {}
    for item in base:
        breakdown.setdefault((item.format, item.block), []).append(item.s or 0)
    rows = tuple(FormatScore(fmt, block, len(scores), sum(scores), 4 * len(scores))
                 for (fmt, block), scores in breakdown.items())

    x3 = [item for item in items if item.tier == "X3"]
    if not x3_eligible(items):
        status, reason = "not_eligible", "Ашылу үшін әр тапсырма кемінде 3 балл алуы керек."
    elif x3 and x3[0].s is not None:
        status, reason = ("passed", None) if x3[0].s >= PASS_SCORE else ("failed", None)
    elif not x3_available:
        status, reason = "not_eligible", "Деңгей боссының сұрағы банкте әлі жоқ."
    else:
        raise ValueError("X3 тапсырмасы бағаланбаған")
    return LevelScore(p=p, mastered=p >= threshold, threshold=threshold, breakdown=rows, score=score,
                      max=maximum, x3_status=status, x3_reason=reason)
