"""Ойын сұрақтарының біртұтас көзі (D98, Games 1-кезең).

Бөлме ашылғанда оның «колодасы» (deck) құрылады: сұрақтың көзі, id-і, масштабтағы тақырыбы мен қиындығы ғана.
Мазмұн мен кілт колодада жоқ: сұрақ ойын кезінде көзінен оқылып, тек сервер күйіне қойылады (кілт клиентке бармайды).
Көздер:
  game      — games.game_questions (оқулық § бойынша ойын банкі);
  examiner  — емтихан банкінің белсенді тесттері, тек оқу көпірі арқылы (games.examiner_* функциялары, D68):
              ешбір жол көшірілмейді, games_svc-те examiner кестелеріне рұқсат жоқ;
  generated — games.generated_questions, «Кез келген тақырып» кэші.

Бөлме ашудың үш режимі (`SOURCE_MODES`):
  paragraphs — оқулық §-тері; ойын банкі мен §-ке байланған емтихан тесттері бірге;
  bank       — дайын пән банкі (history, world_history, …), қалауынша тақырып сүзгісі; $0, дәуір/тақырыпша бойынша
               кезекпен іріктеледі, карта аймақтары — дәуірлер;
  topic      — еркін пән мен тақырып: алдымен кэш пен емтихан банкі (метадерек/кілт сөз), сосын тек тапшылық
               генерацияланады (бір шақыру, ≤ 20 сұрақ), өткені кэшке жазылады. Сол тақырыпқа қайта ойнау — $0.

`format` өрісі ойындарға ашық (`FORMATS`). D99 (2-кезең): mcq-мен бірге true_false_fix («Сенемін — Сенбеймін»)
және escape_step («Эскейп рум») ойналады. Еркін тақырыпта ойынның өз пішіні кэштен алынады, mcq кэші мен емтихан
банкі де саналады (тест $0 түрленеді); тапшылық қана ойынның өз пішінімен генерацияланады.
Пән атауының балама жазылуы («Қазақ тарихы» → history) банк пәніне сәйкестендіріледі: банкте сұрақ болса,
генерация қажетсіз шақырылмайды.
"""

from __future__ import annotations

import hashlib
import json
import os
import random
import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

SOURCE_MODES: tuple[str, ...] = ("paragraphs", "bank", "topic")
ITEM_SOURCES: tuple[str, ...] = ("game", "examiner", "generated")
FORMATS: tuple[str, ...] = ("mcq", "debate_topic", "true_false_fix", "term_card", "role_card", "escape_step")
PLAYABLE_FORMATS: frozenset[str] = frozenset({"mcq", "true_false_fix", "escape_step"})

# Пәннің балама атаулары (normalize_key пішінінде) → corpus.subjects.slug. Кэш кілті де біреу болады (CANON).
SUBJECT_ALIASES: dict[str, str] = {
    "қазақстан тарихы": "history", "қазақ тарихы": "history", "казахстан тарихы": "history",
    "история казахстана": "history", "kazakhstan history": "history", "history of kazakhstan": "history",
    "дүниежүзі тарихы": "world_history", "дүние жүзі тарихы": "world_history", "әлем тарихы": "world_history",
    "жалпы тарих": "world_history", "всемирная история": "world_history", "world history": "world_history",
}
SUBJECT_CANON: dict[str, str] = {"history": "қазақстан тарихы", "world_history": "дүниежүзі тарихы"}

MAX_TOPICS = 8            # масштабтың тақырыбы (Әдіс жорығында — карта аймағы), § шегімен бірдей
DECK_MIN, DECK_MAX = 30, 120
DECK_FACTOR = 3           # колода MIN_BANK-тан үш есе: ойын ішінде қайталану сирек болады
POOL_LIMIT = 200          # көпір функциясының шегі
TOPIC_TARGET = 20         # еркін тақырыпқа керек сұрақ (бір генерация шақыруымен толады)
LABEL_CHARS = 40
STEM_CHARS = 5
MIN_WORD_CHARS = 3
STOPWORDS = frozenset({
    "және", "мен", "пен", "бен", "туралы", "бойынша", "тақырып", "тақырыбы", "сабақ", "ойын", "тест", "сұрақ",
})
TIER_DIFFICULTY = {"X1": 1, "X2": 2, "X3": 3}

