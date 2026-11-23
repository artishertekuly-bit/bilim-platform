"""Tutor сервисі: диалог, екі шақыру контуры, бұғат және лимиттер (personarag §5–§7, api §4, D70, D86).

Хабарламаның жолы:
  0. Эмбеддинг (оқушы мәтіні + тьютордың соңғы сұрағы) → corpus.match_entities → n1…n8 үміткерлер.
  1. Тег қою (кіші модель, Structured Outputs). Сонымен қатар оқулық чанктары векторы бойынша алынады.
  2. Кіріс қақпасы (§6) және маршрут (§5) — таза Python (engine.py).
  3. Контекст: векторлық чанктар + фокус / алғышарт / көпір түйіндерінің §-тері.
  4. Жауап — күшті модель, stream. Ағын біткен соң ағаш бір транзакцияда, FOR UPDATE-пен жаңартылады (§3.5):
     жауап үзілсе, ағаш өзгермейді, ал сол client_request_id-мен қайталау қайта есептейді.
Клиент байланысты үзсе де, жауап фондық тапсырмада аяғына дейін жазылады (api §2.5).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import os
import uuid
from collections.abc import AsyncIterator, Sequence
from dataclasses import asdict, dataclass, field
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
from . import retrieval as R
from .dto import BlockState, Conversation, MessagesPage, SendMessageRequest, TutorMessage, TutorSubject
from .errors import TutorError, not_found, unavailable
from .prompts import (
    BLOCKED_TEXT,
    REPLY_PROMPT_REF,
    SAFETY_TEXT,
    NodeLine,
    build_reply_messages,
    suggestions_for,
)
from .tags import TAGS_PROMPT_REF, Candidate, TagSchema, build_tags_messages, tags_meta, to_tags

logger = logging.getLogger("bilim.tutor")

CONVERSATION_MESSAGES = 30
RATE_LIMIT_PER_MINUTE = 6
COOLDOWN = timedelta(minutes=30)
SECOND_ALERT_WINDOW = timedelta(hours=24)
EPISODIC_K = 3
PENDING_WAIT_S = 90.0
CHARS_PER_TOKEN = 2.5
DEFAULT_DAILY_TOKENS = 200_000
ALERT_CATEGORIES = frozenset({"TOXIC", "TROLLING", "PROFANITY", "AGGRESSION"})


def _sse(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _loads(value: Any) -> Any:
    return json.loads(value) if isinstance(value, str) else (value or {})


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


class TutorService:
    def __init__(self, pool: asyncpg.Pool, *, gateway: LLMGateway | None = None, clock=None) -> None:
        self._pool = pool
        self._gateway_instance = gateway
        self._clock = clock or (lambda: datetime.now(UTC))
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

    async def _require_unblocked(self, conn: Any, student_id: str) -> None:
        until, reason = await self._block(conn, student_id)
        if reason is not None:
            raise TutorError(
                423, "TUTOR_BLOCKED", BLOCKED_TEXT[reason],
                {"blocked_until": until.isoformat() if until else None, "blocked_reason": reason},
            )

    async def _hard_alert(
        self, conn: Any, *, student_id: str, conversation_id: str, message_id: str, text: str, category: str
    ) -> tuple[datetime | None, str]:
        now = self._clock()
        alert_id = str(uuid.uuid4())
        try:
            async with conn.transaction():
                await conn.execute(
                    """
                    insert into public.security_alerts
                      (alert_id, source_system, student_id, severity, category, evidence_text, context_ref)
                    values ($1::uuid, 'tutor', $2::uuid, 'hard', $3, $4, $5::jsonb)
                    """,
                    alert_id, student_id, category if category in ALERT_CATEGORIES else "TOXIC", text[:4000],
                    json.dumps({"conversation_id": conversation_id, "message_id": message_id}),
                )
        except asyncpg.PostgresError as exc:
            # Дабыл жазылмаса да бұғат сақталады: оқушының қауіпсіздігі бірінші (ortaq §5).
            logger.warning("tutor security alert was not written: %s", type(exc).__name__)
            alert_id = None  # type: ignore[assignment]
        async with conn.transaction():
            recent = await conn.fetchval(
                "select count(*)::int from tutor.safety_events where student_id = $1::uuid "
                "and action in ('cooldown', 'teacher') and created_at > $2",
                student_id, now - SECOND_ALERT_WINDOW,
            )
            reason = "teacher" if recent >= 1 else "cooldown"
            until = None if reason == "teacher" else now + COOLDOWN
            await conn.execute(
                """
                insert into tutor.student_blocks (student_id, blocked_until, blocked_reason, updated_at)
                values ($1::uuid, $2, $3, now())
                on conflict (student_id) do update set
                  blocked_until = excluded.blocked_until, blocked_reason = excluded.blocked_reason,
                  updated_at = now(), updated_by = null
                """,
                student_id, until, reason,
            )
            await conn.execute(
                "insert into tutor.safety_events (student_id, action, category, alert_id, message_id) "
                "values ($1::uuid, $2, $3, $4::uuid, $5::uuid)",
                student_id, reason, category, alert_id, message_id,
            )
        return until, reason

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

    # ============================================================== лимиттер (api §2.6, ortaq §2.3)

    async def _require_limits(self, conn: Any, student_id: str) -> None:
        now = self._clock()
        recent = await conn.fetch(
            "select created_at from tutor.messages where student_id = $1::uuid and role = 'student' "
            "and created_at > $2 order by created_at",
            student_id, now - timedelta(seconds=60),
        )
        if len(recent) >= RATE_LIMIT_PER_MINUTE:
            wait = 60 - int((now - recent[0]["created_at"]).total_seconds())
            raise TutorError(429, "RATE_LIMITED", "Тым жиі жазып жатырсың. Сәл күте тұр.", retry_after=max(1, wait))
        used = await conn.fetchval(
            "select tokens from tutor.token_usage where student_id = $1::uuid and day = $2", student_id, now.date()
        )
        if (used or 0) >= daily_token_limit():
            tomorrow = datetime.combine(now.date() + timedelta(days=1), datetime.min.time(), tzinfo=UTC)
            raise TutorError(
                429, "RATE_LIMITED", "Бүгінгі тьютор лимиті бітті. Ертең қайта жалғастырайық.",
                {"limit": "daily_tokens"}, retry_after=max(60, int((tomorrow - now).total_seconds())),
            )

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

        async with self._pool.acquire() as conn:
            conv = await self._conversation(conn, student_id, conversation_id)
            existing = await conn.fetchrow(
                "select message_id::text as message_id, request_hash from tutor.messages "
                "where conversation_id = $1::uuid and client_request_id = $2::uuid and role = 'student'",
                conversation_id, request_id,
            )
            if existing is not None:
                if existing["request_hash"] != request_hash:
                    raise TutorError(409, "DUPLICATE_REQUEST", "Бұл сұраныс id-і басқа мәтінмен жіберілген.")
                reply = await conn.fetchrow(
                    "select message_id::text as message_id, text, status, meta from tutor.messages "
                    "where reply_to = $1::uuid and role = 'tutor'",
                    existing["message_id"],
                )
                if reply is not None and reply["status"] == "complete":
                    return self._replay(reply)
                if reply is not None and reply["status"] == "pending":
                    return self._await_pending(reply["message_id"])
                await self._require_unblocked(conn, student_id)
                student_message_id = existing["message_id"]
                if reply is not None:
                    await conn.execute(
                        "update tutor.messages set status = 'pending', text = '', meta = '{}'::jsonb, created_at = now() "
                        "where message_id = $1::uuid",
                        reply["message_id"],
                    )
                    tutor_message_id = reply["message_id"]
                else:
                    tutor_message_id = await self._insert_pending(conn, conversation_id, student_id, student_message_id)
            else:
                await self._require_unblocked(conn, student_id)
                await self._require_limits(conn, student_id)
                async with conn.transaction():
                    student_message_id = await conn.fetchval(
                        """
                        insert into tutor.messages
                          (conversation_id, student_id, role, text, client_request_id, request_hash)
                        values ($1::uuid, $2::uuid, 'student', $3, $4::uuid, $5)
                        returning message_id::text
                        """,
                        conversation_id, student_id, text, request_id, request_hash,
                    )
                    tutor_message_id = await self._insert_pending(conn, conversation_id, student_id, student_message_id)
                    await conn.execute(
                        "update tutor.conversations set last_message_at = now() where conversation_id = $1::uuid",
                        conversation_id,
                    )

        queue: asyncio.Queue[tuple[str, dict[str, Any]] | None] = asyncio.Queue()
        self._spawn(self._produce(
            queue, student_id=student_id, conv=dict(conv), text=text,
            student_message_id=student_message_id, tutor_message_id=tutor_message_id,
        ))

        async def _stream() -> AsyncIterator[str]:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield _sse(*event)

        return _stream()

    async def _insert_pending(self, conn: Any, conversation_id: str, student_id: str, reply_to: str) -> str:
        return await conn.fetchval(
            """
            insert into tutor.messages (conversation_id, student_id, role, text, status, reply_to)
            values ($1::uuid, $2::uuid, 'tutor', '', 'pending', $3::uuid)
            returning message_id::text
            """,
            conversation_id, student_id, reply_to,
        )

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

    async def _produce(
        self,
        queue: asyncio.Queue[tuple[str, dict[str, Any]] | None],
        *,
        student_id: str,
        conv: dict[str, Any],
        text: str,
        student_message_id: str,
        tutor_message_id: str,
    ) -> None:
        tokens = 0
        day = self._clock().date()
        try:
            tokens = await self._turn(
                queue, student_id=student_id, conv=conv, text=text,
                student_message_id=student_message_id, tutor_message_id=tutor_message_id,
            )
        except (LLMUnavailableError, LLMRequestError, LLMStreamInterrupted) as exc:
            logger.warning("tutor turn failed: %s", type(exc).__name__)
            await self._mark_failed(tutor_message_id)
            await queue.put(("error", {"code": "SERVICE_UNAVAILABLE",
                                       "message": "Тьютор уақытша жауап бере алмады. Қайталап көр."}))
        except Exception as exc:  # noqa: BLE001
            logger.exception("tutor turn unexpected failure: %s", type(exc).__name__)
            await self._mark_failed(tutor_message_id)
            await queue.put(("error", {"code": "INTERNAL_ERROR", "message": "Тьютор жауабында қате шықты."}))
        finally:
            await self._add_tokens(student_id, tokens, day)
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

    async def _turn(
        self,
        queue: asyncio.Queue[tuple[str, dict[str, Any]] | None],
        *,
        student_id: str,
        conv: dict[str, Any],
        text: str,
        student_message_id: str,
        tutor_message_id: str,
    ) -> int:
        gw = self._gateway()
        now = self._clock()
        conversation_id = conv["conversation_id"]
        state = _loads(conv.get("state"))
        prev_focus = state.get("focus")
        active_bridge = state.get("bridge")
        recent_styles = tuple(state.get("styles") or ())
        unanswered = int(state.get("unanswered") or 0)

        async with self._pool.acquire() as conn:
            history = await conn.fetch(
                """
                select role, text from tutor.messages
                where conversation_id = $1::uuid and status = 'complete' and message_id <> $2::uuid
                order by created_at desc, role desc limit $3
                """,
                conversation_id, student_message_id, EPISODIC_K * 2,
            )
            lengths = await conn.fetch(
                "select char_length(text) as n from tutor.messages where conversation_id = $1::uuid "
                "and role = 'student' and message_id <> $2::uuid order by created_at desc limit 10",
                conversation_id, student_message_id,
            )
        history = list(reversed(history))
        tutor_last = next((r["text"] for r in reversed(history) if r["role"] == "tutor"), "")
        episodic = [(r["role"], r["text"]) for r in history[-EPISODIC_K:]]

        # 0-қадам: эмбеддинг. Қате болса, тьютор үміткерсіз (тек алдыңғы фокуспен) жалғасады.
        vector: list[float] | None = None
        try:
            embed_input = (tutor_last[-500:] + "\n" + text).strip()
            vector = (await gw.embed([embed_input], model_key="corpus"))[0]
        except (LLMUnavailableError, LLMRequestError, ValueError) as exc:
            logger.warning("tutor embedding failed: %s", type(exc).__name__)

        async with self._pool.acquire() as conn:
            found = await R.vector_nodes(conn, vector)
            extra_ids = [i for i in (prev_focus, active_bridge) if i]
            prev_prereqs = (await R.prerequisites(conn, [prev_focus])).get(prev_focus, []) if prev_focus else []
            extra = await R.nodes_by_id(conn, [*extra_ids, *prev_prereqs[:2]])
        ordered: list[R.NodeInfo] = []
        for node in [*found, *(extra[i] for i in [*extra_ids, *prev_prereqs[:2]] if i in extra)]:
            if node.node_id not in {n.node_id for n in ordered}:
                ordered.append(node)
        ordered = ordered[: R.MAX_CANDIDATES]
        candidates = [
            Candidate(f"n{i + 1}", n.node_id, n.name, n.entity_type, n.grade, n.paragraph_no)
            for i, n in enumerate(ordered)
        ]
        alias_to_node = {c.alias: c.node_id for c in candidates}
        info = {n.node_id: n for n in ordered}

        # 1-қадам: тег, онымен қатар векторлық чанктар.
        async def _vector_chunks() -> list[tuple[str, str]]:
            async with self._pool.acquire() as cconn:
                return await R.vector_chunks(cconn, vector)

        chunks_task = asyncio.create_task(_vector_chunks())
        try:
            result = await gw.complete(
                Task.TUTOR_TAGS, TAGS_PROMPT_REF, build_tags_messages(candidates, tutor_last, text), schema=TagSchema
            )
        except BaseException:
            chunks_task.cancel()
            raise
        tokens = result.input_tokens + result.output_tokens
        parsed = result.parsed if isinstance(result.parsed, TagSchema) else TagSchema.model_validate_json(result.text)
        tags = to_tags(parsed, alias_to_node)

        # 2-қадам: кіріс қақпасы.
        gate = E.gate(tags)
        if gate is E.Gate.HARD_ALERT:
            chunks_task.cancel()
            async with self._pool.acquire() as conn:
                until, reason = await self._hard_alert(
                    conn, student_id=student_id, conversation_id=conversation_id, message_id=student_message_id,
                    text=text, category=tags.toxicity_category,
                )
                blocked = {"blocked_until": until.isoformat() if until else None, "blocked_reason": reason}
                reply_text = SAFETY_TEXT[reason]
                await self._complete(conn, tutor_message_id, reply_text, {
                    "gate": gate.value, "tags": tags_meta(parsed), "blocked": blocked,
                })
            await queue.put(("blocked", {**blocked, "message": reply_text}))
            return tokens

        plan = await self._plan(
            student_id=student_id, tags=tags, gate=gate, info=info, candidates=candidates, now=now,
            prev_focus=prev_focus, recent_styles=recent_styles, unanswered=unanswered, text=text,
            lengths=[int(r["n"]) for r in lengths],
        )

        # 3-қадам: контекст.
        vector_chunks = await chunks_task
        node_chunk_rows: list[tuple[str, str]] = []
        if plan.chunk_entities and plan.scenario != "EMPATHY":
            async with self._pool.acquire() as conn:
                node_chunk_rows = await R.node_chunks(conn, plan.chunk_entities)
        chunks = [] if plan.scenario == "EMPATHY" else R.merge_chunks(node_chunk_rows, vector_chunks)

        # 4-қадам: жауап ағыны.
        messages = build_reply_messages(
            scenario=plan.scenario, style=plan.style, nodes=plan.nodes, chunks=chunks, episodic=episodic,
            student_text=text, digest=plan.digest, notes=plan.notes,
        )
        parts: list[str] = []
        started = False
        async for piece in gw.stream(Task.TUTOR_REPLY, REPLY_PROMPT_REF, messages):
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
        tokens += math.ceil((sum(len(m.content) for m in messages) + len(reply_text)) / CHARS_PER_TOKEN)

        suggestions = suggestions_for(plan.scenario)
        meta = {
            "gate": plan.gate, "scenario": plan.scenario, "style": plan.style, "status": plan.status,
            "focal": plan.focal, "parent": plan.parent, "bridge": plan.bridge, "paste_suspect": plan.paste_suspect,
            "tags": tags_meta(parsed), "suggestions": suggestions,
            "prompt_versions": {"tags": TAGS_PROMPT_REF.version, "reply": REPLY_PROMPT_REF.version},
        }
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                meta["mastery"] = await self._apply_updates(conn, student_id, tags, plan, now)
                await conn.execute(
                    "update tutor.conversations set state = $2::jsonb, last_message_at = now() "
                    "where conversation_id = $1::uuid",
                    conversation_id, json.dumps(plan.next_state),
                )
                await self._complete(conn, tutor_message_id, reply_text, meta)
        await queue.put(("done", {"message_id": tutor_message_id, "suggestions": suggestions}))
        return tokens

    async def _complete(self, conn: Any, tutor_message_id: str, text: str, meta: dict[str, Any]) -> None:
        await conn.execute(
            "update tutor.messages set text = $2, status = 'complete', meta = $3::jsonb, created_at = now() "
            "where message_id = $1::uuid",
            tutor_message_id, text[:8000], json.dumps(meta, ensure_ascii=False, default=str),
        )

    async def _plan(
        self,
        *,
        student_id: str,
        tags: E.Tags,
        gate: E.Gate,
        info: dict[int, R.NodeInfo],
        candidates: Sequence[Candidate],
        now: datetime,
        prev_focus: int | None,
        recent_styles: tuple[str, ...],
        unanswered: int,
        text: str,
        lengths: list[int],
    ) -> TurnPlan:
        """2-қадам: маршрут пен контекст түйіндері. Ағаш мұнда жазылмайды (жауаптан кейін, §3.5)."""
        alias = {c.node_id: c.alias for c in candidates}
        next_unanswered = E.next_unanswered(unanswered, tags)

        def node_line(node_id: int, role: str, st: dict[int, E.NodeState], prereq: dict[int, list[int]]) -> NodeLine:
            node = info[node_id]
            name = alias.setdefault(node_id, f"n{len(alias) + 1}")
            return NodeLine(
                alias=name, name=node.name, code=E.state_code(name, st.get(node_id), now), role=role,
                description=node.description, grade=node.grade, paragraph_no=node.paragraph_no,
                prerequisites=tuple(alias[p] for p in prereq.get(node_id, []) if p in alias),
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
            async with self._pool.acquire() as conn:
                st = await R.states(conn, student_id, list(info))
            nodes = [node_line(c.node_id, "candidate", st, {}) for c in candidates[:4]]
            return TurnPlan(
                scenario=route.scenario, style=route.style, nodes=nodes,
                next_state=self._next_state(prev_focus, None, recent_styles, route.style, next_unanswered),
            )

        async with self._pool.acquire() as conn:
            prereq = await R.prerequisites(conn, [focal, *info])
            focal_prereqs = prereq.get(focal, [])
            deps = await R.dependents(conn, focal)
            extra_ids = [i for i in [*focal_prereqs, *deps] if i not in info]
            info.update(await R.nodes_by_id(conn, extra_ids))
            st = await R.states(conn, student_id, list(info))

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
        nodes = [node_line(n, role, st, prereq) for n, role in roles.items()]

        notes: list[str] = []
        if paste:
            notes.append("Оқушы күтпеген жерден ұзын, дайын абзац жіберді. Мақтама: тақырыпты өз сөзімен БІР сөйлеммен "
                         "түсіндіріп беруін сұра.")
        if route.scenario == "3B" and tags.evidence_mode == "ACTIVE_CLAIM":
            notes.append("Оқушы өз ойын айтты: оны жеңіл бағалап, толықтыратын бір нақтылау сұрақ қой.")

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

    async def _apply_updates(
        self, conn: Any, student_id: str, tags: E.Tags, plan: TurnPlan, now: datetime
    ) -> dict[str, Any]:
        """§3.5: есеп пен жазу бір транзакцияда, жолдар FOR UPDATE-пен құлыпталады."""
        if plan.focal is None or plan.gate != "NONE":
            return {}
        ids = [plan.focal] + ([plan.tag_bridge] if plan.tag_bridge and plan.tag_bridge != plan.focal else [])
        locked = await R.states(conn, student_id, ids, lock=True)
        report: dict[str, Any] = {}
        if plan.update_focal:
            before = locked.get(plan.focal)
            after = E.update_node(before, tags, now=now, paste_suspect=plan.paste_suspect)
            if after is not None:
                await R.save_state(conn, student_id, plan.focal, after)
            report["focal"] = {
                "before": round(E.effective_mastery(before, now), 4) if before else None,
                "after": after.mastery if after else None,
            }
        if plan.tag_bridge and plan.tag_bridge != plan.focal:
            before = locked.get(plan.tag_bridge)
            after = E.update_node(before, tags, now=now, weight=E.W_BRIDGE, paste_suspect=plan.paste_suspect)
            if after is not None:
                await R.save_state(conn, student_id, plan.tag_bridge, after)
            report["bridge"] = {"after": after.mastery if after else None}
        return report


def plan_debug(plan: TurnPlan) -> dict[str, Any]:
    """Тесттер мен журнал үшін."""
    data = asdict(plan)
    data["nodes"] = [n.alias + ":" + n.role for n in plan.nodes]
    return data
