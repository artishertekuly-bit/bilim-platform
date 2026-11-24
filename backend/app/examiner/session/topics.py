"""Finds the textbook § for a topic the learner typed (D93).

The exam scope is still a § (`topic`), because the bank and generation are built per §. The learner only picks a
subject and writes a topic; this module ranks the subject's § by two signals:

  * lexical: word stems of the query found in the § title (first five letters, so Kazakh suffixes do not matter:
    «хандығы» matches «хан», «Абылай» matches «Абылайдың»);
  * vector: the closest corpus chunks to the query (`corpus.match_chunks`), best distance per §.

Either signal may be missing (no embedding, no EXECUTE grant): the other one still ranks. Pure functions here,
I/O in `ExaminerService.search_topics`.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

STEM_CHARS = 5
MIN_WORD_CHARS = 3
MAX_QUERY_CHARS = 200
MAX_MATCHES = 3
VECTOR_CHUNKS = 30

# Question words and fillers that say nothing about the topic.
STOPWORDS = frozenset({
    "және", "мен", "пен", "бен", "туралы", "деген", "дегеніміз", "қалай", "қандай", "неге", "неліктен", "үшін",
    "тақырып", "тақырыбы", "тақырыпты", "бойынша", "сабақ", "емтихан", "тест",
})

_WORD_RE = re.compile(r"[^\W_]+", re.UNICODE)


@dataclass(frozen=True)
class Paragraph:
    topic_id: str
    book: str
    book_title: str
    grade: int
    paragraph_no: str
    paragraph_title: str


@dataclass(frozen=True)
class Ranked:
    paragraph: Paragraph
    score: float


def clean_query(text: str) -> str:
    return " ".join((text or "").split())[:MAX_QUERY_CHARS]


def words(text: str) -> list[str]:
    return [w for w in _WORD_RE.findall((text or "").lower()) if len(w) >= MIN_WORD_CHARS and w not in STOPWORDS]


def _match(query_word: str, title_word: str) -> bool:
    return title_word.startswith(query_word[:STEM_CHARS]) or query_word.startswith(title_word[:STEM_CHARS])


def lexical_score(query: str, title: str) -> float:
    """Share of the query's words whose stem appears in the title (0..1)."""
    q = list(dict.fromkeys(words(query)))
    if not q:
        return 0.0
    t = words(title)
    return sum(1 for w in q if any(_match(w, tw) for tw in t)) / len(q)


def full_title_match(query: str, paragraphs: Sequence[Paragraph]) -> Ranked | None:
    """A § whose title contains every word of the query (the usual case: learners write a § title). The lowest
    grade wins a tie, as in `rank_topics`. None when no title has them all."""
    best: Paragraph | None = None
    for p in paragraphs:
        if lexical_score(query, p.paragraph_title) >= 1.0 and (best is None or (p.grade, p.topic_id) < (best.grade, best.topic_id)):
            best = p
    return Ranked(best, 1.0) if best is not None else None


def halfvec_literal(values: Sequence[float]) -> str:
    """halfvec keeps ~3.3 significant digits, so four are enough; a 3072-d vector shrinks from ~60 KB of text."""
    return "[" + ",".join(f"{v:.4g}" for v in values) + "]"


def rank_topics(
    query: str,
    paragraphs: Sequence[Paragraph],
    distances: Mapping[str, float],
    *,
    limit: int = MAX_MATCHES,
) -> list[Ranked]:
    """Best § first. A lexical hit on the title (up to 1.0) usually outweighs vector similarity (≈ 0.3–0.7);
    vector similarity breaks ties and finds § whose title does not name the query."""
    ranked: list[Ranked] = []
    for p in paragraphs:
        lexical = lexical_score(query, p.paragraph_title)
        distance = distances.get(p.topic_id)
        similarity = max(0.0, 1.0 - distance) if distance is not None else 0.0
        score = lexical + similarity
        if score > 0:
            ranked.append(Ranked(p, round(score, 6)))
    ranked.sort(key=lambda r: (-r.score, r.paragraph.grade, r.paragraph.topic_id))
    return ranked[:limit]