ON_DEMAND_ENV = "GAMES_ON_DEMAND_GENERATION"       # "0" — генерация өшірулі
DAILY_LIMIT_ENV = "GAMES_GENERATION_DAILY_LIMIT"
DEFAULT_DAILY_LIMIT = 5

_WORD_RE = re.compile(r"[^\W_]+", re.UNICODE)

# ------------------------------------------------------------------ SQL (`/* games:<атау> */` — журнал мен тестке)

BANK_SUBJECTS = """/* games:bank_subjects */
select subject_id::text as subject_id, title, mcq, has_textbook from games.examiner_bank_subjects()
"""

EXAMINER_POOL = """/* games:examiner_pool */
select question_id::text as question_id, topic_id, era, subtopic, tier
from games.examiner_mcq_pool($1::uuid, $2::text[], $3::text[], $4)
"""

EXAMINER_ITEMS = """/* games:examiner_items */
select question_id::text as question_id, topic_id, era, subtopic, tier, content, correct_option_id
from games.examiner_mcq_items($1::uuid[])
"""

GAME_POOL = """/* games:game_pool */
select question_id::text as question_id, topic_id, difficulty
from games.game_questions
where kind = 'mcq' and status = 'active' and topic_id = any($1::text[])
order by random()
limit $2
"""

GAME_ITEMS = """/* games:game_items */
select question_id::text as question_id, topic_id, paragraph, difficulty, content, answer_key
from games.game_questions
where question_id = any($1::uuid[]) and kind = 'mcq' and status = 'active'
"""

GENERATED_POOL = """/* games:generated_pool */
select question_id::text as question_id, format, difficulty, content, answer_key
from games.generated_questions
where subject_key = $1 and topic_key = $2 and format = any($3::text[]) and status = 'active'
"""

GENERATED_ITEMS = """/* games:generated_items */
select question_id::text as question_id, format, difficulty, content, answer_key,
       checks ->> 'explanation' as explanation
from games.generated_questions
where question_id = any($1::uuid[]) and format = any(array['mcq', 'true_false_fix', 'escape_step'])
  and status = 'active'
"""

INSERT_GENERATED = """/* games:insert_generated */
insert into games.generated_questions
  (format, subject_key, topic_key, subject_title, topic_title, stem_hash, difficulty, content, answer_key, checks,
   prompt_version, model, created_by)
values ($13, $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12::uuid)
on conflict (subject_key, topic_key, format, stem_hash) do nothing
returning question_id::text
"""

SUBJECT_BY_SLUG = """/* games:subject_by_slug */
select id::text from corpus.subjects where slug = $1
"""

RUNS_TODAY = """/* games:generation_runs_today */
select count(*)::int from games.generation_runs where user_id = $1::uuid and created_at >= date_trunc('day', now())
"""

INSERT_RUN = """/* games:insert_generation_run */
insert into games.generation_runs (user_id, subject_key, topic_key, requested, accepted, outcome, cost_usd)
values ($1::uuid, $2, $3, $4, $5, $6, $7)
"""

SEEN = """/* games:seen */
select question_id::text as question_id, max(created_at) as seen_at,
       max(created_at) > now() - interval '14 days' as recent
from games.game_answer_log
where user_id = any($1::uuid[]) and question_id = any($2::uuid[])
group by 1
"""

INSERT_ANSWERS_SOURCED = """/* games:insert_answers_sourced */
insert into games.game_answer_log (room_id, user_id, question_id, correct, source)
select $1::uuid, t.user_id, t.question_id, t.correct, t.source
from unnest($2::uuid[], $3::uuid[], $4::boolean[], $5::text[]) as t(user_id, question_id, correct, source)
"""


# ------------------------------------------------------------------ таза функциялар


@dataclass(frozen=True)
class DeckItem:
    src: str          # game | examiner | generated
    id: str
    topic: str        # масштабтағы тақырып кілті: §, дәуір аймағы не еркін тақырып
    difficulty: int = 2
    format: str = "mcq"

    def to_json(self) -> dict[str, Any]:
        data: dict[str, Any] = {"src": self.src, "id": self.id, "topic": self.topic, "d": self.difficulty}
        if self.format != "mcq":
            data["f"] = self.format
        return data

    @classmethod
    def from_json(cls, data: Mapping[str, Any]) -> "DeckItem":
        return cls(str(data["src"]), str(data["id"]), str(data["topic"]), int(data.get("d", 2)),
                   str(data.get("f", "mcq")))


