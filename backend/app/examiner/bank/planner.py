"""Банк қорын жоспарлау: қай § пен форматқа қанша сұрақ жетпейді (ai_examiner.md §5.4, Е3).

Түнгі қор ережесі: `бос қор ≥ бір мезгілдегі ең көп сессия × бір сессиядағы сұрақ саны × 1.2`.
Бұл модульде ол § бойынша есептеледі: әр § үшін `concurrent_sessions_per_topic` сессияға
жететін қор ұсталады. Мәндер — бастапқы конфигурация, нақты жүктеме бойынша түзетіледі.

Сессия құрамы — bagalau §2.3; пәнге келмейтін код форматының орны сол деңгейдің басқа код
форматына беріледі (bagalau §2.4).
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field

from .formats import CODE_FORMATS

# bagalau §2.3: X.1 + X.2 тапсырмаларының саны.
COMPOSITION: dict[int, dict[str, int]] = {
    1: {"mcq": 5, "matching": 3, "short_answer": 2},
    2: {"sequence": 2, "true_false_fix": 2, "error_step": 2, "formula_builder": 1, "slider": 1},
}


@dataclass(frozen=True)
class StockPolicy:
    concurrent_sessions_per_topic: int = 2
    safety: float = 1.2
    tier_share: Mapping[str, float] = field(default_factory=lambda: {"X1": 0.4, "X2": 0.6})
    x3_per_session: int = 1


@dataclass(frozen=True)
class Slot:
    topic_id: str
    format: str
    tier: str
    missing: int


def effective_composition(level: int, applicable: Mapping[str, bool]) -> dict[str, int]:
    """Пәнге келмейтін код форматының саны сол деңгейдің қолданылатын код форматтарына
    кезекпен беріледі. ЖИ мен гибрид форматтары барлық пәнге ортақ (bagalau §2.4)."""
    composition = dict(COMPOSITION[level])
    code = [name for name in composition if name in CODE_FORMATS]
    receivers = [name for name in code if applicable.get(name, True)]
    if not receivers:
        raise ValueError(f"{level}-деңгейде пәнге қолданылатын код форматы жоқ")
    for index, name in enumerate(name for name in code if not applicable.get(name, True)):
        count = composition.pop(name)
        composition[receivers[index % len(receivers)]] += count
    return composition


def stock_targets(
    level: int, applicable: Mapping[str, bool], policy: StockPolicy, formats: Iterable[str] = CODE_FORMATS
) -> dict[tuple[str, str], int]:
    """Бір § үшін (формат, санат) → мақсатты қор."""
    wanted = set(formats)
    composition = {name: count for name, count in effective_composition(level, applicable).items() if name in wanted}
    sessions = policy.concurrent_sessions_per_topic * policy.safety
    targets: dict[tuple[str, str], int] = {}
    for name, count in composition.items():
        for tier, share in policy.tier_share.items():
            targets[(name, tier)] = math.ceil(count * share * sessions - 1e-9)
    # X.3 — деңгейдің бір банкі; қор форматтарға кезекпен бөлінеді.
    x3_total = math.ceil(policy.x3_per_session * sessions - 1e-9)
    names = list(composition)
    for index in range(x3_total if names else 0):
        key = (names[index % len(names)], "X3")
        targets[key] = targets.get(key, 0) + 1
    return targets


def plan(
    topic_ids: Sequence[str],
    level: int,
    applicable: Mapping[str, bool],
    have: Mapping[tuple[str, str, str], int],
    policy: StockPolicy = StockPolicy(),
    formats: Iterable[str] = CODE_FORMATS,
) -> list[Slot]:
    """`have` — (topic_id, формат, санат) → белсенді сұрақ пен өңделмеген сұраныс саны."""
    targets = stock_targets(level, applicable, policy, formats)
    slots: list[Slot] = []
    for topic_id in topic_ids:
        for (name, tier), target in targets.items():
            missing = target - have.get((topic_id, name, tier), 0)
            if missing > 0:
                slots.append(Slot(topic_id, name, tier, missing))
    return slots
