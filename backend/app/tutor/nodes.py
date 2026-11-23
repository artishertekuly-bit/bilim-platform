"""Tutor түйіндерін LightRAG entity-лерінен құру (personarag §2.1, D7, D86). Таза функциялар.

* Оқуға жарайтын entity түрлері ғана `is_learnable`. Даталар мен ғасыр атаулары ағашқа кірмейді.
* Бір ұғымның жазылу нұсқалары («А. Құнанбайұлы» / «А.Құнанбайұлы», тырнақша, жақша) қалыпқа келтірілген
  атау (`norm_key`) бойынша бір түйінге біріктіріледі. Мағыналық синонимдерді («Керей мен Жәнібек» /
  «Жәнібек хан») біріктіру — LLM ұсынып, офлайн тексерілетін кейінгі жұмыс (`curated`).
* `textbook_order` алғышарты тек LightRAG байланысы бар екі түйін арасында: оқулықта бұрын кездескені —
  кейінгісінің алғышарты. Бір түйінге ең көбі `MAX_PREREQUISITES` (салмағы үлкені).
"""

from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field

LEARNABLE_TYPES = frozenset({
    "concept", "term", "person", "organization", "historical_event", "period", "location", "artifact",
    "definition", "rule", "law", "document", "algorithm", "title", "institution", "program", "material",
})
MAX_PREREQUISITES = 5
MAX_DESCRIPTION_CHARS = 600

_QUOTES_RE = re.compile(r"[«»\"“”„'`’‘]")
_PARENS_RE = re.compile(r"\([^()]*\)")
_DASH_RE = re.compile(r"\s*[–—−-]\s*")
_DOT_RE = re.compile(r"\s*\.\s*")
_SPACE_RE = re.compile(r"\s+")
_EDGE_PUNCT = " .,;:!?/\\|"

_DATE_TOKENS_RE = re.compile(
    r"\b(?:б\.?\s*з\.?\s*б|б\.?\s*з|ж|жж|жыл|жылы|жылғы|жылдар|жылдары|жылдардағы|ғ|ғғ|ғасыр|ғасырда|ғасырдың|"
    r"ғасырлар|ғасырлардағы|мыңжылдық|мыңжылдықта|басы|соңы|ортасы|орта|бірінші|екінші|жартысы)\b",
    re.IGNORECASE,
)
_ROMAN_OR_DIGITS_RE = re.compile(r"\b(?:[IVXLC]+|\d+)\b")


def normalize_name(name: str) -> str:
    """Біріктіру кілті: кіші әріп, тырнақша мен жақшасыз, сызықша мен нүкте біріздендірілген."""
    text = _QUOTES_RE.sub("", name or "")
    text = _PARENS_RE.sub(" ", text)
    text = _DASH_RE.sub("-", text)
    text = _DOT_RE.sub(".", text)
    text = _SPACE_RE.sub(" ", text).strip(_EDGE_PUNCT)
    return text.lower()


def is_date_like(name: str) -> bool:
    """«1465 ж.», «XVIII ғасыр», «б.з.б. III мыңжылдық» — дата, оқушы ағашына кірмейді."""
    text = _PARENS_RE.sub(" ", name or "")
    text = _ROMAN_OR_DIGITS_RE.sub(" ", text)
    text = _DATE_TOKENS_RE.sub(" ", text)
    text = re.sub(r"[\s.,;:–—−\-/]+", "", text)
    return text == ""


@dataclass(frozen=True)
class Entity:
    name: str
    entity_type: str | None
    description: str
    chunk_ids: tuple[str, ...]


@dataclass(frozen=True)
class ChunkPosition:
    chunk_id: str
    book: str
    grade: int
    paragraph_no: str
    topic_id: str
    rank: int  # оқулық реті: сынып → кітап → § → §-тің ішіндегі реті


@dataclass
class NodeDraft:
    norm_key: str
    canonical_name: str
    entity_type: str
    entity_ids: list[str]
    description: str
    is_learnable: bool
    aliases: set[str] = field(default_factory=set)
    book: str | None = None
    grade: int | None = None
    paragraph_no: str | None = None
    topic_id: str | None = None
    order_key: int | None = None


