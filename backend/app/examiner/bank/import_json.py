"""Ready JSON question bank importer (D95, Phase 1): level-1 MCQ into examiner.questions, in batches.

    python -m app.examiner.bank.import_json --input history=../data/question_bank/kz_history_full.json [--write]

The file root is a list of items: `question`, `options` {A..D}, `correct_answer` | `answer`, `fact_key`, `era`,
`subtopic`, `period_label` | `period`, `year_sort`, `explanation`. Other keys are ignored.

Database cost is fixed, not per item (the pooler is ~0.5 s away): per subject one query loads the existing
fact keys and generated-question vectors, one loads the § centroids (only when linking topics), and each batch
is one INSERT … ON CONFLICT DO NOTHING that also writes question_state. Per batch the gateway makes at most two
embedding calls: `questions` (text-embedding-3-small, stored, near-duplicate check) and `corpus`
(text-embedding-3-large, nearest § only).

Every question goes in as `active` (D96). One linked to a § also serves § sessions (they select by topic_id); one
without a § is served by subject queries (`session.retrieval`): § sessions and stock counts never match a NULL
topic_id, and the audit exempts imported rows from the textbook-quote checks.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
from collections import Counter
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from .formats import (
    STEM_LIMIT,
    MCQGen,
    _duplicates,
    _length_problems,
    _named_in_stem_problem,
    _option_cue_problems,
    _partial_answer_problem,
    _stem_echo_problem,
    _text_reference_problem,
)

try:  # 9k × 9k cosine is only practical vectorised; the pure-Python path serves small inputs and tests.
    import numpy as _np
except ImportError:  # pragma: no cover
    _np = None

OPTION_KEYS = ("A", "B", "C", "D")
OPTION_IDS = ("a", "b", "c", "d")
DUPLICATE_THRESHOLD = 0.92
TOPIC_THRESHOLD = 0.5
QUESTIONS_KEY = "questions"
CORPUS_KEY = "corpus"
GENERATOR_MODEL = "import:json"
PROMPT_VERSION = "import-json-2026-11-24"
T6_MODES = ("strict", "report", "off")


# ---------------------------------------------------------------- items


@dataclass(frozen=True)
class ImportItem:
    fact_key: str
    stem: str
    options: tuple[str, ...]
    correct_index: int
    era: str
    subtopic: str
    period_label: str
    year_sort: int
    explanation: str

    @property
    def correct_text(self) -> str:
        return self.options[self.correct_index]

    def embed_text(self) -> str:
        return f"{self.era} | {self.subtopic} | {self.period_label} | {self.stem} | {self.correct_text}"


def _text(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) else None


def parse_item(raw: Any) -> ImportItem | None:
    """Structure only. None — the item cannot become an MCQ."""
    if not isinstance(raw, Mapping):
        return None
    options = raw.get("options")
    if not isinstance(options, Mapping) or set(options) != set(OPTION_KEYS):
        return None
    texts = tuple(_text(options[key]) for key in OPTION_KEYS)
    if not all(texts):
        return None
    answer = _text(raw.get("correct_answer", raw.get("answer")))
    if answer is None:
        return None
    if answer.upper() in OPTION_KEYS:
        correct = OPTION_KEYS.index(answer.upper())
    elif answer in texts:
        correct = texts.index(answer)
    else:
        return None
    year = raw.get("year_sort")
    if isinstance(year, bool) or not isinstance(year, int):
        return None
    fields = {name: _text(raw.get(name)) for name in ("fact_key", "question", "era", "subtopic", "explanation")}
    fields["period_label"] = _text(raw.get("period_label", raw.get("period")))
    if any(value is None for value in fields.values()) or not fields["fact_key"] or not fields["question"]:
        return None
    return ImportItem(
        fact_key=fields["fact_key"], stem=fields["question"], options=texts, correct_index=correct,
        era=fields["era"], subtopic=fields["subtopic"], period_label=fields["period_label"], year_sort=year,
        explanation=fields["explanation"],
    )


def t6_problems(item: ImportItem) -> list[str]:
    """The code-only MCQ checks of MCQGen.problems (Т6) that do not need a generator's evidence fields."""
    options = list(item.options)
    index = item.correct_index
    problems = []
    reference = _text_reference_problem(item.stem)
    if reference:
        problems.append(reference)
    if len(item.stem) > STEM_LIMIT:
        problems.append(f"Т6: stem {STEM_LIMIT} таңбадан ұзын")
    problems += _length_problems(options, MCQGen.OPTION_LIMIT, "нұсқа")
    problems += _duplicates(options, "нұсқа")
    problems += _option_cue_problems(options, index)
    for problem in (_stem_echo_problem(item.stem, options, index), _partial_answer_problem(options, index),
                    _named_in_stem_problem(item.stem, options, index)):
        if problem:
            problems.append(problem)
    return problems


