"""Examiner сессиясының сервисі (api-kelisimderi.md §3; ai_examiner.md §5; bagalau §2.3–§4.3).

Күй өзгертетін әр әрекет бір транзакцияда жүреді және `request_log`-қа жазылады (api §2.3):
сол `client_request_id`-мен қайта келген сұранысқа бірінші жауап қайталанады.

Е1: сессия басталғанда X1 мен X2 тапсырмаларының бәрі бекітіледі (`exam_item_leases`, infinity),
сессия біткенде бекіту тағы T_tail = 2 сағат сақталады (D14). Е1 — басымдық (D65): алдымен бос сұрақ,
ол жетпесе ең ерте бекітілген сұрақ қайта беріледі (selection.py). Бос сұрақ `question_state` жолымен
`FOR UPDATE SKIP LOCKED` арқылы құлыпталады: қатар басталған екі сессия бір бос сұрақты ала алмайды.
Қайта берілетін сұрақ құлыпталмайды; оның нұсқалары сессияда жеке араластырылады (shuffle.py).
Е2: сұрақ оқушыға «көрілді» деп сессия басталғанда жазылады (тасталған сессияда да, D36). Е2 қатаң.
"""

from __future__ import annotations

import hashlib
import json
import random
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import asyncpg

from .composition import (
    AVAILABLE_LEVELS,
    FORMAT_TITLES,
    LAMBDA,
    LEVEL_TITLES,
    THRESHOLDS,
    Composition,
    Slot,
    build_composition,
    level_formats,
)
from .dto import (
    AbandonRequest,
    AnswerRequest,
    AnswerResult,
    Book,
    BreakdownRow,
    Chapter,
    ExamSession,
    LevelCard,
    LevelResult,
    LevelsResponse,
    Progress,
    Scope,
    ScopeCatalog,
    SessionItem,
    SessionResult,
    StartSessionRequest,
    StudentProfile,
    SubjectCatalogItem,
    SubjectInfo,
    SubjectProfile,
    Topic,
    Total,
    X3Result,
)
from .errors import ExaminerError, not_found, validation
from .grading import AnswerInvalid, check_answer
from .scoring import GradedItem, level_score, x3_eligible
from .selection import Candidate, Picker, level_availability, order_items
from .shuffle import shuffle_content

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


