"""Tutor-дың деректі оқуы: үміткер түйіндер (0-қадам), оқушы күйі, алғышарттар, оқулық чанктары (3-қадам).

LightRAG кітапханасы іске қосылмайды: оның деректері postgres иеленетін corpus көріністері мен
`corpus.match_entities` / `corpus.match_chunks` функциялары арқылы оқылады (D86). Бір қадамның оқулары екі
біріккен сұрауда (queries.CANDIDATES, queries.GRAPH) жүреді (D88).
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from . import queries as Q
from .db import vector_literal
from .engine import NodeState

VECTOR_ENTITY_LIMIT = 40
VECTOR_NODE_LIMIT = 6
MAX_CANDIDATES = 8
VECTOR_CHUNK_LIMIT = 4   # кілт сөз бойынша қайта реттелетін векторлық чанктар
NODE_CHUNK_LIMIT = 2
MAX_CHUNKS = 2           # жауапқа 1–2 дәл чанк (D88)
CHUNK_EXCERPT_CHARS = 900
CHUNK_HEAD_CHARS = 160
DEPENDENTS_LIMIT = 8
MAX_KEYWORDS = 10
MIN_KEYWORD_CHARS = 3
ALIAS_PAGE_ROWS = 2000   # statement_timeout (15 с) баяу желіде де бір бетке жетеді


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


def _json(value: Any) -> Any:
    return json.loads(value) if isinstance(value, str) else (value if value is not None else [])


def node_from(row: Any) -> NodeInfo:
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


def _time(value: Any) -> datetime:
    return datetime.fromisoformat(value) if isinstance(value, str) else value


def state_from(row: Any) -> NodeState:
    return NodeState(
        mastery=float(row["initial_mastery"]),
        bloom_level=row["bloom_level"],
        review_count=int(row["review_count"]),
        fail_streak=int(row["fail_streak"]),
        error_type=row["error_type"],
        last_interaction=_time(row["last_interaction"]),
    )


# ------------------------------------------------------------------ атаулар (aliases.py кэші)


async def alias_rows(conn: Any, *, page_rows: int = ALIAS_PAGE_ROWS) -> list[tuple[str, int]]:
    """Оқуға жарайтын түйіндердің атаулары, беттеп (keyset): бір үлкен сұрау баяу желіде statement_timeout-қа ұшырайды."""
    out: list[tuple[str, int]] = []
    last: tuple[int, str] = (-1, "")
    while True:
        rows = await conn.fetch(Q.ALIAS_PAGE, last[0], last[1], page_rows)
        out.extend((r["alias"], int(r["node_id"])) for r in rows)
        if len(rows) < page_rows:
            return out
        last = (int(rows[-1]["node_id"]), rows[-1]["alias"])


# ------------------------------------------------------------------ 0-қадам: үміткерлер (бір сұрау)


@dataclass
class CandidateData:
    ranked: dict[int, list[int]] = field(default_factory=dict)  # вектордың реті (1-ден) → node_id-лер
    nodes: dict[int, NodeInfo] = field(default_factory=dict)
    prev_prereqs: list[int] = field(default_factory=list)
    chunks: list[tuple[str, str]] = field(default_factory=list)


async def candidates(
    conn: Any,
    vectors: Sequence[Sequence[float]],
    *,
    chunk_vector: int,
    explicit_ids: Iterable[int],
    prev_focus: int | None,
) -> CandidateData:
    """Векторларға жақын түйіндер (әр векторға ≤ 6), аталған id-лердің түйіндері, алдыңғы фокустың алғышарттары
    және `chunk_vector`-ші (1-ден) вектор бойынша чанктар — бір барып-қайтуда. Векторлар бір-ақ рет жіберіледі."""
    ids = sorted({int(i) for i in explicit_ids if i is not None})
    if not vectors and not ids and prev_focus is None:
        return CandidateData()
    row = await conn.fetchrow(
        Q.CANDIDATES,
        [vector_literal(list(v)) for v in vectors], chunk_vector, ids, prev_focus, VECTOR_CHUNK_LIMIT,
        VECTOR_NODE_LIMIT,
    )
    data = CandidateData()
    for item in _json(row["ranked"]):
        data.ranked.setdefault(int(item["ord"]), []).append(int(item["node_id"]))
    data.nodes = {int(n["node_id"]): node_from(n) for n in _json(row["nodes"])}
    data.prev_prereqs = [int(i) for i in _json(row["prev_prereqs"])]
    data.chunks = [(c["chunk_id"], c["content"]) for c in _json(row["chunks"])]
    return data


# ------------------------------------------------------------------ 2-қадам: граф және күй (бір сұрау)


@dataclass
class GraphData:
    prereqs: dict[int, list[int]] = field(default_factory=dict)
    deps: dict[int, list[int]] = field(default_factory=dict)
    nodes: dict[int, NodeInfo] = field(default_factory=dict)   # үміткерлерден тыс көршілер
    states: dict[int, NodeState] = field(default_factory=dict)
    errors: list[tuple[str, str]] = field(default_factory=list)  # соңғы қате түсініктер (ат, GAP/MISC)


async def graph(conn: Any, student_id: str, node_ids: Iterable[int]) -> GraphData:
    """Үміткерлердің алғышарттары мен тәуелділері (`1_hop_forward`, ≤ 8), көршілердің түйіні және оқушы күйі.
    Фокус әлі белгісіз (тег шақыруымен қатар жүреді), сондықтан барлық үміткер үшін алынады."""
    ids = sorted({int(i) for i in node_ids if i is not None})
    if not ids:
        return GraphData()
    row = await conn.fetchrow(Q.GRAPH, student_id, ids, DEPENDENTS_LIMIT)
    data = GraphData()
    for item in _json(row["prereqs"]):
        data.prereqs.setdefault(int(item["node_id"]), []).append(int(item["prereq"]))
    for item in _json(row["deps"]):
        data.deps.setdefault(int(item["of"]), []).append(int(item["node_id"]))
    data.nodes = {int(n["node_id"]): node_from(n) for n in _json(row["nodes"])}
    data.states = {int(s["node_id"]): state_from(s) for s in _json(row["states"])}
    data.errors = [(e["name"], e["error"]) for e in _json(row["errors"])]
    return data


# ------------------------------------------------------------------ ағаш: баяу жол (compare-and-swap сәтсіз болса)


async def states(conn: Any, student_id: str, node_ids: Iterable[int], *, lock: bool = False) -> dict[int, NodeState]:
    ids = sorted({int(i) for i in node_ids if i is not None})
    if not ids:
        return {}
    rows = await conn.fetch(
        "/* tutor:states */ select node_id, initial_mastery, bloom_level, review_count, fail_streak, error_type, "
        "last_interaction from tutor.student_knowledge_tree where student_id = $1::uuid and node_id = any($2::bigint[]) "
        "order by node_id" + (" for update" if lock else ""),
        student_id, ids,
    )
    return {int(r["node_id"]): state_from(r) for r in rows}


async def save_state(conn: Any, student_id: str, node_id: int, state: NodeState) -> None:
    await conn.execute(
        """/* tutor:save_state */
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
        """/* tutor:node_chunks */
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


_SENTENCE_RE = re.compile(r"(?<=[.!?…])\s+")


def excerpt(content: str, terms: Sequence[tuple[str, int]], limit: int = CHUNK_EXCERPT_CHARS) -> str:
    """Ұзын чанктан кілт сөзі бар сөйлемдер мен олардың көршілері (D88: 1–2 дәл үзінді, артық мәтінсіз).
    Тақырып жолы («[Оқулық: … ]») қысқартылып сақталады; кілт сөз түспесе — басынан."""
    text = " ".join((content or "").split())
    if len(text) <= limit:
        return text
    head, body = "", text
    if text.startswith("[") and "]" in text[:600]:
        end = text.index("]") + 1
        head, body = text[:end], text[end:].strip()
        if len(head) > CHUNK_HEAD_CHARS:
            head = head[: CHUNK_HEAD_CHARS - 2] + "…]"
    budget = max(200, limit - len(head) - 1)
    sentences = _SENTENCE_RE.split(body)
    hits = {i for i, s in enumerate(sentences) if any(term in s.lower() for term, _ in terms)}
    if not hits:
        return (head + " " + body[:budget]).strip()
    keep: list[int] = []
    for i in sorted(hits):
        for j in (i - 1, i, i + 1):
            if 0 <= j < len(sentences) and j not in keep:
                keep.append(j)
    picked: list[int] = []
    used = 0
    for j in sorted(keep, key=lambda k: (k not in hits, k)):  # алдымен кілт сөзді сөйлемдер
        if used + len(sentences[j]) + 1 > budget:
            continue
        picked.append(j)
        used += len(sentences[j]) + 1
    ordered = " ".join(sentences[j] for j in sorted(picked))
    return (head + " " + (ordered or body[:budget])).strip()


def compose_chunks(
    node_rows: Sequence[tuple[str, str, int]],
    vector_rows: Sequence[tuple[str, str]],
    terms: Sequence[tuple[str, int]],
    *,
    limit: int = MAX_CHUNKS,
    max_chars: int | None = CHUNK_EXCERPT_CHARS,
) -> list[str]:
    """Жауап контексі (≤ limit). Кілт сөз сәйкескен түйін чанктары бірінші; ондай чанк болмаса — таза
    векторлық реттілік, түйін чанктары тек бос орынды толтырады. Векторлық чанктар да кілт сөзбен қайта реттеледі.
    `max_chars` берілсе, әр чанктан тек кілт сөзі бар бөлігі алынады."""
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
            out.append(excerpt(content, terms, max_chars) if max_chars else content)
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
        """/* tutor:digest */
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
        st = state_from(r)
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