def to_row(item: ImportItem, *, topic_id: str | None, embedding: Sequence[float] | None) -> dict[str, Any]:
    correct_id = OPTION_IDS[item.correct_index]
    return {
        "topic_id": topic_id,
        "question_content": {"stem": item.stem,
                             "options": [{"id": i, "text": t} for i, t in zip(OPTION_IDS, item.options)]},
        "ecd_skill": item.subtopic or item.era or "fact_recall",
        "ecd_evidence": {"code_check_target": {"correct_option_id": correct_id},
                         "evidence": item.explanation, "support_quote": ""},
        "reference_context": {"text": item.explanation},
        "embedding": None if embedding is None else _vector_literal(embedding),
        "era": item.era, "subtopic": item.subtopic, "year_sort": item.year_sort,
        "period_label": item.period_label, "fact_key": item.fact_key, "explanation": item.explanation,
        "status": "active",  # D96: unlinked rows are served by subject queries
    }


def _vector_literal(values: Sequence[float]) -> str:
    return "[" + ",".join(f"{float(v):.6g}" for v in values) + "]"


def _parse_vector(text: str) -> list[float]:
    return [float(part) for part in text.strip("[]").split(",") if part]


# ---------------------------------------------------------------- vectors


class VectorIndex:
    """Unit vectors with max-cosine lookup (numpy when present)."""

    def __init__(self, vectors: Sequence[Sequence[float]] = (), labels: Sequence[str] | None = None) -> None:
        self.labels = list(labels) if labels is not None else []
        self._rows: Any = None
        self._dim = 0
        self.add(vectors)

    def __len__(self) -> int:
        return 0 if self._rows is None else len(self._rows)

    @staticmethod
    def _unit(vectors: Sequence[Sequence[float]]) -> Any:
        if _np is not None:
            m = _np.asarray(vectors, dtype=_np.float32)
            norms = _np.linalg.norm(m, axis=1, keepdims=True)
            return m / _np.where(norms == 0, 1, norms)
        out = []
        for v in vectors:
            n = math.sqrt(sum(x * x for x in v)) or 1.0
            out.append([x / n for x in v])
        return out

    def add(self, vectors: Sequence[Sequence[float]]) -> None:
        if not len(vectors):
            return
        unit = self._unit(vectors)
        if self._rows is None:
            self._rows = unit
        elif _np is not None:
            self._rows = _np.vstack([self._rows, unit])
        else:
            self._rows = self._rows + unit

    def best(self, queries: Sequence[Sequence[float]]) -> list[tuple[int, float]]:
        """(row index, cosine) of the nearest row per query; (-1, 0.0) when empty."""
        if not len(queries):
            return []
        if self._rows is None:
            return [(-1, 0.0)] * len(queries)
        q = self._unit(queries)
        if _np is not None:
            sims = q @ self._rows.T
            idx = sims.argmax(axis=1)
            return [(int(i), float(sims[r, i])) for r, i in enumerate(idx)]
        result = []
        for qv in q:
            scores = [sum(a * b for a, b in zip(qv, row)) for row in self._rows]
            i = max(range(len(scores)), key=scores.__getitem__)
            result.append((i, scores[i]))
        return result


# ---------------------------------------------------------------- ports


@dataclass
class SubjectState:
    subject_id: str
    fact_keys: set[str]
    vectors: VectorIndex
    centroids: VectorIndex | None = None


class ImportRepo(Protocol):
    async def load_subject(self, slug: str) -> SubjectState: ...
    async def topic_centroids(self, subject_id: str) -> VectorIndex: ...
    async def insert_batch(self, state: SubjectState, slug: str, rows: Sequence[Mapping[str, Any]], *,
                           x_tier: str, embedding_model: str | None) -> int: ...