class ExaminerService:
    def __init__(self, pool: asyncpg.Pool, *, rng: random.Random | None = None) -> None:
        self._pool = pool
        self._rng = rng or random.SystemRandom()

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
        chapters: dict[str, Chapter] = {}  # § ретімен алғаш кездескен реті сақталады
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
                if level not in AVAILABLE_LEVELS:
                    formats = ["Таймерлі блок", "Сократтық диалог", "Фейнман"] if level == 3 else ["Басымдық", "Кейс"]
                    cards.append(LevelCard(
                        level=level, title=LEVEL_TITLES[level], formats=formats, tasks=0, minutes=25,
                        available=False, availability="unavailable",
                        note="Бұл деңгей ЖИ бағалауымен бірге ашылады.", last=previous,
                    ))
                    continue
                composition = build_composition(level, applicable)
                stock = await self._stock(conn, student_id, scope, level, level_formats(level, applicable))
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

    async def _stock(self, conn: Any, student_id: str, scope: ResolvedScope, level: int,
                     formats: Sequence[str]) -> dict[str, tuple[int, int]]:
        """Санат → (Е2-ден өткен сұрақ, оның ішінде бос сұрақ): деңгей картасының `availability`-і (D65)."""
        rows = await conn.fetch(
            """
            select s.x_tier::text as tier, count(*)::int as eligible,
                   (count(*) filter (where l.question_id is null))::int as free
            from examiner.questions q
            join examiner.question_state s on s.question_id = q.question_id
            left join examiner.exam_item_leases l on l.question_id = q.question_id and l.leased_until > now()
            left join examiner.student_item_exposure e on e.question_id = q.question_id and e.student_id = $1::uuid
            where q.subject_id = $2::uuid and q.level = $3::smallint and q.topic_id = any($4::text[])
              and q.format::text = any($5::text[]) and s.status = 'active'
              and (e.question_id is null
                   or e.last_seen_at < now() - make_interval(days => ceil(e.n * 1.204 / $6::float8)::int))
            group by 1
            """,
            student_id, scope.subject_id, level, list(scope.topics), list(formats), LAMBDA[level],
        )
        return {row["tier"]: (row["eligible"], row["free"]) for row in rows}

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
        """Сессия бітті: бекіту тағы T_tail сақталады. Қайта берілген сұрақты (D65) басқа белсенді сессия
        әлі ұстап тұрса, бекіту соған ауысады және шексіз қалады."""
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
            raise ExaminerError(409, "LEVEL_NOT_AVAILABLE", "Бұл деңгей ЖИ бағалауымен бірге ашылады.",
                                {"level": request.level})
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
                                              level_formats(request.level, applicable))
                    session_id = await self._create(conn, student_id, scope, composition, chosen)
                    session = await self._session(conn, student_id, session_id)
                    await self._remember(conn, student_id, request_id, "POST /sessions", request_hash,
                                         session.model_dump(mode="json"))
                    return session
            except asyncpg.UniqueViolationError as exc:
                # Қатар келген екі сұраныс: бірі сессияны ашты немесе сол id-ді жазды.
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

    async def _candidates(self, conn: Any, student_id: str, scope: ResolvedScope, level: int,
                          formats: Sequence[str], tiers: Sequence[str], exclude: Sequence[str] = ()) -> list[Candidate]:
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
        """Бос сұрақтарды құлыптайды; басқа сессия алып үлгерген немесе құлыптаған сұрақ қайтарылмайды."""
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

    async def _pick(self, conn: Any, student_id: str, scope: ResolvedScope, level: int, slots: list[Slot],
                    formats: Sequence[str]) -> list[tuple[Slot, Candidate]]:
        tiers = sorted({slot.tier for slot in slots})
        picker = Picker(await self._candidates(conn, student_id, scope, level, formats, tiers), formats, self._rng)
        chosen: list[Candidate | None] = [picker.take(slot) for slot in slots]
        accepted: set[str] = set()
        for _ in range(LOCK_ROUNDS):
            # Қайта берілетін сұрақ құлыпталмайды (D65); бос сұрақты басқа сессия алып үлгеруі мүмкін.
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
        await self._add_items(conn, student_id, session_id, [(slot.tier, c.question_id) for slot, c in chosen], 1)
        return session_id

    async def _add_items(self, conn: Any, student_id: str, session_id: str, items: Sequence[tuple[str, str]],
                         first_position: int) -> None:
        question_ids = [question_id for _, question_id in items]
        await conn.execute(
            """
            insert into examiner.session_items (session_id, question_id, position, tier, served_at)
            select $1::uuid, q, ($2::int + o - 1)::smallint, t, case when o = 1 then now() end
            from unnest($3::text[]::uuid[], $4::text[]) with ordinality as x(q, t, o)
            """,
            session_id, first_position, question_ids, [tier for tier, _ in items],
        )
        # Е1: сессия жүріп жатқанда бекіту шексіз (ai_examiner §5.2). Қайта берілген сұрақтың бекітуі осы
        # сессияға ауысады. Жолдар бір ретпен құлыпталуы үшін id сұрыпталады: қатар басталған екі сессия
        # бір қайта берілген сұрақты бекітсе, бірі екіншісін күтеді, бірақ deadlock болмайды.
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
        # Е2: сессияда берілген сұрақ «көрілді» (D36).
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
        async with self._pool.acquire() as conn, conn.transaction():
            await self._abandon_idle(conn, student_id)
            session_id = await conn.fetchval(
                "select session_id::text from examiner.sessions where student_id = $1::uuid "
                "and status in ('preparing', 'active', 'blocked')",
                student_id,
            )
            return await self._session(conn, student_id, session_id) if session_id else None

    async def get(self, student_id: str, session_id: str) -> ExamSession:
        async with self._pool.acquire() as conn, conn.transaction():
            await self._abandon_idle(conn, student_id)
            return await self._session(conn, student_id, session_id)

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
                   q.ecd_evidence, g.s::int as s
            from examiner.session_items i
            join examiner.questions q on q.question_id = i.question_id
            left join examiner.effective_grades g on g.item_id = i.item_id
            where i.session_id = $1::uuid
            order by i.position
            """,
            session_id,
        )

    async def _session(self, conn: Any, student_id: str, session_id: str) -> ExamSession:
        row = await self._session_row(conn, student_id, session_id)
        items = await self._items(conn, session_id)
        composition = _loads(row["composition"])
        open_items = [item for item in items if item["state"] == "open"]
        visible = row["status"] in ("active", "preparing")

        def dto(item: asyncpg.Record) -> SessionItem:
            # Кілт тек араластыру үшін оқылады (жауапты ашып қоятын реттен қашу), клиентке бармайды.
            key = (_loads(item["ecd_evidence"]) or {}).get("code_check_target") or {}
            content = shuffle_content(item["format"], _loads(item["question_content"]), key, item["item_id"])
            return SessionItem(
                item_id=item["item_id"], position=item["position"], tier=item["tier"], block=item["block"],
                format=item["format"], content=content, served_at=item["served_at"],
                deadline_at=item["deadline_at"], state=item["state"],
            )

        return ExamSession(
            session_id=row["session_id"], status=row["status"], level=row["level"],
            scope=Scope.model_validate(composition["scope"]),
            progress=Progress(answered=len(items) - len(open_items), total=len(items)),
            current=dto(open_items[0]) if visible and open_items else None,
            upcoming=[dto(item) for item in open_items[1:1 + PREFETCH] if item["block"] != "A"] if visible else [],
            strike_count=row["strike_count"], started_at=row["started_at"] or row["created_at"],
        )

    # ============================================================== жауап

    async def answer(self, student_id: str, session_id: str, item_id: str, request: AnswerRequest) -> AnswerResult:
        request_id = str(request.client_request_id)
        endpoint = f"POST /sessions/{session_id}/items/{item_id}/answer"
        request_hash = _hash(endpoint, request.answer)
        async with self._pool.acquire() as conn, conn.transaction():
            replay = await self._replay(conn, student_id, request_id, request_hash)
            if replay is not None:
                return AnswerResult.model_validate(replay)
            session = await self._session_row(conn, student_id, session_id, lock=True)
            self._require_active(session)
            item = await conn.fetchrow(
                """
                select i.item_id::text as item_id, i.state, i.tier::text as tier, i.position::int as position,
                       q.question_id::text as question_id, q.format::text as format, q.question_content,
                       q.ecd_evidence
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
            current = await conn.fetchval(
                "select min(position)::int from examiner.session_items where session_id = $1::uuid and state = 'open'",
                session_id,
            )
            if item["position"] != current:
                raise validation("Тапсырмалар ретімен беріледі: алдымен ағымдағы тапсырмаға жауап беріңіз.")
            key = _loads(item["ecd_evidence"]).get("code_check_target") or {}
            try:
                c = check_answer(item["format"], _loads(item["question_content"]), key, request.answer)
            except AnswerInvalid as exc:
                raise validation(str(exc)) from exc
            await conn.execute(
                """
                insert into examiner.answer_log (item_id, session_id, student_id, question_id, x_tier, answer, late,
                                                 c, s, grade_source, grade_status, graded_at)
                values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::jsonb, false, $7::smallint,
                        $8::smallint, 'code', 'final', now())
                """,
                item_id, session_id, student_id, item["question_id"], item["tier"],
                json.dumps(request.answer, ensure_ascii=False), c, 4 * c,
            )
            await conn.execute("update examiner.session_items set state = 'graded' where item_id = $1::uuid", item_id)
            await self._advance(conn, student_id, session)
            result = AnswerResult(
                item_id=item_id, check="correct" if c else "incorrect", late=False, explanation="none",
                moderation=None, session=await self._session(conn, student_id, session_id),
            )
            await self._remember(conn, student_id, request_id, endpoint, request_hash, result.model_dump(mode="json"))
            return result

    @staticmethod
    def _require_active(session: asyncpg.Record) -> None:
        if session["status"] == "blocked":
            raise ExaminerError(423, "SESSION_BLOCKED", "Сессия уақытша тоқтатылды. Мұғаліміңізге хабарласыңыз.")
        if session["status"] in ("completed", "abandoned"):
            raise ExaminerError(410, "SESSION_CLOSED", "Сессия аяқталған.")
        if session["status"] != "active":
            raise ExaminerError(409, "SESSION_NOT_ACTIVE", "Сессия әлі басталған жоқ.")

    async def _advance(self, conn: Any, student_id: str, session: asyncpg.Record) -> None:
        """Келесі тапсырманы береді; тапсырма қалмаса, X3 шартын тексереді немесе сессияны аяқтайды."""
        session_id = session["session_id"]
        served = await conn.fetchval(
            """
            update examiner.session_items set served_at = coalesce(served_at, now())
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
        graded = [GradedItem(item["tier"], item["format"], item["block"], item["s"]) for item in items]
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
            picker = Picker(await self._candidates(conn, student_id, scope, session["level"], formats, ["X3"]),
                            formats, self._rng)
            for _ in range(LOCK_ROUNDS):
                candidate = picker.take_any("X3")
                if candidate is None:
                    break
                if candidate.reused or await self._lock(conn, [candidate.question_id]):
                    await self._add_items(conn, student_id, session_id, [("X3", candidate.question_id)],
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
            insert into examiner.session_results (session_id, p, mastered, is_final, x3_status)
            values ($1::uuid, $2::numeric, $3, true, $4)
            """,
            session_id, score.p, score.mastered, score.x3_status,
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
                "select p::float8 as p, mastered, is_final, x3_status from examiner.session_results "
                "where session_id = $1::uuid",
                session_id,
            )
            items = await self._items(conn, session_id)
            profiles = await self._profiles(conn, student_id, book=session["book"])
        graded = [GradedItem(item["tier"], item["format"], item["block"], item["s"]) for item in items]
        has_x3 = any(item.tier == "X3" for item in graded)
        score = level_score(session["level"], graded, x3_available=has_x3)
        composition = _loads(session["composition"])
        profile = profiles[0] if profiles else await self._empty_profile(session["book"])
        return SessionResult(
            session_id=session_id, level=session["level"], scope=Scope.model_validate(composition["scope"]),
            p=stored["p"], threshold=THRESHOLDS[session["level"]], mastered=stored["mastered"],
            is_final=stored["is_final"],
            breakdown=[BreakdownRow(format=row.format, block=row.block, tasks=row.tasks, score=row.score, max=row.max)
                       for row in score.breakdown],
            total=Total(score=score.score, max=score.max),
            x3=X3Result(status=stored["x3_status"], reason=score.x3_reason),
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
                )
            profile.levels[row["level"] - 1] = LevelResult(
                level=row["level"], p=row["p"], mastered=row["mastered"], is_final=row["is_final"],
                taken_at=row["taken_at"])
        for profile in grouped.values():
            # F тек төрт деңгей түгел тапсырылғанда (bagalau §4.3).
            if all(level.p is not None for level in profile.levels):
                profile.f = round(sum(level.p or 0 for level in profile.levels) / 4, 2)
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
        )

