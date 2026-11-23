"""Tutor-дың деректі оқуы: үміткер түйіндер (0-қадам), оқушы күйі, алғышарттар, оқулық чанктары (3-қадам).

LightRAG кітапханасы іске қосылмайды: оның деректері postgres иеленетін corpus көріністері мен
`corpus.match_entities` / `corpus.match_chunks` функциялары арқылы оқылады (D86).
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from .db import vector_literal
from .engine import NodeState

VECTOR_ENTITY_LIMIT = 40
VECTOR_NODE_LIMIT = 6
MAX_CANDIDATES = 8
VECTOR_CHUNK_LIMIT = 3
NODE_CHUNK_LIMIT = 2
MAX_CHUNKS = 4


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


async def node_chunks(conn: Any, entity_ids: Sequence[str]) -> list[tuple[str, str]]:
    """Түйін entity-лері алғаш кездесетін § чанктары (оқулық реті бойынша)."""
    if not entity_ids:
        return []
    rows = await conn.fetch(
        """
        select distinct on (t.chunk_id) t.chunk_id, t.content, t.topic_id, t.order_in_paragraph
        from corpus.entity_chunk_links l
        join corpus.chunk_text t on t.chunk_id = l.chunk_id
        where l.entity = any($1::text[])
        """,
        list(entity_ids),
    )
    ordered = sorted(rows, key=lambda r: (r["topic_id"] or "", r["order_in_paragraph"] or 0))
    return [(r["chunk_id"], r["content"]) for r in ordered[:NODE_CHUNK_LIMIT]]


def merge_chunks(*groups: Sequence[tuple[str, str]], limit: int = MAX_CHUNKS) -> list[str]:
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
    """§6.1 жалпы дайджест: MASTERED / DECAYED / EXPOSED бұтақтары (META_REFLECTION үшін)."""
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
    groups: dict[str, list[str]] = {"MASTERED": [], "DECAYED": [], "DEVELOPING": [], "EXPOSED": []}
    for r in rows:
        st = _state(r)
        m = effective_mastery(st, now)
        if st.mastery >= DECAYED_SAVED_MIN and m < DECAYED_EFF_MAX:
            key = "DECAYED"
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
        "EXPOSED": "Жаңа танысқан",
    }
    return "\n".join(f"{labels[k]}: {', '.join(v)}" for k, v in groups.items() if v)