@dataclass
class Deck:
    """Бөлменің масштабы: тақырып кілттері мен атаулары (қозғалтқыштар үшін) және сұрақ сілтемелері."""

    topic_ids: list[str]
    labels: list[str]
    items: list[DeckItem]
    meta: dict[str, Any] = field(default_factory=dict)

    def scope(self, source: str, **extra: Any) -> dict[str, Any]:
        return {"source": source, "topic_ids": self.topic_ids, "labels": self.labels,
                "deck": [item.to_json() for item in self.items], **self.meta, **extra}


def normalize_key(text: str | None, limit: int = 200) -> str:
    """Кэш кілті: кіші әріп, тек сөздер, бір бос орын. «Excel  формулалары!» → «excel формулалары»."""
    return " ".join(_WORD_RE.findall((text or "").casefold()))[:limit]


def subject_slug(subject_key: str) -> str | None:
    """«Қазақ тарихы», «Қазақстан тарихы» → history: банк пәнінің slug-ы (балама жазылу), болмаса None."""
    return SUBJECT_ALIASES.get(normalize_key(subject_key, 80))


def canonical_subject_key(subject_key: str) -> str:
    """Кэш кілті: балама атаулар бір кілтке келеді («қазақ тарихы» → «қазақстан тарихы»)."""
    slug = subject_slug(subject_key)
    return SUBJECT_CANON.get(slug, subject_key) if slug else subject_key


def clean_title(text: str | None, limit: int) -> str:
    return " ".join((text or "").split())[:limit]


def stem_hash(stem: str) -> str:
    return hashlib.sha256(normalize_key(stem, 2000).encode("utf-8")).hexdigest()


def topic_words(query: str | None) -> list[str]:
    return list(dict.fromkeys(w for w in _WORD_RE.findall((query or "").casefold())
                              if len(w) >= MIN_WORD_CHARS and w not in STOPWORDS and not w.isdigit()))


def like_patterns(query: str | None) -> list[str] | None:
    """Тақырып сөздерінің түбірі (алғашқы 5 әріп, қазақша жалғау әсер етпейді) → LIKE үлгілері. Сөз жоқ — None."""
    stems = list(dict.fromkeys(w[:STEM_CHARS] for w in topic_words(query)))
    return [f"%{s}%" for s in stems] or None


def deck_size(min_bank: int) -> int:
    return max(DECK_MIN, min(DECK_MAX, min_bank * DECK_FACTOR))


def regions(rows: Sequence[Mapping[str, Any]], *, max_regions: int = MAX_TOPICS) -> tuple[list[str], list[str], list[str]]:
    """Банк сұрақтарын карта аймақтарына бөлу: дәуір бойынша (бір дәуір болса — тақырыпша бойынша). Ең үлкен
    `max_regions − 1` топ өз аймағы, қалғаны «Аралас» аймағына қосылады. (кілттер, атаулар, әр жолдың кілті)."""
    def era_of(row: Mapping[str, Any]) -> str:
        return clean_title(row.get("era") or "", LABEL_CHARS)

    key_of = era_of
    if len({era_of(r) for r in rows}) < 2:
        def key_of(row: Mapping[str, Any]) -> str:
            return clean_title(row.get("subtopic") or row.get("era") or "", LABEL_CHARS)

    sizes: dict[str, int] = {}
    for row in rows:
        sizes[key_of(row)] = sizes.get(key_of(row), 0) + 1
    ordered = sorted(sizes, key=lambda k: (-sizes[k], k))
    kept = ordered if len(ordered) <= max_regions else ordered[: max_regions - 1]
    topic_ids = [f"r{i + 1}" for i in range(len(kept))]
    labels = [name or "Жалпы" for name in kept]
    if len(ordered) > len(kept):
        topic_ids.append(f"r{len(kept) + 1}")
        labels.append("Аралас")
    index = {name: topic_ids[i] for i, name in enumerate(kept)}
    rest = topic_ids[-1]
    return topic_ids, labels, [index.get(key_of(row), rest) for row in rows]


def order_candidates(items: Sequence[DeckItem], seen: Mapping[str, Mapping[str, Any]], difficulty: int,
                     rng: random.Random) -> list[DeckItem]:
    """D45 реті: ойыншылар 14 күнде көрмегені, қиындығы жақыны, бұрын көрілгенінің ең ертедегісі, сосын кездейсоқ."""
    def key(item: DeckItem) -> tuple:
        row = seen.get(item.id) or {}
        seen_at = row.get("seen_at")
        stamp = seen_at.timestamp() if isinstance(seen_at, datetime) else float("-inf")
        return (bool(row.get("recent")), abs(item.difficulty - difficulty), seen_at is not None, stamp, rng.random())

    return sorted(items, key=key)


