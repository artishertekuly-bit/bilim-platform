"""Tutor-дың деректі оқуы: үміткер түйіндер (0-қадам), оқушы күйі, алғышарттар, оқулық чанктары (3-қадам).

LightRAG кітапханасы іске қосылмайды: оның деректері postgres иеленетін corpus көріністері мен
`corpus.match_entities` / `corpus.match_chunks` функциялары арқылы оқылады (D86).
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from .db import vector_literal
from .engine import NodeState

VECTOR_ENTITY_LIMIT = 40
VECTOR_NODE_LIMIT = 6
MAX_CANDIDATES = 8
VECTOR_CHUNK_LIMIT = 6   # кілт сөз бойынша қайта реттелетін векторлық чанктар
NODE_CHUNK_LIMIT = 2
MAX_CHUNKS = 4
MAX_KEYWORDS = 10
MIN_KEYWORD_CHARS = 3


@dataclass(frozen=True)
class NodeInfo:
    node_id: int
    name: str
    entity_type: str
    description: str
    entity_ids: tuple[str, ...]
    grade: int | None
    paragraph_no: str | None
    topic_id: str | None
    order_key: int | None


_NODE_COLUMNS = """
    node_id, canonical_name, entity_type, description, lightrag_entity_ids, grade::int as grade,
    paragraph_no, topic_id, order_key