def build_drafts(entities: Iterable[Entity], positions: Mapping[str, ChunkPosition]) -> list[NodeDraft]:
    groups: dict[str, list[Entity]] = defaultdict(list)
    for entity in entities:
        key = normalize_name(entity.name)
        if key:
            groups[key].append(entity)

    drafts: list[NodeDraft] = []
    for key, members in groups.items():
        # Өкіл: чанкі көп, содан кейін атауы қысқа entity.
        rep = sorted(members, key=lambda e: (-len(e.chunk_ids), len(e.name), e.name))[0]
        entity_type = (rep.entity_type or "UNKNOWN").strip()
        chunk_ids = {cid for e in members for cid in e.chunk_ids}
        home = min((positions[cid] for cid in chunk_ids if cid in positions), key=lambda p: p.rank, default=None)
        learnable = (
            any((e.entity_type or "") in LEARNABLE_TYPES for e in members)
            and not is_date_like(rep.name)
            and home is not None
            and len(key) >= 2
        )
        if (rep.entity_type or "") not in LEARNABLE_TYPES:
            learnable_member = next((e for e in members if (e.entity_type or "") in LEARNABLE_TYPES), None)
            if learnable_member is not None:
                entity_type = learnable_member.entity_type or entity_type
        description = next((e.description for e in (rep, *members) if e.description.strip()), "")
        draft = NodeDraft(
            norm_key=key,
            canonical_name=rep.name.strip()[:300],
            entity_type=entity_type,
            entity_ids=sorted({e.name for e in members}),
            description=description.strip()[:MAX_DESCRIPTION_CHARS],
            is_learnable=learnable,
            aliases={e.name.strip().lower() for e in members} | {key},
        )
        if home is not None:
            draft.book, draft.grade = home.book, home.grade
            draft.paragraph_no, draft.topic_id, draft.order_key = home.paragraph_no, home.topic_id, home.rank
        drafts.append(draft)
    drafts.sort(key=lambda d: (d.order_key if d.order_key is not None else 1 << 30, d.norm_key))
    return drafts


def textbook_prerequisites(
    drafts: Sequence[NodeDraft],
    edges: Iterable[tuple[str, str, float]],
    *,
    max_per_node: int = MAX_PREREQUISITES,
) -> list[tuple[str, str]]:
    """(node_key, prerequisite_key) жұптары. Екеуі де learnable және оқулықта орны бар болуы керек."""
    by_entity: dict[str, NodeDraft] = {}
    for draft in drafts:
        if draft.is_learnable and draft.order_key is not None:
            for entity_id in draft.entity_ids:
                by_entity[entity_id] = draft

    best: dict[tuple[str, str], float] = {}
    for src, tgt, weight in edges:
        a, b = by_entity.get(src), by_entity.get(tgt)
        if a is None or b is None or a.norm_key == b.norm_key:
            continue
        assert a.order_key is not None and b.order_key is not None
        if a.order_key == b.order_key:
            continue
        earlier, later = (a, b) if a.order_key < b.order_key else (b, a)
        pair = (later.norm_key, earlier.norm_key)
        best[pair] = max(best.get(pair, 0.0), float(weight or 0.0))

    order = {d.norm_key: d.order_key or 0 for d in drafts}
    per_node: dict[str, list[tuple[float, int, str]]] = defaultdict(list)
    for (node, prereq), weight in best.items():
        per_node[node].append((weight, order[prereq], prereq))

    result: list[tuple[str, str]] = []
    for node, items in per_node.items():
        # Салмағы үлкені, тең болса — оқулықта жақынырағы (кейінірек кездескені).
        items.sort(key=lambda item: (-item[0], -item[1], item[2]))
        result.extend((node, prereq) for _, _, prereq in items[:max_per_node])
    result.sort()
    return result


def summary(drafts: Sequence[NodeDraft], prerequisites: Sequence[tuple[str, str]]) -> dict[str, int]:
    learnable = [d for d in drafts if d.is_learnable]
    merged = sum(1 for d in drafts if len(d.entity_ids) > 1)
    return {
        "nodes": len(drafts),
        "learnable": len(learnable),
        "merged_nodes": merged,
        "prerequisites": len(prerequisites),
        "nodes_with_prerequisites": len({node for node, _ in prerequisites}),
    }
