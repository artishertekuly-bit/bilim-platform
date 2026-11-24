"""Hybrid MCQ retrieval over a subject's whole bank (D96): generated and imported level-1 MCQs together.

Imported rows (D95) carry metadata (`era`, `subtopic`, `period_label`, `year_sort`); many have no § (all of
world_history), so a § filter would never find them. A query is a subject plus the learner's text:

  * narrow (a topic was written): a row qualifies by a topic word stem in `subtopic` / `era` / `period_label`, or by
    `content_embedding` cosine ≥ SIMILARITY_THRESHOLD; when the query names years (1465, 1916–1920, XV ғасыр),
    `year_sort` must fall in that range (± YEAR_TOLERANCE). Metadata hits rank first, then similarity.
  * broad (empty, or only the subject's own name, «Қазақстан тарихы» / «Дүниежүзі тарихы»): a stratified sample.
    Eras take turns and each era cycles its subtopics, so a 20–50 item set covers every period evenly.

Both keep one question per `fact_key` / `concept_key`. Rows the learner saw recently and the SQL prefilter are in
`ExaminerService._bank_mcqs`; everything here is pure.
"""

from __future__ import annotations

import math
import random
import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

from .topics import STEM_CHARS, clean_query, words

SIMILARITY_THRESHOLD = 0.76   # query ↔ question cosine for a narrow topic without a metadata hit
DEDUP_THRESHOLD = 0.88        # a newly generated MCQ this close to a chosen one is dropped
YEAR_TOLERANCE = 2
MIN_SET, MAX_SET = 1, 50      # custom sets are 20–50 in the UI; the service accepts any size up to 50

_YEAR_RE = re.compile(r"(?<!\d)(\d{3,4})(?!\d)")
_CENTURY_RE = re.compile(r"(?<![\w])([IVXLC]{1,6}|\d{1,2})\s*(?:ғасыр\w*|ғ\.)", re.IGNORECASE)
_ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}
# Words that mark a date or a whole subject, not a topic.
_DATE_WORDS = ("ғасыр", "жылы", "жылдар", "жылғы", "жыл")
_GENERIC_WORDS = ("тарих", "барлық", "жалпы", "толық", "кезең", "пәні", "сұрақ")


@dataclass(frozen=True)
class McqQuery:
    text: str
    words: tuple[str, ...]              # topic words left after subject-name and date words
    years: tuple[int, int] | None       # inclusive range named by the query

    @property
    def broad(self) -> bool:
        return not self.words and self.years is None


@dataclass(frozen=True)
class BankMcq:
    question_id: str
    origin: str
    topic_id: str | None
    tier: str
    era: str | None = None
    subtopic: str | None = None
    period_label: str | None = None
    year_sort: int | None = None
    fact_key: str | None = None
    concept_key: str | None = None
    similarity: float | None = None
    leased_at: datetime | None = None

    @property
    def diversity_key(self) -> str:
        if self.fact_key:
            return f"fact:{self.fact_key}"
        if self.concept_key:
            return f"concept:{self.concept_key}"
        return f"question:{self.question_id}"


@dataclass(frozen=True)
class McqAssembly:
    question_ids: tuple[str, ...]
    from_bank: int
    generated: int
    broad: bool
    tiers: tuple[str, ...] = ()   # x_tier of each question, in `question_ids` order


def _roman(text: str) -> int | None:
    values = [_ROMAN.get(ch) for ch in text.upper()]
    if not values or None in values:
        return None
    total = 0
    for index, value in enumerate(values):
        nxt = values[index + 1] if index + 1 < len(values) else 0
        total += -value if value < nxt else value
    return total or None


def _stem_match(a: str, b: str) -> bool:
    return b.startswith(a[:STEM_CHARS]) or a.startswith(b[:STEM_CHARS])


def parse_query(text: str | None, subject_title: str = "") -> McqQuery:
    cleaned = clean_query(text or "")
    years: list[int] = []
    for match in _CENTURY_RE.finditer(cleaned):
        raw = match.group(1)
        century = int(raw) if raw.isdigit() else _roman(raw)
        if century and 1 <= century <= 21:
            years += [(century - 1) * 100 + 1, century * 100]
    without_centuries = _CENTURY_RE.sub(" ", cleaned)
    years += [int(y) for y in _YEAR_RE.findall(without_centuries)]
    subject_words = words(subject_title)
    topic_words = [
        w for w in words(without_centuries)
        if not w.isdigit() and _roman(w) is None
        and not any(_stem_match(w, s) for s in (*subject_words, *_GENERIC_WORDS))
        and not any(w.startswith(d) for d in _DATE_WORDS)
    ]
    return McqQuery(
        text=cleaned,
        words=tuple(dict.fromkeys(topic_words)),
        years=(min(years), max(years)) if years else None,
    )