def on_demand_enabled() -> bool:
    return os.getenv(ON_DEMAND_ENV, "1").strip().lower() not in ("0", "false", "no", "off")


def daily_limit() -> int:
    try:
        return max(0, int(os.getenv(DAILY_LIMIT_ENV, str(DEFAULT_DAILY_LIMIT))))
    except ValueError:
        return DEFAULT_DAILY_LIMIT


def _json(value: Any) -> Any:
    if value is None or isinstance(value, (dict, list)):
        return value
    return json.loads(value)


def tier_difficulty(tier: str | None) -> int:
    return TIER_DIFFICULTY.get(str(tier or ""), 2)


def sources_of(deck: Iterable[Mapping[str, Any]] | None) -> dict[str, str]:
    return {str(d["id"]): str(d["src"]) for d in deck or ()}


# ------------------------------------------------------------------ колода құру (I/O)


class BankShort(Exception):
    """Масштабта сұрақ жеткіліксіз: `found` — табылғаны, `needed` — керегі."""

    def __init__(self, found: int, needed: int) -> None:
        super().__init__(f"{found} < {needed}")
        self.found = found
        self.needed = needed


class GenerationLimit(Exception):
    """Пайдаланушының бүгінгі генерация шегі бітті."""


@dataclass
class TopicPlan:
    """«Кез келген тақырып» есебі: кэште, емтихан банкінде табылғаны және генерацияның тапшылығы."""

    subject_key: str
    topic_key: str
    subject_title: str
    topic_title: str
    cached: list[dict[str, Any]]
    examiner: list[dict[str, Any]]
    deficit: int
    format: str = "mcq"     # тапшылық осы пішінмен генерацияланады (ойынның DECK_FORMAT-ы)

    @property
    def found(self) -> int:
        return len(self.cached) + len(self.examiner)