class Embedder(Protocol):
    async def embed(self, texts: Sequence[str], model_key: str) -> list[list[float]]: ...
    def model_name(self, model_key: str) -> str: ...
    def cost(self, chars: int, model_key: str) -> float: ...


class PgImportRepo:
    """One query per method: the importer's DB round trips are countable."""

    def __init__(self, pool: Any) -> None:
        self._pool = pool

    async def load_subject(self, slug: str) -> SubjectState:
        rows = await self._pool.fetch(
            """
            select s.id::text as subject_id, q.fact_key, q.embedding
            from corpus.subjects s
            left join lateral (
              select fact_key,
                     case when fact_key is null then content_embedding::text end as embedding
              from examiner.questions
              where subject_id = s.id and (fact_key is not null or content_embedding is not null)
            ) q on true
            where s.slug = $1
            """,
            slug,
        )
        if not rows:
            raise LookupError(f"corpus.subjects has no slug '{slug}'")
        keys = {r["fact_key"] for r in rows if r["fact_key"]}
        vectors = [_parse_vector(r["embedding"]) for r in rows if r["embedding"]]
        return SubjectState(rows[0]["subject_id"], keys, VectorIndex(vectors))

    async def topic_centroids(self, subject_id: str) -> VectorIndex:
        rows = await self._pool.fetch(
            "select topic_id, centroid::text as centroid from corpus.topic_centroids($1::uuid)", subject_id
        )
        return VectorIndex([_parse_vector(r["centroid"]) for r in rows], [r["topic_id"] for r in rows])

    async def insert_batch(self, state: SubjectState, slug: str, rows: Sequence[Mapping[str, Any]], *,
                           x_tier: str, embedding_model: str | None) -> int:
        def col(name: str, as_json: bool = False) -> list[Any]:
            return [json.dumps(r[name], ensure_ascii=False) if as_json else r[name] for r in rows]

        inserted = await self._pool.fetch(
            """
            with src as (
              select * from unnest(
                $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[],
                $10::text[], $11::text[], $12::bigint[], $13::text[], $14::text[], $15::text[], $16::text[]
              ) as r(topic_id, question_content, ecd_skill, ecd_evidence, reference_context, embedding,
                     era, subtopic, year_sort, period_label, fact_key, explanation, status)
            ), ins as (
              insert into examiner.questions
                (origin, subject_id, subject, topic_id, level, format, question_content, ecd_skill, ecd_evidence,
                 reference_context, generator_model, prompt_version, content_embedding, content_embedding_model,
                 era, subtopic, year_sort, period_label, fact_key, explanation)
              select 'imported', $1::uuid, $2, r.topic_id, 1::smallint, 'mcq', r.question_content::jsonb, r.ecd_skill,
                     r.ecd_evidence::jsonb, r.reference_context::jsonb, $17, $18,
                     r.embedding::extensions.vector, case when r.embedding is not null then $19 end,
                     r.era, r.subtopic, r.year_sort, r.period_label, r.fact_key, r.explanation
              from src r
              on conflict (subject, fact_key) where fact_key is not null do nothing
              returning question_id, fact_key
            )
            insert into examiner.question_state (question_id, x_tier, status, change_reason)
            select ins.question_id, $3::text, src.status, 'import'
            from ins join src on src.fact_key = ins.fact_key
            returning question_id
            """,
            state.subject_id, slug, x_tier,
            col("topic_id"), col("question_content", True), col("ecd_skill"), col("ecd_evidence", True),
            col("reference_context", True), col("embedding"), col("era"), col("subtopic"), col("year_sort"),
            col("period_label"), col("fact_key"), col("explanation"), col("status"),
            GENERATOR_MODEL, PROMPT_VERSION, embedding_model,
        )
        return len(inserted)


class GatewayEmbedder:
    def __init__(self, gateway: Any) -> None:
        self._gateway = gateway

    async def embed(self, texts: Sequence[str], model_key: str) -> list[list[float]]:
        from ...llm_gateway import Priority

        return await self._gateway.embed(list(texts), model_key=model_key, priority=Priority.BACKGROUND)

    def _model(self, model_key: str) -> Any:
        config = self._gateway.config
        return config.models[config.embeddings[model_key]]

    def model_name(self, model_key: str) -> str:
        model = self._model(model_key)
        return model.model or self._gateway.config.embeddings[model_key]

    def cost(self, chars: int, model_key: str) -> float:
        pricing = self._model(model_key).pricing
        tokens = chars / self._gateway.config.chars_per_token
        return tokens / 1e6 * (pricing.input_per_mtok if pricing else 0.0)


