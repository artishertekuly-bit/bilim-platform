"""Ойын сервисі (geimifikatsiya §5–§7, D46, D52–D54, D67).

Ойын күйін тек сервер басқарады. Әр әрекет бір транзакцияда: бөлме `FOR UPDATE`-пен құлыпталады, қозғалтқыш
жаңа күйді есептейді, күй, жауап журналы мен Realtime хабарлары бірге жазылады (хабар commit-пен бірге кетеді).
Таймер — фондық цикл: `match_state.deadline_at` өткен бөлмелерге қозғалтқыштың `timeout`-ы қолданылады.
Дебаттың төрешісі (LLM) транзакциядан тыс шақырылады: алдымен deadline «жалға» алынады, екі цикл қатар шақырмайды.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import secrets
import uuid
from collections.abc import Callable, Sequence
from datetime import datetime, timedelta, timezone
from typing import Any

import asyncpg

from . import queries as Q
from .dto import ActionRequest, CreateRoomRequest, PreviewRequest
from .engines import ENGINES, MIN_BANK, MODES, debate, deck_format
from .provider import (
    INSERT_ANSWERS_SOURCED,
    BankShort,
    DeckQuestions,
    GenerationLimit,
    QuestionBank,
    on_demand_enabled,
    sources_of,
)
from .engines.base import BOT_ID, AnswerLog, Ctx, GameRuleError, Outcome, PlayerInfo, Question, remember_request
from .errors import GamesError, forbidden, not_found
from .judge import judge_debate

logger = logging.getLogger("bilim.games")

CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"  # сынып кодымен бірдей (api §5.2)
CODE_ATTEMPTS = 8
BOT_NAME = "Демо-бот"
JUDGE_LEASE_S = 90
SWEEP_INTERVAL_S = 1.0
SWEEP_BATCH = 20
NAME_WORDS = 2


def _json(value: Any) -> Any:
    if value is None or isinstance(value, (dict, list)):
        return value
    return json.loads(value)


def _uuid(value: str) -> str:
    try:
        return str(uuid.UUID(str(value)))
    except ValueError:
        raise not_found() from None


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except ValueError:
        return False


def _short_name(full_name: str, seat: int) -> str:
    words = (full_name or "").split()
    return " ".join(words[:NAME_WORDS])[:80] or f"Ойыншы {seat + 1}"


def _label(row: Any) -> str:
    title = " ".join(str(row["paragraph_title"] or "").split())
    return (f"§{row['paragraph_no']} {title}".strip())[:120]


def _rule_error(exc: GameRuleError) -> GamesError:
    return GamesError(exc.status, exc.code, exc.message)


class DbQuestions:
    """Ойын банкінен сұрақ (D45): ойыншылар 14 күнде көрмегені, қиындығы жақыны, бір ойын ішінде қайталанбайды."""

    def __init__(self, conn: Any) -> None:
        self._conn = conn

    async def take(self, *, topic_ids: Sequence[str], difficulty: int, viewers: Sequence[str],
                   exclude: Sequence[str]) -> Question | None:
        row = await self._conn.fetchrow(
            Q.PICK_QUESTION, list(topic_ids), [v for v in viewers if _is_uuid(v)], list(exclude), int(difficulty)
        )
        if row is None:
            return None
        content = _json(row["content"]) or {}
        key = _json(row["answer_key"]) or {}
        options = tuple({"id": str(o["id"]), "text": str(o["text"])} for o in content.get("options") or [])
        return Question(row["question_id"], row["topic_id"], row["paragraph"], int(row["difficulty"]),
                        str(content.get("stem") or ""), options, str(key.get("correct_option_id") or ""))

    async def debate_topic(self, topic_ids: Sequence[str], viewers: Sequence[str]) -> dict[str, Any] | None:
        row = await self._conn.fetchrow(Q.PICK_DEBATE_TOPIC, list(topic_ids), [v for v in viewers if _is_uuid(v)])
        if row is None:
            return None
        content = _json(row["content"]) or {}
        return {"qid": row["question_id"], "statement": str(content.get("statement") or ""),
                "paragraph": row["paragraph"]}


class GamesService:
    def __init__(
        self,
        pool: Any,
        *,
        gateway: Any = None,
        clock: Callable[[], datetime] | None = None,
        rng: random.Random | None = None,
        topic_generator: Any = None,
    ) -> None:
        self._pool = pool
        self._gateway = gateway
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._rng = rng or random.Random(secrets.randbits(64))
        self._sweeper: asyncio.Task | None = None
        self._bank = QuestionBank(pool, gateway=self._llm, rng=self._rng, generator=topic_generator)

    # ------------------------------------------------------------------ көмекшілер

    def _llm(self) -> Any:
        if self._gateway is None:
            try:
                from ..llm_gateway import LLMGateway, load_config

                self._gateway = LLMGateway(load_config())
            except Exception as exc:  # noqa: BLE001 — модерация regex-пен жалғасады, төреші кейін қайталайды
                logger.warning("games gateway unavailable: %s", type(exc).__name__)
                return None
        return self._gateway

    def _ctx(self, conn: Any, room: Any = None) -> Ctx:
        return Ctx(now=self._clock(), rng=self._rng, questions=self._questions(conn, room))

    def _questions(self, conn: Any, room: Any) -> Any:
        """D98: колодасы бар бөлме сұрақты колодадан алады (үш көз); ескі бөлме — бұрынғыша ойын банкінен."""
        scope = (_json(room["scope"]) or {}) if room is not None else {}
        deck = scope.get("deck")
        if deck:
            labels = dict(zip(scope.get("topic_ids") or [], scope.get("labels") or []))
            return DeckQuestions(conn, deck, labels, self._rng)
        return DbQuestions(conn)

    @staticmethod
    def _summary(room: Any, players: Sequence[Any], user_id: str | None) -> dict[str, Any]:
        engine = ENGINES[room["game_type"]]
        scope = _json(room["scope"]) or {}
        active = room["status"] in ("lobby", "playing")
        summary = {
            "room_id": room["room_id"],
            "game_type": room["game_type"],
            "mode": room["mode"],
            "status": room["status"],
            "join_code": room["join_code"] if active else None,
            "host_role": room["host_role"],
            "scope": {"subject_id": scope.get("subject_id"), "book": scope.get("book"),
                      "labels": scope.get("labels") or []},
            "settings": _json(room["settings"]) or {},
            "min_players": getattr(engine, "SOLO_PLAYERS", None) if room["mode"] == "solo" else (
                1 if room["mode"] == "bot" else engine.MIN_PLAYERS),
            "max_players": 1 if room["mode"] in ("bot", "solo") else engine.MAX_PLAYERS,
            "players": [{"seat": p["seat"], "name": p["display_name"], "left": p["left_at"] is not None,
                         "user_id": p["user_id"]} for p in players],
            "created_at": room["created_at"].isoformat() if room["created_at"] else None,
            "started_at": room["started_at"].isoformat() if room["started_at"] else None,
        }
        if user_id is not None:
            summary["is_host"] = room["host_id"] == user_id
        return summary

    def _view(self, room: Any, players: Sequence[Any], user_id: str, state: dict | None, version: int) -> dict:
        engine = ENGINES[room["game_type"]]
        me = next((p for p in players if p["user_id"] == user_id), None)
        return {
            "room": self._summary(room, players, user_id),
            "version": version,
            "public": engine.public_view(state) if state else None,
            "private": engine.private_view(state, user_id) if state else {},
            "me": {"user_id": user_id, "seat": me["seat"] if me else None,
                   "left": bool(me and me["left_at"] is not None)},
        }

    async def _broadcast(self, conn: Any, room: Any, players: Sequence[Any], state: dict | None, version: int,
                         status: str) -> None:
        engine = ENGINES[room["game_type"]]
        summary = self._summary(dict(room) | {"status": status}, players, None)
        public = {"room_id": room["room_id"], "version": version, "status": status, "room": summary,
                  "public": engine.public_view(state) if state else None}
        users = [p["user_id"] for p in players if p["left_at"] is None]
        private = [json.dumps({"room_id": room["room_id"], "version": version,
                               "private": engine.private_view(state, uid) if state else {}}, ensure_ascii=False)
                   for uid in users]
        await conn.fetchval(Q.BROADCAST, room["room_id"], json.dumps(public, ensure_ascii=False), users, private)

    async def _persist(self, conn: Any, room: Any, players: Sequence[Any], outcome: Outcome,
                       alerts: dict[int, str] | None = None) -> int:
        engine = ENGINES[room["game_type"]]
        state = outcome.state
        version = await conn.fetchval(Q.SAVE_STATE, room["room_id"], json.dumps(state, ensure_ascii=False),
                                      engine.deadline(state))
        await self._write_log(conn, room, outcome.log)
        for entry in outcome.entries:
            await conn.execute(Q.INSERT_DEBATE_ENTRY, room["room_id"], entry["user_id"], entry["round"], entry["text"],
                               entry["moderation"], (alerts or {}).get(entry["round"]))
        if outcome.record:
            await conn.execute(Q.UPSERT_RECORD, outcome.record["user_id"], outcome.record["score"],
                               outcome.record["correct"])
        status = room["status"]
        if outcome.finished:
            status = "finished"
            await conn.execute(Q.SET_STATUS, room["room_id"], status,
                               json.dumps({"results": engine.results(state)}, ensure_ascii=False))
        await self._broadcast(conn, room, players, state, version, status)
        return version

    @staticmethod
    async def _write_log(conn: Any, room: Any, log: Sequence[AnswerLog]) -> None:
        rows = [entry for entry in log if _is_uuid(entry.user_id)]
        if not rows:
            return
        deck = (_json(room["scope"]) or {}).get("deck")
        if deck:
            # D98: журналда сұрақтың көзі де жазылады (game / examiner / generated).
            sources = sources_of(deck)
            await conn.execute(INSERT_ANSWERS_SOURCED, room["room_id"], [r.user_id for r in rows],
                               [r.question_id for r in rows], [r.correct for r in rows],
                               [sources.get(r.question_id, "game") for r in rows])
            return
        await conn.execute(Q.INSERT_ANSWERS, room["room_id"], [r.user_id for r in rows],
                           [r.question_id for r in rows], [r.correct for r in rows])

    async def _locked(self, conn: Any, room_id: str) -> tuple[Any, list[Any]]:
        room = await conn.fetchrow(Q.ROOM_FOR_UPDATE, room_id)
        if room is None:
            raise not_found()
        return room, list(await conn.fetch(Q.PLAYERS, room_id))

    async def _start_engine(self, conn: Any, room: Any, players: Sequence[Any]) -> Outcome:
        engine = ENGINES[room["game_type"]]
        scope = _json(room["scope"]) or {}
        options = engine.settings(_json(room["settings"]) or {})
        infos = [PlayerInfo(p["user_id"], p["seat"], p["display_name"]) for p in players if p["left_at"] is None]
        if room["mode"] == "bot":
            infos.append(PlayerInfo(BOT_ID, 1, BOT_NAME, bot=True))
        ctx = self._ctx(conn, room)
        topics, labels = scope.get("topic_ids") or [], scope.get("labels") or []
        if room["game_type"] == "debate":
            topic = await DbQuestions(conn).debate_topic(topics, [p.user_id for p in infos])
            if topic is None:
                raise GamesError(409, "BANK_EMPTY", "Бұл тақырыптарға дебат тақырыбы әлі дайын емес.")
            outcome = await debate.start(infos, topics, labels, options, ctx, topic=topic)
            outcome.log += [AnswerLog(topic["qid"], p.user_id, None) for p in infos]
            return outcome
        return await engine.start(infos, topics, labels, options, ctx)

    # ------------------------------------------------------------------ масштаб

    async def scopes(self) -> list[dict[str, Any]]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(Q.SCOPES)
        subjects: dict[str, dict[str, Any]] = {}
        for row in rows:
            subject = subjects.setdefault(str(row["subject_id"]), {
                "subject_id": str(row["subject_id"]), "title": row["subject"], "books": {}})
            book = subject["books"].setdefault(row["book"], {
                "book": row["book"], "title": row["book_title"], "grade": row["grade"], "paragraphs": []})
            book["paragraphs"].append({
                "topic_id": row["topic_id"], "label": _label(row), "chapter": row["chapter"],
                "mcq": int(row["mcq"]), "debate": int(row["debate"]),
            })
        return [s | {"books": list(s["books"].values())} for s in subjects.values()]

    # ------------------------------------------------------------------ бөлмелер

    async def create_room(self, user_id: str, role: str, req: CreateRoomRequest) -> dict[str, Any]:
        if role not in ("student", "teacher"):
            raise forbidden("Ойын бөлмесін тек оқушы не мұғалім ашады.")
        game = req.game_type
        engine = ENGINES[game]
        if req.mode not in MODES[game]:
            raise GamesError(422, "INVALID_MODE", "Бұл ойында мұндай режим жоқ.")
        if role == "teacher" and req.mode != "multi":
            raise forbidden("Мұғалім ойынға қатыспайды, тек сыныпқа бөлме ашады.")
        try:
            options = engine.settings(req.settings)
        except GameRuleError as exc:
            raise _rule_error(exc) from None
        if req.source != "paragraphs" and game == "debate":
            raise GamesError(409, "DEBATE_NEEDS_TEXTBOOK",
                             "Дебат тақырыбы оқулық мәтініне сүйенеді: «Оқулық параграфтары» көзін таңдаңыз.")
        # D98: пән банкі мен еркін тақырыптың колодасы бөлмені ашатын байланыстан бұрын құрылады
        # (еркін тақырыпта LLM шақырылуы мүмкін — ол кезде байланыс ұсталмайды).
        scope: dict[str, Any] | None = None
        if req.source == "bank":
            subject_id = _uuid(req.subject_id)
            deck = await self._deck(self._bank.bank_deck(subject_id, req.topic_query, min_bank=MIN_BANK[game]))
            scope = deck.scope("bank", subject_id=subject_id, book=None)
        elif req.source == "topic":
            deck = await self._deck(self._bank.topic_deck(user_id, req.subject_text or "", req.topic_query or "",
                                                          min_bank=MIN_BANK[game], fmt=deck_format(game)))
            scope = deck.scope("topic", subject_id=None, book=None)
        async with self._pool.acquire() as conn:
            if scope is None:
                scope = await self._paragraph_scope(conn, game, req)
            name = _short_name(await conn.fetchval(Q.DISPLAY_NAME, user_id) or "", 0)
            multi = req.mode == "multi"
            async with conn.transaction():
                room_id = await self._insert_room(conn, game, req.mode, user_id, role, scope, options, multi)
                if role == "student":
                    await conn.execute(Q.INSERT_PLAYER, room_id, user_id, 0, name)
                if not multi:
                    room, players = await self._locked(conn, room_id)
                    outcome = await self._start(conn, room, players)
                    room = await conn.fetchrow(Q.ROOM, room_id)
                    return self._view(room, players, user_id, outcome.state, 1)
            room = await conn.fetchrow(Q.ROOM, room_id)
            players = await conn.fetch(Q.PLAYERS, room_id)
        return self._view(room, players, user_id, None, 0)

    async def _paragraph_scope(self, conn: Any, game: str, req: CreateRoomRequest) -> dict[str, Any]:
        """Оқулық §-тері: ойын банкі мен §-ке байланған емтихан тесттері бірге саналады (D98)."""
        subject_id = _uuid(req.subject_id)
        topic_ids = list(dict.fromkeys(req.topic_ids))
        rows = {r["topic_id"]: r for r in await conn.fetch(Q.SCOPE_CHECK, subject_id, req.book, topic_ids)}
        if len(rows) != len(topic_ids):
            raise GamesError(422, "INVALID_SCOPE", "Таңдалған § бұл оқулықта жоқ.")
        if sum(r["mcq"] for r in rows.values()) < MIN_BANK[game] or (
                game == "debate" and sum(r["debate"] for r in rows.values()) < 1):
            raise GamesError(409, "BANK_EMPTY", "Бұл тақырыптарға ойын сұрақтары әлі жеткіліксіз.")
        labels = [_label(rows[t]) for t in topic_ids]
        if game == "debate":
            return {"subject_id": subject_id, "book": req.book, "topic_ids": topic_ids, "labels": labels}
        deck = await self._deck(self._bank.paragraph_deck(conn, subject_id, topic_ids, labels,
                                                          min_bank=MIN_BANK[game]))
        return deck.scope("paragraphs", subject_id=subject_id, book=req.book)

    @staticmethod
    async def _deck(build: Any) -> Any:
        try:
            return await build
        except BankShort as exc:
            raise GamesError(409, "BANK_EMPTY", f"Бұл таңдауда ойынға сұрақ жеткіліксіз: {exc.found} / {exc.needed}. "
                             "Тақырыпты басқаша жазып көріңіз немесе кеңірек таңдаңыз.") from None
        except GenerationLimit:
            raise GamesError(429, "GENERATION_LIMIT", "Бүгін жаңа сұрақ құру шегі бітті. Дайын пән банкінен не "
                             "оқулық §-терінен ойнай аласыз, ертең қайта көріңіз.") from None

    async def bank_subjects(self) -> list[dict[str, Any]]:
        """D98: емтихан банкінде белсенді тесті бар пәндер (оқулығы жоқ «Дүниежүзі тарихы» да)."""
        return await self._bank.bank_subjects()

    async def preview(self, req: PreviewRequest) -> dict[str, Any]:
        """Бөлме ашпай: таңдалған көзде қанша сұрақ бар, ойынға қанша керек, генерация керек пе (LLM шақырылмайды)."""
        needed = MIN_BANK[req.game_type]
        if req.source == "bank":
            found = len(await self._bank.bank_pool(_uuid(req.subject_id), req.topic_query, 200))
            return {"source": "bank", "available": found, "needed": needed, "deficit": 0, "generate": False,
                    "ready": found >= needed}
        if req.source == "topic":
            plan = await self._bank.topic_plan(req.subject_text or "", req.topic_query or "",
                                               fmt=deck_format(req.game_type))
            generate = bool(plan.deficit) and on_demand_enabled()
            return {"source": "topic", "available": plan.found, "needed": needed, "deficit": plan.deficit,
                    "generate": generate, "ready": plan.found >= needed or generate,
                    "from_cache": len(plan.cached), "from_bank": len(plan.examiner)}
        subject_id = _uuid(req.subject_id)
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(Q.SCOPE_CHECK, subject_id, req.book, list(dict.fromkeys(req.topic_ids)))
        found = sum(int(r["mcq"]) for r in rows)
        return {"source": "paragraphs", "available": found, "needed": needed, "deficit": 0, "generate": False,
                "ready": found >= needed}

    async def _insert_room(self, conn: Any, game: str, mode: str, user_id: str, role: str, scope: dict,
                           options: dict, multi: bool) -> str:
        status = "lobby" if multi else "playing"
        for _ in range(CODE_ATTEMPTS if multi else 1):
            code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6)) if multi else None
            try:
                async with conn.transaction():
                    row = await conn.fetchrow(Q.INSERT_ROOM, game, mode, user_id, role,
                                              json.dumps(scope, ensure_ascii=False), json.dumps(options), code, status)
                    return row["room_id"]
            except asyncpg.UniqueViolationError:
                continue
        raise GamesError(503, "CODE_UNAVAILABLE", "Бөлме кодын жасау мүмкін болмады. Қайталап көріңіз.")

    async def _start(self, conn: Any, room: Any, players: Sequence[Any]) -> Outcome:
        try:
            outcome = await self._start_engine(conn, room, players)
        except GameRuleError as exc:
            raise _rule_error(exc) from None
        engine = ENGINES[room["game_type"]]
        await conn.execute(Q.INSERT_STATE, room["room_id"], json.dumps(outcome.state, ensure_ascii=False),
                           engine.deadline(outcome.state))
        await conn.execute(Q.SET_STATUS, room["room_id"], "playing", None)
        await self._write_log(conn, room, outcome.log)
        started = dict(room) | {"status": "playing", "started_at": room["started_at"] or self._clock()}
        await self._broadcast(conn, started, players, outcome.state, 1, "playing")
        return outcome

    async def join(self, user_id: str, role: str, code: str) -> dict[str, Any]:
        if role != "student":
            raise forbidden("Ойынға тек оқушы қосылады.")
        code = code.strip().upper()
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                room_id = await conn.fetchval(Q.ROOM_BY_CODE, code)
                if room_id is None:
                    raise GamesError(404, "ROOM_NOT_FOUND", "Мұндай кодпен ашық бөлме жоқ.")
                room, players = await self._locked(conn, room_id)
                mine = next((p for p in players if p["user_id"] == user_id), None)
                if mine is not None and mine["left_at"] is None:
                    return self._view(room, players, user_id, _json(room["state"]), room["version"] or 0)
                if room["status"] != "lobby":
                    raise GamesError(409, "ROOM_STARTED", "Ойын басталып кеткен.")
                if room["host_id"] != user_id and not await conn.fetchval(Q.CAN_JOIN, room["host_id"], user_id):
                    raise forbidden("Бұл бөлмеге тек бөлме иесімен бір сыныпта оқитын оқушылар кіре алады.")
                engine = ENGINES[room["game_type"]]
                seated = [p for p in players if p["left_at"] is None]
                if len(seated) >= engine.MAX_PLAYERS:
                    raise GamesError(409, "ROOM_FULL", "Бөлме толы.")
                taken = {p["seat"] for p in players}
                seat = next(s for s in range(6) if s not in taken)
                name = _short_name(await conn.fetchval(Q.DISPLAY_NAME, user_id) or "", seat)
                await conn.execute(Q.INSERT_PLAYER, room_id, user_id, seat, name)
                players = list(await conn.fetch(Q.PLAYERS, room_id))
                await self._broadcast(conn, room, players, None, 0, "lobby")
                return self._view(room, players, user_id, None, 0)

    async def room(self, user_id: str, room_id: str) -> dict[str, Any]:
        room_id = _uuid(room_id)
        async with self._pool.acquire() as conn:
            room = await conn.fetchrow(Q.ROOM, room_id)
            if room is None:
                raise not_found()
            players = list(await conn.fetch(Q.PLAYERS, room_id))
        if room["host_id"] != user_id and not any(p["user_id"] == user_id for p in players):
            raise not_found()
        return self._view(room, players, user_id, _json(room["state"]), room["version"] or 0)

    async def start(self, user_id: str, room_id: str) -> dict[str, Any]:
        room_id = _uuid(room_id)
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                room, players = await self._locked(conn, room_id)
                if room["host_id"] != user_id:
                    raise forbidden("Ойынды тек бөлме иесі бастайды.")
                if room["status"] != "lobby":
                    raise GamesError(409, "ROOM_STARTED", "Ойын басталып кеткен.")
                engine = ENGINES[room["game_type"]]
                seated = [p for p in players if p["left_at"] is None]
                if not engine.MIN_PLAYERS <= len(seated) <= engine.MAX_PLAYERS:
                    raise GamesError(409, "NOT_ENOUGH_PLAYERS",
                                     f"Бұл ойынға {engine.MIN_PLAYERS}–{engine.MAX_PLAYERS} ойыншы керек.")
                outcome = await self._start(conn, room, seated)
                room = await conn.fetchrow(Q.ROOM, room_id)
                return self._view(room, players, user_id, outcome.state, 1)

    async def leave(self, user_id: str, room_id: str) -> dict[str, Any]:
        room_id = _uuid(room_id)
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                room, players = await self._locked(conn, room_id)
                me = next((p for p in players if p["user_id"] == user_id), None)
                is_host = room["host_id"] == user_id
                if me is None and not is_host:
                    raise not_found()
                status = room["status"]
                if status == "lobby":
                    if is_host:
                        await conn.execute(Q.SET_STATUS, room_id, "abandoned", None)
                        await self._broadcast(conn, room, players, None, 0, "abandoned")
                    else:
                        await conn.execute(Q.DELETE_PLAYER, room_id, user_id)
                        players = [p for p in players if p["user_id"] != user_id]
                        await self._broadcast(conn, room, players, None, 0, "lobby")
                    return {"left": True}
                if status == "playing" and me is not None and me["left_at"] is None:
                    await conn.execute(Q.MARK_LEFT, room_id, user_id)
                    state = _json(room["state"])
                    try:
                        outcome = await ENGINES[room["game_type"]].leave(state, user_id, self._ctx(conn, room))
                    except GameRuleError as exc:
                        raise _rule_error(exc) from None
                    players = list(await conn.fetch(Q.PLAYERS, room_id))
                    await self._persist(conn, room, players, outcome)
                elif me is not None:
                    await conn.execute(Q.MARK_LEFT, room_id, user_id)
                return {"left": True}

    async def act(self, user_id: str, room_id: str, req: ActionRequest) -> dict[str, Any]:
        room_id = _uuid(room_id)
        action = req.payload()
        request_id = str(req.client_request_id)
        moderation: str | None = None
        if action["type"] == "submit":
            moderation = await self._moderate(room_id, user_id, action.get("text") or "")
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                room, players = await self._locked(conn, room_id)
                me = next((p for p in players if p["user_id"] == user_id), None)
                if me is None:
                    raise not_found()
                if room["status"] != "playing" or me["left_at"] is not None:
                    raise GamesError(409, "NOT_PLAYING", "Бұл ойын жүріп жатқан жоқ.")
                state = _json(room["state"])
                if remember_request(state, user_id, request_id):
                    return self._view(room, players, user_id, _json(room["state"]), room["version"])
                alerts: dict[int, str] = {}
                if moderation is not None:
                    action["moderation"] = moderation
                    if moderation != "SAFE":
                        alert = await self._alert(conn, room_id, user_id, action.get("text") or "", moderation,
                                                  state.get("round"))
                        if alert:
                            alerts[int(state.get("round") or 1)] = alert
                try:
                    outcome = await ENGINES[room["game_type"]].act(state, user_id, action, self._ctx(conn, room))
                except GameRuleError as exc:
                    raise _rule_error(exc) from None
                version = await self._persist(conn, room, players, outcome, alerts)
                status = "finished" if outcome.finished else room["status"]
                return self._view(dict(room) | {"status": status}, players, user_id, outcome.state, version)

    async def _moderate(self, room_id: str, user_id: str, text: str) -> str:
        """Дебат мәтіні (D52): код сүзгісі — 422, модерация — санат (ережені бұзса, мәтін қарсыласқа көрсетілмейді)."""
        from ..examiner.session.input_filter import check_code_filter, moderate_text

        problem = check_code_filter(text)
        if problem:
            raise GamesError(422, "TEXT_FILTERED", problem)
        decision = await moderate_text(self._llm(), text, topic_context="тарих пәнінен оқушылар дебаты")
        return decision.category

    @staticmethod
    async def _alert(conn: Any, room_id: str, user_id: str, text: str, category: str, round_no: Any) -> str | None:
        alert_id = str(uuid.uuid4())
        try:
            async with conn.transaction():
                await conn.execute(Q.ALERT, alert_id, user_id, category, text[:4000],
                                   json.dumps({"room_id": room_id, "game": "debate", "round": round_no}))
            return alert_id
        except asyncpg.PostgresError as exc:
            logger.warning("games alert was not written: %s", type(exc).__name__)
            return None

    async def my_rooms(self, user_id: str) -> list[dict[str, Any]]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(Q.MY_ROOMS, user_id)
        return [{"room_id": r["room_id"], "game_type": r["game_type"], "mode": r["mode"], "status": r["status"],
                 "join_code": r["join_code"] if r["status"] in ("lobby", "playing") else None,
                 "is_host": r["is_host"], "players": r["players"], "created_at": r["created_at"].isoformat()}
                for r in rows]

    async def record(self, user_id: str) -> dict[str, Any]:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(Q.RECORD, user_id)
        if row is None:
            return {"best_score": None, "best_correct": None, "achieved_at": None}
        return {"best_score": row["best_score"], "best_correct": row["best_correct"],
                "achieved_at": row["achieved_at"].isoformat()}

    # ------------------------------------------------------------------ таймер

    async def sweep_once(self, limit: int = SWEEP_BATCH) -> int:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(Q.DUE, limit)
        done = 0
        for row in rows:
            try:
                done += await self._tick(row["room_id"])
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 — бір бөлменің қатесі қалғандарын тоқтатпайды
                logger.warning("games tick failed for a room: %s", type(exc).__name__)
        return done

    async def _tick(self, room_id: str) -> int:
        judge_job: tuple[int, dict[str, Any]] | None = None
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                room = await conn.fetchrow(Q.ROOM_FOR_UPDATE_NOWAIT, room_id)
                if room is None:
                    return 0
                state = _json(room["state"])
                if room["status"] != "playing" or state is None:
                    await conn.execute(Q.LEASE_DEADLINE, room_id, room["version"], None)
                    return 0
                engine = ENGINES[room["game_type"]]
                due = engine.deadline(state)
                now = self._clock()
                if due is None or due > now:
                    await conn.execute(Q.LEASE_DEADLINE, room_id, room["version"], due)
                    return 0
                if room["game_type"] == "debate" and state.get("phase") == "judging":
                    leased = await conn.fetchval(Q.LEASE_DEADLINE, room_id, room["version"],
                                                 now + timedelta(seconds=JUDGE_LEASE_S))
                    if leased is None:
                        return 0
                    judge_job = (room["version"], state)
                else:
                    players = list(await conn.fetch(Q.PLAYERS, room_id))
                    outcome = await engine.timeout(state, self._ctx(conn, room))
                    await self._persist(conn, room, players, outcome)
                    return 1
        if judge_job is not None:
            await self._judge(room_id, *judge_job)
            return 1
        return 0

    async def _judge(self, room_id: str, version: int, state: dict[str, Any]) -> None:
        verdict = None
        try:
            async with self._pool.acquire() as conn:
                row = await conn.fetchrow(Q.DEBATE_REFERENCE, state["topic"]["qid"])
            reference = row["reference_context"] if row else ""
            gateway = self._llm()
            if gateway is not None:
                verdict = await judge_debate(gateway, state["topic"]["statement"], reference,
                                             debate.transcript(state))
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 — төреші қолжетімсіз болса, кейін қайталанады
            logger.warning("debate judge failed: %s", type(exc).__name__)
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                room = await conn.fetchrow(Q.ROOM_FOR_UPDATE, room_id)
                current = _json(room["state"]) if room else None
                if room is None or room["version"] != version or (current or {}).get("phase") != "judging":
                    return
                players = list(await conn.fetch(Q.PLAYERS, room_id))
                outcome = (debate.apply_verdict(current, verdict) if verdict
                           else debate.judge_failed(current, self._ctx(conn, room)))
                await self._persist(conn, room, players, outcome)

    async def run_sweeper(self, interval: float = SWEEP_INTERVAL_S) -> None:
        while True:
            try:
                await self.sweep_once()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 — база уақытша қолжетімсіз болса, цикл тоқтамайды
                logger.warning("games sweeper error: %s", type(exc).__name__)
            await asyncio.sleep(interval)

    def start_sweeper(self) -> None:
        if self._sweeper is None or self._sweeper.done():
            self._sweeper = asyncio.create_task(self.run_sweeper())

    async def close(self) -> None:
        if self._sweeper is not None:
            self._sweeper.cancel()
            try:
                await self._sweeper
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
            self._sweeper = None