class QuestionBank:
    """Колода құрушы. Генерация тек `topic_deck`-те, тапшылыққа ғана, транзакциядан тыс (байланыс ұсталмайды)."""

    def __init__(self, pool: Any, *, gateway: Any, rng: random.Random, generator: Any = None) -> None:
        self._pool = pool
        self._gateway = gateway          # () -> LLMGateway | None
        self._rng = rng
        self._generator = generator      # тесттер үшін: build_topic_mcq-тің орнына

    async def bank_subjects(self) -> list[dict[str, Any]]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(BANK_SUBJECTS)
        return [{"subject_id": r["subject_id"], "title": r["title"], "mcq": int(r["mcq"]),
                 "has_textbook": bool(r["has_textbook"])} for r in rows]

    async def paragraph_deck(self, conn: Any, subject_id: str, topic_ids: Sequence[str], labels: Sequence[str],
                             *, min_bank: int) -> Deck:
        """Оқулық §-тері: ойын банкі және §-ке байланған емтихан тесттері (көшірілмейді, тек сілтеме)."""
        game = await conn.fetch(GAME_POOL, list(topic_ids), POOL_LIMIT)
        exam = await conn.fetch(EXAMINER_POOL, subject_id, list(topic_ids), None, POOL_LIMIT)
        items = [DeckItem("game", r["question_id"], r["topic_id"], int(r["difficulty"])) for r in game]
        items += [DeckItem("examiner", r["question_id"], r["topic_id"], tier_difficulty(r["tier"])) for r in exam
                  if r["topic_id"] in topic_ids]
        if len(items) < min_bank:
            raise BankShort(len(items), min_bank)
        return Deck(list(topic_ids), list(labels), items)

    async def bank_pool(self, subject_id: str, topic_query: str | None, limit: int) -> list[Any]:
        async with self._pool.acquire() as conn:
            return list(await conn.fetch(EXAMINER_POOL, subject_id, None, like_patterns(topic_query), limit))

    async def bank_deck(self, subject_id: str, topic_query: str | None, *, min_bank: int) -> Deck:
        """Дайын пән банкі: $0, LLM жоқ. Дәуірлер мен тақырыпшалар кезекпен; карта аймақтары — дәуірлер."""
        rows = await self.bank_pool(subject_id, topic_query, deck_size(min_bank))
        if len(rows) < min_bank:
            raise BankShort(len(rows), min_bank)
        topic_ids, labels, keys = regions(rows)
        items = [DeckItem("examiner", r["question_id"], key, tier_difficulty(r["tier"])) for r, key in zip(rows, keys)]
        query = clean_title(topic_query, 200) or None
        return Deck(topic_ids, labels, items, {"topic_query": query})

    async def topic_plan(self, subject_text: str, topic_text: str, *, fmt: str = "mcq") -> TopicPlan:
        """1-қадам: кэш (сол пән мен тақырып; ойынның пішіні мен mcq) және емтихан банкі (пәннің атауы не балама
        атауы банк пәніне сай келсе, кілт сөзбен). Тапшылық = TOPIC_TARGET − табылғаны, ең көбі MAX_GENERATE."""
        from .bank.topic import MAX_GENERATE

        subject_title, topic_title = clean_title(subject_text, 80), clean_title(topic_text, 200)
        subject_key = canonical_subject_key(normalize_key(subject_title, 80))
        topic_key = normalize_key(topic_title, 200)
        formats = list(dict.fromkeys([fmt, "mcq"]))
        async with self._pool.acquire() as conn:
            cached = [dict(r) for r in await conn.fetch(GENERATED_POOL, subject_key, topic_key, formats)]
            examiner: list[dict[str, Any]] = []
            patterns = like_patterns(topic_title)
            if patterns:
                bank = {normalize_key(r["title"], 80): r["subject_id"] for r in await conn.fetch(BANK_SUBJECTS)}
                subject_id = bank.get(subject_key)
                slug = subject_slug(subject_key)
                if subject_id is None and slug:
                    subject_id = await conn.fetchval(SUBJECT_BY_SLUG, slug)
                if subject_id is not None and subject_id in bank.values():
                    examiner = [dict(r) for r in await conn.fetch(EXAMINER_POOL, subject_id, None, patterns,
                                                                    TOPIC_TARGET)]
        found = len(cached) + len(examiner)
        return TopicPlan(subject_key, topic_key, subject_title, topic_title, cached, examiner,
                         min(MAX_GENERATE, max(0, TOPIC_TARGET - found)), fmt)

    async def topic_deck(self, user_id: str, subject_text: str, topic_text: str, *, min_bank: int,
                         fmt: str = "mcq") -> Deck:
        """Еркін тақырып: банк бірінші, жетпесе тек тапшылық (ойынның пішінімен) генерацияланады да кэшке жазылады."""
        plan = await self.topic_plan(subject_text, topic_text, fmt=fmt)
        generated: list[dict[str, Any]] = []
        if plan.deficit and on_demand_enabled():
            try:
                generated = await self._generate(user_id, plan)
            except GenerationLimit:
                if plan.found < min_bank:
                    raise  # бар сұрақпен ойнауға жетпейді; жетсе — бармен басталады
        items = [DeckItem("generated", r["question_id"], "topic", int(r["difficulty"]), str(r.get("format") or "mcq"))
                 for r in plan.cached + generated]
        items += [DeckItem("examiner", r["question_id"], "topic", tier_difficulty(r["tier"])) for r in plan.examiner]
        if len(items) < min_bank:
            raise BankShort(len(items), min_bank)
        label = clean_title(f"{plan.subject_title} · {plan.topic_title}", 120)
        return Deck(["topic"], [label], items, {
            "subject_title": plan.subject_title, "topic_query": plan.topic_title,
            "generated": len(generated), "from_cache": len(plan.cached), "from_bank": len(plan.examiner),
        })

    async def _generate(self, user_id: str, plan: TopicPlan) -> list[dict[str, Any]]:
        from .bank.topic import BUILDERS, PROMPT_REFS

        async with self._pool.acquire() as conn:
            if await conn.fetchval(RUNS_TODAY, user_id) >= daily_limit():
                raise GenerationLimit()
            existing = [(_json(r["content"]) or {}, _json(r["answer_key"]) or {}) for r in plan.cached
                        if (r.get("format") or "mcq") == plan.format]
        gateway = self._gateway()
        if gateway is None and self._generator is None:
            return []
        build = self._generator or BUILDERS[plan.format]
        # Байланыс ұсталмайды: LLM шақыруы транзакция мен пулдан тыс.
        batch = await build(gateway, plan.subject_title, plan.topic_title, plan.deficit, existing, self._rng)
        rows: list[dict[str, Any]] = []
        async with self._pool.acquire() as conn, conn.transaction():
            for item in batch.items:
                qid = await conn.fetchval(
                    INSERT_GENERATED, plan.subject_key, plan.topic_key, plan.subject_title, plan.topic_title,
                    stem_hash(str(item.content.get("stem") or "")), item.difficulty,
                    json.dumps(item.content, ensure_ascii=False), json.dumps(item.answer_key),
                    json.dumps({"explanation": item.explanation}, ensure_ascii=False),
                    PROMPT_REFS[plan.format].version, batch.model, user_id, plan.format,
                )
                if qid:  # бір мәтін екі рет келсе (қатар генерация), кэште біреуі қалады
                    rows.append({"question_id": qid, "difficulty": item.difficulty, "format": plan.format})
            await conn.execute(INSERT_RUN, user_id, plan.subject_key, plan.topic_key, max(1, batch.requested),
                               len(rows), batch.outcome, batch.cost_usd)
        return rows


