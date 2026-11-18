"""Генерацияға контекст: § чанктары және олардың комбинациялары (ai_examiner.md §2.1–2.2).

Бір §-тің чанктарынан көп бірегей сұрақ алу үшін чанктар комбинацияланады:
  * дара чанк [Ci] — тест;
  * жұп [Ci + Cj] — сәйкестендіру, реттілік, қате қадам;
  * үштік [Ci + Cj + Ck] — конструктор мен слайдер (теория + формула + мысал).
Комбинацияға тек §-те қатар тұрған немесе ортақ entity-сі бар чанктар кіреді: байланыссыз
чанктардан мағынасыз жұп шықпауы үшін.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from itertools import combinations

COMBO_SIZE: dict[str, int] = {
    "mcq": 1,
    "matching": 2,
    "sequence": 2,
    "error_step": 2,
    "formula_builder": 3,
    "slider": 3,
}

_HEADER = re.compile(r"^\s*\[[^\]]*\]\s*")
_HEADING_MARKS = re.compile(r"^#{1,6}\s*", re.MULTILINE)


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    order: int
    text: str


def clean_chunk_text(content: str) -> str:
    """Чанктың басындағы «[Оқулық | Тарау | Тақырып]» жолы мен markdown белгілерін алып тастайды."""
    text = _HEADER.sub("", content, count=1)
    text = _HEADING_MARKS.sub("", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def reference_text(chunks: Sequence[Chunk]) -> str:
    return "\n\n".join(chunk.text for chunk in sorted(chunks, key=lambda chunk: chunk.order))


def entity_map(links: Sequence[tuple[str, str]], chunk_ids: Sequence[str]) -> dict[str, frozenset[str]]:
    """(entity, chunk_id) жұптарынан чанк → entity жиыны. §-тің жартысынан көп чанкында кездесетін
    жалпы entity (мысалы, «Қазақстан») байланыс деп саналмайды: ол бәрін бәрімен жалғап жібереді."""
    wanted = set(chunk_ids)
    by_entity: dict[str, set[str]] = {}
    for entity, chunk_id in links:
        if chunk_id in wanted:
            by_entity.setdefault(entity, set()).add(chunk_id)
    limit = max(2, len(wanted) // 2)
    result: dict[str, set[str]] = {}
    for entity, members in by_entity.items():
        if 2 <= len(members) <= limit:
            for chunk_id in members:
                result.setdefault(chunk_id, set()).add(entity)
    return {chunk_id: frozenset(entities) for chunk_id, entities in result.items()}


def chunk_combinations(
    chunks: Sequence[Chunk], size: int, entities: Mapping[str, frozenset[str]] | None = None
) -> list[tuple[Chunk, ...]]:
    """Рұқсат етілген комбинациялар, § ретімен. Чанк саны `size`-тан аз болса — бүкіл §."""
    ordered = sorted(chunks, key=lambda chunk: chunk.order)
    if not ordered:
        return []
    if len(ordered) <= size:
        return [tuple(ordered)]
    if size == 1:
        return [(chunk,) for chunk in ordered]

    entities = entities or {}
    position = {chunk.chunk_id: index for index, chunk in enumerate(ordered)}

    def linked(a: Chunk, b: Chunk) -> bool:
        if abs(position[a.chunk_id] - position[b.chunk_id]) == 1:
            return True
        return bool(entities.get(a.chunk_id, frozenset()) & entities.get(b.chunk_id, frozenset()))

    result: list[tuple[Chunk, ...]] = []
    for combo in combinations(ordered, size):
        # Әр элемент кем дегенде біреуімен байланысты, ал бүкіл комбинация бір тізбек құрайды.
        if all(linked(combo[i], combo[i + 1]) or any(linked(combo[i + 1], other) for other in combo[: i + 1])
               for i in range(size - 1)):
            result.append(combo)
    # Алдымен қатар тұрған комбинациялар: олар мәтіннің логикалық ағынын сақтайды.
    result.sort(key=lambda combo: (position[combo[-1].chunk_id] - position[combo[0].chunk_id],
                                   position[combo[0].chunk_id]))
    return result