"""


def _node(row: Any) -> NodeInfo:
    return NodeInfo(
        node_id=int(row["node_id"]),
        name=row["canonical_name"],
        entity_type=row["entity_type"],
        description=row["description"] or "",
        entity_ids=tuple(row["lightrag_entity_ids"] or ()),
        grade=row["grade"],
        paragraph_no=row["paragraph_no"],
        topic_id=row["topic_id"],
        order_key=row["order_key"],
    )


async def nodes_by_id(conn: Any, node_ids: Iterable[int]) -> dict[int, NodeInfo]:
    ids = sorted({int(i) for i in node_ids if i is not None})
    if not ids:
        return {}
    rows = await conn.fetch(
        f"select {_NODE_COLUMNS} from tutor.tutor_nodes where node_id = any($1::bigint[]) and is_learnable", ids
    )
    return {int(r["node_id"]): _node(r) for r in rows}


async def alias_rows(conn: Any) -> list[tuple[str, int]]:
    """Оқуға жарайтын түйіндердің атаулары: процесс жадындағы AliasCache-ке (aliases.py)."""
    rows = await conn.fetch(
        """
        select a.alias, a.node_id
        from tutor.tutor_node_aliases a
        join tutor.tutor_nodes n on n.node_id = a.node_id and n.is_learnable
        """
    )
    return [(r["alias"], int(r["node_id"])) for r in rows]


async def vector_nodes(conn: Any, vector: Sequence[float] | None) -> list[NodeInfo]:
    """0-қадам: хабарлама векторына жақын entity → learnable түйіндер, қашықтығы бойынша."""
    if not vector:
        return []
    matches = await conn.fetch(
        "select entity, distance from corpus.match_entities($1::extensions.halfvec, $2)",
        vector_literal(list(vector)), VECTOR_ENTITY_LIMIT,
    )
    if not matches:
        return []
    distance = {r["entity"]: float(r["distance"]) for r in matches}
    rows = await conn.fetch(
        f"select {_NODE_COLUMNS} from tutor.tutor_nodes where lightrag_entity_ids && $1::text[] and is_learnable",
        list(distance),
    )
    ranked = sorted(
        (_node(r) for r in rows),
        key=lambda n: min(distance.get(e, 9.0) for e in n.entity_ids),
    )
    return ranked[:VECTOR_NODE_LIMIT]


async def prerequisites(conn: Any, node_ids: Iterable[int]) -> dict[int, list[int]]:
    ids = sorted({int(i) for i in node_ids})
    if not ids:
        return {}
    rows = await conn.fetch(
        """
        select p.node_id, p.prerequisite_node_id
        from tutor.tutor_prerequisites p
        join tutor.tutor_nodes n on n.node_id = p.prerequisite_node_id and n.is_learnable
        where p.node_id = any($1::bigint[])
        """,
        ids,
    )
    out: dict[int, list[int]] = {}
    for r in rows:
        out.setdefault(int(r["node_id"]), []).append(int(r["prerequisite_node_id"]))
    return out


async def dependents(conn: Any, node_id: int, limit: int = 8) -> list[int]:
    """Осы түйінді алғышарт ететін түйіндер (`1_hop_forward` үшін), оқулықтағы реті бойынша."""
    rows = await conn.fetch(
        """
        select p.node_id
        from tutor.tutor_prerequisites p
        join tutor.tutor_nodes n on n.node_id = p.node_id and n.is_learnable
        where p.prerequisite_node_id = $1
        order by n.order_key nulls last
        limit $2
        """,
        node_id, limit,
    )
    return [int(r["node_id"]) for r in rows]


def _state(row: Any) -> NodeState:
    return NodeState(
        mastery=float(row["initial_mastery"]),
        bloom_level=row["bloom_level"],
        review_count=int(row["review_count"]),
        fail_streak=int(row["fail_streak"]),
        error_type=row["error_type"],
        last_interaction=row["last_interaction"],
    )


async def states(conn: Any, student_id: str, node_ids: Iterable[int], *, lock: bool = False) -> dict[int, NodeState]:
    ids = sorted({int(i) for i in node_ids if i is not None})
    if not ids:
        return {}
    rows = await conn.fetch(
        "select node_id, initial_mastery, bloom_level, review_count, fail_streak, error_type, last_interaction "
        "from tutor.student_knowledge_tree where student_id = $1::uuid and node_id = any($2::bigint[]) "
        "order by node_id" + (" for update" if lock else ""),
        student_id, ids,
    )
    return {int(r["node_id"]): _state(r) for r in rows}


async def save_state(conn: Any, student_id: str, node_id: int, state: NodeState) -> None:
    await conn.execute(
        """
        insert into tutor.student_knowledge_tree
          (student_id, node_id, initial_mastery, bloom_level, review_count, fail_streak, error_type, last_interaction)
        values ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
        on conflict (student_id, node_id) do update set
          initial_mastery = excluded.initial_mastery, bloom_level = excluded.bloom_level,
          review_count = excluded.review_count, fail_streak = excluded.fail_streak,
          error_type = excluded.error_type, last_interaction = excluded.last_interaction
        """,
        student_id, node_id, state.mastery, state.bloom_level, state.review_count, state.fail_streak,
        state.error_type, state.last_interaction,
    )


async def vector_chunks(conn: Any, vector: Sequence[float] | None) -> list[tuple[str, str]]:
    if not vector:
        return []
    rows = await conn.fetch(
        """
        select m.chunk_id, t.content
        from corpus.match_chunks($1::extensions.halfvec, $2) m
        join corpus.chunk_text t on t.chunk_id = m.chunk_id
        order by m.distance
        """,
        vector_literal(list(vector)), VECTOR_CHUNK_LIMIT,
    )
    return [(r["chunk_id"], r["content"]) for r in rows]


# ------------------------------------------------------------------ кілт сөз (3-қадам, D87)


_RANGE_RE = re.compile(r"\d+\s*[-–—]\s*\d+")
_NUMBER_RE = re.compile(r"\d{2,4}")


def _expand_term(term: str) -> list[str]:
    """Жыл не сан аралығы («1465-1466», «1465–1466 жылдар») мәтінде бөлек жазылады: сандарды бөлек іздейміз.
    Таза аралық («1465—1466») тек сандарға ауысады, сөзі бар аралықтың өзі де қалады."""
    if not _RANGE_RE.search(term):
        return [term]
    numbers = [n for span in _RANGE_RE.findall(term) for n in _NUMBER_RE.findall(span)]
    keep = [term] if any(ch.isalpha() for ch in term) else []
    return keep + numbers


def keyword_terms(hl_keywords: Sequence[str], ll_keywords: Sequence[str]) -> list[tuple[str, int]]:
    """1-қадамның hl/ll кілт сөздері (personarag §7) → (кіші әріппен, салмақ). Көп сөзді мен санды — 2."""
    out: dict[str, int] = {}
    for raw in [*ll_keywords, *hl_keywords]:
        for term in _expand_term(" ".join((raw or "").lower().split())):
            if len(term) < MIN_KEYWORD_CHARS and not term.isdigit() or term in out:
                continue
            out[term] = 2 if (" " in term or any(ch.isdigit() for ch in term)) else 1
            if len(out) >= MAX_KEYWORDS:
                return list(out.items())
    return list(out.items())


def keyword_score(content: str, terms: Sequence[tuple[str, int]]) -> int:
    """Мәтінде кездескен кілт сөздің салмағы; чанктың тақырып жолында («[Оқулық: … | Тақырып: …]») да болса —
    тағы бір рет: бөлімнің өз аты кілт сөзді атаса, чанк сол тақырып туралы. node_chunks SQL-і де дәл осылай санайды."""
    text = " ".join((content or "").lower().split())
    head = text.split("]", 1)[0] if text.startswith("[") else ""
    return sum(weight * ((term in text) + (term in head)) for term, weight in terms)


async def node_chunks(
    conn: Any,
    entity_ids: Sequence[str],
    terms: Sequence[tuple[str, int]] = (),
    *,
    extra_entity_ids: Sequence[str] = (),
) -> list[tuple[str, str, int]]:
    """Түйін entity-лері кездесетін чанктар: кілт сөзі көп сәйкескені алдымен, тең болса — негізгі түйіндікі
    (фокус / аталық / көпір), содан кейін оқулық реті бойынша.

    `extra_entity_ids` — мәтінде аты аталған ұғымдар мен алдыңғы фокус (D87): тег моделі фокус етіп таңдаған
    оқиға түйінінің чанкі аз не бөтен тарауда болса да, дұрыс чанк кілт сөз арқылы табылады.
    Кілт сөз сүзгі емес, басымдық: ұпайы 0 чанк та қайтады, бірақ compose_chunks оны векторлық чанктардан кейін қояды.
    """
    primary = list(dict.fromkeys(entity_ids))
    pool = list(dict.fromkeys([*primary, *extra_entity_ids]))
    if not pool:
        return []
    # materialized: мәтін бір рет қалыпқа келтіріледі, әр кілт сөз үшін қайта есептелмейді (86 чанк: 186 → 26 мс).
    rows = await conn.fetch(
        """
        with c as materialized (
          select t.chunk_id, t.content, t.topic_id, t.order_in_paragraph, l.is_primary,
                 regexp_replace(lower(t.content), '\\s+', ' ', 'g') as body
          from (select l.chunk_id, bool_or(l.entity = any($5::text[])) as is_primary
                from corpus.entity_chunk_links l where l.entity = any($1::text[]) group by l.chunk_id) l
          join corpus.chunk_text t on t.chunk_id = l.chunk_id
        )
        select c.chunk_id, c.content, s.score
        from c
        cross join lateral (
          select coalesce(sum(k.weight * ((strpos(c.body, k.term) > 0)::int
                 + (left(c.body, 1) = '[' and strpos(split_part(c.body, ']', 1), k.term) > 0)::int)), 0)::int as score
          from unnest($2::text[], $3::int[]) as k(term, weight)
        ) s
        order by s.score desc, c.is_primary desc, c.topic_id, c.order_in_paragraph
        limit $4
        """,
        pool, [t for t, _ in terms], [w for _, w in terms], NODE_CHUNK_LIMIT, primary,
    )
    return [(r["chunk_id"], r["content"], int(r["score"] or 0)) for r in rows]


def compose_chunks(
    node_rows: Sequence[tuple[str, str, int]],
    vector_rows: Sequence[tuple[str, str]],
    terms: Sequence[tuple[str, int]],
    *,
    limit: int = MAX_CHUNKS,
) -> list[str]:
    """Жауап контексі (≤ limit). Кілт сөз сәйкескен түйін чанктары бірінші; ондай чанк болмаса — таза
    векторлық реттілік, түйін чанктары тек бос орынды толтырады. Векторлық чанктар да кілт сөзбен қайта реттеледі."""
    ranked_vector = sorted(vector_rows, key=lambda row: -keyword_score(row[1], terms))  # тұрақты сұрыптау
    boosted = [(cid, content) for cid, content, score in node_rows if score > 0]
    rest = [(cid, content) for cid, content, score in node_rows if score <= 0]
    groups = [boosted, ranked_vector, rest] if boosted else [ranked_vector, rest]
    seen: set[str] = set()
    out: list[str] = []
    for group in groups:
        for chunk_id, content in group:
            if chunk_id in seen or not (content or "").strip():
                continue
            seen.add(chunk_id)
            out.append(content)
            if len(out) >= limit:
                return out
    return out


async def digest(conn: Any, student_id: str, now: datetime, limit: int = 8) -> str:
    """§6.1 жалпы дайджест (META_REFLECTION үшін): MASTERED / DECAYED / DEVELOPING / EXPOSED бұтақтары.

    Қатесі бар (GAP / MISC, F_streak ≥ 1) түйін бөлек «Қиындық туғызған» тобына түседі: ол оқушыға жаңа танысқан
    тақырып болып көрінбеуі керек (D87). Бос топ мүлде жазылмайды.
    """
    from .engine import DECAYED_EFF_MAX, DECAYED_SAVED_MIN, EXPOSED_MAX, MASTERED_MIN, effective_mastery

    rows = await conn.fetch(
        """
        select n.canonical_name, k.initial_mastery, k.bloom_level, k.review_count, k.fail_streak, k.error_type,
               k.last_interaction
        from tutor.student_knowledge_tree k
        join tutor.tutor_nodes n on n.node_id = k.node_id
        where k.student_id = $1::uuid
        order by k.last_interaction desc
        limit 300
        """,
        student_id,
    )
    groups: dict[str, list[str]] = {"MASTERED": [], "DECAYED": [], "DEVELOPING": [], "STRUGGLING": [], "EXPOSED": []}
    for r in rows:
        st = _state(r)
        m = effective_mastery(st, now)
        if st.mastery >= DECAYED_SAVED_MIN and m < DECAYED_EFF_MAX:
            key = "DECAYED"
        elif st.error_type in ("GAP", "MISC") and st.fail_streak > 0:
            key = "STRUGGLING"
        elif m >= MASTERED_MIN:
            key = "MASTERED"
        elif m <= EXPOSED_MAX:
            key = "EXPOSED"
        else:
            key = "DEVELOPING"
        if len(groups[key]) < limit:
            groups[key].append(r["canonical_name"])
    labels = {
        "MASTERED": "Меңгерілген",
        "DECAYED": "Ұмытыла бастаған",
        "DEVELOPING": "Бекіп келе жатқан",
        "STRUGGLING": "Қиындық туғызған",
        "EXPOSED": "Жаңа танысқан",
    }
    return "\n".join(f"{labels[k]}: {', '.join(v)}" for k, v in groups.items() if v)
