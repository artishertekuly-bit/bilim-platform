"""«Пән бойынша тест» (D97): a subject-wide mixed set of 10, 20 or 50 items from the active bank only.

  * 60 % MCQ: `ExaminerService.assemble_mcqs(..., bank_only=True)`, the D96 retrieval (stratified by era and subtopic
    for the whole subject, metadata ranking for a written topic). Generated and imported MCQs together.
  * 40 % other single-turn formats, drawn at random with `NON_MCQ_WEIGHTS` (one format per draw, so a large bank of
    one format does not crowd out the rest). One item per `fact_key` / `concept_key` across the whole set.

Nothing is generated and nothing is embedded at start ($0, well under a second). When the bank has fewer non-MCQ
items than 40 % (world_history has MCQs only), the free slots go to extra bank MCQs; the final order is shuffled.
Dialog formats (socratic, teach_ai) and the long feynman explanation do not fit a timed 50-item test.
Pure functions here; I/O in `ExaminerService.start_mixed`.
"""

from __future__ import annotations

import random
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import TypeVar

from . import topics as topic_search

COUNTS: tuple[int, ...] = (10, 20, 50)
MCQ_SHARE_NUM, MCQ_SHARE_DEN = 3, 5      # 60 % MCQ: 10 → 6 + 4, 20 → 12 + 8, 50 → 30 + 20
TIERS: tuple[str, ...] = ("X1", "X2")    # X3 stays the level boss item
TOPIC_MIN_SCORE = 0.5                    # share of the written topic's words found in a § title

NON_MCQ_WEIGHTS: dict[str, int] = {
    "matching": 3,
    "sequence": 3,
    "true_false_fix": 3,
    "short_answer": 2,
    "priority": 2,
    "error_step": 1,
    "formula_builder": 1,
    "slider": 1,
    "case_study": 1,
}
NON_MCQ_FORMATS: tuple[str, ...] = tuple(NON_MCQ_WEIGHTS)

T = TypeVar("T")


@dataclass(frozen=True)
class BankItem:
    question_id: str
    format: str
    tier: str
    topic_id: str | None = None
    fact_key: str | None = None
    concept_key: str | None = None
    leased_at: datetime | None = None

    @property
    def diversity_key(self) -> str:
        if self.fact_key:
            return f"fact:{self.fact_key}"
        if self.concept_key:
            return f"concept:{self.concept_key}"
        return f"question:{self.question_id}"


def split(count: int) -> tuple[int, int]:
    """(MCQ target, non-MCQ target) of a set."""
    if count not in COUNTS:
        raise ValueError(f"count must be one of {COUNTS}")
    mcq = count * MCQ_SHARE_NUM // MCQ_SHARE_DEN
    return mcq, count - mcq


def pick_non_mcq(items: Sequence[BankItem], target: int, rng: random.Random, *,
                 weights: dict[str, int] | None = None, taken: Iterable[str] = ()) -> list[BankItem]:
    """Up to `target` items; each draw picks a format by weight among the formats that still have items, then the
    next item of that format (free rows first). Repeated `fact_key` / `concept_key` are skipped."""
    weights = NON_MCQ_WEIGHTS if weights is None else weights
    keys = set(taken)
    by_format: dict[str, list[BankItem]] = {}
    for item in items:
        if weights.get(item.format, 0) > 0:
            by_format.setdefault(item.format, []).append(item)
    for lst in by_format.values():
        rng.shuffle(lst)
        lst.sort(key=lambda i: i.leased_at is not None)
    out: list[BankItem] = []
    while len(out) < target:
        formats = [name for name, lst in by_format.items() if lst]
        if not formats:
            break
        name = rng.choices(formats, weights=[weights[f] for f in formats])[0]
        item = by_format[name].pop(0)
        if item.diversity_key in keys:
            continue
        keys.add(item.diversity_key)
        out.append(item)
    return out


def topic_ids(query: str, paragraphs: Sequence[topic_search.Paragraph], *,
              min_score: float = TOPIC_MIN_SCORE) -> list[str]:
    """§ whose title holds the written topic, by word stems only (no embedding call). Empty when none does."""
    return [p.topic_id for p in paragraphs if topic_search.lexical_score(query, p.paragraph_title) >= min_score]


def arrange(items: Sequence[T], rng: random.Random) -> list[T]:
    out = list(items)
    rng.shuffle(out)
    return out