def word_hit(item: BankMcq, query: McqQuery) -> bool:
    meta = words(" ".join(filter(None, (item.subtopic, item.era, item.period_label))))
    return bool(meta) and any(_stem_match(q, m) for q in query.words for m in meta)


def year_hit(item: BankMcq, query: McqQuery) -> bool:
    if query.years is None or item.year_sort is None:
        return False
    low, high = query.years
    return low - YEAR_TOLERANCE <= item.year_sort <= high + YEAR_TOLERANCE


def qualifies(item: BankMcq, query: McqQuery, threshold: float = SIMILARITY_THRESHOLD) -> bool:
    if query.broad:
        return True
    similar = item.similarity is not None and item.similarity >= threshold
    if not query.words:                       # years only
        return year_hit(item, query)
    topical = word_hit(item, query) or similar
    if query.years is None:
        return topical
    # Years narrow the topic; a row without year_sort (generated) can only stay on similarity.
    return topical and (year_hit(item, query) or (item.year_sort is None and similar))


def _take(ordered: Iterable[BankMcq], count: int, taken: set[str]) -> list[BankMcq]:
    out: list[BankMcq] = []
    for item in ordered:
        if len(out) >= count:
            break
        if item.diversity_key in taken:
            continue
        taken.add(item.diversity_key)
        out.append(item)
    return out


def select_narrow(items: Sequence[BankMcq], query: McqQuery, count: int, rng: random.Random, *,
                  threshold: float = SIMILARITY_THRESHOLD, taken: set[str] | None = None) -> list[BankMcq]:
    pool = [item for item in items if qualifies(item, query, threshold)]
    rng.shuffle(pool)  # variety among equal ranks
    pool.sort(key=lambda i: (-(word_hit(i, query) + year_hit(i, query)), -(i.similarity or 0.0),
                             i.leased_at is not None))
    return _take(pool, count, taken if taken is not None else set())


def stratified(items: Sequence[BankMcq], count: int, rng: random.Random, *,
               taken: set[str] | None = None) -> list[BankMcq]:
    """Eras in chronological order take turns; inside an era the subtopics take turns. Generated rows (no era)
    form one stratum whose subtopics are their §."""
    taken = taken if taken is not None else set()
    by_era: dict[str, dict[str, list[BankMcq]]] = {}
    for item in items:
        by_era.setdefault(item.era or "", {}).setdefault(item.subtopic or item.topic_id or "", []).append(item)

    def era_start(era: str) -> float:
        years = [i.year_sort for subs in [by_era[era]] for lst in subs.values() for i in lst if i.year_sort is not None]
        return min(years) if years else math.inf

    strata: list[list[list[BankMcq]]] = []
    for era in sorted(by_era, key=lambda e: (era_start(e), e)):
        lists = list(by_era[era].values())
        for lst in lists:
            rng.shuffle(lst)
            lst.sort(key=lambda i: i.leased_at is not None)  # free rows first
        rng.shuffle(lists)
        strata.append(lists)
    cursors = [0] * len(strata)
    out: list[BankMcq] = []
    while len(out) < count:
        progressed = False
        for index, lists in enumerate(strata):
            if len(out) >= count:
                break
            for _ in range(len(lists)):
                lst = lists[cursors[index] % len(lists)]
                cursors[index] += 1
                while lst and lst[0].diversity_key in taken:
                    lst.pop(0)
                if lst:
                    item = lst.pop(0)
                    taken.add(item.diversity_key)
                    out.append(item)
                    progressed = True
                    break
        if not progressed:
            break
    return out


def select(items: Sequence[BankMcq], query: McqQuery, count: int, rng: random.Random, *,
           threshold: float = SIMILARITY_THRESHOLD, taken: Iterable[str] = ()) -> list[BankMcq]:
    keys = set(taken)
    if query.broad:
        return stratified(items, count, rng, taken=keys)
    return select_narrow(items, query, count, rng, threshold=threshold, taken=keys)


def deficit(needed: int, found: int) -> int:
    return max(0, needed - found)


def drop_near_duplicates(fresh: Sequence[BankMcq], similarity_to_chosen: Mapping[str, float],
                         threshold: float = DEDUP_THRESHOLD) -> list[BankMcq]:
    """Newly generated rows whose best cosine to an already chosen row is above `threshold` are dropped."""
    return [item for item in fresh if similarity_to_chosen.get(item.question_id, 0.0) <= threshold]


def like_patterns(query: McqQuery) -> list[str]:
    """SQL prefilter: a superset of `word_hit` (substring of the stem), refined here."""
    return [f"%{w[:STEM_CHARS]}%" for w in query.words]
