"""Банк қорын жоспарлау: қай § пен форматқа қанша сұрақ жетпейді (ai_examiner.md §5.4, Е3, D76).

Түнгі қор ережесі: `бос қор ≥ бір мезгілдегі ең көп сессия × бір сессиядағы сұрақ саны × 1.2`.
Ұғымдары шығарылған §-те қор чанк санынан емес, ұғым тобының санынан есептеледі (`concept_targets`,
D76, D80):
  * тест — ұғым тобының саны (5-тен 30-ға дейін), бірақ барлық санатта бірге ұғым санынан аспайды:
    бір ұғымнан бір § пен форматта бір ғана сұрақ (X2 мен X3 бір ұғымнан бірдей сұрақ құрып жібереді);
  * сәйкестендіру — `ceil(ұғым саны / 2)` (3-тен 12-ге дейін); §-те 3 ұғымнан аз болса, өткізіледі;
  * басқа форматтар — базалық қор ұғым санына пропорционалды масштабталады.

Сессия құрамы — bagalau §2.3; пәнге келмейтін код форматының орны сол деңгейдің басқа код
форматына беріледі (bagalau §2.4).
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field

from .formats import ALL_FORMATS, CODE_FORMATS, CONCEPT_BOUND_FORMATS

# bagalau §2.3: X.1 + X.2 тапсырмаларының саны (3-деңгейдің A блогы 1–2-деңгейден таңдалады).
COMPOSITION: dict[int, dict[str, int]] = {
    1: {"mcq": 5, "matching": 3, "short_answer": 2},
    2: {"sequence": 2, "true_false_fix": 2, "error_step": 2, "formula_builder": 1, "slider": 1},
    3: {"socratic": 1, "feynman": 1, "teach_ai": 1},
    4: {"case_study": 1, "priority": 2},
}

BASELINE_SESSIONS = 2.4       # 2 қатар сессия × 1.2
BASELINE_CONCEPTS = 10        # stock_targets осы ұғым санына сәйкес
MCQ_PER_CONCEPT = 1.0
MCQ_MIN = 5
MCQ_MAX = 30
MATCHING_PER_CONCEPT = 0.5
MATCHING_MIN = 3
MATCHING_MAX = 12
MIN_MATCHING_CONCEPTS = 3     # сәйкестендіруге кемінде 3 жұп керек (Т6)
# Әр сұрағы бір ұғымға байланатын форматтар: тест, сәйкестендіру (D80), ашық пен гибрид форматтары (D79).
# Бір § пен форматта бір ұғым тобынан бір ғана сұрақ, санатқа қарамай: қоры ұғым санынан аспайды (D80).
ANCHORED_FORMATS = frozenset({"matching", *CONCEPT_BOUND_FORMATS})


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
    if code:
        receivers = [name for name in code if applicable.get(name, True)]
        if not receivers:
            raise ValueError(f"{level}-деңгейде пәнге қолданылатын код форматы жоқ")
        for index, name in enumerate(name for name in code if not applicable.get(name, True)):
            count = composition.pop(name)
            composition[receivers[index % len(receivers)]] += count
    return composition


def stock_targets(
    level: int, applicable: Mapping[str, bool], policy: StockPolicy, formats: Iterable[str] = ALL_FORMATS
) -> dict[tuple[str, str], int]:
    """Бір § үшін (формат, санат) → базалық мақсатты қор (ұғым саны белгісіз кезде)."""
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


def concept_targets(
    concept_count: int,
    level: int,
    applicable: Mapping[str, bool],
    policy: StockPolicy = StockPolicy(),
    formats: Iterable[str] = ALL_FORMATS,
) -> dict[tuple[str, str], int]:
    """§-тің ұғым саны бойынша (формат, санат) → мақсатты қор (D76)."""
    if concept_count <= 0:
        return {}
    wanted = set(formats)
    composition = {name: count for name, count in effective_composition(level, applicable).items() if name in wanted}
    if "matching" in composition and concept_count < MIN_MATCHING_CONCEPTS:
        composition.pop("matching")
    if not composition:
        return {}

    sessions = policy.concurrent_sessions_per_topic * policy.safety
    if sessions < 1.0:
        targets = stock_targets(level, {name: True for name in composition}, policy, composition)
        for name in ANCHORED_FORMATS & set(composition):
            _cap_by_concepts(targets, name, concept_count)
        return {k: v for k, v in targets.items() if v > 0}
    policy_scale = sessions / BASELINE_SESSIONS
    concept_scale = min(2.0, max(0.5, concept_count / BASELINE_CONCEPTS))

    x3_base_total = math.ceil(policy.x3_per_session * BASELINE_SESSIONS - 1e-9)
    names = list(composition)
    x3_by_name: dict[str, int] = {name: 0 for name in names}
    for index in range(x3_base_total):
        name = names[index % len(names)]
        x3_by_name[name] += 1

    targets: dict[tuple[str, str], int] = {}
    x1_share = float(policy.tier_share.get("X1", 0.4))
    for name, count in composition.items():
        if name == "mcq":
            base_total = min(MCQ_MAX, max(MCQ_MIN, round(MCQ_PER_CONCEPT * concept_count)))
        elif name == "matching":
            base_total = min(MATCHING_MAX, max(MATCHING_MIN, math.ceil(MATCHING_PER_CONCEPT * concept_count)))
        else:
            base_total = max(1, round(count * BASELINE_SESSIONS * concept_scale))

        x3_base = min(x3_by_name[name], max(1, base_total // 3)) if x3_by_name[name] else 0
        rest_base = max(0, base_total - x3_base)
        x1_base = math.floor(rest_base * x1_share + 0.5)
        x2_base = max(0, rest_base - x1_base)

        if abs(policy_scale - 1.0) < 1e-9:
            x1, x2, x3 = x1_base, x2_base, x3_base
        else:
            x1 = math.ceil(x1_base * policy_scale - 1e-9) if x1_base else 0
            x2 = math.ceil(x2_base * policy_scale - 1e-9) if x2_base else 0
            x3 = math.ceil(x3_base * policy_scale - 1e-9) if x3_base else 0

        for tier, value in (("X1", x1), ("X2", x2), ("X3", x3)):
            if value > 0:
                targets[(name, tier)] = value
        if name in ANCHORED_FORMATS:
            _cap_by_concepts(targets, name, concept_count)
    return {k: v for k, v in targets.items() if v > 0}


def _cap_by_concepts(targets: dict[tuple[str, str], int], name: str, concept_count: int) -> None:
    """Форматтың барлық санаттағы қоры ұғым санынан аспайды (D80). Артығы алдымен X2-ден (ең үлкен
    үлес), сосын X1-ден алынады; X3 — деңгей боссы, ол соңғы кезекте қысқарады."""
    excess = sum(targets.get((name, tier), 0) for tier in ("X1", "X2", "X3")) - concept_count
    for tier in ("X2", "X1", "X3"):
        if excess <= 0:
            return
        value = targets.get((name, tier), 0)
        cut = min(value, excess)
        targets[(name, tier)] = value - cut
        excess -= cut


def plan(
    topic_ids: Sequence[str],
    level: int,
    applicable: Mapping[str, bool],
    have: Mapping[tuple[str, str, str], int],
    policy: StockPolicy = StockPolicy(),
    formats: Iterable[str] = ALL_FORMATS,
    *,
    concepts_by_topic: Mapping[str, int] | None = None,
    x3_limits: Mapping[tuple[str, str], int] | None = None,
) -> list[Slot]:
    """`have` — (topic_id, формат, санат) → белсенді сұрақ пен өңделмеген сұраныс саны.
    `concepts_by_topic` берілген §-терге норма ұғым санынан (`concept_targets`), қалғанына
    базалық `stock_targets`-тен есептеледі.
    `x3_limits` — (topic_id, формат) → X3-ке нысана бола алатын ұғым тобының саны (D80). X3 нормасы одан
    аспайды, артығы X2 нормасына қосылады: форматтың жалпы қоры өзгермейді."""
    fallback = stock_targets(level, applicable, policy, formats)
    slots: list[Slot] = []
    for topic_id in topic_ids:
        targets = dict(
            concept_targets(concepts_by_topic[topic_id], level, applicable, policy, formats)
            if concepts_by_topic is not None and topic_id in concepts_by_topic
            else fallback
        )
        for (limit_topic, name), limit in (x3_limits or {}).items():
            x3 = targets.get((name, "X3"), 0)
            if limit_topic == topic_id and x3 > limit:
                targets[(name, "X3")] = limit
                targets[(name, "X2")] = targets.get((name, "X2"), 0) + x3 - limit
        for (name, tier), target in targets.items():
            missing = target - have.get((topic_id, name, tier), 0)
            if missing > 0:
                slots.append(Slot(topic_id, name, tier, missing))
    return slots
