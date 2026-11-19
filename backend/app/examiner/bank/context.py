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

# Оқулықтың әдістемелік бөліктері (D77): тапсырма, талқылау сұрақтары, баяндама мен слайд талаптары,
# әдебиет тізімі. Олар §-тің мазмұны емес, бірақ модель олардан да сұрақ құрып жібереді.
_TASK_HEADING = re.compile(
    r"^(қосымша тапсырма|үй тапсырмасы|тапсырма|сұрақтар|жұп болып|жұппен жұмыс|топпен жұмыс|топтық жұмыс"
    r"|дәптермен жұмыс|ойлан|бекіт|кері байланыс|пайдаланылған әдебиет|әдебиеттер)",
    re.IGNORECASE,
)
_TASK_PHRASE = re.compile(r"қойылатын талаптар", re.IGNORECASE)
# 2-жақ көпше бұйрық рай: «дайындаңдар», «жазыңдар», «беріңдер». Алдында кемінде 3 әріп:
# «аңдар», «шыңдар», «таңдар» сияқты зат есімдер ілінбеуі үшін. Ашық райдың осы шағы
# («білесіңдер», «ойлайсыңдар») бұйрық емес: кіріспе мәтін оқушыға солай жүгінеді.
_IMPERATIVE = re.compile(r"(?<!\w)\w{3,}(?<!с[ыі])(ңдар|ңдер|ңыздар|ңіздер)(?!\w)", re.IGNORECASE)
# Тапсырма жолы қысқа; бұйрық сөзі бар ұзын абзац — мазмұн (мысалы, тарихи тұлғаның сөзі).
MAX_TASK_LINE = 300
_LIST_ITEM = re.compile(r"^(\d{1,2}[.)]|[•\-–*])\s*")
_BIBLIOGRAPHY = re.compile(r"[–-]\s*(Алматы|Астана|Нұр-Сұлтан|Москва|М\.|Л\.|СПб\.?)\s*[,:]?\s*\d{4}")
MIN_CONTENT_CHARS = 80


def _plain(line: str) -> str:
    return re.sub(r"[*_`]+", "", line).strip()


def strip_assignments(text: str) -> str:
    """Тапсырма блоктарын, талқылау сұрақтарын және әдебиет тізімін алып тастайды. Тапсырма тақырыбынан
    кейінгі тізім, сұрақ пен бұйрық жолдары да блоктың бөлігі; мазмұнды жол блокты жабады."""
    kept: list[str] = []
    in_task = False
    for line in text.split("\n"):
        plain = _plain(line)
        if not plain:
            kept.append(line)
            continue
        # Тақырып қысқа жол: «Бекітілген шарт бойынша…» сияқты мазмұн жолы тақырып болып саналмайды.
        heading = (len(plain) <= 60 and bool(_TASK_HEADING.match(plain))) or bool(_TASK_PHRASE.search(plain))
        imperative = len(plain) <= MAX_TASK_LINE and bool(_IMPERATIVE.search(plain))
        question = plain.endswith("?")
        listed = bool(_LIST_ITEM.match(plain))
        if heading or imperative or _BIBLIOGRAPHY.search(plain):
            in_task = in_task or heading or imperative
            continue
        if in_task and (listed or question or len(plain) < 60):
            continue
        if question and len(plain) < 200:
            continue  # жеке тұрған талқылау сұрағы
        in_task = False
        kept.append(line)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(kept)).strip()


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    order: int
    text: str


def clean_chunk_text(content: str) -> str:
    """Чанктың басындағы «[Оқулық | Тарау | Тақырып]» жолын, markdown белгілерін және тапсырма
    блоктарын (strip_assignments) алып тастайды."""
    text = _HEADER.sub("", content, count=1)
    text = _HEADING_MARKS.sub("", text)
    return strip_assignments(re.sub(r"\n{3,}", "\n\n", text).strip())


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


def distant_partners(
    chunks: Sequence[Chunk], anchor_id: str, entities: Mapping[str, frozenset[str]] | None = None
) -> list[Chunk]:
    """X3 тестке нысананың чанкымен бірге берілетін екінші чанктың кандидаттары, жақсысы бірінші (D80).

    Қатар тұрған чанктар LightRAG-те қабаттасады: көршінің басы нысана чанкының соңын қайталайды, сонда
    «екі үзінді» іс жүзінде бір абзац болып шығады. Сондықтан алдымен көрші емес чанктар (ортақ entity-сі
    көбі, сосын жақыны), тек олар жоқ болса — көршілер.
    """
    ordered = sorted(chunks, key=lambda chunk: chunk.order)
    position = {chunk.chunk_id: index for index, chunk in enumerate(ordered)}
    if anchor_id not in position:
        return []
    entities = entities or {}
    own = entities.get(anchor_id, frozenset())

    def rank(chunk: Chunk) -> tuple[int, int, int]:
        distance = abs(position[chunk.chunk_id] - position[anchor_id])
        return (distance == 1, -len(own & entities.get(chunk.chunk_id, frozenset())), distance)

    return sorted((chunk for chunk in ordered if chunk.chunk_id != anchor_id), key=rank)
