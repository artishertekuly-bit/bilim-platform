"""Сессияға сұрақ таңдау (ai_examiner §2.1, §5.4; bagalau §2.4).

Кандидаттар Е1 мен Е2-ден өткен белсенді сұрақтар (SQL-да сүзіледі). Мұнда тек бөлу қалады:
  * әр орынға өз форматы мен санатындағы сұрақ; жоқ болса, сол санаттағы деңгейдің басқа код
    форматы (bagalau §2.4: код форматы тек код форматымен алмастырылады);
  * тарау мен пән масштабында сұрақтар §-тер бойынша тең таралады (ең аз қолданылған § бірінші).
"""

from __future__ import annotations

import random
from collections import Counter, defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from .composition import Slot


@dataclass(frozen=True)
class Candidate:
    question_id: str
    topic_id: str
    format: str
    tier: str


class Picker:
    def __init__(self, candidates: Iterable[Candidate], formats: Sequence[str], rng: random.Random) -> None:
        self._formats = list(formats)
        self._rng = rng
        self._pools: dict[tuple[str, str], list[Candidate]] = defaultdict(list)
        for candidate in candidates:
            self._pools[(candidate.tier, candidate.format)].append(candidate)
        for pool in self._pools.values():
            rng.shuffle(pool)
        self._topic_use: Counter[str] = Counter()

    def _take(self, tier: str, fmt: str) -> Candidate | None:
        pool = self._pools.get((tier, fmt))
        if not pool:
            return None
        least = min(self._topic_use[candidate.topic_id] for candidate in pool)
        choices = [index for index, candidate in enumerate(pool) if self._topic_use[candidate.topic_id] == least]
        chosen = pool.pop(self._rng.choice(choices))
        self._topic_use[chosen.topic_id] += 1
        return chosen

    def take(self, slot: Slot) -> Candidate | None:
        """Орынның өз форматы, болмаса сол санаттағы басқа код форматы."""
        chosen = self._take(slot.tier, slot.format)
        if chosen is not None:
            return chosen
        for fmt in self._formats:
            if fmt != slot.format:
                chosen = self._take(slot.tier, fmt)
                if chosen is not None:
                    return chosen
        return None

    def take_any(self, tier: str) -> Candidate | None:
        """X3: деңгейдің кез келген код форматы."""
        formats = list(self._formats)
        self._rng.shuffle(formats)
        for fmt in formats:
            chosen = self._take(tier, fmt)
            if chosen is not None:
                return chosen
        return None


def order_items(slots: Sequence[Slot], chosen: Sequence[Candidate]) -> list[tuple[Slot, Candidate]]:
    """Сессиядағы рет: X1 → X2, әр санаттың ішінде құрамдағы форматтардың ретімен (bagalau §2.3).
    Алмастырылған сұрақ өз форматының орнына тұрады."""
    rank = {fmt: index for index, fmt in enumerate(dict.fromkeys(slot.format for slot in slots))}
    pairs = list(zip(slots, chosen, strict=True))
    tier_rank = {"X1": 0, "X2": 1, "X3": 2}
    return sorted(pairs, key=lambda pair: (tier_rank[pair[0].tier], rank.get(pair[1].format, len(rank))))