# ---------------------------------------------------------------- run


@dataclass
class FileStats:
    subject: str
    path: str
    read: int = 0
    valid: int = 0
    t6_flagged: int = 0
    t6_skipped: int = 0
    dup_fact_key: int = 0
    dup_similar: int = 0
    linked_topic: int = 0
    ready: int = 0
    inserted: int = 0
    conflicts: int = 0
    small_chars: int = 0
    large_chars: int = 0
    t6_reasons: Counter = field(default_factory=Counter)

    def lines(self, *, write: bool, embed: bool, cost: float) -> list[str]:
        top = ", ".join(f"{reason} ×{n}" for reason, n in self.t6_reasons.most_common(3)) or "—"
        mode = "write" if write else "dry-run"
        out = [
            f"[{mode}] {self.subject} ← {self.path}",
            f"  read {self.read} · valid {self.valid} · invalid {self.read - self.valid}",
            f"  t6_flagged {self.t6_flagged} (skipped {self.t6_skipped}) · top: {top}",
            f"  skipped_dup fact_key {self.dup_fact_key} · similar>{DUPLICATE_THRESHOLD} {self.dup_similar}",
            f"  linked_topic {self.linked_topic}" + ("" if embed else " (no embeddings: not linked)"),
            f"  inserted {self.inserted} · on_conflict {self.conflicts}" if write
            else f"  inserted 0 · would_insert {self.ready}",
            f"  est_embed_cost ${cost:.4f}" + ("" if embed else " (not spent)"),
        ]
        return out


@dataclass
class Options:
    write: bool = False
    batch_size: int = 200
    t6_mode: str = "report"
    embed: bool = True
    link_topics: bool = True
    topic_threshold: float = TOPIC_THRESHOLD
    duplicate_threshold: float = DUPLICATE_THRESHOLD
    x_tier: str = "X1"


def _batches(items: Sequence[Any], size: int) -> Iterator[Sequence[Any]]:
    for start in range(0, len(items), size):
        yield items[start:start + size]


async def import_items(raw_items: Sequence[Any], *, slug: str, path: str, state: SubjectState,
                       repo: ImportRepo, embedder: Embedder | None, options: Options) -> FileStats:
    stats = FileStats(slug, path)
    embed = options.embed and options.write and embedder is not None
    link = embed and options.link_topics and state.centroids is not None and len(state.centroids) > 0
    small_model = embedder.model_name(QUESTIONS_KEY) if embed else None
    for batch in _batches(raw_items, options.batch_size):
        candidates: list[ImportItem] = []
        for raw in batch:
            stats.read += 1
            item = parse_item(raw)
            if item is None:
                continue
            stats.valid += 1
            if options.t6_mode != "off":
                problems = t6_problems(item)
                if problems:
                    stats.t6_flagged += 1
                    stats.t6_reasons.update(p.split(" (")[0] for p in problems)
                    if options.t6_mode == "strict":
                        stats.t6_skipped += 1
                        continue
            if item.fact_key in state.fact_keys:
                stats.dup_fact_key += 1
                continue
            state.fact_keys.add(item.fact_key)
            candidates.append(item)
        texts = [c.embed_text() for c in candidates]
        stats.small_chars += sum(map(len, texts))
        if not embed:
            if options.link_topics:
                stats.large_chars += sum(map(len, texts))
            rows = [to_row(c, topic_id=None, embedding=None) for c in candidates]
        else:
            rows = await _embedded_rows(candidates, texts, state, embedder, options, stats, link)
        stats.ready += len(rows)
        if options.write and rows:
            inserted = await repo.insert_batch(state, slug, rows, x_tier=options.x_tier,
                                               embedding_model=small_model)
            stats.inserted += inserted
            stats.conflicts += len(rows) - inserted
    return stats


