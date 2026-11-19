"""Сессияға сұрақ таңдау (ai_examiner §2.1, §5.2, §5.4; bagalau §2.4).

Кандидаттар — Е2-ден өткен белсенді сұрақтар (SQL-да сүзіледі). Е1 — басымдық (D65): әр сұрақ не бос
(`leased_at is None`), не басқа сессияға бекітілген (`leased_at` — соңғы бекітілген сәті). Бөлу реті:
  1. орынның өз форматындағы бос сұрақ;
  2. өз форматындағы бекітілген сұрақ, ең ерте бекітілгені бірінші (сынып бір §-ті қатар тапсырғанда);
  3. сол санаттағы деңгейдің басқа код форматы, алдымен бос, содан кейін бекітілген
     (bagalau §2.4: код форматы тек код форматымен алмастырылады).
Форматтың орнын сақтау Е1-ден маңыздырақ: құрам деңгейдің өлшеу жоспары (bagalau §2.3), ал қайта
берілген сұрақтың нұсқалары сессияда жеке араластырылады (shuffle.py).
Тарау мен пән масштабында сұрақтар §-тер бойынша тең таралады (ең аз қолданылған § бірінші).
"""

from __future__ import annotations

import random
from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

from .composition import Slot


@dataclass(frozen=True)
class Candidate:
    question_id: str
    topic_id: str
    format: str
    tier: str
    leased_at: datetime | None = None  # None — бос; әйтпесе басқа сессияға бекітілген (D65)

    @property
    def reused(self) -> bool:
        return self.leased_at is not None


class Picker:
    def __init__(self, candidates: Iterable[Candidate], formats: Sequence[str], rng: random.Random) -> None:
        self._formats = list(formats)
        self._rng = rng
        self._free: dict[tuple[str, str], list[Candidate]] = defaultdict(list)
        self._leased: dict[tuple[str, str], list[Candidate]] = defaultdict(list)
        for candidate in candidates:
            target = self._leased if candidate.reused else self._free
            target[(candidate.tier, candidate.format)].append(candidate)
        for pool in self._free.values():
            rng.shuffle(pool)
        self._topic_use: Counter[str] = Counter()

    def _take(self, tier: str, fmt: str, *, reuse: bool) -> Candidate | None:
        pool = (self._leased if reuse else self._free).get((tier, fmt))
        if not pool:
            return None
        least = min(self._topic_use[candidate.topic_id] for candidate in pool)
        choices = [index for index, candidate in enumerate(pool) if self._topic_use[candidate.topic_id] == least]
        if reuse:
            # Е1-дің 2-сатысы: ең ерте бекітілгені (ai_examiner §5.2).
            index = min(choices, key=lambda i: pool[i].leased_at.timestamp() if pool[i].leased_at else 0.0)
        else:
            index = self._rng.choice(choices)
        chosen = pool.pop(index)
        self._topic_use[chosen.topic_id] += 1
        return chosen

    def _first(self, tier: str, formats: Sequence[str]) -> Candidate | None:
        for reuse in (False, True):
            for fmt in formats:
                chosen = self._take(tier, fmt, reuse=reuse)
                if chosen is not None:
                    return chosen
        return None

    def take(self, slot: Slot) -> Candidate | None:
        """Орынның өз форматы (бос, содан кейін бекітілген), болмаса сол санаттағы басқа код форматы."""
        chosen = self._first(slot.tier, [slot.format])
        if chosen is not None:
            return chosen
        return self._first(slot.tier, [fmt for fmt in self._formats if fmt != slot.format])

    def take_any(self, tier: str) -> Candidate | None:
        """X3: деңгейдің кез келген код форматы, алдымен бос сұрақ."""
        formats = list(self._formats)
        self._rng.shuffle(formats)
        return self._first(tier, formats)


def level_availability(slots: Sequence[Slot], stock: Mapping[str, tuple[int, int]]) -> str:
    """Деңгей картасының күйі (D65). `stock`: санат → (Е2-ден өткен сұрақ, оның ішінде бос сұрақ).
    Санат ішінде формат алмастырылатындықтан (bagalau §2.4), қор санат бойынша саналады."""
    need = Counter(slot.tier for slot in slots)
    if any(stock.get(tier, (0, 0))[0] < count for tier, count in need.items()):
        return "unavailable"
    if any(stock.get(tier, (0, 0))[1] < count for tier, count in need.items()):
        return "low_stock"
    return "ready"


def order_items(slots: Sequence[Slot], chosen: Sequence[Candidate]) -> list[tuple[Slot, Candidate]]:
    """Сессиядағы рет: X1 → X2, әр санаттың ішінде құрамдағы форматтардың ретімен (bagalau §2.3).
    Алмастырылған сұрақ өз форматының орнына тұрады."""
    rank = {fmt: index for index, fmt in enumerate(dict.fromkeys(slot.format for slot in slots))}
    pairs = list(zip(slots, chosen, strict=True))
    tier_rank = {"X1": 0, "X2": 1, "X3": 2}
    return sorted(pairs, key=lambda pair: (tier_rank[pair[0].tier], rank.get(pair[1].format, len(rank))))
