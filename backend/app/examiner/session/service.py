"""Examiner сессиясының сервисі (api-kelisimderi.md §3; ai_examiner.md §5, §7; bagalau §2.3–§4.3)."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import random
from collections import defaultdict
from collections.abc import AsyncIterator, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import asyncpg

from ...llm_gateway import LLMGateway, LLMRequestError, LLMStreamInterrupted, LLMUnavailableError, Task, get_gateway
from ..bank.formats import AI_FORMATS, CACHEABLE_TEXT_FORMATS, CODE_FORMATS, DIALOG_FORMATS, HYBRID_FORMATS
from .ai_grader import (
    GradingDeferredError,
    generate_explanation,
    grade_text_answer,
    verify_candidate_vector,
)
from .cache_filters import answer_hash
from .composition import (
    A_BLOCK_SECONDS,
    AVAILABLE_LEVELS,
    FORMAT_TITLES,
    LAMBDA,
    LEVEL_TITLES,
    THRESHOLDS,
    Composition,
    Slot,
    build_composition,
    code_formats_for_subject,
    level_formats,
)
from .dialog import DIALOG_PROMPT_REF, END_MARKER, MAX_DIALOG_TURNS, build_dialog_messages, strip_end_marker
from .dto import (
    AbandonRequest,
    AnswerRequest,
    AnswerResult,
    AppealRequest,
    AppealResponse,
    Book,
    BreakdownRow,
    Chapter,
    ConfirmGradeRequest,
    DialogTurnDTO,
    DialogTurnRequest,
    ExamSession,
    ExplanationResponse,
    FalsePositiveRequest,
    FalsePositiveResponse,
    LevelCard,
    LevelResult,
    LevelsResponse,
    Moderation,
    OverrideGradeRequest,
    Progress,
    ResultItemSummary,
    ReviewQueueResponse,
    Scope,
    ScopeCatalog,
    SessionItem,
    SessionResult,
    StartSessionRequest,
    StudentProfile,
    SubjectCatalogItem,
    SubjectInfo,
    SubjectProfile,
    TeacherGradeActionResponse,
    TeacherGradeDetail,
    Topic,
    Total,
    X3Result,
)
from .errors import ExaminerError, not_found, validation
from .grading import AnswerInvalid, check_answer, check_hybrid_answer, extract_text_answer
from .input_filter import check_code_filter, moderate_text
from .review import (
    confirm_grade,
    fetch_grade_detail,
    fetch_review_queue,
    mark_false_positive,
    override_grade,
    recompute_session_result,
)
from .scoring import GradedItem, level_score, x3_eligible
from .selection import POOL_CODE, POOL_D_EXPLAIN, Candidate, Picker, level_availability, order_items
from .shuffle import shuffle_content

logger = logging.getLogger("bilim.examiner.session")

IDLE_MINUTES = 60          # D36
LEASE_TAIL = "2 hours"     # T_tail, D14
PREFETCH = 2               # ai_examiner §6
LOCK_ROUNDS = 3


@dataclass(frozen=True)
class ResolvedScope:
    type: str
    api_id: str          # клиент көретін id (D63)
    db_id: str           # sessions.scope_id
    title: str
    book: str
    book_title: str
    grade: int
    subject_id: str
    topics: tuple[str, ...]

    def dto(self) -> Scope:
        return Scope(type=self.type, id=self.api_id, title=self.title)


def _loads(value: Any) -> Any:
    return json.loads(value) if isinstance(value, str) else value


def _hash(endpoint: str, payload: Any) -> str:
    raw = json.dumps({"endpoint": endpoint, "payload": payload}, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _vector_literal(values: Sequence[float]) -> str:
    return "[" + ",".join(repr(float(v)) for v in values) + "]"


def _sse(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"


class ExaminerService:
    def __init__(
        self,
        pool: asyncpg.Pool,
        *,
        gateway: LLMGateway | None = None,
        rng: random.Random | None = None,
    ) -> None:
        self._pool = pool
        self._gateway_instance = gateway
        self._rng = rng or random.SystemRandom()
        self._bg_tasks: set[asyncio.Task[Any]] = set()

    def _gateway(self) -> LLMGateway:
        if self._gateway_instance is None:
            self._gateway_instance = get_gateway()
        return self._gateway_instance

    def _spawn(self, coro: Any) -> asyncio.Task[Any]:
        task = asyncio.create_task(coro)
        self._bg_tasks.add(task)
        task.add_done_callback(self._bg_tasks.discard)
        return task

    async def close(self) -> None:
        for task in list(self._bg_tasks):
            if not task.done():
                task.cancel()
        if self._bg_tasks:
            await asyncio.gather(*self._bg_tasks, return_exceptions=True)
        self._bg_tasks.clear()

    # ============================================================== каталог

    async def catalog(self) -> list[SubjectCatalogItem]:
        rows = await self._pool.fetch(
            """
            select t.book, t.title, t.grade, t.subject_id::text as subject_id, s.name_kk,
                   exists (select 1 from corpus.paragraphs p where p.book = t.book and p.chapter_no is not null)
                     as has_chapters
            from corpus.textbooks t
            join corpus.subjects s on s.id = t.subject_id
            order by s.sort_order nulls last, s.name_kk, t.grade
            """
        )
        subjects: dict[str, SubjectCatalogItem] = {}
        for row in rows:
            item = subjects.setdefault(row["subject_id"], SubjectCatalogItem(
                subject_id=row["subject_id"], title=row["name_kk"], books=[]))
            item.books.append(Book(book=row["book"], title=row["title"], grade=row["grade"],
                                   has_chapters=row["has_chapters"]))
        return list(subjects.values())

    async def scopes(self, book: str) -> ScopeCatalog:
        rows = await self._paragraphs(self._pool, book)
        if not rows:
            raise not_found("Оқулық табылмады.")
        first = rows[0]
        subject = await self._pool.fetchval("select name_kk from corpus.subjects where id = $1::uuid",
                                            first["subject_id"])
        chapters: dict[str, Chapter] = {}
        topics = []
        for row in rows:
            chapter_id = None
            if row["chapter_no"] is not None:
                chapter_id = f"{book}#ch{row['chapter_no']}"
                chapters.setdefault(row["chapter_no"], Chapter(
                    id=chapter_id, no=row["chapter_no"], title=row["chapter"] or f"{row['chapter_no']} тарау"))
            topics.append(Topic(id=row["topic_id"], no=row["paragraph_no"],
                                title=row["paragraph_title"] or f"§{row['paragraph_no']}", chapter_id=chapter_id))
        return ScopeCatalog(
            book=Book(book=book, title=first["book_title"], grade=first["grade"], has_chapters=bool(chapters)),
            subject_id=first["subject_id"], subject_title=subject or "",
            chapters=list(chapters.values()), topics=topics,
        )

    @staticmethod
    async def _paragraphs(conn: Any, book: str) -> list[asyncpg.Record]:
        return await conn.fetch(
            """
            select topic_id, book, subject_id::text as subject_id, grade, book_title, chapter_no, chapter,
                   paragraph_no, paragraph_title
            from corpus.paragraphs
            where book = $1
            order by sort_no, paragraph_no
            """,
            book,
        )

    async def resolve_scope(self, conn: Any, scope_type: str, scope_id: str) -> ResolvedScope:
        if scope_type == "topic":
            book = scope_id.split("#", 1)[0]
            rows = [row for row in await self._paragraphs(conn, book) if row["topic_id"] == scope_id]
            if not rows:
                raise not_found("Тақырып табылмады.")
            row = rows[0]
            title = f"§{row['paragraph_no']} · {row['paragraph_title']}" if row["paragraph_title"] \
                else f"§{row['paragraph_no']}"
            return self._scope(rows, scope_type, scope_id, scope_id, title)
        if scope_type == "chapter":
            book, _, tail = scope_id.partition("#ch")
            if not tail:
                raise validation("Тараудың id-і қате.")
            rows = [row for row in await self._paragraphs(conn, book) if row["chapter_no"] == tail]
            if not rows:
                raise not_found("Тарау табылмады.")
            title = rows[0]["chapter"] or f"{tail} тарау"
            return self._scope(rows, scope_type, scope_id, scope_id, title)
        rows = await self._paragraphs(conn, scope_id)
        if not rows:
            raise not_found("Оқулық табылмады.")
        return self._scope(rows, "subject", scope_id, rows[0]["subject_id"], rows[0]["book_title"])

    @staticmethod
    def _scope(rows: Sequence[asyncpg.Record], scope_type: str, api_id: str, db_id: str, title: str) -> ResolvedScope:
        first = rows[0]
        return ResolvedScope(
            type=scope_type, api_id=api_id, db_id=db_id, title=title, book=first["book"],
            book_title=first["book_title"], grade=first["grade"], subject_id=first["subject_id"],
            topics=tuple(dict.fromkeys(row["topic_id"] for row in rows)),
        )

    async def _applicability(self, conn: Any, subject_id: str) -> dict[str, bool]:
        rows = await conn.fetch(
            "select format::text as format, applicable from examiner.format_applicability where subject_id = $1::uuid",
            subject_id,
        )
        return {row["format"]: row["applicable"] for row in rows}

    # ============================================================== деңгей картасы

    async def levels(self, student_id: str, scope_type: str, scope_id: str) -> LevelsResponse:
        async with self._pool.acquire() as conn:
            scope = await self.resolve_scope(conn, scope_type, scope_id)
            applicable = await self._applicability(conn, scope.subject_id)
            last = await self._last_results(conn, student_id, scope)
            cards = []
            for level in (1, 2, 3, 4):
                previous = last.get(level, LevelResult(level=level, p=None, mastered=False, is_final=False,
                                                       taken_at=None))
                composition = build_composition(level, applicable)
                stock = await self._stock(conn, student_id, scope, level, applicable)
                availability = level_availability(composition.slots, stock)
                cards.append(LevelCard(
                    level=level, title=LEVEL_TITLES[level],
                    formats=[FORMAT_TITLES[name] for name in composition.formats],
                    tasks=composition.n, minutes=composition.minutes, available=True, availability=availability,
                    note="Бұл масштаб бойынша сұрақтар әлі дайындалып жатыр." if availability == "unavailable"
                    else None,
                    last=previous,
                ))
        return LevelsResponse(scope=scope.dto(), levels=cards)

    async def _last_results(self, conn: Any, student_id: str, scope: ResolvedScope) -> dict[int, LevelResult]:
        rows = await conn.fetch(
            """
            select distinct on (s.level) s.level::int as level, r.p::float8 as p, r.mastered, r.is_final,
                   s.ended_at
            from examiner.sessions s
            join examiner.session_results r on r.session_id = s.session_id
            where s.student_id = $1::uuid and s.scope_type::text = $2 and s.scope_id = $3 and s.book = $4
              and s.status = 'completed'
            order by s.level, s.ended_at desc
            """,
            student_id, scope.type, scope.db_id, scope.book,
        )
        return {row["level"]: LevelResult(level=row["level"], p=row["p"], mastered=row["mastered"],
                                          is_final=row["is_final"], taken_at=row["ended_at"]) for row in rows}

    async def _stock(
        self, conn: Any, student_id: str, scope: ResolvedScope, level: int, applicable: Mapping[str, bool]
    ) -> dict[tuple[str, str], tuple[int, int]]:
        """(санат, пул) → (Е2-ден өткен сұрақ, оның ішінде бос сұрақ) (D65, bagalau §2.4)."""
        totals: dict[tuple[str, str], list[int]] = defaultdict(lambda: [0, 0])
        if level == 3:
            d_rows = await conn.fetch(
                """
                select s.x_tier::text as tier, q.format::text as format, count(*)::int as eligible,
                       (count(*) filter (where l.question_id is null))::int as free
                from examiner.questions q
                join examiner.question_state s on s.question_id = q.question_id
                left join examiner.exam_item_leases l on l.question_id = q.question_id and l.leased_until > now()
                left join examiner.student_item_exposure e on e.question_id = q.question_id and e.student_id = $1::uuid
                where q.subject_id = $2::uuid and q.level = 3 and q.topic_id = any($3::text[])
                  and q.format::text = any($4::text[]) and s.status = 'active'
                  and (e.question_id is null
                       or e.last_seen_at < now() - make_interval(days => ceil(e.n * 1.204 / $5::float8)::int))
                group by 1, 2
                """,
                student_id, scope.subject_id, list(scope.topics),
                ["socratic", "feynman", "teach_ai"], LAMBDA[3],
            )
            for row in d_rows:
                pool_key = POOL_D_EXPLAIN if row["format"] in ("feynman", "teach_ai") else row["format"]
                totals[(row["tier"], pool_key)][0] += row["eligible"]
                totals[(row["tier"], pool_key)][1] += row["free"]

            a_code = code_formats_for_subject(applicable)
            a_rows = await conn.fetch(
                """
                select s.x_tier::text as tier, count(*)::int as eligible,
                       (count(*) filter (where l.question_id is null))::int as free
                from examiner.questions q
                join examiner.question_state s on s.question_id = q.question_id
                left join examiner.exam_item_leases l on l.question_id = q.question_id and l.leased_until > now()
                left join examiner.student_item_exposure e on e.question_id = q.question_id and e.student_id = $1::uuid
                where q.subject_id = $2::uuid and q.level in (1, 2) and q.topic_id = any($3::text[])
                  and q.format::text = any($4::text[]) and s.status = 'active'
                  and (e.question_id is null
                       or e.last_seen_at < now() - make_interval(days => ceil(e.n * 1.204 / (
                           case when q.level = 1 then $5::float8 else $6::float8 end
                       ))::int))
                group by 1
                """,
                student_id, scope.subject_id, list(scope.topics), a_code, LAMBDA[1], LAMBDA[2],
            )
            for row in a_rows:
                totals[(row["tier"], POOL_CODE)][0] += row["eligible"]
                totals[(row["tier"], POOL_CODE)][1] += row["free"]
            return {k: (v[0], v[1]) for k, v in totals.items()}

        formats = level_formats(level, applicable)
        rows = await conn.fetch(
            """
            select s.x_tier::text as tier, q.format::text as format, count(*)::int as eligible,
                   (count(*) filter (where l.question_id is null))::int as free
            from examiner.questions q
            join examiner.question_state s on s.question_id = q.question_id
            left join examiner.exam_item_leases l on l.question_id = q.question_id and l.leased_until > now()
            left join examiner.student_item_exposure e on e.question_id = q.question_id and e.student_id = $1::uuid
            where q.subject_id = $2::uuid and q.level = $3::smallint and q.topic_id = any($4::text[])
              and q.format::text = any($5::text[]) and s.status = 'active'
              and (e.question_id is null
                   or e.last_seen_at < now() - make_interval(days => ceil(e.n * 1.204 / $6::float8)::int))
            group by 1, 2
            """,
            student_id, scope.subject_id, level, list(scope.topics), formats, LAMBDA[level],
        )
        for row in rows:
            pool_key = POOL_CODE if row["format"] in CODE_FORMATS else row["format"]
            totals[(row["tier"], pool_key)][0] += row["eligible"]
            totals[(row["tier"], pool_key)][1] += row["free"]
        return {k: (v[0], v[1]) for k, v in totals.items()}

    # ============================================================== қайталанған сұраныс

    async def _replay(self, conn: Any, user_id: str, request_id: str, request_hash: str) -> dict | None:
        row = await conn.fetchrow(
            "select request_hash, response from examiner.request_log where user_id = $1::uuid "
            "and client_request_id = $2::uuid",
            user_id, request_id,
        )
        if row is None:
            return None
        if row["request_hash"] != request_hash:
            raise ExaminerError(409, "DUPLICATE_REQUEST", "Бұл сұраныстың id-і басқа мазмұнмен қолданылған.")
        return _loads(row["response"])

    @staticmethod
    async def _remember(conn: Any, user_id: str, request_id: str, endpoint: str, request_hash: str,
                        response: dict) -> None:
        await conn.execute(
            """
            insert into examiner.request_log (user_id, client_request_id, endpoint, request_hash, status_code, response)
            values ($1::uuid, $2::uuid, $3, $4, 200, $5::jsonb)
            """,
            user_id, request_id, endpoint, request_hash, json.dumps(response, ensure_ascii=False, default=str),
        )

    # ============================================================== сессия өмірі

    async def _abandon_idle(self, conn: Any, student_id: str) -> None:
        rows = await conn.fetch(
            f"""
            update examiner.sessions set status = 'abandoned', ended_at = now()
            where student_id = $1::uuid and status in ('preparing', 'active')
              and last_activity_at < now() - interval '{IDLE_MINUTES} minutes'
            returning session_id
            """,
            student_id,
        )
        for row in rows:
            await self._release_leases(conn, row["session_id"])

    @staticmethod
    async def _release_leases(conn: Any, session_id: Any) -> None:
        await conn.execute(
            f"""
            update examiner.exam_item_leases l
            set session_id = coalesce(o.session_id, l.session_id),
                leased_until = case when o.session_id is null then now() + interval '{LEASE_TAIL}'
                                    else 'infinity'::timestamptz end
            from examiner.exam_item_leases cur
            left join lateral (
              select i.session_id
              from examiner.session_items i
              join examiner.sessions s on s.session_id = i.session_id
              where i.question_id = cur.question_id and i.session_id <> cur.session_id
                and s.status in ('preparing', 'active', 'blocked')
              limit 1
            ) o on true
            where cur.session_id = $1::uuid and l.question_id = cur.question_id
            """,
            str(session_id),
        )

    async def start(self, student_id: str, request: StartSessionRequest) -> ExamSession:
        if request.level not in AVAILABLE_LEVELS:
            raise ExaminerError(409, "LEVEL_NOT_AVAILABLE", "Мұндай деңгей жоқ.", {"level": request.level})
        payload = request.model_dump(mode="json")
        request_id = str(request.client_request_id)
        request_hash = _hash("POST /sessions", {k: v for k, v in payload.items() if k != "client_request_id"})
        async with self._pool.acquire() as conn:
            try:
                async with conn.transaction():
                    replay = await self._replay(conn, student_id, request_id, request_hash)
                    if replay is not None:
                        return ExamSession.model_validate(replay)
                    await self._abandon_idle(conn, student_id)
                    open_id = await conn.fetchval(
                        "select session_id::text from examiner.sessions where student_id = $1::uuid "
                        "and status in ('preparing', 'active', 'blocked')",
                        student_id,
                    )
                    if open_id:
                        raise ExaminerError(409, "ACTIVE_SESSION_EXISTS", "Сізде аяқталмаған емтихан бар.",
                                            {"session_id": open_id})
                    scope = await self.resolve_scope(conn, request.scope_type, request.scope_id)
                    applicable = await self._applicability(conn, scope.subject_id)
                    composition = build_composition(request.level, applicable)
                    chosen = await self._pick(conn, student_id, scope, request.level, list(composition.slots),
                                              applicable)
                    session_id = await self._create(conn, student_id, scope, composition, chosen)
                    session = await self._session(conn, student_id, session_id)
                    await self._remember(conn, student_id, request_id, "POST /sessions", request_hash,
                                         session.model_dump(mode="json"))
                    return session
            except asyncpg.UniqueViolationError as exc:
                async with conn.transaction():
                    replay = await self._replay(conn, student_id, request_id, request_hash)
                    if replay is not None:
                        return ExamSession.model_validate(replay)
                    open_id = await conn.fetchval(
                        "select session_id::text from examiner.sessions where student_id = $1::uuid "
                        "and status in ('preparing', 'active', 'blocked')",
                        student_id,
                    )
                if open_id:
                    raise ExaminerError(409, "ACTIVE_SESSION_EXISTS", "Сізде аяқталмаған емтихан бар.",
                                        {"session_id": open_id}) from exc
                raise

    async def _candidates(
        self,
        conn: Any,
        student_id: str,
        scope: ResolvedScope,
        level: int,
        formats: Sequence[str],
        tiers: Sequence[str],
        exclude: Sequence[str] = (),
        *,
        include_a_code_levels: bool = False,
        code_formats: Sequence[str] = (),
    ) -> list[Candidate]:
        if include_a_code_levels:
            rows = await conn.fetch(
                """
                select q.question_id::text as question_id, q.topic_id, q.format::text as format, s.x_tier::text as tier,
                       case when l.question_id is not null then l.leased_at end as leased_at
                from examiner.questions q
                join examiner.question_state s on s.question_id = q.question_id
                left join examiner.exam_item_leases l on l.question_id = q.question_id and l.leased_until > now()
                left join examiner.student_item_exposure e on e.question_id = q.question_id and e.student_id = $1::uuid
                where q.subject_id = $2::uuid and q.topic_id = any($3::text[])
                  and (
                    (q.level = $4::smallint and q.format::text = any($5::text[]))
                    or (q.level in (1, 2) and q.format::text = any($8::text[]))
                  )
                  and s.x_tier::text = any($6::text[])
                  and s.status = 'active'
                  and not (q.question_id = any($7::text[]::uuid[]))
                  and (e.question_id is null
                       or e.last_seen_at < now() - make_interval(days => ceil(e.n * 1.204 / (
                           case q.level when 1 then $9::float8 when 2 then $10::float8 else $11::float8 end
                       ))::int))
                """,
                student_id, scope.subject_id, list(scope.topics), level, list(formats), list(tiers),
                list(exclude), list(code_formats), LAMBDA[1], LAMBDA[2], LAMBDA[level],
            )
        else:
            rows = await conn.fetch(
                """
                select q.question_id::text as question_id, q.topic_id, q.format::text as format, s.x_tier::text as tier,
                       case when l.question_id is not null then l.leased_at end as leased_at
                from examiner.questions q
                join examiner.question_state s on s.question_id = q.question_id
                left join examiner.exam_item_leases l on l.question_id = q.question_id and l.leased_until > now()
                left join examiner.student_item_exposure e on e.question_id = q.question_id and e.student_id = $1::uuid
                where q.subject_id = $2::uuid and q.level = $3::smallint and q.topic_id = any($4::text[])
                  and q.format::text = any($5::text[]) and s.x_tier::text = any($6::text[])
                  and s.status = 'active'
                  and not (q.question_id = any($8::text[]::uuid[]))
                  and (e.question_id is null
                       or e.last_seen_at < now() - make_interval(days => ceil(e.n * 1.204 / $7::float8)::int))
                """,
                student_id, scope.subject_id, level, list(scope.topics), list(formats), list(tiers), LAMBDA[level],
                list(exclude),
            )
        return [Candidate(row["question_id"], row["topic_id"], row["format"], row["tier"], row["leased_at"])
                for row in rows]

    @staticmethod
    async def _lock(conn: Any, question_ids: Sequence[str]) -> set[str]:
        rows = await conn.fetch(
            """
            select s.question_id::text as question_id
            from examiner.question_state s
            left join examiner.exam_item_leases l on l.question_id = s.question_id and l.leased_until > now()
            where s.question_id = any($1::text[]::uuid[]) and s.status = 'active' and l.question_id is null
            for update of s skip locked
            """,
            list(question_ids),
        )
        return {row["question_id"] for row in rows}

    async def _pick(
        self, conn: Any, student_id: str, scope: ResolvedScope, level: int, slots: list[Slot], applicable: Mapping[str, bool]
    ) -> list[tuple[Slot, Candidate]]:
        tiers = sorted({slot.tier for slot in slots})
        lvl_formats = level_formats(level, applicable)
        a_code = code_formats_for_subject(applicable) if level == 3 else []
        candidates = await self._candidates(
            conn, student_id, scope, level, lvl_formats, tiers,
            include_a_code_levels=(level == 3), code_formats=a_code,
        )
        picker_formats = list(dict.fromkeys(lvl_formats + a_code))
        picker = Picker(candidates, picker_formats, self._rng)
        chosen: list[Candidate | None] = [picker.take(slot) for slot in slots]
        accepted: set[str] = set()
        for _ in range(LOCK_ROUNDS):
            accepted |= {c.question_id for c in chosen if c is not None and c.reused}
            pending = [c.question_id for c in chosen
                       if c is not None and not c.reused and c.question_id not in accepted]
            if pending:
                accepted |= await self._lock(conn, pending)
            if all(c is not None and c.question_id in accepted for c in chosen):
                break
            chosen = [c if c is not None and c.question_id in accepted else picker.take(slot)
                      for slot, c in zip(slots, chosen, strict=True)]
            if any(c is None for c in chosen):
                break
        accepted |= {c.question_id for c in chosen if c is not None and c.reused}
        if any(c is None or c.question_id not in accepted for c in chosen):
            missing = [f"{slot.tier}/{slot.format}" for slot, c in zip(slots, chosen, strict=True)
                       if c is None or c.question_id not in accepted]
            raise ExaminerError(
                409, "BANK_NOT_READY",
                "Бұл масштаб бойынша сұрақ банкі әлі толмаған. Кейінірек қайталап көріңіз немесе басқа тақырып таңдаңыз.",
                {"missing": missing},
            )
        return order_items(slots, [c for c in chosen if c is not None])

    async def _create(self, conn: Any, student_id: str, scope: ResolvedScope, composition: Composition,
                      chosen: Sequence[tuple[Slot, Candidate]]) -> str:
        snapshot = composition.to_json() | {
            "scope": scope.dto().model_dump(), "topics": list(scope.topics), "book_title": scope.book_title,
        }
        session_id = await conn.fetchval(
            """
            insert into examiner.sessions (student_id, subject_id, scope_type, scope_id, level, status, composition,
                                           started_at, book)
            values ($1::uuid, $2::uuid, $3::text, $4, $5::smallint, 'active', $6::jsonb, now(), $7)
            returning session_id::text
            """,
            student_id, scope.subject_id, scope.type, scope.db_id, composition.level,
            json.dumps(snapshot, ensure_ascii=False), scope.book,
        )
        await self._add_items(
            conn, student_id, session_id, [(slot.tier, slot.block, c.question_id) for slot, c in chosen], 1
        )
        return session_id

    async def _add_items(
        self, conn: Any, student_id: str, session_id: str, items: Sequence[tuple[str, str | None, str]], first_position: int
    ) -> None:
        question_ids = [question_id for _, _, question_id in items]
        tiers = [tier for tier, _, _ in items]
        blocks = [block for _, block, _ in items]
        await conn.execute(
            f"""
            insert into examiner.session_items (session_id, question_id, position, tier, block, served_at, deadline_at)
            select $1::uuid, q, ($2::int + o - 1)::smallint, t, b,
                   case when o = 1 then now() end,
                   case when o = 1 and b = 'A' then now() + interval '{A_BLOCK_SECONDS} seconds' end
            from unnest($3::text[]::uuid[], $4::text[], $5::text[]) with ordinality as x(q, t, b, o)
            """,
            session_id, first_position, question_ids, tiers, blocks,
        )
        ordered = sorted(question_ids)
        await conn.execute(
            """
            insert into examiner.exam_item_leases (question_id, session_id, leased_at, leased_until)
            select q, $2::uuid, now(), 'infinity' from unnest($1::text[]::uuid[]) with ordinality as x(q, o)
            order by o
            on conflict (question_id) do update
              set session_id = excluded.session_id, leased_at = excluded.leased_at,
                  leased_until = excluded.leased_until
            """,
            ordered, session_id,
        )
        await conn.execute(
            """
            insert into examiner.student_item_exposure (student_id, question_id, n, last_seen_at)
            select $1::uuid, q, 1, now() from unnest($2::text[]::uuid[]) as q
            on conflict (student_id, question_id) do update
              set n = examiner.student_item_exposure.n + 1, last_seen_at = now()
            """,
            student_id, ordered,
        )

    # ============================================================== күйді оқу

    async def active(self, student_id: str) -> ExamSession | None:
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                await self._abandon_idle(conn, student_id)
                session_id = await conn.fetchval(
                    "select session_id::text from examiner.sessions where student_id = $1::uuid "
                    "and status in ('preparing', 'active', 'blocked')",
                    student_id,
                )
            if not session_id:
                return None
            await self._retry_pending_grades(conn, student_id, session_id)
            return await self._session(conn, student_id, session_id)

    async def get(self, student_id: str, session_id: str) -> ExamSession:
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                await self._abandon_idle(conn, student_id)
                session = await self._session_row(conn, student_id, session_id)
            if session["status"] == "active":
                await self._retry_pending_grades(conn, student_id, session_id)
            return await self._session(conn, student_id, session_id)

    async def _retry_pending_grades(self, conn: Any, student_id: str, session_id: str) -> None:
        """Егер провайдер уақытша істен шыққанда жауап pending болып қалса, сессияны оқығанда қайта бағалайды."""
        pending_rows = await conn.fetch(
            """
            select al.answer_id::text as answer_id, al.item_id::text as item_id, al.question_id::text as question_id,
                   al.answer, al.answer_text, al.c::int as c, q.format::text as format, q.question_content,
                   q.ecd_evidence, q.rubric_0_4, q.reference_context
            from examiner.answer_log al
            join examiner.questions q on q.question_id = al.question_id
            where al.session_id = $1::uuid and al.grade_status = 'pending' and al.answer_text is not null
            """,
            session_id,
        )
        if not pending_rows:
            return
        for prow in pending_rows:
            fmt = prow["format"]
            is_hybrid = fmt in HYBRID_FORMATS
            max_score = 2 if is_hybrid else 4
            c_val = prow["c"] or 0
            try:
                grade_out = await grade_text_answer(
                    conn,
                    self._gateway(),
                    question_id=prow["question_id"],
                    format_name=fmt,
                    max_score=max_score,
                    answer_text=prow["answer_text"],
                    question_content=_loads(prow["question_content"]) or {},
                    key=(_loads(prow["ecd_evidence"]) or {}).get("code_check_target") or {},
                    rubric_0_4=_loads(prow["rubric_0_4"]),
                    reference_context=_loads(prow["reference_context"]),
                    item_id=prow["item_id"],
                    hybrid_base_c=c_val,
                )
            except GradingDeferredError:
                continue

            total_s = (2 * c_val + grade_out.score) if is_hybrid else grade_out.score
            a_val = grade_out.score if is_hybrid else None
            async with conn.transaction():
                updated = await conn.execute(
                    """
                    update examiner.answer_log
                    set a = $2::smallint, s = $3::smallint, grade_source = $4, grade_status = $5,
                        review_reason = $6, evidence_quotes = $7::jsonb, grade_reason = $8,
                        grader_model = $9, prompt_version = $10, rubric_version = $11, graded_at = now()
                    where answer_id = $1::uuid and grade_status = 'pending'
                    """,
                    prow["answer_id"], a_val, total_s, grade_out.grade_source, grade_out.grade_status,
                    grade_out.review_reason, json.dumps(grade_out.evidence_quotes, ensure_ascii=False),
                    grade_out.grade_reason, grade_out.grader_model, grade_out.prompt_version,
                    grade_out.rubric_version,
                )
                if updated == "UPDATE 1":
                    if grade_out.embedding is not None and grade_out.grade_source == "llm" and fmt in CACHEABLE_TEXT_FORMATS:
                        await conn.execute(
                            """
                            insert into examiner.answer_vectors
                              (answer_id, question_id, value, cluster_state, embedding, embedding_model)
                            values ($1::uuid, $2::uuid, $3::smallint, 'candidate', ($4::text)::extensions.vector, $5)
                            on conflict (answer_id) do nothing
                            """,
                            prow["answer_id"], prow["question_id"], grade_out.score,
                            _vector_literal(grade_out.embedding), grade_out.embedding_model,
                        )
                    await conn.execute(
                        "update examiner.session_items set state = 'graded' where item_id = $1::uuid",
                        prow["item_id"],
                    )
                    session = await self._session_row(conn, student_id, session_id, lock=True)
                    if session["status"] == "active":
                        await self._advance(conn, student_id, session)

    async def _session_row(self, conn: Any, student_id: str, session_id: str, *, lock: bool = False) -> asyncpg.Record:
        row = await conn.fetchrow(
            f"""
            select session_id::text as session_id, status, level::int as level, composition,
                   strike_count::int as strike_count, started_at, created_at, book, subject_id::text as subject_id
            from examiner.sessions where session_id = $1::uuid and student_id = $2::uuid
            {'for update' if lock else ''}
            """,
            session_id, student_id,
        )
        if row is None:
            raise not_found("Сессия табылмады.")
        return row

    @staticmethod
    async def _items(conn: Any, session_id: str) -> list[asyncpg.Record]:
        return await conn.fetch(
            """
            select i.item_id::text as item_id, i.position::int as position, i.tier::text as tier, i.block,
                   i.served_at, i.deadline_at, i.state, q.format::text as format, q.question_content,
                   q.ecd_evidence, g.s::int as s, (g.grade_status = 'final') as is_final,
                   coalesce(g.grade_status, 'pending') as grade_status, g.grade_source,
                   al.appealed_at
            from examiner.session_items i
            join examiner.questions q on q.question_id = i.question_id
            left join examiner.effective_grades g on g.item_id = i.item_id
            left join examiner.answer_log al on al.item_id = i.item_id
            where i.session_id = $1::uuid
            order by i.position
            """,
            session_id,
        )

    async def _dialog_turns(self, conn: Any, item_id: str) -> list[DialogTurnDTO]:
        rows = await conn.fetch(
            "select turn_no::int as turn_no, student_text, examiner_text from examiner.dialog_turns "
            "where item_id = $1::uuid order by turn_no",
            item_id,
        )
        return [DialogTurnDTO(turn_no=r["turn_no"], student_text=r["student_text"], examiner_text=r["examiner_text"])
                for r in rows]

    async def _session(self, conn: Any, student_id: str, session_id: str) -> ExamSession:
        row = await self._session_row(conn, student_id, session_id)
        # Егер ағымдағы A-блок тапсырмасына deadline_at қойылмаған болса — дәл осы сәтте басталады.
        await conn.execute(
            f"""
            update examiner.session_items
            set served_at = coalesce(served_at, now()),
                deadline_at = coalesce(served_at, now()) + interval '{A_BLOCK_SECONDS} seconds'
            where item_id = (
              select item_id from examiner.session_items
              where session_id = $1::uuid and state = 'open' order by position limit 1
            ) and block = 'A' and deadline_at is null
            """,
            session_id,
        )
        items = await self._items(conn, session_id)
        composition = _loads(row["composition"])
        open_items = [item for item in items if item["state"] == "open"]
        visible = row["status"] in ("active", "preparing")

        current_dto: SessionItem | None = None
        if visible and open_items:
            cur = open_items[0]
            turns = await self._dialog_turns(conn, cur["item_id"]) if cur["format"] in DIALOG_FORMATS else None
            key = (_loads(cur["ecd_evidence"]) or {}).get("code_check_target") or {}
            content = shuffle_content(cur["format"], _loads(cur["question_content"]), key, cur["item_id"])
            current_dto = SessionItem(
                item_id=cur["item_id"], position=cur["position"], tier=cur["tier"], block=cur["block"],
                format=cur["format"], content=content, served_at=cur["served_at"],
                deadline_at=cur["deadline_at"], state=cur["state"], turns=turns,
            )

        upcoming_dtos: list[SessionItem] = []
        if visible:
            for item in open_items[1:1 + PREFETCH]:
                if item["block"] == "A":
                    continue
                key = (_loads(item["ecd_evidence"]) or {}).get("code_check_target") or {}
                content = shuffle_content(item["format"], _loads(item["question_content"]), key, item["item_id"])
                upcoming_dtos.append(SessionItem(
                    item_id=item["item_id"], position=item["position"], tier=item["tier"], block=item["block"],
                    format=item["format"], content=content, served_at=item["served_at"],
                    deadline_at=item["deadline_at"], state=item["state"],
                ))

        return ExamSession(
            session_id=row["session_id"], status=row["status"], level=row["level"],
            scope=Scope.model_validate(composition["scope"]),
            progress=Progress(answered=len(items) - len(open_items), total=len(items)),
            current=current_dto,
            upcoming=upcoming_dtos,
            strike_count=row["strike_count"], started_at=row["started_at"] or row["created_at"],
        )

    # ============================================================== жауап пен модерация

    @staticmethod
    def _require_active(session: asyncpg.Record) -> None:
        if session["status"] == "blocked":
            raise ExaminerError(423, "SESSION_BLOCKED", "Сессия уақытша тоқтатылды. Мұғаліміңізге хабарласыңыз.")
        if session["status"] in ("completed", "abandoned"):
            raise ExaminerError(410, "SESSION_CLOSED", "Сессия аяқталған.")
        if session["status"] != "active":
            raise ExaminerError(409, "SESSION_NOT_ACTIVE", "Сессия әлі басталған жоқ.")

    async def _fetch_open_current_item(self, conn: Any, session_id: str, item_id: str) -> asyncpg.Record:
        item = await conn.fetchrow(
            """
            select i.item_id::text as item_id, i.state, i.tier::text as tier, i.block,
                   i.position::int as position, i.served_at, i.deadline_at,
                   q.question_id::text as question_id, q.format::text as format, q.question_content,
                   q.ecd_evidence, q.rubric_0_4, q.socratic_checkpoints, q.reference_context
            from examiner.session_items i
            join examiner.questions q on q.question_id = i.question_id
            where i.item_id = $1::uuid and i.session_id = $2::uuid
            """,
            item_id, session_id,
        )
        if item is None:
            raise not_found("Тапсырма табылмады.")
        if item["state"] != "open":
            raise ExaminerError(409, "ALREADY_ANSWERED", "Бұл тапсырмаға жауап берілген.")
        current_pos = await conn.fetchval(
            "select min(position)::int from examiner.session_items where session_id = $1::uuid and state = 'open'",
            session_id,
        )
        if item["position"] != current_pos:
            raise validation("Тапсырмалар ретімен беріледі: алдымен ағымдағы тапсырмаға жауап беріңіз.")
        return item

    async def _apply_strike(
        self,
        conn: Any,
        *,
        student_id: str,
        session_id: str,
        item: asyncpg.Record,
        category: str,
        evidence_text: str,
        raw_answer: dict[str, Any],
    ) -> Moderation:
        active_count = await conn.fetchval(
            "select count(*)::int from examiner.moderation_events where session_id = $1::uuid and revoked_at is null",
            session_id,
        )
        strike_no = min(2, int(active_count or 0) + 1)
        await conn.execute(
            """
            insert into examiner.moderation_events (session_id, item_id, student_id, strike_no, category, evidence_text)
            values ($1::uuid, $2::uuid, $3::uuid, $4::smallint, $5, $6)
            """,
            session_id, item["item_id"], student_id, strike_no, category, evidence_text[:4000],
        )
        if strike_no == 1:
            await conn.execute(
                "update examiner.sessions set strike_count = 1, last_activity_at = now() where session_id = $1::uuid",
                session_id,
            )
            return Moderation(
                strike_count=1,
                message="Ескерту (1/2): жауап академиялық ережеге сай емес. Осы тапсырмаға қайта жауап беріп көріңіз.",
                retry_allowed=True,
            )
        # 2-ші страйк: s = 0, сессия уақытша бұғатталады (ended_at NULL болып қалады!).
        await conn.execute(
            """
            insert into examiner.answer_log
              (item_id, session_id, student_id, question_id, x_tier, answer, answer_text, late,
               s, grade_source, grade_status, graded_at)
            values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::jsonb, $7, false,
                    0, 'moderation', 'final', now())
            """,
            item["item_id"], session_id, student_id, item["question_id"], item["tier"],
            json.dumps(raw_answer, ensure_ascii=False), evidence_text[:4000],
        )
        await conn.execute(
            "update examiner.session_items set state = 'graded' where item_id = $1::uuid",
            item["item_id"],
        )
        await conn.execute(
            "update examiner.sessions set strike_count = 2, status = 'blocked', last_activity_at = now() "
            "where session_id = $1::uuid",
            session_id,
        )
        await self._release_leases(conn, session_id)
        return Moderation(
            strike_count=2,
            message="Сессия ереже бұзушылыққа байланысты уақытша тоқтатылды (2/2). Мұғаліміңіз қарайды.",
            retry_allowed=False,
        )

    async def answer(self, student_id: str, session_id: str, item_id: str, request: AnswerRequest) -> AnswerResult:
        request_id = str(request.client_request_id)
        endpoint = f"POST /sessions/{session_id}/items/{item_id}/answer"
        request_hash = _hash(endpoint, request.answer)

        async with self._pool.acquire() as conn:
            # 1) Қысқа оқу: қайталау, күй және формат тексеру
            async with conn.transaction():
                replay = await self._replay(conn, student_id, request_id, request_hash)
                if replay is not None:
                    return AnswerResult.model_validate(replay)
                session = await self._session_row(conn, student_id, session_id)
                self._require_active(session)
                item = await self._fetch_open_current_item(conn, session_id, item_id)
                composition = _loads(session["composition"])
                topic_ctx = (composition.get("scope") or {}).get("title", "")

            fmt = item["format"]
            if fmt in DIALOG_FORMATS:
                raise validation("Диалог тапсырмасы `/turns` ағыны арқылы орындалады.")
            content = _loads(item["question_content"]) or {}
            key = (_loads(item["ecd_evidence"]) or {}).get("code_check_target") or {}
            rubric = _loads(item["rubric_0_4"])
            ref_ctx = _loads(item["reference_context"])

            # A-блок таймерін сервер тексереді (bagalau §4.2)
            now_utc = await conn.fetchval("select now()")
            is_late = bool(item["block"] == "A" and item["deadline_at"] is not None and now_utc > item["deadline_at"])

            # Тек код форматтары немесе мерзімі өткен A-блок
            spawn_explanation = False
            spawn_t8_payload: dict[str, Any] | None = None

            if is_late or fmt in CODE_FORMATS:
                if is_late:
                    c = 0
                else:
                    try:
                        c = check_answer(fmt, content, key, request.answer)
                    except AnswerInvalid as exc:
                        raise validation(str(exc)) from exc
                async with conn.transaction():
                    replay = await self._replay(conn, student_id, request_id, request_hash)
                    if replay is not None:
                        return AnswerResult.model_validate(replay)
                    session = await self._session_row(conn, student_id, session_id, lock=True)
                    self._require_active(session)
                    item = await self._fetch_open_current_item(conn, session_id, item_id)
                    await conn.execute(
                        """
                        insert into examiner.answer_log (item_id, session_id, student_id, question_id, x_tier, answer,
                                                         late, c, s, grade_source, grade_status, graded_at)
                        values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::jsonb, $7, $8::smallint,
                                $9::smallint, 'code', 'final', now())
                        """,
                        item_id, session_id, student_id, item["question_id"], item["tier"],
                        json.dumps(request.answer, ensure_ascii=False), is_late, c, 4 * c,
                    )
                    await conn.execute("update examiner.session_items set state = 'graded' where item_id = $1::uuid", item_id)
                    if c == 0 and not is_late:
                        await conn.execute(
                            "insert into examiner.explanations (item_id, status) values ($1::uuid, 'pending') "
                            "on conflict (item_id) do nothing",
                            item_id,
                        )
                        spawn_explanation = True
                    await self._advance(conn, student_id, session)
                    result = AnswerResult(
                        item_id=item_id,
                        check="correct" if c else "incorrect",
                        late=is_late,
                        explanation="pending" if spawn_explanation else "none",
                        moderation=None,
                        session=await self._session(conn, student_id, session_id),
                    )
                    await self._remember(conn, student_id, request_id, endpoint, request_hash,
                                         result.model_dump(mode="json"))
                if spawn_explanation:
                    self._spawn(generate_explanation(
                        self._pool, self._gateway(), item_id=item_id, question_content=content,
                        key=key, reference_context=ref_ctx, student_answer=request.answer,
                    ))
                return result

            # Гибрид және ашық ЖИ форматтары
            is_hybrid = fmt in HYBRID_FORMATS
            hybrid_c: int | None = None
            eval_text: str | None = None
            if is_hybrid:
                try:
                    hybrid_c, eval_text = check_hybrid_answer(fmt, content, key, request.answer)
                except AnswerInvalid as exc:
                    raise validation(str(exc)) from exc
            else:
                try:
                    eval_text = extract_text_answer(fmt, request.answer)
                except AnswerInvalid as exc:
                    raise validation(str(exc)) from exc

            # Гибридте код сәйкессіздігі (c = 0) немесе түзету қажет емес (true_false_fix + is_true=True)
            if is_hybrid and (hybrid_c == 0 or eval_text is None):
                s_val = 4 * (hybrid_c or 0)
                async with conn.transaction():
                    replay = await self._replay(conn, student_id, request_id, request_hash)
                    if replay is not None:
                        return AnswerResult.model_validate(replay)
                    session = await self._session_row(conn, student_id, session_id, lock=True)
                    self._require_active(session)
                    item = await self._fetch_open_current_item(conn, session_id, item_id)
                    await conn.execute(
                        """
                        insert into examiner.answer_log (item_id, session_id, student_id, question_id, x_tier, answer,
                                                         late, c, s, grade_source, grade_status, graded_at)
                        values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::jsonb, false, $7::smallint,
                                $8::smallint, 'code', 'final', now())
                        """,
                        item_id, session_id, student_id, item["question_id"], item["tier"],
                        json.dumps(request.answer, ensure_ascii=False), hybrid_c, s_val,
                    )
                    await conn.execute("update examiner.session_items set state = 'graded' where item_id = $1::uuid", item_id)
                    if hybrid_c == 0:
                        await conn.execute(
                            "insert into examiner.explanations (item_id, status) values ($1::uuid, 'pending') "
                            "on conflict (item_id) do nothing",
                            item_id,
                        )
                        spawn_explanation = True
                    await self._advance(conn, student_id, session)
                    result = AnswerResult(
                        item_id=item_id,
                        check="correct" if s_val >= 3 else "incorrect",
                        late=False,
                        explanation="pending" if spawn_explanation else "none",
                        moderation=None,
                        session=await self._session(conn, student_id, session_id),
                    )
                    await self._remember(conn, student_id, request_id, endpoint, request_hash,
                                         result.model_dump(mode="json"))
                if spawn_explanation:
                    self._spawn(generate_explanation(
                        self._pool, self._gateway(), item_id=item_id, question_content=content,
                        key=key, reference_context=ref_ctx, student_answer=request.answer,
                    ))
                return result

            assert eval_text is not None
            prompt_text = " ".join(
                str(content.get(k) or "") for k in ("stem", "statement", "scenario", "task_prompt", "concept")
            ).strip()
            code_reject = check_code_filter(eval_text, prompt_text)
            if code_reject is not None:
                raise ExaminerError(422, "ANSWER_FILTERED", code_reject)

            gw = self._gateway()
            mod = await moderate_text(gw, eval_text, topic_context=topic_ctx)
            if mod.flagged:
                async with conn.transaction():
                    replay = await self._replay(conn, student_id, request_id, request_hash)
                    if replay is not None:
                        return AnswerResult.model_validate(replay)
                    session = await self._session_row(conn, student_id, session_id, lock=True)
                    self._require_active(session)
                    item = await self._fetch_open_current_item(conn, session_id, item_id)
                    moderation_dto = await self._apply_strike(
                        conn, student_id=student_id, session_id=session_id, item=item,
                        category=mod.category, evidence_text=eval_text, raw_answer=request.answer,
                    )
                    result = AnswerResult(
                        item_id=item_id,
                        check="pending" if moderation_dto.retry_allowed else "incorrect",
                        late=False,
                        explanation="none",
                        moderation=moderation_dto,
                        session=await self._session(conn, student_id, session_id),
                    )
                    await self._remember(conn, student_id, request_id, endpoint, request_hash,
                                         result.model_dump(mode="json"))
                    return result

            # 3-сатылы ЖИ / кэш бағалауы (транзакция сыртында)
            max_score = 2 if is_hybrid else 4
            deferred = False
            grade_out = None
            try:
                grade_out = await grade_text_answer(
                    conn,
                    gw,
                    question_id=item["question_id"],
                    format_name=fmt,
                    max_score=max_score,
                    answer_text=eval_text,
                    question_content=content,
                    key=key,
                    rubric_0_4=rubric,
                    reference_context=ref_ctx,
                    item_id=item_id,
                    hybrid_base_c=hybrid_c or 0,
                )
            except GradingDeferredError:
                deferred = True

            async with conn.transaction():
                replay = await self._replay(conn, student_id, request_id, request_hash)
                if replay is not None:
                    return AnswerResult.model_validate(replay)
                session = await self._session_row(conn, student_id, session_id, lock=True)
                self._require_active(session)
                item = await self._fetch_open_current_item(conn, session_id, item_id)
                ans_hash = answer_hash(eval_text) if fmt in CACHEABLE_TEXT_FORMATS else None
                if deferred or grade_out is None:
                    await conn.execute(
                        """
                        insert into examiner.answer_log
                          (item_id, session_id, student_id, question_id, x_tier, answer, answer_text, answer_hash,
                           late, c, grade_status)
                        values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::jsonb, $7, $8,
                                false, $9::smallint, 'pending')
                        """,
                        item_id, session_id, student_id, item["question_id"], item["tier"],
                        json.dumps(request.answer, ensure_ascii=False), eval_text, ans_hash, hybrid_c,
                    )
                    await conn.execute(
                        "update examiner.session_items set state = 'grading' where item_id = $1::uuid", item_id
                    )
                    check_label: str = "pending"
                else:
                    total_s = (2 * (hybrid_c or 0) + grade_out.score) if is_hybrid else grade_out.score
                    a_val = grade_out.score if is_hybrid else None
                    answer_id = await conn.fetchval(
                        """
                        insert into examiner.answer_log
                          (item_id, session_id, student_id, question_id, x_tier, answer, answer_text, answer_hash,
                           late, c, a, s, grade_source, grade_status, review_reason, evidence_quotes, grade_reason,
                           grader_model, prompt_version, rubric_version, graded_at)
                        values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::jsonb, $7, $8,
                                false, $9::smallint, $10::smallint, $11::smallint, $12, $13, $14, $15::jsonb, $16,
                                $17, $18, $19, now())
                        returning answer_id::text
                        """,
                        item_id, session_id, student_id, item["question_id"], item["tier"],
                        json.dumps(request.answer, ensure_ascii=False), eval_text, ans_hash,
                        hybrid_c, a_val, total_s, grade_out.grade_source, grade_out.grade_status,
                        grade_out.review_reason, json.dumps(grade_out.evidence_quotes, ensure_ascii=False),
                        grade_out.grade_reason, grade_out.grader_model, grade_out.prompt_version,
                        grade_out.rubric_version,
                    )
                    if (
                        grade_out.embedding is not None
                        and grade_out.grade_source == "llm"
                        and fmt in CACHEABLE_TEXT_FORMATS
                    ):
                        await conn.execute(
                            """
                            insert into examiner.answer_vectors
                              (answer_id, question_id, value, cluster_state, embedding, embedding_model)
                            values ($1::uuid, $2::uuid, $3::smallint, 'candidate', ($4::text)::extensions.vector, $5)
                            on conflict (answer_id) do nothing
                            """,
                            answer_id, item["question_id"], grade_out.score,
                            _vector_literal(grade_out.embedding), grade_out.embedding_model,
                        )
                        spawn_t8_payload = {
                            "answer_id": answer_id,
                            "primary_value": grade_out.score,
                            "max_score": max_score,
                            "answer_text": eval_text,
                            "question_content": content,
                            "key": key,
                            "rubric_0_4": rubric,
                            "reference_context": ref_ctx,
                        }
                    await conn.execute(
                        "update examiner.session_items set state = 'graded' where item_id = $1::uuid", item_id
                    )
                    check_label = "correct" if total_s >= 3 else "incorrect"

                await self._advance(conn, student_id, session)
                result = AnswerResult(
                    item_id=item_id,
                    check=check_label,  # type: ignore[arg-type]
                    late=False,
                    explanation="none",
                    moderation=None,
                    session=await self._session(conn, student_id, session_id),
                )
                await self._remember(conn, student_id, request_id, endpoint, request_hash, result.model_dump(mode="json"))

            if spawn_t8_payload is not None:
                self._spawn(verify_candidate_vector(self._pool, gw, **spawn_t8_payload))
            return result

    # ============================================================== түсіндірме, диалог, шағым

    async def explanation(self, student_id: str, session_id: str, item_id: str) -> tuple[int, ExplanationResponse]:
        async with self._pool.acquire() as conn:
            await self._session_row(conn, student_id, session_id)
            row = await conn.fetchrow(
                """
                select e.status, e.text
                from examiner.explanations e
                join examiner.session_items i on i.item_id = e.item_id
                where e.item_id = $1::uuid and i.session_id = $2::uuid
                """,
                item_id, session_id,
            )
        if row is None:
            raise not_found("Түсіндірме табылмады.")
        status_code = 202 if row["status"] == "pending" else 200
        return status_code, ExplanationResponse(status=row["status"], text=row["text"])

    async def stream_turn(
        self, student_id: str, session_id: str, item_id: str, request: DialogTurnRequest
    ) -> AsyncIterator[str]:
        """Сократтық диалог пен «ЖИ-ді оқыт» қадамы (SSE). Клиент үзсе де, сервер жауапты жазады."""
        req_id = str(request.client_request_id)
        text = request.text.strip()
        async with self._pool.acquire() as conn:
            session = await self._session_row(conn, student_id, session_id)
            self._require_active(session)
            item = await self._fetch_open_current_item(conn, session_id, item_id)
            if item["format"] not in DIALOG_FORMATS:
                raise validation("Бұл формат диалогты қолдамайды.")

            existing = await conn.fetchrow(
                "select turn_no::int as turn_no, examiner_text, completed_at from examiner.dialog_turns "
                "where item_id = $1::uuid and client_request_id = $2::uuid",
                item_id, req_id,
            )
            if existing is not None:
                ex_text = existing["examiner_text"] or ""
                total_turns = await conn.fetchval(
                    "select count(*)::int from examiner.dialog_turns where item_id = $1::uuid", item_id
                )
                done_flag = existing["turn_no"] >= MAX_DIALOG_TURNS
                cur_session = await self._session(conn, student_id, session_id)

                async def _replay_stream() -> AsyncIterator[str]:
                    if ex_text:
                        yield _sse("token", {"text": ex_text})
                    yield _sse("done", {
                        "turn_no": existing["turn_no"],
                        "total_turns": total_turns,
                        "dialog_complete": done_flag,
                        "session": cur_session.model_dump(mode="json"),
                    })

                return _replay_stream()

            content = _loads(item["question_content"]) or {}
            key = (_loads(item["ecd_evidence"]) or {}).get("code_check_target") or {}
            ref_ctx = _loads(item["reference_context"])
            rubric = _loads(item["rubric_0_4"])
            checkpoints = _loads(item["socratic_checkpoints"])
            prompt_text = " ".join(str(content.get(k) or "") for k in ("stem", "situation", "opening_question")).strip()

            code_reject = check_code_filter(text, prompt_text)
            if code_reject is not None:
                raise ExaminerError(422, "ANSWER_FILTERED", code_reject)

            composition = _loads(session["composition"])
            topic_ctx = (composition.get("scope") or {}).get("title", "")
            gw = self._gateway()
            mod = await moderate_text(gw, text, topic_context=topic_ctx)
            if mod.flagged:
                async with conn.transaction():
                    session_locked = await self._session_row(conn, student_id, session_id, lock=True)
                    self._require_active(session_locked)
                    item_locked = await self._fetch_open_current_item(conn, session_id, item_id)
                    moderation_dto = await self._apply_strike(
                        conn, student_id=student_id, session_id=session_id, item=item_locked,
                        category=mod.category, evidence_text=text, raw_answer={"text": text},
                    )
                    updated_session = await self._session(conn, student_id, session_id)

                async def _moderation_stream() -> AsyncIterator[str]:
                    yield _sse("done", {
                        "dialog_complete": not moderation_dto.retry_allowed,
                        "moderation": moderation_dto.model_dump(mode="json"),
                        "session": updated_session.model_dump(mode="json"),
                    })

                return _moderation_stream()

            history = await conn.fetch(
                "select turn_no::int as turn_no, student_text, examiner_text from examiner.dialog_turns "
                "where item_id = $1::uuid order by turn_no",
                item_id,
            )
            if len(history) >= MAX_DIALOG_TURNS:
                raise validation("Диалог қадамдарының шегіне жеттіңіз.")
            turn_no = len(history) + 1
            await conn.execute(
                """
                insert into examiner.dialog_turns (item_id, turn_no, student_text, client_request_id)
                values ($1::uuid, $2::smallint, $3, $4::uuid)
                """,
                item_id, turn_no, text, req_id,
            )

        messages = build_dialog_messages(
            format_name=item["format"],
            content=content,
            key=key,
            reference_context=ref_ctx,
            history_turns=[dict(r) for r in history],
            student_text=text,
            turn_no=turn_no,
            checkpoints=checkpoints,
        )
        queue: asyncio.Queue[tuple[str, dict[str, Any]] | None] = asyncio.Queue()

        async def _produce() -> None:
            full_raw = ""
            hold = ""
            guard = len(END_MARKER)
            try:
                async with self._pool.acquire() as pconn:
                    async for piece in gw.stream(Task.EXAMINER_DIALOG, DIALOG_PROMPT_REF, messages):
                        if not piece:
                            continue
                        full_raw += piece
                        hold += piece
                        if len(hold) > guard:
                            emit = hold[:-guard]
                            hold = hold[-guard:]
                            emit_clean = emit.replace(END_MARKER, "")
                            if emit_clean:
                                await queue.put(("token", {"text": emit_clean}))
                    tail_clean, _ = strip_end_marker(hold)
                    if tail_clean:
                        await queue.put(("token", {"text": tail_clean}))
                    clean_reply, saw_end = strip_end_marker(full_raw)
                    dialog_complete = (turn_no >= MAX_DIALOG_TURNS) or saw_end
                    route_model = gw.config.route(Task.EXAMINER_DIALOG).model
                    model_name = gw.config.models[route_model].model or route_model

                    await pconn.execute(
                        """
                        update examiner.dialog_turns
                        set examiner_text = $3, model = $4, prompt_version = $5, completed_at = now()
                        where item_id = $1::uuid and turn_no = $2::smallint
                        """,
                        item_id, turn_no, clean_reply or "...", model_name, DIALOG_PROMPT_REF.version,
                    )

                    if dialog_complete:
                        turns_all = await pconn.fetch(
                            "select turn_no::int as turn_no, student_text, examiner_text from examiner.dialog_turns "
                            "where item_id = $1::uuid order by turn_no",
                            item_id,
                        )
                        transcript_lines = []
                        student_only = []
                        for t in turns_all:
                            student_only.append(t["student_text"])
                            transcript_lines.append(f"Оқушы ({t['turn_no']}): {t['student_text']}")
                            if t["examiner_text"]:
                                transcript_lines.append(f"ЖИ: {t['examiner_text']}")
                        answer_text = "\n\n".join(student_only)
                        transcript_payload = {"turns": [dict(t) for t in turns_all], "text": answer_text}
                        deferred = False
                        grade_out = None
                        try:
                            grade_out = await grade_text_answer(
                                pconn,
                                gw,
                                question_id=item["question_id"],
                                format_name=item["format"],
                                max_score=4,
                                answer_text=answer_text,
                                question_content={**content, "dialog_transcript": "\n".join(transcript_lines)},
                                key=key,
                                rubric_0_4=rubric,
                                reference_context=ref_ctx,
                                item_id=item_id,
                            )
                        except GradingDeferredError:
                            deferred = True

                        async with pconn.transaction():
                            sess_locked = await self._session_row(pconn, student_id, session_id, lock=True)
                            if deferred or grade_out is None:
                                await pconn.execute(
                                    """
                                    insert into examiner.answer_log
                                      (item_id, session_id, student_id, question_id, x_tier, answer, answer_text,
                                       late, grade_status)
                                    values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::jsonb, $7,
                                            false, 'pending')
                                    on conflict (item_id) do nothing
                                    """,
                                    item_id, session_id, student_id, item["question_id"], item["tier"],
                                    json.dumps(transcript_payload, ensure_ascii=False), answer_text,
                                )
                                await pconn.execute(
                                    "update examiner.session_items set state = 'grading' where item_id = $1::uuid",
                                    item_id,
                                )
                            else:
                                await pconn.execute(
                                    """
                                    insert into examiner.answer_log
                                      (item_id, session_id, student_id, question_id, x_tier, answer, answer_text,
                                       late, s, grade_source, grade_status, review_reason, evidence_quotes,
                                       grade_reason, grader_model, prompt_version, rubric_version, graded_at)
                                    values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::jsonb, $7,
                                            false, $8::smallint, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, now())
                                    on conflict (item_id) do nothing
                                    """,
                                    item_id, session_id, student_id, item["question_id"], item["tier"],
                                    json.dumps(transcript_payload, ensure_ascii=False), answer_text,
                                    grade_out.score, grade_out.grade_source, grade_out.grade_status,
                                    grade_out.review_reason, json.dumps(grade_out.evidence_quotes, ensure_ascii=False),
                                    grade_out.grade_reason, grade_out.grader_model, grade_out.prompt_version,
                                    grade_out.rubric_version,
                                )
                                await pconn.execute(
                                    "update examiner.session_items set state = 'graded' where item_id = $1::uuid",
                                    item_id,
                                )
                            await self._advance(pconn, student_id, sess_locked)

                    cur_session = await self._session(pconn, student_id, session_id)
                    await queue.put(("done", {
                        "turn_no": turn_no,
                        "dialog_complete": dialog_complete,
                        "session": cur_session.model_dump(mode="json"),
                    }))
            except (LLMUnavailableError, LLMRequestError, LLMStreamInterrupted) as exc:
                logger.warning("dialog stream failed on turn %s: %s", turn_no, type(exc).__name__)
                try:
                    async with self._pool.acquire() as pconn:
                        await pconn.execute(
                            "delete from examiner.dialog_turns where item_id = $1::uuid and turn_no = $2::smallint "
                            "and completed_at is null",
                            item_id, turn_no,
                        )
                except Exception:  # noqa: BLE001
                    pass
                await queue.put(("error", {"code": "SERVICE_UNAVAILABLE", "message": "Диалог уақытша қолжетімсіз. Қайталап көріңіз."}))
            except Exception as exc:  # noqa: BLE001
                logger.exception("dialog unexpected failure: %s", type(exc).__name__)
                await queue.put(("error", {"code": "INTERNAL_ERROR", "message": "Диалог кезінде қате шықты."}))
            finally:
                await queue.put(None)

        self._spawn(_produce())

        async def _sse_gen() -> AsyncIterator[str]:
            while True:
                ev = await queue.get()
                if ev is None:
                    break
                name, data = ev
                yield _sse(name, data)

        return _sse_gen()

    async def appeal(
        self, student_id: str, session_id: str, item_id: str, request: AppealRequest
    ) -> AppealResponse:
        request_id = str(request.client_request_id)
        endpoint = f"POST /sessions/{session_id}/items/{item_id}/appeal"
        request_hash = _hash(endpoint, {"reason": request.reason})
        async with self._pool.acquire() as conn, conn.transaction():
            replay = await self._replay(conn, student_id, request_id, request_hash)
            if replay is not None:
                return AppealResponse.model_validate(replay)
            session = await self._session_row(conn, student_id, session_id)
            row = await conn.fetchrow(
                """
                select al.answer_id::text as grade_id, al.grade_source, al.a
                from examiner.answer_log al
                where al.item_id = $1::uuid and al.session_id = $2::uuid and al.student_id = $3::uuid
                """,
                item_id, session_id, student_id,
            )
            if row is None:
                raise not_found("Жауап табылмады.")
            if row["grade_source"] == "code" and row["a"] is None:
                raise validation("Код арқылы тексерілген тапсырмаға ЖИ шағымы берілмейді.")
            await conn.execute(
                """
                update examiner.answer_log
                set appeal_text = $2, appealed_at = coalesce(appealed_at, now()),
                    review_reason = 'appeal', grade_status = 'provisional',
                    confirmed_by = null, confirmed_at = null
                where answer_id = $1::uuid
                """,
                row["grade_id"], request.reason.strip(),
            )
            if session["status"] == "completed":
                await recompute_session_result(conn, session_id)
            response = AppealResponse(item_id=item_id, grade_id=row["grade_id"], status="appealed")
            await self._remember(conn, student_id, request_id, endpoint, request_hash, response.model_dump(mode="json"))
            return response

    # ============================================================== сессияны жылжыту

    async def _advance(self, conn: Any, student_id: str, session: asyncpg.Record) -> None:
        session_id = session["session_id"]
        served = await conn.fetchval(
            f"""
            update examiner.session_items
            set served_at = coalesce(served_at, now()),
                deadline_at = case
                    when block = 'A' and deadline_at is null then coalesce(served_at, now()) + interval '{A_BLOCK_SECONDS} seconds'
                    else deadline_at
                end
            where item_id = (select item_id from examiner.session_items
                             where session_id = $1::uuid and state = 'open' order by position limit 1)
            returning item_id
            """,
            session_id,
        )
        if served is not None:
            await conn.execute("update examiner.sessions set last_activity_at = now() where session_id = $1::uuid",
                               session_id)
            return

        items = await self._items(conn, session_id)
        if any(item["state"] in ("answered", "grading") or item["s"] is None for item in items):
            # Провайдер бағалауы күтілуде: сессия аяқталмай тұрады, клиент /sessions/{id} сұрайды.
            await conn.execute("update examiner.sessions set last_activity_at = now() where session_id = $1::uuid",
                               session_id)
            return

        graded = [
            GradedItem(item["tier"], item["format"], item["block"], item["s"], is_final=bool(item["is_final"]))
            for item in items
        ]
        has_x3 = any(item.tier == "X3" for item in graded)
        if not has_x3 and x3_eligible(graded):
            composition = _loads(session["composition"])
            applicable = await self._applicability(conn, session["subject_id"])
            formats = level_formats(session["level"], applicable)
            scope = ResolvedScope(
                type=composition["scope"]["type"], api_id=composition["scope"]["id"], db_id="",
                title=composition["scope"]["title"], book=session["book"], book_title="", grade=0,
                subject_id=session["subject_id"], topics=tuple(composition["topics"]),
            )
            picker = Picker(
                await self._candidates(conn, student_id, scope, session["level"], formats, ["X3"]),
                formats, self._rng,
            )
            for _ in range(LOCK_ROUNDS):
                candidate = picker.take_any("X3")
                if candidate is None:
                    break
                if candidate.reused or await self._lock(conn, [candidate.question_id]):
                    await self._add_items(conn, student_id, session_id, [("X3", None, candidate.question_id)],
                                          len(items) + 1)
                    await conn.execute(
                        "update examiner.sessions set last_activity_at = now() where session_id = $1::uuid",
                        session_id)
                    return
        await self._complete(conn, session, graded, x3_available=has_x3)

    async def _complete(self, conn: Any, session: asyncpg.Record, graded: Sequence[GradedItem], *,
                        x3_available: bool) -> None:
        score = level_score(session["level"], graded, x3_available=x3_available)
        session_id = session["session_id"]
        await conn.execute(
            "update examiner.sessions set status = 'completed', ended_at = now(), last_activity_at = now() "
            "where session_id = $1::uuid",
            session_id,
        )
        await self._release_leases(conn, session_id)
        await conn.execute(
            """
            insert into examiner.session_results
              (session_id, p, part_d, part_a, mastered, is_final, x3_status, x3_rating_valid)
            values ($1::uuid, $2::numeric, $3::numeric, $4::numeric, $5, $6, $7, $8)
            """,
            session_id, score.p, score.part_d, score.part_a, score.mastered,
            score.is_final, score.x3_status, score.x3_rating_valid,
        )

    async def abandon(self, student_id: str, session_id: str, request: AbandonRequest) -> ExamSession:
        request_id = str(request.client_request_id)
        endpoint = f"POST /sessions/{session_id}/abandon"
        request_hash = _hash(endpoint, {})
        async with self._pool.acquire() as conn, conn.transaction():
            replay = await self._replay(conn, student_id, request_id, request_hash)
            if replay is not None:
                return ExamSession.model_validate(replay)
            session = await self._session_row(conn, student_id, session_id, lock=True)
            if session["status"] in ("completed", "abandoned"):
                raise ExaminerError(410, "SESSION_CLOSED", "Сессия аяқталған.")
            await conn.execute(
                "update examiner.sessions set status = 'abandoned', ended_at = now(), blocked_until = null "
                "where session_id = $1::uuid",
                session_id,
            )
            await self._release_leases(conn, session_id)
            result = await self._session(conn, student_id, session_id)
            await self._remember(conn, student_id, request_id, endpoint, request_hash, result.model_dump(mode="json"))
            return result

    # ============================================================== нәтиже мен профиль

    async def result(self, student_id: str, session_id: str) -> SessionResult:
        async with self._pool.acquire() as conn:
            session = await self._session_row(conn, student_id, session_id)
            if session["status"] != "completed":
                raise ExaminerError(409, "SESSION_NOT_COMPLETED", "Сессия әлі аяқталған жоқ.")
            stored = await conn.fetchrow(
                "select p::float8 as p, part_d::float8 as part_d, part_a::float8 as part_a, "
                "mastered, is_final, x3_status, x3_rating_valid from examiner.session_results "
                "where session_id = $1::uuid",
                session_id,
            )
            items = await self._items(conn, session_id)
            profiles = await self._profiles(conn, student_id, book=session["book"])
        graded = [
            GradedItem(item["tier"], item["format"], item["block"], item["s"], is_final=bool(item["is_final"]))
            for item in items
        ]
        has_x3 = any(item.tier == "X3" for item in graded)
        score = level_score(session["level"], graded, x3_available=has_x3)
        composition = _loads(session["composition"])
        profile = profiles[0] if profiles else await self._empty_profile(session["book"])
        item_summaries = [
            ResultItemSummary(
                item_id=item["item_id"],
                position=item["position"],
                format=item["format"],
                score=int(item["s"] or 0),
                grade_status=item["grade_status"],
                appealable=bool(
                    item["format"] in AI_FORMATS or (item["format"] in HYBRID_FORMATS and item["grade_source"] != "code")
                ),
                appealed=item["appealed_at"] is not None,
            )
            for item in items
        ]
        return SessionResult(
            session_id=session_id,
            level=session["level"],
            scope=Scope.model_validate(composition["scope"]),
            p=stored["p"],
            threshold=THRESHOLDS[session["level"]],
            mastered=stored["mastered"],
            is_final=stored["is_final"],
            part_d=stored["part_d"],
            part_a=stored["part_a"],
            x3_rating_valid=bool(stored["x3_rating_valid"]),
            breakdown=[BreakdownRow(format=row.format, block=row.block, tasks=row.tasks, score=row.score, max=row.max)
                       for row in score.breakdown],
            total=Total(score=score.score, max=score.max),
            x3=X3Result(status=stored["x3_status"], reason=score.x3_reason),
            items=item_summaries,
            subject_profile=profile,
        )

    async def profile(self, student_id: str) -> StudentProfile:
        async with self._pool.acquire() as conn:
            return StudentProfile(subjects=await self._profiles(conn, student_id))

    async def _profiles(self, conn: Any, student_id: str, *, book: str | None = None) -> list[SubjectProfile]:
        rows = await conn.fetch(
            """
            select l.subject_id::text as subject_id, l.book, l.level::int as level, l.p::float8 as p, l.mastered,
                   l.is_final, l.taken_at, t.title as book_title, t.grade, s.name_kk
            from examiner.subject_level_latest l
            join corpus.textbooks t on t.book = l.book
            join corpus.subjects s on s.id = l.subject_id
            where l.student_id = $1::uuid and ($2::text is null or l.book = $2)
            order by s.sort_order nulls last, t.grade, l.level
            """,
            student_id, book,
        )
        grouped: dict[str, SubjectProfile] = {}
        for row in rows:
            profile = grouped.get(row["book"])
            if profile is None:
                profile = grouped[row["book"]] = SubjectProfile(
                    subject=SubjectInfo(id=row["subject_id"], title=row["name_kk"], grade=row["grade"],
                                        book=row["book"], book_title=row["book_title"]),
                    levels=[LevelResult(level=level, p=None, mastered=False, is_final=False, taken_at=None)
                            for level in (1, 2, 3, 4)],
                    f=None,
                    f_is_final=False,
                )
            profile.levels[row["level"] - 1] = LevelResult(
                level=row["level"], p=row["p"], mastered=row["mastered"], is_final=row["is_final"],
                taken_at=row["taken_at"])
        for profile in grouped.values():
            if all(level.p is not None for level in profile.levels):
                profile.f = round(sum(level.p or 0 for level in profile.levels) / 4, 2)
                profile.f_is_final = all(level.is_final for level in profile.levels)
        if book is not None and not grouped:
            return []
        return list(grouped.values())

    async def _empty_profile(self, book: str) -> SubjectProfile:
        row = await self._pool.fetchrow(
            """
            select t.subject_id::text as subject_id, t.title, t.grade, s.name_kk
            from corpus.textbooks t join corpus.subjects s on s.id = t.subject_id where t.book = $1
            """,
            book,
        )
        return SubjectProfile(
            subject=SubjectInfo(id=row["subject_id"], title=row["name_kk"], grade=row["grade"], book=book,
                                book_title=row["title"]),
            levels=[LevelResult(level=level, p=None, mastered=False, is_final=False, taken_at=None)
                    for level in (1, 2, 3, 4)],
            f=None,
            f_is_final=False,
        )

    # ============================================================== мұғалім кезегі (api §3.9)

    async def teacher_review_queue(
        self, teacher_id: str, *, class_id: str | None = None, limit: int = 50, offset: int = 0
    ) -> ReviewQueueResponse:
        async with self._pool.acquire() as conn:
            return await fetch_review_queue(conn, teacher_id, class_id=class_id, limit=limit, offset=offset)

    async def teacher_grade_detail(self, teacher_id: str, grade_id: str) -> TeacherGradeDetail:
        async with self._pool.acquire() as conn:
            return await fetch_grade_detail(conn, teacher_id, grade_id)

    async def teacher_confirm_grade(
        self, teacher_id: str, grade_id: str, request: ConfirmGradeRequest
    ) -> TeacherGradeActionResponse:
        async with self._pool.acquire() as conn, conn.transaction():
            return await confirm_grade(conn, teacher_id, grade_id, request)

    async def teacher_override_grade(
        self, teacher_id: str, grade_id: str, request: OverrideGradeRequest
    ) -> TeacherGradeActionResponse:
        async with self._pool.acquire() as conn, conn.transaction():
            return await override_grade(conn, teacher_id, grade_id, request)

    async def teacher_false_positive(
        self, teacher_id: str, alert_or_event_id: str, request: FalsePositiveRequest
    ) -> FalsePositiveResponse:
        async with self._pool.acquire() as conn, conn.transaction():
            return await mark_false_positive(conn, teacher_id, alert_or_event_id, request)