async def _embedded_rows(candidates: Sequence[ImportItem], texts: Sequence[str], state: SubjectState,
                         embedder: Embedder, options: Options, stats: FileStats, link: bool) -> list[dict]:
    if not candidates:
        return []
    vectors = await embedder.embed(texts, QUESTIONS_KEY)
    nearest = state.vectors.best(vectors)
    within = VectorIndex()
    kept: list[int] = []
    for i, (_, score) in enumerate(nearest):
        if score > options.duplicate_threshold or (len(within) and
                                                   within.best([vectors[i]])[0][1] > options.duplicate_threshold):
            stats.dup_similar += 1
            continue
        within.add([vectors[i]])
        kept.append(i)
    state.vectors.add([vectors[i] for i in kept])
    topics: dict[int, str] = {}
    if link and kept:
        kept_texts = [texts[i] for i in kept]
        stats.large_chars += sum(map(len, kept_texts))
        corpus_vectors = await embedder.embed(kept_texts, CORPUS_KEY)
        for i, (row, score) in zip(kept, state.centroids.best(corpus_vectors)):
            if row >= 0 and score >= options.topic_threshold:
                topics[i] = state.centroids.labels[row]
    stats.linked_topic += len(topics)
    return [to_row(candidates[i], topic_id=topics.get(i), embedding=vectors[i]) for i in kept]


def _parse_input(value: str) -> tuple[str, Path]:
    slug, sep, path = value.partition("=")
    if not sep or not slug.strip() or not path.strip():
        raise argparse.ArgumentTypeError("--input must be <subject_slug>=<file_path>")
    return slug.strip(), Path(path.strip())


def _load_file(path: Path) -> list[Any]:
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise ValueError(f"{path}: root must be a JSON list")
    return data


async def run(inputs: Sequence[tuple[str, Path]], *, repo: ImportRepo, embedder: Embedder | None,
              options: Options, no_link: frozenset[Path] = frozenset()) -> list[str]:
    states: dict[str, SubjectState] = {}
    lines: list[str] = []
    for slug, path in inputs:
        if slug not in states:
            states[slug] = await repo.load_subject(slug)
        state = states[slug]
        link = options.link_topics and path.resolve() not in no_link
        if link and options.write and options.embed and state.centroids is None:
            state.centroids = await repo.topic_centroids(state.subject_id)
        file_options = Options(**{**options.__dict__, "link_topics": link})
        stats = await import_items(_load_file(path), slug=slug, path=str(path), state=state, repo=repo,
                                   embedder=embedder, options=file_options)
        embed = options.write and options.embed
        cost = 0.0
        if embedder is not None:
            cost = embedder.cost(stats.small_chars, QUESTIONS_KEY) + embedder.cost(stats.large_chars, CORPUS_KEY)
        lines += stats.lines(write=options.write, embed=embed, cost=cost)
    return lines


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.examiner.bank.import_json")
    parser.add_argument("--input", action="append", type=_parse_input, required=True,
                        metavar="SLUG=PATH", help="public.subjects slug and JSON file; repeatable")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", dest="write", action="store_false", help="default: validate and count only")
    mode.add_argument("--write", dest="write", action="store_true")
    parser.set_defaults(write=False)
    parser.add_argument("--batch-size", type=int, default=200)
    parser.add_argument("--t6-mode", choices=T6_MODES, default="report")
    parser.add_argument("--no-embed", action="store_true", help="insert without vectors and without a §")
    parser.add_argument("--no-topic-link", action="append", type=Path, default=[], metavar="PATH",
                        help="file whose items get no § (e.g. a subject with no textbook in the corpus)")
    parser.add_argument("--topic-threshold", type=float, default=TOPIC_THRESHOLD)
    parser.add_argument("--x-tier", choices=("X1", "X2", "X3"), default="X1")
    return parser


async def _main(args: argparse.Namespace) -> int:
    from ...llm_gateway import get_gateway
    from .cli import _load_environment
    from .repository import create_pool

    _load_environment()
    options = Options(write=args.write, batch_size=max(1, args.batch_size), t6_mode=args.t6_mode,
                      embed=not args.no_embed, topic_threshold=args.topic_threshold, x_tier=args.x_tier)
    pool = await create_pool(max_size=2)
    try:
        lines = await run(args.input, repo=PgImportRepo(pool), embedder=GatewayEmbedder(get_gateway()),
                          options=options, no_link=frozenset(p.resolve() for p in args.no_topic_link))
    finally:
        await pool.close()
    print("\n".join(lines))
    return 0


def main() -> int:
    return asyncio.run(_main(build_parser().parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