class DeckQuestions:
    """Колодадан сұрақ (`QuestionSource`): D45 реті сақталады, мазмұн көзінен оқылады, кілт тек серверде."""

    LOAD_TRIES = 5

    def __init__(self, conn: Any, deck: Sequence[Mapping[str, Any]], labels: Mapping[str, str], rng: random.Random,
                 ) -> None:
        self._conn = conn
        self._items = [DeckItem.from_json(d) for d in deck]
        self._labels = dict(labels)
        self._rng = rng

    async def take(self, *, topic_ids: Sequence[str], difficulty: int, viewers: Sequence[str],
                   exclude: Sequence[str]) -> Any:
        wanted, skip = set(topic_ids), set(exclude)
        pool = [i for i in self._items if i.topic in wanted and i.id not in skip and i.format in PLAYABLE_FORMATS]
        if not pool:
            return None
        viewers = [v for v in viewers if _uuid_like(v)]
        seen = {}
        if viewers:
            seen = {r["question_id"]: r for r in await self._conn.fetch(SEEN, viewers, [i.id for i in pool])}
        for item in order_candidates(pool, seen, int(difficulty), self._rng)[: self.LOAD_TRIES]:
            question = await self._load(item)
            if question is not None:
                return question
        return None

    async def _load(self, item: DeckItem) -> Any:
        from .engines.base import Question

        if item.src == "examiner":
            row = await self._conn.fetchrow(EXAMINER_ITEMS, [item.id])
            key = {"correct_option_id": row["correct_option_id"]} if row else {}
        elif item.src == "generated":
            row = await self._conn.fetchrow(GENERATED_ITEMS, [item.id])
            key = (_json(row["answer_key"]) or {}) if row else {}
        else:
            row = await self._conn.fetchrow(GAME_ITEMS, [item.id])
            key = (_json(row["answer_key"]) or {}) if row else {}
        if row is None:
            return None  # сұрақ ойын кезінде шығарылып тасталды
        content = _json(row["content"]) or {}
        options = tuple({"id": str(o["id"]), "text": str(o["text"])} for o in content.get("options") or [])
        correct = str(key.get("correct_option_id") or "")
        fmt = str((row.get("format") if item.src == "generated" else None) or item.format or "mcq")
        explanation = str((row.get("explanation") if item.src == "generated" else None) or "")
        paragraph = row["paragraph"] if item.src == "game" else self._labels.get(item.topic, "")
        paragraph = clean_title(paragraph, LABEL_CHARS)
        if fmt == "true_false_fix":
            # D99: тұжырым дұрыс болса — түзету жоқ (correct бос), қате болса — түзету нұсқалардың бірі.
            truth = bool(key.get("is_true"))
            stem = str(content.get("statement") or content.get("stem") or "")
            if not stem or len(options) < 2 or (not truth and correct not in {o["id"] for o in options}):
                return None
            return Question(item.id, item.topic, paragraph, item.difficulty, stem, options,
                            "" if truth else correct, fmt, explanation, truth)
        if len(options) < 2 or correct not in {o["id"] for o in options}:
            return None
        return Question(item.id, item.topic, paragraph, item.difficulty, str(content.get("stem") or ""), options,
                        correct, fmt, explanation)


def _uuid_like(value: str) -> bool:
    return bool(re.fullmatch(r"[0-9a-fA-F-]{36}", str(value)))
