"""Tutor сервисі: диалог, екі шақыру контуры, бұғат және лимиттер (personarag §5–§7, api §4, D70, D86–D88).

Хабарламаның жолы (бір оқу қадамы — 5 SQL statement, бәрі queries.py-да):
  1. INTAKE: диалог иесі, қайталанған сұраныс, бұғат, лимиттер, тарих; рұқсат болса, екі хабарлама жазылады.
  0. Үміткерлер n1…n8: мәтінде аты аталған түйіндер (aliases.py, жадтағы кэш) + entity векторлары + алдыңғы
     фокус. Іздеу режимі хабарламаға қарай: қысқа жауапта алдыңғы фокус сақталса не «не үйрендік?» болса —
     эмбеддинг те, векторлық іздеу де жоқ; атау табылса — тек оқушы мәтінінің векторы (D87, D88). CANDIDATES.
  1. Тег қою (кіші модель, Structured Outputs). Онымен қатар GRAPH: үміткерлердің графы мен оқушы күйі.
  2. Кіріс қақпасы (§6, PROMPT_INJECTION қоса) және маршрут (§5) — таза Python (engine.py), БД-сыз.
  3. Контекст: NODE_CHUNKS (кілт сөз басымдығымен) не DIGEST. EMPATHY, INJECTION, META-да оқулық жоқ.
  4. Жауап — stream; жеңіл сценарийлер арзан модельге (`light`). Ағын біткен соң FINALIZE: ағаш
     (compare-and-swap), диалог күйі, жауап және токен лимиті бір statement-те (§3.5): жауап үзілсе, ағаш
     өзгермейді, ал сол client_request_id-мен қайталау қайта есептейді.
Клиент байланысты үзсе де, жауап фондық тапсырмада аяғына дейін жазылады (api §2.5).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import os
import re
import uuid
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any

import asyncpg

from ..llm_gateway import (
    LLMGateway,
    LLMRequestError,
    LLMStreamInterrupted,
    LLMUnavailableError,
    Task,
    get_gateway,
)
from . import engine as E
from . import queries as Q
from . import retrieval as R
from .aliases import AliasCache, is_short_reply, mentions
from .dto import BlockState, Conversation, MessagesPage, SendMessageRequest, TutorMessage, TutorSubject
from .errors import TutorError, not_found
from .prompts import (
    BLOCKED_TEXT,
    NO_TEXTBOOK_SCENARIOS,
    REPLY_PROMPT_REF,
    SAFETY_TEXT,
    NodeLine,
    build_reply_messages,
    reply_variant,
    suggestions_for,
)
from .tags import TAGS_PROMPT_REF, Candidate, TagSchema, apply_help_guard, build_tags_messages, tags_meta, to_tags

logger = logging.getLogger("bilim.tutor")

CONVERSATION_MESSAGES = 30
RATE_LIMIT_PER_MINUTE = 6
COOLDOWN = timedelta(minutes=30)
SECOND_ALERT_WINDOW = timedelta(hours=24)
EPISODIC_K = 4           # жауап промптына соңғы 4 хабарлама (тьютордікі қысқартылып, D88)
HISTORY_ROWS = 6         # тьютордың соңғы сұрағын табу үшін сәл көбірек
PENDING_WAIT_S = 90.0
CHARS_PER_TOKEN = 2.5
DEFAULT_DAILY_TOKENS = 200_000
ALERT_CATEGORIES = frozenset({"TOXIC", "TROLLING", "PROFANITY", "AGGRESSION"})
TUTOR_TAIL_CHARS = 500
STUDENT_VECTOR_NODES = 3
JOINT_VECTOR_NODES = 3
# «Не үйрендім / үйрендік?» — бірінші жақтағы қорытынды сұрауы. «Абылай не үйренді?» сияқты тақырып сұрағы кірмейді.
_META_RE = re.compile(r"не\s+(?:үйрендім|үйрендік|білдім|білдік|өттік)|қорытындыла", re.IGNORECASE)


def _sse(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _loads(value: Any) -> Any:
    return json.loads(value) if isinstance(value, str) else (value or {})


def _rows(value: Any) -> list[Any]:
    return json.loads(value) if isinstance(value, str) else list(value or [])


def _int(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def daily_token_limit() -> int:
    try:
        return max(1, int(os.getenv("TUTOR_DAILY_TOKEN_LIMIT", str(DEFAULT_DAILY_TOKENS))))
    except ValueError:
        return DEFAULT_DAILY_TOKENS


def _message(row: Any) -> TutorMessage:
    return TutorMessage(
        message_id=str(row["message_id"]), role=row["role"], text=row["text"], created_at=row["created_at"]
    )


@dataclass
class TurnPlan:
    """2-қадамның нәтижесі: жауап промптына керектің бәрі және ағаш жаңартуының кірісі."""

    scenario: str
    style: str
    gate: str = "NONE"
    status: str | None = None
    focal: int | None = None
    parent: int | None = None
    bridge: int | None = None
    tag_bridge: int | None = None
    paste_suspect: bool = False
    update_focal: bool = False
    nodes: list[NodeLine] = field(default_factory=list)
    chunk_entities: list[str] = field(default_factory=list)
    digest: str | None = None
    notes: list[str] = field(default_factory=list)
    next_state: dict[str, Any] = field(default_factory=dict)


@dataclass
class _Usage:
    """Тәуліктік лимитке жазылатын токен (толық бағамен есептелетіні: кэштен өткен префикс кірмейді)."""

    tokens: int = 0
    recorded: bool = False


@dataclass
class _Turn:
    """INTAKE-тен кейінгі бір қадамның кірісі."""

    student_id: str
    conversation_id: str
    state: dict[str, Any]
    text: str
    history: list[dict[str, Any]]
    lengths: list[int]
    student_message_id: str
    tutor_message_id: str


class TutorService:
    def __init__(
        self,
        pool: asyncpg.Pool,
        *,
        gateway: LLMGateway | None = None,
        clock=None,
        aliases: AliasCache | None = None,
    ) -> None:
        self._pool = pool
        self._gateway_instance = gateway
        self._clock = clock or (lambda: datetime.now(UTC))
        self._bg_tasks: set[asyncio.Task[Any]] = set()
        self._aliases = aliases or AliasCache(self._load_aliases)

    async def _load_aliases(self) -> list[tuple[str, int]]:
        async with self._pool.acquire() as conn:
            return await R.alias_rows(conn)

    async def warm(self) -> None:
        """Іске қосылғанда фонда: атаулар индексі бірінші хабарламаны күттірмейді (D88)."""
        await self._aliases.warm()

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
        await self._aliases.close()

    # ============================================================== каталог және диалог

    async def subjects(self) -> list[TutorSubject]:
        rows = await self._pool.fetch(
            """
            select t.subject_id::text as id, s.name_kk as title, min(t.grade)::int as grade
            from corpus.textbooks t
            join corpus.subjects s on s.id = t.subject_id
            where exists (select 1 from tutor.tutor_nodes n where n.book = t.book and n.is_learnable)
            group by t.subject_id, s.name_kk, s.sort_order
            order by s.sort_order nulls last, s.name_kk
            """
        )
        return [TutorSubject(id=r["id"], title=r["title"], grade=r["grade"]) for r in rows]

    async def current_conversation(self, student_id: str, subject_id: str) -> Conversation:
        subject = next((s for s in await self.subjects() if s.id == subject_id), None)
        if subject is None:
            raise not_found()
        async with self._pool.acquire() as conn:
            await conn.execute(
                "insert into tutor.conversations (student_id, subject_id) values ($1::uuid, $2::uuid) "
                "on conflict (student_id, subject_id) do nothing",
                student_id, subject_id,
            )
            conv_id = await conn.fetchval(
                "select conversation_id::text from tutor.conversations where student_id = $1::uuid and subject_id = $2::uuid",
                student_id, subject_id,
            )
            rows = await conn.fetch(
                """
                select message_id, role, text, created_at from tutor.messages
                where conversation_id = $1::uuid and status = 'complete'
                order by created_at desc, role desc limit $2
                """,
                conv_id, CONVERSATION_MESSAGES,
            )
            until, reason = await self._block(conn, student_id)
        return Conversation(
            conversation_id=conv_id,
            subject=subject,
            messages=[_message(r) for r in reversed(rows)],
            blocked_until=until,
            blocked_reason=reason,
        )

    async def messages(self, student_id: str, conversation_id: str, before: str | None, limit: int) -> MessagesPage:
        async with self._pool.acquire() as conn:
            await self._conversation(conn, student_id, conversation_id)
            anchor = None
            if before:
                anchor = await conn.fetchval(
                    "select created_at from tutor.messages where message_id = $1::uuid and conversation_id = $2::uuid",
                    before, conversation_id,
                )
                if anchor is None:
                    raise not_found()
            rows = await conn.fetch(
                """
                select message_id, role, text, created_at from tutor.messages
                where conversation_id = $1::uuid and status = 'complete'
                  and ($2::timestamptz is null or created_at < $2::timestamptz)
                order by created_at desc, role desc limit $3
                """,
                conversation_id, anchor, limit + 1,
            )
        has_more = len(rows) > limit
        return MessagesPage(messages=[_message(r) for r in reversed(rows[:limit])], has_more=has_more)

    async def _conversation(self, conn: Any, student_id: str, conversation_id: str) -> Any:
        row = await conn.fetchrow(
            "select conversation_id::text as conversation_id, subject_id::text as subject_id, state "
            "from tutor.conversations where conversation_id = $1::uuid and student_id = $2::uuid",
            conversation_id, student_id,
        )
        if row is None:
            raise not_found()
        return row

    # ============================================================== бұғат (§6.3, D70)

    async def _block(self, conn: Any, student_id: str) -> tuple[datetime | None, str | None]:
        row = await conn.fetchrow(
            "select blocked_until, blocked_reason from tutor.student_blocks where student_id = $1::uuid", student_id
        )
        if row is None or row["blocked_reason"] is None:
            return None, None
        if row["blocked_reason"] == "cooldown" and row["blocked_until"] <= self._clock():
            return None, None  # таймер бітті: диалог өзі ашылады
        return row["blocked_until"], row["blocked_reason"]

    @staticmethod
    def _raise_blocked(intake: Any) -> None:
        if not intake["blocked"]:
            return
        until, reason = intake["blocked_until"], intake["blocked_reason"]
        raise TutorError(
            423, "TUTOR_BLOCKED", BLOCKED_TEXT[reason],
            {"blocked_until": until.isoformat() if until else None, "blocked_reason": reason},
        )

    @staticmethod
    def _raise_limits(intake: Any, now: datetime) -> None:
        if intake["rate_limited"]:
            first = intake["rate_first_at"]
            wait = 60 - int((now - first).total_seconds()) if first is not None else 60
            raise TutorError(429, "RATE_LIMITED", "Тым жиі жазып жатырсың. Сәл күте тұр.", retry_after=max(1, wait))
        if intake["over_budget"]:
            tomorrow = datetime.combine(now.date() + timedelta(days=1), datetime.min.time(), tzinfo=UTC)
            raise TutorError(
                429, "RATE_LIMITED", "Бүгінгі тьютор лимиті бітті. Ертең қайта жалғастырайық.",
                {"limit": "daily_tokens"}, retry_after=max(60, int((tomorrow - now).total_seconds())),
            )

    async def _hard_alert(
        self, *, turn: _Turn, parsed: TagSchema, category: str, gate: E.Gate, usage: _Usage
    ) -> tuple[datetime | None, str, str]:
        """Дабыл (ALERT) + бұғат, журнал, тұрақты жауап, токен (BLOCK). Дабыл жазылмаса да бұғат сақталады:
        оқушының қауіпсіздігі бірінші (ortaq §5)."""
        now = self._clock()
        alert_id: str | None = str(uuid.uuid4())
        async with self._pool.acquire() as conn:
            try:
                await conn.execute(
                    Q.ALERT, alert_id, turn.student_id, category if category in ALERT_CATEGORIES else "TOXIC",
                    turn.text[:4000],
                    json.dumps({"conversation_id": turn.conversation_id, "message_id": turn.student_message_id}),
                )
            except asyncpg.PostgresError as exc:
                logger.warning("tutor security alert was not written: %s", type(exc).__name__)
                alert_id = None
            row = await conn.fetchrow(
                Q.BLOCK, turn.student_id, now - SECOND_ALERT_WINDOW, now + COOLDOWN, category, alert_id,
                turn.student_message_id, turn.tutor_message_id, SAFETY_TEXT["cooldown"], SAFETY_TEXT["teacher"],
                json.dumps({"gate": gate.value, "tags": tags_meta(parsed)}, ensure_ascii=False), now.date(),
                usage.tokens,
            )
        usage.recorded = True
        return row["blocked_until"], row["reason"], row["text"]

    # ============================================================== мұғалім (api §4.1)

    async def _require_teacher_link(self, conn: Any, teacher_id: str, student_id: str) -> None:
        linked = await conn.fetchval(
            """
            select exists (
              select 1 from public.class_members m join public.classes c on c.class_id = m.class_id
              where c.teacher_id = $1::uuid and m.student_id = $2::uuid
            )
            """,
            teacher_id, student_id,
        )
        if not linked:
            raise not_found()

    async def teacher_block_state(self, teacher_id: str, student_id: str) -> BlockState:
        async with self._pool.acquire() as conn:
            await self._require_teacher_link(conn, teacher_id, student_id)
            until, reason = await self._block(conn, student_id)
        return BlockState(student_id=student_id, blocked_until=until, blocked_reason=reason)

    async def teacher_set_block(self, teacher_id: str, student_id: str, *, lock: bool) -> BlockState:
        async with self._pool.acquire() as conn:
            await self._require_teacher_link(conn, teacher_id, student_id)
            async with conn.transaction():
                await conn.execute(
                    """
                    insert into tutor.student_blocks (student_id, blocked_until, blocked_reason, updated_at, updated_by)
                    values ($1::uuid, null, $2, now(), $3::uuid)
                    on conflict (student_id) do update set
                      blocked_until = null, blocked_reason = excluded.blocked_reason,
                      updated_at = now(), updated_by = excluded.updated_by
                    """,
                    student_id, "teacher" if lock else None, teacher_id,
                )
                await conn.execute(
                    "insert into tutor.safety_events (student_id, action, actor_id) values ($1::uuid, $2, $3::uuid)",
                    student_id, "lock" if lock else "unblock", teacher_id,
                )
            until, reason = await self._block(conn, student_id)
        return BlockState(student_id=student_id, blocked_until=until, blocked_reason=reason)

    # ============================================================== лимит (сәтсіз қадамның токені)

    async def _add_tokens(self, student_id: str, tokens: int, day: date) -> None:
        if tokens <= 0:
            return
        try:
            await self._pool.execute(
                """
                insert into tutor.token_usage (student_id, day, tokens) values ($1::uuid, $2, $3)
                on conflict (student_id, day) do update set tokens = tutor.token_usage.tokens + excluded.tokens
                """,
                student_id, day, tokens,
            )
        except asyncpg.PostgresError as exc:
            logger.warning("tutor token usage was not recorded: %s", type(exc).__name__)

    # ============================================================== хабарлама (SSE)

    async def send(self, student_id: str, conversation_id: str, request: SendMessageRequest) -> AsyncIterator[str]:
        text = request.text.strip()
        if not text:
            raise TutorError(400, "VALIDATION_ERROR", "Хабарлама бос.", {"fields": ["text"]})
        request_id = str(request.client_request_id)
        request_hash = _hash(text)
        now = self._clock()

        async with self._pool.acquire() as conn:
            intake = await conn.fetchrow(
                Q.INTAKE, conversation_id, student_id, text, request_id, request_hash, now, now.date(),
                now - timedelta(seconds=60), RATE_LIMIT_PER_MINUTE, daily_token_limit(), HISTORY_ROWS,
            )
            if not intake["conv_ok"]:
                raise not_found()
            if intake["has_prior"]:
                return await self._resume(conn, intake, student_id, conversation_id, text, request_hash)
        self._raise_blocked(intake)
        self._raise_limits(intake, now)
        return self._start(_Turn(
            student_id=student_id, conversation_id=conversation_id, state=_loads(intake["state"]), text=text,
            history=_rows(intake["history"]), lengths=[int(n) for n in _rows(intake["lengths"])],
            student_message_id=intake["student_message_id"], tutor_message_id=intake["tutor_message_id"],
        ))

    async def _resume(
        self, conn: Any, intake: Any, student_id: str, conversation_id: str, text: str, request_hash: str
    ) -> AsyncIterator[str]:
        """Сол client_request_id қайта келді (сирек жол): дайын жауапты қайталау, генерацияны күту не қайта жасау."""
        if intake["prior_hash"] != request_hash:
            raise TutorError(409, "DUPLICATE_REQUEST", "Бұл сұраныс id-і басқа мәтінмен жіберілген.")
        student_message_id = intake["prior_id"]
        reply = await conn.fetchrow(
            "/* tutor:reply_of */ select message_id::text as message_id, text, status, meta from tutor.messages "
            "where reply_to = $1::uuid and role = 'tutor'",
            student_message_id,
        )
        if reply is not None and reply["status"] == "complete":
            return self._replay(reply)
        if reply is not None and reply["status"] == "pending":
            return self._await_pending(reply["message_id"])
        self._raise_blocked(intake)
        if reply is not None:
            await conn.execute(
                "update tutor.messages set status = 'pending', text = '', meta = '{}'::jsonb, created_at = now() "
                "where message_id = $1::uuid",
                reply["message_id"],
            )
            tutor_message_id = reply["message_id"]
        else:
            tutor_message_id = await conn.fetchval(
                """
                insert into tutor.messages (conversation_id, student_id, role, text, status, reply_to)
                values ($1::uuid, $2::uuid, 'tutor', '', 'pending', $3::uuid)
                returning message_id::text
                """,
                conversation_id, student_id, student_message_id,
            )
        history = await conn.fetch(
            """
            select role, text from tutor.messages
            where conversation_id = $1::uuid and status = 'complete' and message_id <> $2::uuid
            order by created_at desc, role desc limit $3
            """,
            conversation_id, student_message_id, HISTORY_ROWS,
        )
        lengths = await conn.fetch(
            "select char_length(text) as n from tutor.messages where conversation_id = $1::uuid "
            "and role = 'student' and message_id <> $2::uuid order by created_at desc limit 10",
            conversation_id, student_message_id,
        )
        return self._start(_Turn(
            student_id=student_id, conversation_id=conversation_id, state=_loads(intake["state"]), text=text,
            history=[{"role": r["role"], "text": r["text"]} for r in reversed(history)],
            lengths=[int(r["n"]) for r in lengths],
            student_message_id=student_message_id, tutor_message_id=tutor_message_id,
        ))

    def _start(self, turn: _Turn) -> AsyncIterator[str]:
        queue: asyncio.Queue[tuple[str, dict[str, Any]] | None] = asyncio.Queue()
        self._spawn(self._produce(queue, turn))

        async def _stream() -> AsyncIterator[str]:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield _sse(*event)

        return _stream()

    def _replay(self, reply: Any) -> AsyncIterator[str]:
        meta = _loads(reply["meta"])

        async def _gen() -> AsyncIterator[str]:
            blocked = meta.get("blocked")
            if blocked:
                yield _sse("blocked", {**blocked, "message": reply["text"]})
                return
            if reply["text"]:
                yield _sse("token", {"text": reply["text"]})
            yield _sse("done", {"message_id": reply["message_id"], "suggestions": meta.get("suggestions", [])})

        return _gen()

    def _await_pending(self, tutor_message_id: str) -> AsyncIterator[str]:
        """Сол сұраныс әлі генерацияланып жатыр (басқа вкладка не үзілген байланыс): бітуін күтеміз."""

        async def _gen() -> AsyncIterator[str]:
            loop = asyncio.get_running_loop()
            deadline = loop.time() + PENDING_WAIT_S
            while loop.time() < deadline:
                row = await self._pool.fetchrow(
                    "select message_id::text as message_id, text, status, meta from tutor.messages "
                    "where message_id = $1::uuid",
                    tutor_message_id,
                )
                if row is None or row["status"] == "failed":
                    break
                if row["status"] == "complete":
                    async for chunk in self._replay(row):
                        yield chunk
                    return
                await asyncio.sleep(0.5)
            yield _sse("error", {"code": "SERVICE_UNAVAILABLE", "message": "Жауап дайын болмады. Қайталап көр."})

        return _gen()

    async def _produce(self, queue: asyncio.Queue[tuple[str, dict[str, Any]] | None], turn: _Turn) -> None:
        usage = _Usage()
        day = self._clock().date()
        try:
            await self._turn(queue, turn, usage)
        except (LLMUnavailableError, LLMRequestError, LLMStreamInterrupted) as exc:
            logger.warning("tutor turn failed: %s", type(exc).__name__)
            await self._mark_failed(turn.tutor_message_id)
            await queue.put(("error", {"code": "SERVICE_UNAVAILABLE",
                                       "message": "Тьютор уақытша жауап бере алмады. Қайталап көр."}))
        except Exception as exc:  # noqa: BLE001
            logger.exception("tutor turn unexpected failure: %s", type(exc).__name__)
            await self._mark_failed(turn.tutor_message_id)
            await queue.put(("error", {"code": "INTERNAL_ERROR", "message": "Тьютор жауабында қате шықты."}))
        finally:
            if not usage.recorded:
                await self._add_tokens(turn.student_id, usage.tokens, day)
            await queue.put(None)

    async def _mark_failed(self, tutor_message_id: str) -> None:
        try:
            await self._pool.execute(
                "update tutor.messages set status = 'failed' where message_id = $1::uuid and status = 'pending'",
                tutor_message_id,
            )
        except asyncpg.PostgresError:
            pass

    # ============================================================== бір қадам

    async def _turn(self, queue: asyncio.Queue[tuple[str, dict[str, Any]] | None], turn: _Turn, usage: _Usage) -> None:
        gw = self._gateway()
        now = self._clock()
        text = turn.text
        state = turn.state
        prev_focus = _int(state.get("focus"))
        active_bridge = _int(state.get("bridge"))
        recent_styles = tuple(state.get("styles") or ())
        unanswered = int(state.get("unanswered") or 0)
        prev_candidates = [i for i in (state.get("candidates") or []) if _int(i) is not None]
        tutor_last = next((h["text"] for h in reversed(turn.history) if h["role"] == "tutor"), "")
        episodic = [(h["role"], h["text"]) for h in turn.history[-EPISODIC_K:]]

        # 0-қадам: үміткерлер. Реті: мәтінде аты аталған түйіндер → оқушы мәтінінің векторы → алдыңғы фокус пен
        # көпір → (қысқа жауапта) алдыңғы үміткерлер → біріккен вектор (§7.1) → алдыңғы фокустың алғышарттары.
        index = await self._aliases.get()
        lexical = [m.node_id for m in index.match(text)] if index is not None else []
        meta_like = bool(_META_RE.search(text))
        short = is_short_reply(text) and not lexical
        if meta_like or (short and prev_focus is not None):
            mode = "none"      # эмбеддинг те, векторлық іздеу де жоқ (D88)
        elif short:
            mode = "joint"     # тек тьютордың сұрағымен біріккен вектор (D87)
        elif lexical:
            mode = "student"   # атау табылды: екінші векторлық іздеу артық (D88)
        else:
            mode = "both"
        vectors, chunk_vector = await self._vectors(gw, text, tutor_last, mode)
        kept = prev_candidates if short else []
        cdata = R.CandidateData()
        if not meta_like:
            async with self._pool.acquire() as conn:
                cdata = await R.candidates(
                    conn, [v for _, v in vectors], chunk_vector=chunk_vector,
                    explicit_ids=[*lexical, prev_focus, active_bridge, *kept], prev_focus=prev_focus,
                )
        kinds = [k for k, _ in vectors]
        by_student = cdata.ranked.get(kinds.index("student") + 1, []) if "student" in kinds else []
        by_joint = cdata.ranked.get(kinds.index("joint") + 1, []) if "joint" in kinds else []
        order = [
            *lexical, *by_student[:STUDENT_VECTOR_NODES], prev_focus, active_bridge, *kept,
            *by_joint[:JOINT_VECTOR_NODES], *cdata.prev_prereqs[:2],
            *by_student[STUDENT_VECTOR_NODES:], *by_joint[JOINT_VECTOR_NODES:],
        ]
        ordered: list[int] = []
        for node_id in order:
            if node_id in cdata.nodes and node_id not in ordered:
                ordered.append(node_id)
        ordered = ordered[: R.MAX_CANDIDATES]
        info: dict[int, R.NodeInfo] = {i: cdata.nodes[i] for i in ordered}
        candidates = [
            Candidate(f"n{k + 1}", n.node_id, n.name, n.entity_type, n.grade, n.paragraph_no)
            for k, n in enumerate(info.values())
        ]
        alias_to_node = {c.alias: c.node_id for c in candidates}

        # 1-қадам: тег, онымен қатар граф пен оқушы күйі (бір барып-қайту, тег уақытының ішінде).
        graph_task = asyncio.create_task(self._graph(turn.student_id, ordered))
        try:
            result = await gw.complete(
                Task.TUTOR_TAGS, TAGS_PROMPT_REF, build_tags_messages(candidates, tutor_last, text), schema=TagSchema
            )
        except BaseException:
            await asyncio.gather(graph_task, return_exceptions=True)  # сұрауды үзбейміз: қосылым таза қалады
            raise
        usage.tokens += max(0, result.input_tokens - result.cached_tokens) + result.output_tokens
        parsed = result.parsed if isinstance(result.parsed, TagSchema) else TagSchema.model_validate_json(result.text)
        tags = apply_help_guard(to_tags(parsed, alias_to_node), text, tutor_asked="?" in tutor_last[-300:])
        graph = await graph_task

        # 2-қадам: кіріс қақпасы.
        gate = E.gate(tags)
        if gate is E.Gate.HARD_ALERT:
            until, reason, reply_text = await self._hard_alert(
                turn=turn, parsed=parsed, category=tags.toxicity_category, gate=gate, usage=usage
            )
            blocked = {"blocked_until": until.isoformat() if until else None, "blocked_reason": reason}
            await queue.put(("blocked", {**blocked, "message": reply_text}))
            return

        plan = await self._plan(
            student_id=turn.student_id, tags=tags, gate=gate, info=info, candidates=candidates, graph=graph,
            now=now, prev_focus=prev_focus, recent_styles=recent_styles, unanswered=unanswered, text=text,
            lengths=turn.lengths,
        )

        # 3-қадам: контекст. 1-қадамның кілт сөздері — сүзгі емес, басымдық (D87).
        chunks: list[str] = []
        if plan.scenario not in NO_TEXTBOOK_SCENARIOS:
            terms = R.keyword_terms(parsed.hl_keywords, parsed.ll_keywords)
            # Аты аталған ұғымдар мен алдыңғы фокустың чанктары да кілт сөз бойынша таңдалады (D87).
            extra_entities = [e for i in [*lexical, prev_focus] if i in info for e in info[i].entity_ids]
            node_chunk_rows: list[tuple[str, str, int]] = []
            if plan.chunk_entities or extra_entities:
                async with self._pool.acquire() as conn:
                    node_chunk_rows = await R.node_chunks(
                        conn, plan.chunk_entities, terms, extra_entity_ids=extra_entities[:40]
                    )
            chunks = R.compose_chunks(node_chunk_rows, cdata.chunks, terms)

        # 4-қадам: жауап ағыны. Жеңіл сценарийлер — арзан модель (D88).
        variant = reply_variant(plan.scenario)
        messages = build_reply_messages(
            scenario=plan.scenario, style=plan.style, nodes=plan.nodes, chunks=chunks, episodic=episodic,
            student_text=text, digest=plan.digest, notes=plan.notes,
        )
        parts: list[str] = []
        started = False
        async for piece in gw.stream(Task.TUTOR_REPLY, REPLY_PROMPT_REF, messages, variant=variant):
            if not piece:
                continue
            if not started:
                piece = piece.lstrip()
                if not piece:
                    continue
                started = True
            parts.append(piece)
            await queue.put(("token", {"text": piece}))
        reply_text = "".join(parts).rstrip() or "…"
        # Жүйелік промпт тұрақты әрі кэштен өтеді: лимитке тек өзгеретін бөлігі мен жауап жазылады.
        dynamic_chars = sum(len(m.content) for m in messages if m.role != "system")
        usage.tokens += math.ceil((dynamic_chars + len(reply_text)) / CHARS_PER_TOKEN)

        next_state = self._settle_focus(plan, info, reply_text)
        next_state["candidates"] = ordered
        suggestions = suggestions_for(plan.scenario)
        rows, report = self._compute_updates(tags, plan, graph.states, now)
        meta = {
            "gate": plan.gate, "scenario": plan.scenario, "style": plan.style, "status": plan.status,
            "focal": plan.focal, "parent": plan.parent, "bridge": plan.bridge, "paste_suspect": plan.paste_suspect,
            "tags": tags_meta(parsed), "suggestions": suggestions, "mastery": report,
            "candidates": [c.name for c in candidates], "lexical": lexical, "search": mode, "chunks": len(chunks),
            "variant": variant or "default",
            "prompt_versions": {"tags": TAGS_PROMPT_REF.version, "reply": REPLY_PROMPT_REF.version},
        }
        async with self._pool.acquire() as conn:
            ok = await self._finalize(conn, turn, rows, next_state, reply_text, meta, now.date(), usage.tokens)
        usage.recorded = True
        if not ok:
            await self._slow_finalize(turn, tags, plan, next_state, reply_text, meta, now)
        await queue.put(("done", {"message_id": turn.tutor_message_id, "suggestions": suggestions}))

    async def _vectors(
        self, gw: LLMGateway, text: str, tutor_last: str, mode: str
    ) -> tuple[list[tuple[str, list[float]]], int]:
        """Бір эмбеддинг шақыруы: `student` — оқушы мәтінінің өзі, `joint` — тьютордың соңғы сұрағымен бірге (§7.1).
        Қайтарады: [(түрі, вектор)] және чанк ізделетін вектордың реті (1-ден; біріккені болса — сол)."""
        if mode == "none":
            return [], 0
        tail = tutor_last.strip()[-TUTOR_TAIL_CHARS:]
        joint_text = f"{tail}\n{text}" if tail else text
        if mode == "joint":
            inputs = [("joint", joint_text)]
        elif mode == "student":
            inputs = [("student", text)]
        else:
            inputs = [("student", text)] + ([("joint", joint_text)] if tail else [])
        try:
            vectors = await gw.embed([t for _, t in inputs], model_key="corpus")
        except (LLMUnavailableError, LLMRequestError, ValueError) as exc:
            logger.warning("tutor embedding failed: %s", type(exc).__name__)
            return [], 0
        pairs = [(kind, vec) for (kind, _), vec in zip(inputs, vectors)]
        kinds = [k for k, _ in pairs]
        return pairs, (kinds.index("joint") + 1 if "joint" in kinds else 1) if pairs else 0

    async def _graph(self, student_id: str, node_ids: list[int]) -> R.GraphData:
        if not node_ids:
            return R.GraphData()
        async with self._pool.acquire() as conn:
            return await R.graph(conn, student_id, node_ids)

    @staticmethod
    def _settle_focus(plan: TurnPlan, info: dict[int, R.NodeInfo], reply_text: str) -> dict[str, Any]:
        """Келесі фокус (D87): 5, 6А, 9-сценарийлерде фокус аталық не көпір түйінге ауысады, бірақ тек жауап
        шынымен сол ұғымға бұрылса. textbook_order алғышарттары әлі тексерілмеген, сондықтан жауапта аталмаған
        аталыққа көшу диалогты бөтен тақырыпқа апарады («Абылай хан» → «Ресей»)."""
        state = dict(plan.next_state)
        if plan.parent is not None and state.get("focus") == plan.parent:
            parent = info.get(plan.parent)
            if parent is None or not mentions(reply_text, parent.name):
                state["focus"] = plan.focal
        if plan.bridge is not None and state.get("bridge") == plan.bridge:
            bridge = info.get(plan.bridge)
            if bridge is None or not mentions(reply_text, bridge.name):
                state["bridge"] = None
        return state

    # ============================================================== ағашты жазу (§3.5)

    @staticmethod
    def _compute_updates(
        tags: E.Tags, plan: TurnPlan, states: dict[int, E.NodeState], now: datetime
    ) -> tuple[list[tuple[int, E.NodeState, datetime | None]], dict[str, Any]]:
        """Жаңа күйлер: (node_id, жаңа күй, күтілетін last_interaction — compare-and-swap үшін)."""
        if plan.focal is None or plan.gate != "NONE":
            return [], {}
        rows: list[tuple[int, E.NodeState, datetime | None]] = []
        report: dict[str, Any] = {}
        if plan.update_focal:
            before = states.get(plan.focal)
            after = E.update_node(before, tags, now=now, paste_suspect=plan.paste_suspect)
            if after is not None:
                rows.append((plan.focal, after, before.last_interaction if before else None))
            report["focal"] = {
                "before": round(E.effective_mastery(before, now), 4) if before else None,
                "after": after.mastery if after else None,
            }
        if plan.tag_bridge and plan.tag_bridge != plan.focal:
            before = states.get(plan.tag_bridge)
            after = E.update_node(before, tags, now=now, weight=E.W_BRIDGE, paste_suspect=plan.paste_suspect)
            if after is not None:
                rows.append((plan.tag_bridge, after, before.last_interaction if before else None))
            report["bridge"] = {"after": after.mastery if after else None}
        return rows, report

    @staticmethod
    async def _finalize(
        conn: Any, turn: _Turn, rows: Sequence[tuple[int, E.NodeState, datetime | None]],
        next_state: dict[str, Any], reply_text: str, meta: dict[str, Any], day: date, tokens: int,
    ) -> bool:
        row = await conn.fetchrow(
            Q.FINALIZE, turn.student_id,
            [r[0] for r in rows], [r[1].mastery for r in rows], [r[1].bloom_level for r in rows],
            [r[1].review_count for r in rows], [r[1].fail_streak for r in rows], [r[1].error_type for r in rows],
            [r[1].last_interaction for r in rows], [r[2] for r in rows],
            turn.conversation_id, json.dumps(next_state), turn.tutor_message_id, reply_text[:8000],
            json.dumps(meta, ensure_ascii=False, default=str), day, tokens,
        )
        return bool(row["ok"])

    async def _slow_finalize(
        self, turn: _Turn, tags: E.Tags, plan: TurnPlan, next_state: dict[str, Any], reply_text: str,
        meta: dict[str, Any], now: datetime,
    ) -> None:
        """Compare-and-swap сәтсіз болды (сол оқушының параллель қадамы ағашты өзгертті): жолдар FOR UPDATE-пен
        құлыпталып, ΔM жаңа күйден қайта есептеледі. Токен FINALIZE-та жазылып қойған."""
        ids = [plan.focal] + ([plan.tag_bridge] if plan.tag_bridge and plan.tag_bridge != plan.focal else [])
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                locked = await R.states(conn, turn.student_id, ids, lock=True)
                rows, report = self._compute_updates(tags, plan, locked, now)
                meta["mastery"] = report
                for node_id, after, _ in rows:
                    await R.save_state(conn, turn.student_id, node_id, after)
                await conn.execute(
                    "update tutor.conversations set state = $2::jsonb, last_message_at = now() "
                    "where conversation_id = $1::uuid",
                    turn.conversation_id, json.dumps(next_state),
                )
                await self._complete(conn, turn.tutor_message_id, reply_text, meta)

    async def _complete(self, conn: Any, tutor_message_id: str, text: str, meta: dict[str, Any]) -> None:
        await conn.execute(
            "update tutor.messages set text = $2, status = 'complete', meta = $3::jsonb, created_at = now() "
            "where message_id = $1::uuid",
            tutor_message_id, text[:8000], json.dumps(meta, ensure_ascii=False, default=str),
        )

    # ============================================================== маршрут (БД-сыз, тек META-да дайджест)

    async def _plan(
        self,
        *,
        student_id: str,
        tags: E.Tags,
        gate: E.Gate,
        info: dict[int, R.NodeInfo],
        candidates: Sequence[Candidate],
        graph: R.GraphData,
        now: datetime,
        prev_focus: int | None,
        recent_styles: tuple[str, ...],
        unanswered: int,
        text: str,
        lengths: list[int],
    ) -> TurnPlan:
        """2-қадам: маршрут пен контекст түйіндері. Граф пен күй GRAPH-тан келді; ағаш мұнда жазылмайды (§3.5)."""
        alias = {c.node_id: c.alias for c in candidates}
        next_unanswered = E.next_unanswered(unanswered, tags)
        st = graph.states
        prereq = graph.prereqs

        def node_line(node_id: int, role: str, with_prereqs: bool = True) -> NodeLine:
            node = info[node_id]
            name = alias.setdefault(node_id, f"n{len(alias) + 1}")
            return NodeLine(
                alias=name, name=node.name, code=E.state_code(name, st.get(node_id), now), role=role,
                description=node.description, grade=node.grade, paragraph_no=node.paragraph_no,
                prerequisites=tuple(alias[p] for p in prereq.get(node_id, []) if p in alias) if with_prereqs else (),
            )

        if gate is E.Gate.PROMPT_INJECTION:
            # Рөл сақталады, оқулық пен түйін сипаттамасы берілмейді, ағаш өзгермейді (D87).
            route = E.special_route("INJECTION", recent_styles)
            return TurnPlan(
                scenario=route.scenario, style=route.style, gate=gate.value,
                next_state=self._next_state(prev_focus, None, recent_styles, route.style, next_unanswered),
            )
        if gate is E.Gate.META_REFLECTION:
            route = E.special_route("META", recent_styles)
            async with self._pool.acquire() as conn:
                digest = await R.digest(conn, student_id, now)
            return TurnPlan(
                scenario=route.scenario, style=route.style, gate=gate.value, digest=digest,
                next_state=self._next_state(prev_focus, None, recent_styles, route.style, next_unanswered),
            )
        if gate is E.Gate.OPEN_EMPATHETIC_DIALOG:
            route = E.special_route("EMPATHY", recent_styles)
            return TurnPlan(
                scenario=route.scenario, style=route.style, gate=gate.value,
                next_state=self._next_state(prev_focus, None, recent_styles, route.style, next_unanswered),
            )

        focal = tags.focal_node
        if focal is None and tags.alignment == 1 and tags.intent == "ANSWER" and prev_focus in info:
            focal = prev_focus
        if focal is None or focal not in info:
            route = E.special_route("GENERAL", recent_styles)
            nodes = [node_line(c.node_id, "candidate", with_prereqs=False) for c in candidates[:4]]
            return TurnPlan(
                scenario=route.scenario, style=route.style, nodes=nodes,
                next_state=self._next_state(prev_focus, None, recent_styles, route.style, next_unanswered),
            )

        focal_prereqs = prereq.get(focal, [])
        deps = graph.deps.get(focal, [])
        info.update({i: graph.nodes[i] for i in [*focal_prereqs, *deps] if i not in info and i in graph.nodes})

        focal_state = st.get(focal)
        m_eff = E.effective_mastery(focal_state, now)
        paste = E.paste_suspect(text, lengths)
        update_focal = not (tags.alignment == 0 and focal == prev_focus)
        new_focal = E.update_node(focal_state, tags, now=now, paste_suspect=paste) if update_focal else None
        fail_streak = new_focal.fail_streak if new_focal else (focal_state.fail_streak if focal_state else 0)
        status = E.node_status(focal_state, m_eff, tags.error_type)

        m_new = None
        if (status is E.Status.UNSEEN and new_focal is not None and tags.error_type == "NONE"
                and tags.evidence_mode == "ACTIVE_CLAIM" and E.GAMMA_ARG.get(tags.arg_depth, 0.0) > 0):
            m_new = new_focal.mastery

        prereq_in_tree = [p for p in focal_prereqs if p in info]
        parent = min(prereq_in_tree, key=lambda p: E.effective_mastery(st.get(p), now), default=None)
        parent_m = E.effective_mastery(st.get(parent), now) if parent is not None else None

        def unmastered(node_id: int) -> bool:
            return node_id != focal and node_id in info and E.effective_mastery(st.get(node_id), now) < E.MASTERED_MIN

        bridge = next(
            (n for n in [tags.bridge_node, *deps, *(c.node_id for c in candidates)] if n is not None and unmastered(n)),
            None,
        )

        route = E.route(E.RouteInput(
            status=status, tags=tags, m_new=m_new, fail_streak=fail_streak,
            has_prerequisite=parent is not None, parent_m_eff=parent_m, bridge_available=bridge is not None,
            unanswered_questions=unanswered, recent_styles=recent_styles,
        ))

        roles: dict[int, str] = {focal: "focal"}
        if route.graph_action == "BACKWARD" and parent is not None:
            roles[parent] = "parent"
        if route.graph_action == "FORWARD" and bridge is not None:
            roles[bridge] = "bridge"
        for node in [c.node_id for c in candidates] + focal_prereqs[:2]:
            if node in info and node not in roles and len(roles) < R.MAX_CANDIDATES:
                roles[node] = "candidate"
        nodes = [node_line(n, role) for n, role in roles.items()]

        notes: list[str] = []
        if paste:
            notes.append("Оқушы күтпеген жерден ұзын, дайын абзац жіберді. Мақтама: тақырыпты өз сөзімен БІР сөйлеммен "
                         "түсіндіріп беруін сұра.")
        if route.scenario == "3B" and tags.evidence_mode == "ACTIVE_CLAIM":
            notes.append("Оқушы өз ойын айтты: оны жеңіл бағалап, толықтыратын бір нақтылау сұрақ қой.")
        errors = [f"{name} ({kind})" for name, kind in graph.errors if name != info[focal].name]
        if errors:
            # Толық дайджест тек META-да; мұнда — тек соңғы қате түсініктер (D88).
            notes.append("Оқушының соңғы қиындықтары: " + ", ".join(errors[:3]) + ". Қажет болса ғана еске ал.")

        chunk_entities = list(info[focal].entity_ids)
        if route.graph_action == "BACKWARD" and parent is not None:
            chunk_entities = list(info[parent].entity_ids) + chunk_entities
        elif route.graph_action == "FORWARD" and bridge is not None:
            chunk_entities += list(info[bridge].entity_ids)

        if route.graph_action == "BACKWARD" and parent is not None:
            next_focus, next_bridge = parent, None
        elif route.graph_action == "FORWARD" and bridge is not None:
            next_focus, next_bridge = focal, bridge
        else:
            next_focus, next_bridge = focal, None

        return TurnPlan(
            scenario=route.scenario, style=route.style, status=status.value, focal=focal,
            parent=parent if route.graph_action == "BACKWARD" else None,
            bridge=bridge if route.graph_action == "FORWARD" else None,
            tag_bridge=tags.bridge_node, paste_suspect=paste, update_focal=update_focal,
            nodes=nodes, chunk_entities=chunk_entities[:40], notes=notes,
            next_state=self._next_state(next_focus, next_bridge, recent_styles, route.style, next_unanswered),
        )

    @staticmethod
    def _next_state(focus: int | None, bridge: int | None, styles: tuple[str, ...], style: str,
                    unanswered: int) -> dict[str, Any]:
        return {"focus": focus, "bridge": bridge, "styles": list(E.push_style(styles, style)), "unanswered": unanswered}
