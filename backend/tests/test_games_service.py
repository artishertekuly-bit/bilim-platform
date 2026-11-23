"""Ойын сервисі (geimifikatsiya §5–§7): бөлме, кіру ережесі (D52), әрекет, таймер, хабар тарату (D67), дебат."""

from __future__ import annotations

import asyncio
import json
import random
import unittest
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.examiner.session.input_filter import ModerationSchema
from app.games.dto import ActionRequest, CreateRoomRequest
from app.games.errors import GamesError
from app.games.judge import JudgeVerdict, SideScore
from app.games.service import GamesService

T0 = datetime(2026, 11, 25, 9, 0, tzinfo=timezone.utc)
SUBJECT = str(uuid.uuid4())
HOST, MATE, STRANGER, TEACHER = (str(uuid.uuid4()) for _ in range(4))
CLASS = str(uuid.uuid4())


def run(coro):
    return asyncio.run(coro)


class FakeDB:
    """Жадтағы база: сервистің сұраулары `/* games:<атау> */` белгісі бойынша өңделеді."""

    def __init__(self, clock) -> None:
        self.clock = clock
        self.rooms: dict[str, dict] = {}
        self.players: dict[str, list[dict]] = {}
        self.states: dict[str, dict] = {}
        self.questions: list[dict] = []
        self.answers: list[tuple] = []
        self.entries: list[tuple] = []
        self.alerts: list[tuple] = []
        self.records: dict[str, tuple] = {}
        self.broadcasts: list[dict] = []
        self.calls: list[str] = []
        self.paragraphs = {f"t{i}": {"topic_id": f"t{i}", "paragraph_no": str(i), "paragraph_title": f"Тақырып {i}"}
                           for i in range(1, 4)}
        self.classes = {CLASS: TEACHER}
        self.members = {(CLASS, HOST)}
        self.names = {HOST: "Әлия Серікқызы Нұрова", MATE: "Дәулет", STRANGER: "Бөтен"}

    def add_questions(self, n: int = 40, topics=("t1", "t2"), debate: int = 2) -> None:
        options = [{"id": x, "text": x.upper()} for x in "abcd"]
        for i in range(n):
            self.questions.append({"question_id": str(uuid.uuid4()), "kind": "mcq", "topic_id": topics[i % len(topics)],
                                   "paragraph": "§1", "difficulty": 1 + (i // len(topics)) % 3,
                                   "content": json.dumps({"stem": f"Сұрақ {i}?", "options": options}),
                                   "answer_key": json.dumps({"correct_option_id": "b"})})
        for i in range(debate):
            self.questions.append({"question_id": str(uuid.uuid4()), "kind": "debate_topic", "topic_id": topics[0],
                                   "paragraph": "§1", "difficulty": 2,
                                   "content": json.dumps({"statement": f"Тұжырым {i}"}), "answer_key": "{}",
                                   "reference_context": "Оқулық мәтіні"})

    # ----------------------------------------------------------------- көмекші

    def _room(self, room_id: str) -> dict | None:
        room = self.rooms.get(room_id)
        if room is None:
            return None
        state = self.states.get(room_id)
        return room | {"state": state["state"] if state else None, "version": state["version"] if state else None}

    def handle(self, sql: str, args: tuple):
        name = sql.split("/* games:", 1)[1].split(" */", 1)[0]
        self.calls.append(name)
        return getattr(self, "q_" + name)(*args)

    def q_scope_check(self, subject, book, topic_ids):
        rows = []
        for t in topic_ids:
            if t in self.paragraphs and subject == SUBJECT and book == "hist8":
                mcq = sum(1 for q in self.questions if q["topic_id"] == t and q["kind"] == "mcq")
                deb = sum(1 for q in self.questions if q["topic_id"] == t and q["kind"] == "debate_topic")
                rows.append(self.paragraphs[t] | {"mcq": mcq, "debate": deb})
        return rows

    def q_scopes(self):
        return [{"subject_id": SUBJECT, "subject": "Қазақстан тарихы", "sort_order": 1, "book": "hist8",
                 "book_title": "8-сынып", "grade": 8, "chapter_no": "1", "chapter": "I тарау", "sort_no": int(t[1]),
                 **self.paragraphs[t],
                 "mcq": sum(1 for q in self.questions if q["topic_id"] == t and q["kind"] == "mcq"),
                 "debate": sum(1 for q in self.questions if q["topic_id"] == t and q["kind"] == "debate_topic")}
                for t in ("t1", "t2")]

    def q_display_name(self, uid):
        return self.names.get(uid)

    def q_can_join(self, host, uid):
        for class_id, teacher in self.classes.items():
            if (class_id, uid) in self.members and (teacher == host or (class_id, host) in self.members):
                return True
        return False

    def q_insert_room(self, game, mode, host, role, scope, settings, code, status):
        room_id = str(uuid.uuid4())
        self.rooms[room_id] = {"room_id": room_id, "game_type": game, "mode": mode, "host_id": host,
                               "host_role": role, "scope": scope, "settings": settings, "join_code": code,
                               "status": status, "result": None, "created_at": self.clock(),
                               "started_at": self.clock() if status == "playing" else None, "finished_at": None}
        self.players[room_id] = []
        return {"room_id": room_id, "created_at": self.clock()}

    def q_insert_player(self, room_id, uid, seat, name):
        self.players[room_id].append({"user_id": uid, "seat": seat, "display_name": name,
                                      "joined_at": self.clock(), "left_at": None})

    def q_room(self, room_id):
        return self._room(room_id)

    q_room_for_update = q_room
    q_room_tick = q_room

    def q_room_by_code(self, code):
        return next((r["room_id"] for r in self.rooms.values()
                     if r["join_code"] == code and r["status"] in ("lobby", "playing")), None)

    def q_players(self, room_id):
        return sorted((dict(p) for p in self.players.get(room_id, [])), key=lambda p: p["seat"])

    def q_delete_player(self, room_id, uid):
        self.players[room_id] = [p for p in self.players[room_id] if p["user_id"] != uid]

    def q_mark_left(self, room_id, uid):
        for p in self.players[room_id]:
            if p["user_id"] == uid and p["left_at"] is None:
                p["left_at"] = self.clock()

    def q_insert_state(self, room_id, state, deadline):
        self.states[room_id] = {"state": state, "version": 1, "deadline": deadline}

    def q_save_state(self, room_id, state, deadline):
        entry = self.states[room_id]
        entry.update(state=state, version=entry["version"] + 1, deadline=deadline)
        return entry["version"]

    def q_lease(self, room_id, version, deadline):
        entry = self.states.get(room_id)
        if entry is None or entry["version"] != version:
            return None
        entry["deadline"] = deadline
        return version

    def q_set_status(self, room_id, status, result):
        room = self.rooms[room_id]
        room["status"] = status
        if result is not None:
            room["result"] = result

    def q_due(self, limit):
        due = [rid for rid, s in self.states.items() if s["deadline"] is not None and s["deadline"] <= self.clock()]
        return [{"room_id": rid} for rid in due[:limit]]

    def q_my_rooms(self, uid):
        return []

    def q_pick_question(self, topics, viewers, exclude, difficulty):
        pool = [q for q in self.questions if q["kind"] == "mcq" and q["topic_id"] in topics
                and q["question_id"] not in exclude]
        pool.sort(key=lambda q: abs(q["difficulty"] - difficulty))
        return pool[0] if pool else None

    def q_pick_debate_topic(self, topics, viewers):
        return next((q for q in self.questions if q["kind"] == "debate_topic" and q["topic_id"] in topics), None)

    def q_debate_reference(self, qid):
        q = next(q for q in self.questions if q["question_id"] == qid)
        return {"reference_context": q.get("reference_context", ""), "content": q["content"]}

    def q_insert_answers(self, room_id, users, qids, corrects):
        self.answers += list(zip(users, qids, corrects))

    def q_insert_debate_entry(self, room_id, uid, round_no, text, moderation, alert_id):
        self.entries.append((uid, round_no, text, moderation, alert_id))

    def q_alert(self, alert_id, uid, category, text, context):
        self.alerts.append((alert_id, uid, category, text))

    def q_upsert_record(self, uid, score, correct):
        if uid not in self.records or self.records[uid][0] < score:
            self.records[uid] = (score, correct)

    def q_record(self, uid):
        return None

    def q_broadcast(self, room_id, public, users, private):
        self.broadcasts.append({"room_id": room_id, "public": json.loads(public),
                                "private": {u: json.loads(p) for u, p in zip(users, private)}})
        return 1 + len(users)


class FakeConn:
    def __init__(self, db: FakeDB) -> None:
        self.db = db

    async def fetch(self, sql, *args):
        return self.db.handle(sql, args) or []

    async def fetchrow(self, sql, *args):
        return self.db.handle(sql, args)

    async def fetchval(self, sql, *args):
        return self.db.handle(sql, args)

    async def execute(self, sql, *args):
        self.db.handle(sql, args)
        return "OK"

    @asynccontextmanager
    async def transaction(self):
        yield


class FakePool:
    def __init__(self, db: FakeDB) -> None:
        self.conn = FakeConn(db)

    @asynccontextmanager
    async def acquire(self):
        yield self.conn


class FakeGateway:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def complete(self, task, prompt, messages, *, schema=None, variant=None):
        self.calls.append(str(task))
        if schema is ModerationSchema:
            return SimpleNamespace(parsed=ModerationSchema(category="PROFANITY", reason="балағат"))
        if schema is JudgeVerdict:
            score = SideScore(logic=4, facts=3, response=3)
            return SimpleNamespace(parsed=JudgeVerdict(winner="con", pro=SideScore(logic=1, facts=1, response=1),
                                                       con=score, tip_pro="Дерек келтір.", tip_con="Жарайсың.",
                                                       summary="Қарсылас жақ дәлелдірек."))
        raise AssertionError(schema)


class ServiceCase(unittest.TestCase):
    def setUp(self) -> None:
        self.now = T0
        self.db = FakeDB(lambda: self.now)
        self.db.add_questions()
        self.gateway = FakeGateway()
        self.service = GamesService(FakePool(self.db), gateway=self.gateway, clock=lambda: self.now,
                                    rng=random.Random(5))

    def create(self, game="baige", mode="multi", user=HOST, role="student", topics=("t1", "t2"), settings=None):
        req = CreateRoomRequest(game_type=game, mode=mode, subject_id=SUBJECT, book="hist8", topic_ids=list(topics),
                                settings=settings or {})
        return run(self.service.create_room(user, role, req))

    def act(self, user, room_id, **fields):
        return run(self.service.act(user, room_id, ActionRequest(client_request_id=uuid.uuid4(), **fields)))

    def assert_clean_broadcasts(self):
        for message in self.db.broadcasts:
            text = json.dumps(message["public"], ensure_ascii=False)
            for key in ('"correct"', '"answer_key"', '"reference_context"', '"ships"', '"my_ships"', '"secret"',
                        '"my_cards"'):
                self.assertNotIn(key, text)


class RoomTest(ServiceCase):
    def test_validation(self):
        with self.assertRaises(GamesError) as err:
            self.create(game="checkers", mode="bot", user=TEACHER, role="teacher")
        self.assertEqual(err.exception.status, 403)
        with self.assertRaises(GamesError) as err:
            self.create(game="conquest", mode="bot")
        self.assertEqual(err.exception.code, "INVALID_MODE")
        with self.assertRaises(GamesError) as err:
            self.create(topics=("t1", "t9"))
        self.assertEqual(err.exception.code, "INVALID_SCOPE")
        with self.assertRaises(GamesError) as err:
            self.create(topics=("t3",))
        self.assertEqual(err.exception.code, "BANK_EMPTY")
        with self.assertRaises(GamesError) as err:
            self.create(user=HOST, role="parent")
        self.assertEqual(err.exception.status, 403)

    def test_join_rules_and_start(self):
        view = self.create()
        room_id = view["room"]["room_id"]
        code = view["room"]["join_code"]
        self.assertEqual(len(code), 6)
        self.assertEqual(view["room"]["players"][0]["name"], "Әлия Серікқызы")
        with self.assertRaises(GamesError) as err:
            run(self.service.join(STRANGER, "student", code))
        self.assertEqual(err.exception.status, 403)
        with self.assertRaises(GamesError) as err:
            run(self.service.start(HOST, room_id))
        self.assertEqual(err.exception.code, "NOT_ENOUGH_PLAYERS")
        self.db.members.add((CLASS, MATE))
        joined = run(self.service.join(MATE, "student", code.lower()))
        self.assertEqual(joined["me"]["seat"], 1)
        self.assertEqual(self.db.broadcasts[-1]["public"]["status"], "lobby")
        with self.assertRaises(GamesError):
            run(self.service.start(MATE, room_id))
        started = run(self.service.start(HOST, room_id))
        self.assertEqual(started["room"]["status"], "playing")
        self.assertEqual(started["public"]["phase"], "question")
        message = self.db.broadcasts[-1]
        self.assertEqual(set(message["private"]), {HOST, MATE})
        self.assertEqual(message["private"][MATE]["private"]["riding"], True)
        with self.assertRaises(GamesError) as err:
            run(self.service.join(STRANGER, "student", code))
        self.assertIn(err.exception.code, ("ROOM_STARTED", "FORBIDDEN"))
        self.assert_clean_broadcasts()
        self.assertEqual(len(self.db.answers), 2)  # екеуі де сұрақты көрді

    def test_actions_idempotent_and_logged(self):
        self.db.members.add((CLASS, MATE))
        room_id = self.create()["room"]["room_id"]
        run(self.service.join(MATE, "student", self.db.rooms[room_id]["join_code"]))
        run(self.service.start(HOST, room_id))
        request_id = uuid.uuid4()
        first = run(self.service.act(HOST, room_id, ActionRequest(client_request_id=request_id, type="answer",
                                                                  option="b")))
        again = run(self.service.act(HOST, room_id, ActionRequest(client_request_id=request_id, type="answer",
                                                                  option="b")))
        self.assertEqual(first["version"], again["version"])
        self.assertEqual(first["private"]["my_answer"], "b")
        after = self.act(MATE, room_id, type="answer", option="c")
        self.assertEqual(after["public"]["phase"], "decide")
        self.assertIn((HOST, after["public"]["last"]["qid"], True), self.db.answers)
        self.assertIn((MATE, after["public"]["last"]["qid"], False), self.db.answers)
        with self.assertRaises(GamesError) as err:
            self.act(STRANGER, room_id, type="answer", option="b")
        self.assertEqual(err.exception.status, 404)
        self.assert_clean_broadcasts()

    def test_teacher_room_and_projector_view(self):
        self.db.members.add((CLASS, MATE))
        view = self.create(game="conquest", user=TEACHER, role="teacher", settings={"size": 5})
        room_id = view["room"]["room_id"]
        self.assertEqual(view["room"]["players"], [])
        self.assertTrue(view["room"]["is_host"])
        for uid in (HOST, MATE):
            run(self.service.join(uid, "student", view["room"]["join_code"]))
        with self.assertRaises(GamesError):
            run(self.service.join(STRANGER, "student", view["room"]["join_code"]))
        with self.assertRaises(GamesError) as err:
            run(self.service.start(TEACHER, room_id))
        self.assertEqual(err.exception.code, "NOT_ENOUGH_PLAYERS")  # Әдіс жорығына кемінде 3 ойыншы
        self.db.members.add((CLASS, STRANGER))
        run(self.service.join(STRANGER, "student", view["room"]["join_code"]))
        started = run(self.service.start(TEACHER, room_id))
        self.assertIsNone(started["me"]["seat"])
        self.assertEqual(started["private"], {})
        self.assertEqual(len(started["public"]["cells"]), 25)
        self.assertEqual(set(self.db.broadcasts[-1]["private"]), {HOST, MATE, STRANGER})

    def test_leave_lobby_and_playing(self):
        self.db.members.add((CLASS, MATE))
        room_id = self.create(game="checkers")["room"]["room_id"]
        code = self.db.rooms[room_id]["join_code"]
        run(self.service.join(MATE, "student", code))
        run(self.service.leave(MATE, room_id))
        self.assertEqual([p["user_id"] for p in self.db.players[room_id]], [HOST])
        run(self.service.join(MATE, "student", code))
        run(self.service.start(HOST, room_id))
        run(self.service.leave(MATE, room_id))
        self.assertEqual(self.db.rooms[room_id]["status"], "finished")
        view = run(self.service.room(HOST, room_id))
        self.assertEqual(view["public"]["finish_reason"], "opponent_left")
        host_room = self.create()["room"]["room_id"]
        run(self.service.leave(HOST, host_room))
        self.assertEqual(self.db.rooms[host_room]["status"], "abandoned")

    def test_scopes(self):
        subjects = run(self.service.scopes())
        self.assertEqual(subjects[0]["books"][0]["paragraphs"][0]["label"], "§1 Тақырып 1")
        self.assertEqual(subjects[0]["books"][0]["paragraphs"][0]["mcq"], 20)


class TimerTest(ServiceCase):
    def test_bot_game_runs_on_sweeper(self):
        view = self.create(game="battleship", mode="bot")
        room_id = view["room"]["room_id"]
        self.assertEqual(view["room"]["status"], "playing")
        self.assertEqual(view["public"]["phase"], "placement")
        self.act(HOST, room_id, type="auto_place")
        progressed = 0
        for step in range(12):
            self.now += timedelta(seconds=35)
            progressed += run(self.service.sweep_once())
        self.assertGreater(progressed, 3)
        state = json.loads(self.db.states[room_id]["state"])
        self.assertTrue(state["shots"][HOST] or state["phase"] == "finished")
        self.assert_clean_broadcasts()
        for message in self.db.broadcasts:
            self.assertEqual(set(message["private"]), {HOST})

    def test_solo_baige_record(self):
        room_id = self.create(mode="solo", settings={"stages": 3})["room"]["room_id"]
        for _ in range(3):
            self.now += timedelta(seconds=25)
            run(self.service.sweep_once())
        self.assertEqual(self.db.rooms[room_id]["status"], "finished")
        self.assertEqual(self.db.records[HOST], (0, 0))


class DebateServiceTest(ServiceCase):
    def start_debate(self):
        self.db.members.add((CLASS, MATE))
        room_id = self.create(game="debate")["room"]["room_id"]
        run(self.service.join(MATE, "student", self.db.rooms[room_id]["join_code"]))
        run(self.service.start(HOST, room_id))
        return room_id

    def test_moderation_alert_and_judge(self):
        room_id = self.start_debate()
        with self.assertRaises(GamesError) as err:
            self.act(HOST, room_id, type="submit", text="!!!!!!!")
        self.assertEqual(err.exception.code, "TEXT_FILTERED")
        self.act(HOST, room_id, type="submit", text="Сен сука, мен дұрыспын")
        self.assertEqual(self.db.alerts[0][2], "PROFANITY")
        self.assertEqual(self.db.entries[0][3], "PROFANITY")
        self.assertEqual(self.db.entries[0][4], self.db.alerts[0][0])
        view = self.act(MATE, room_id, type="submit", text="Абылай хан бейбітшілік саясатын жүргізді.")
        self.assertNotIn("сука", json.dumps(view["public"], ensure_ascii=False))
        last = self.db.broadcasts[-1]
        self.assertNotIn("сука", json.dumps(last["public"], ensure_ascii=False))
        self.assertNotIn("сука", json.dumps(last["private"][MATE], ensure_ascii=False))
        self.assertTrue(last["private"][HOST]["private"]["my_entries"][0]["hidden"])  # автор өз мәтінін көреді
        for _ in range(2):
            self.now += timedelta(seconds=301)
            run(self.service.sweep_once())
        state = json.loads(self.db.states[room_id]["state"])
        self.assertEqual(state["phase"], "judging")
        run(self.service.sweep_once())
        self.assertEqual(self.db.rooms[room_id]["status"], "finished")
        final = run(self.service.room(MATE, room_id))
        self.assertEqual(final["public"]["verdict"]["winner"], "con")
        self.assertIn("game_judge", self.gateway.calls)

    def test_client_cannot_set_moderation(self):
        with self.assertRaises(Exception):
            ActionRequest(client_request_id=uuid.uuid4(), type="submit", text="x", moderation="SAFE")


if __name__ == "__main__":
    unittest.main()
