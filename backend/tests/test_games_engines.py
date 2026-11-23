"""Ойын қозғалтқыштары (geimifikatsiya §4): ережелер, таймер, нәтиже және проекцияның қауіпсіздігі (D67)."""

from __future__ import annotations

import asyncio
import json
import random
import unittest
from datetime import datetime, timedelta, timezone

from app.games.engines import baige, battleship, checkers, conquest, debate
from app.games.engines.base import (
    BOT_ID,
    Ctx,
    GameRuleError,
    PlayerInfo,
    Question,
    standings,
    strip_secrets,
    take_question,
)

NOW = datetime(2026, 11, 25, 9, 0, tzinfo=timezone.utc)
OPTIONS = ({"id": "a", "text": "A"}, {"id": "b", "text": "B"}, {"id": "c", "text": "C"}, {"id": "d", "text": "D"})


class FakeQuestions:
    def __init__(self, n: int = 300, topics: tuple[str, ...] = ("t1", "t2", "t3")) -> None:
        self.bank = [Question(f"q{i}", topics[i % len(topics)], f"§{i % len(topics) + 1}", 1 + (i // len(topics)) % 3,
                              f"Сұрақ {i}?", OPTIONS, "a") for i in range(n)]
        self.calls: list[dict] = []

    async def take(self, *, topic_ids, difficulty, viewers, exclude):
        self.calls.append({"topics": list(topic_ids), "difficulty": difficulty, "viewers": list(viewers)})
        pool = [q for q in self.bank if q.topic_id in topic_ids and q.question_id not in exclude]
        pool.sort(key=lambda q: abs(q.difficulty - difficulty))
        return pool[0] if pool else None


def run(coro):
    return asyncio.run(coro)


def ctx(questions=None, *, seconds: float = 0, seed: int = 7) -> Ctx:
    return Ctx(now=NOW + timedelta(seconds=seconds), rng=random.Random(seed), questions=questions or FakeQuestions())


def players(n: int) -> list[PlayerInfo]:
    return [PlayerInfo(f"u{i}", i, f"Оқушы {i}") for i in range(n)]


def wrong(question: dict) -> str:
    return next(o["id"] for o in question["options"] if o["id"] != question["correct"])


def assert_no_secrets(test: unittest.TestCase, view: dict) -> None:
    text = json.dumps(view, ensure_ascii=False)
    for key in ('"correct"', '"answer_key"', '"reference_context"', '"ships"', '"secret"'):
        test.assertNotIn(key, text)


class BaseHelpersTest(unittest.TestCase):
    def test_strip_secrets_removes_nested_keys(self):
        view = strip_secrets({"a": 1, "question": {"correct": "b", "stem": "?"}, "list": [{"ships": [1]}]})
        self.assertEqual(view, {"a": 1, "question": {"stem": "?"}, "list": [{}]})

    def test_take_question_falls_back_to_scope_then_repeats(self):
        source = FakeQuestions(n=2, topics=("t1",))
        state = {"topics": ["t1"], "used": []}
        c = ctx(source)
        first = run(take_question(c, state, topic_ids=["t9"], difficulty=1, viewers=["u0"]))
        second = run(take_question(c, state, topic_ids=["t1"], difficulty=1, viewers=["u0"]))
        third = run(take_question(c, state, topic_ids=["t1"], difficulty=1, viewers=["u0", BOT_ID]))
        self.assertNotEqual(first.question_id, second.question_id)
        self.assertTrue(state["repeats"])
        self.assertIn(third.question_id, {first.question_id, second.question_id})
        self.assertEqual(source.calls[-1]["viewers"], ["u0"])

    def test_take_question_empty_bank(self):
        with self.assertRaises(GameRuleError) as err:
            run(take_question(ctx(FakeQuestions(n=0)), {"topics": ["t1"], "used": []}, topic_ids=["t1"],
                              difficulty=1, viewers=[]))
        self.assertEqual(err.exception.code, "BANK_EXHAUSTED")

    def test_standings_share_places(self):
        rows = standings([{"s": 5, "c": 1}, {"s": 7, "c": 0}, {"s": 5, "c": 1}], ("s", "c"))
        self.assertEqual([r["place"] for r in rows], [1, 2, 2])


class ConquestTest(unittest.TestCase):
    def start(self, n=3, size=5, topics=("t1", "t2")):
        outcome = run(conquest.start(players(n), list(topics), ["§1", "§2"][: len(topics)],
                                     conquest.settings({"size": size}), ctx()))
        return outcome.state

    def current(self, state):
        return state["players"][state["turn"]]["id"]

    def test_settings_validation(self):
        with self.assertRaises(GameRuleError):
            conquest.settings({"size": 8})
        with self.assertRaises(GameRuleError):
            conquest.settings({"answer_s": 10})
        self.assertEqual(conquest.settings({}), {"size": 6, "answer_s": 30})

    def test_start_board(self):
        state = self.start(size=6, topics=("t1", "t2", "t3"))
        self.assertEqual(len(state["cells"]), 36)
        self.assertEqual(sum(c["diamond"] for c in state["cells"]), 4)
        self.assertEqual({c["region"] for c in state["cells"]}, {0, 1, 2})
        self.assertEqual(state["phase"], "pick")
        self.assertTrue(all(s["cards"] == ["fifty"] for s in state["stats"].values()))

    def test_capture_and_turn(self):
        state = self.start()
        uid = self.current(state)
        out = run(conquest.act(state, uid, {"type": "pick", "cell": 0}, ctx()))
        state = out.state
        self.assertEqual(state["phase"], "question")
        self.assertEqual(state["question"]["to"], [uid])
        self.assertEqual(len(out.log), 3)  # үшеуі де сұрақты көрді
        value = state["cells"][0]["value"]
        out = run(conquest.act(state, uid, {"type": "answer", "option": state["question"]["correct"]}, ctx()))
        state = out.state
        self.assertEqual(state["cells"][0]["owner"], uid)
        self.assertEqual(conquest.score(state, uid), value)
        self.assertNotEqual(self.current(state), uid)
        self.assertEqual(state["phase"], "pick")
        self.assertTrue(out.log[0].correct)

    def test_adjacency_and_shield(self):
        state = self.start()
        a = state["players"][0]["id"]
        b = state["players"][1]["id"]
        state["cells"][0]["owner"] = a
        state["cells"][1]["owner"] = b
        self.assertEqual(conquest.allowed_cells(state, a), [1, 5])
        state["cells"][1]["shield"] = True
        self.assertEqual(conquest.allowed_cells(state, a), [5])
        self.assertIn(24, conquest.allowed_cells(state, state["players"][2]["id"]))  # аумағы жоқ — кез келген бос

    def test_wrong_answer_and_second_chance(self):
        state = self.start()
        uid = self.current(state)
        state["stats"][uid]["cards"].append("second")
        state = run(conquest.act(state, uid, {"type": "pick", "cell": 0}, ctx())).state
        state = run(conquest.act(state, uid, {"type": "card", "card": "second"}, ctx())).state
        bad = wrong(state["question"])
        state = run(conquest.act(state, uid, {"type": "answer", "option": bad}, ctx())).state
        self.assertEqual(self.current(state), uid)  # екінші мүмкіндік
        self.assertIn(bad, state["question"]["removed"])
        with self.assertRaises(GameRuleError):
            run(conquest.act(state, uid, {"type": "answer", "option": bad}, ctx()))
        state = run(conquest.act(state, uid, {"type": "answer", "option": state["question"]["correct"]}, ctx())).state
        self.assertEqual(state["cells"][0]["owner"], uid)

    def test_fifty_and_double(self):
        state = self.start()
        uid = self.current(state)
        state["stats"][uid]["cards"].append("double")
        state["cells"][3]["diamond"] = False
        state = run(conquest.act(state, uid, {"type": "pick", "cell": 3}, ctx())).state
        state = run(conquest.act(state, uid, {"type": "card", "card": "fifty"}, ctx())).state
        self.assertEqual(len(state["question"]["removed"]), 2)
        self.assertNotIn(state["question"]["correct"], state["question"]["removed"])
        public = conquest.public_view(state)
        self.assertEqual(len(public["question"]["options"]), 2)
        state = run(conquest.act(state, uid, {"type": "card", "card": "double"}, ctx())).state
        value = state["cells"][3]["value"]
        state = run(conquest.act(state, uid, {"type": "answer", "option": state["question"]["correct"]}, ctx())).state
        self.assertEqual(conquest.score(state, uid), 2 * value)
        self.assertEqual(state["stats"][uid]["cards"], [])

    def test_streak_and_diamond_award_cards(self):
        state = self.start()
        uid = state["players"][0]["id"]
        cell = next(i for i, c in enumerate(state["cells"]) if c["diamond"])
        state["turn"] = 0
        state = run(conquest.act(state, uid, {"type": "pick", "cell": cell}, ctx())).state
        state = run(conquest.act(state, uid, {"type": "answer", "option": state["question"]["correct"]}, ctx())).state
        self.assertEqual(len(state["stats"][uid]["cards"]), 2)
        self.assertFalse(state["cells"][cell]["diamond"])

    def test_timeouts(self):
        state = self.start()
        uid = self.current(state)
        state = run(conquest.timeout(state, ctx(seconds=21))).state
        self.assertNotEqual(self.current(state), uid)
        uid = self.current(state)
        state = run(conquest.act(state, uid, {"type": "pick", "cell": 0}, ctx())).state
        out = run(conquest.timeout(state, ctx(seconds=31)))
        self.assertIsNone(out.state["cells"][0]["owner"])
        self.assertIsNone(out.log[0].correct)

    def test_board_full_finishes_with_tiebreak(self):
        state = self.start(n=3)
        ids = [p["id"] for p in state["players"]]
        for i, cell in enumerate(state["cells"]):
            cell["owner"] = ids[0] if i < 24 else None
            cell["value"] = 1
        state["cells"][24]["owner"] = None
        uid = self.current(state)
        state["turn"] = [p["id"] for p in state["players"]].index(ids[1])
        state = run(conquest.act(state, ids[1], {"type": "pick", "cell": 24}, ctx())).state
        out = run(conquest.act(state, ids[1], {"type": "answer", "option": state["question"]["correct"]}, ctx()))
        self.assertTrue(out.finished)
        results = conquest.results(out.state)
        self.assertEqual(results[0]["user_id"], ids[0])
        self.assertEqual(out.state["finish_reason"], "board_full")
        self.assertTrue(uid)

    def test_time_limit_and_leave(self):
        state = self.start()
        out = run(conquest.timeout(state, ctx(seconds=40 * 60 + 1)))
        self.assertTrue(out.finished)
        state = self.start()
        state = run(conquest.leave(state, state["players"][0]["id"], ctx())).state
        out = run(conquest.leave(state, state["players"][1]["id"], ctx()))
        self.assertTrue(out.finished)
        self.assertEqual(out.state["finish_reason"], "players_left")

    def test_views_hide_answer_and_cards(self):
        state = self.start()
        uid = self.current(state)
        state = run(conquest.act(state, uid, {"type": "pick", "cell": 0}, ctx())).state
        public = conquest.public_view(state)
        assert_no_secrets(self, public)
        self.assertEqual(public["players"][0]["card_count"], 1)
        self.assertEqual(conquest.private_view(state, uid)["my_cards"], ["fifty"])
        state = run(conquest.act(state, uid, {"type": "answer", "option": wrong(state["question"])}, ctx())).state
        self.assertIn("right_option", conquest.public_view(state)["last"])  # жауаптан кейін ғана


class CheckersRulesTest(unittest.TestCase):
    @staticmethod
    def board(**pieces):
        board = [None] * 64
        for name, piece in pieces.items():
            r, c = int(name[1]), int(name[2])
            board[r * 8 + c] = piece
        return board

    def test_initial_moves(self):
        self.assertEqual(len(checkers.legal_moves(checkers.initial_board(), "w")), 7)

    def test_capture_is_mandatory_and_backwards(self):
        board = self.board(s52="w", s43="b", s70="w")
        moves = checkers.legal_moves(board, "w")
        self.assertEqual(moves, [{"path": [42, 28], "captured": [35]}])
        back = self.board(s34="w", s45="b")
        self.assertEqual(checkers.legal_moves(back, "w"), [{"path": [28, 46], "captured": [37]}])

    def test_multi_jump(self):
        board = self.board(s70="w", s61="b", s41="b")
        moves = checkers.legal_moves(board, "w")
        self.assertEqual(moves, [{"path": [56, 42, 24], "captured": [33, 49]}])

    def test_promotion_mid_capture_continues_as_king(self):
        # Ақ тас 2-қатардан 0-қатарға алып шығады, сосын дамка ретінде жалғастырады.
        board = self.board(s21="w", s12="b", s25="b")
        moves = checkers.legal_moves(board, "w")
        self.assertTrue(moves and all(m["captured"] == [10, 21] for m in moves))
        move = moves[0]
        result = checkers.apply_move(board, move)
        self.assertEqual(result[move["path"][-1]], "W")

    def test_flying_king(self):
        board = self.board(s70="W")
        moves = checkers.legal_moves(board, "w")
        self.assertEqual(len(moves), 7)
        board = self.board(s70="W", s43="b")
        moves = checkers.legal_moves(board, "w")
        self.assertEqual({m["path"][-1] for m in moves}, {28, 21, 14, 7})
        self.assertTrue(all(m["captured"] == [35] for m in moves))

    def test_king_must_land_where_capture_continues(self):
        board = self.board(s70="W", s52="b", s14="b")
        moves = checkers.legal_moves(board, "w")
        self.assertTrue(all(len(m["captured"]) == 2 for m in moves))

    def test_bot_prefers_capture(self):
        board = self.board(s52="w", s43="b", s74="w")
        move = checkers.bot_move(board, "w", random.Random(1))
        self.assertEqual(move["captured"], [35])


class CheckersFlowTest(unittest.TestCase):
    def start(self, bot=False):
        infos = [PlayerInfo("u0", 0, "А")] + ([PlayerInfo(BOT_ID, 1, "Бот", bot=True)] if bot else [PlayerInfo("u1", 1, "Б")])
        return run(checkers.start(infos, ["t1"], ["§1"], checkers.settings({}), ctx()))

    def test_question_then_move(self):
        state = self.start().state
        if state["players"][0]["id"] != "u0":
            state = run(checkers.timeout(state, ctx(seconds=31))).state
        self.assertEqual(state["phase"], "question")
        self.assertEqual(state["question"]["difficulty"] in (1, 2), True)
        uid = state["players"][state["turn"]]["id"]
        state = run(checkers.act(state, uid, {"type": "answer", "option": state["question"]["correct"]}, ctx())).state
        self.assertEqual(state["phase"], "move")
        moves = checkers.private_view(state, uid)["moves"]
        self.assertEqual(len(moves), 7)
        state = run(checkers.act(state, uid, {"type": "move", "path": moves[0]}, ctx())).state
        self.assertEqual(state["phase"], "question")
        self.assertNotEqual(state["players"][state["turn"]]["id"], uid)
        self.assertEqual(state["quiet_moves"], 1)

    def test_wrong_answer_passes_turn_and_illegal_move(self):
        state = self.start().state
        uid = state["players"][state["turn"]]["id"]
        state2 = run(checkers.act(state, uid, {"type": "answer", "option": wrong(state["question"])}, ctx())).state
        self.assertNotEqual(state2["players"][state2["turn"]]["id"], uid)
        state3 = run(checkers.act(state, uid, {"type": "answer", "option": state["question"]["correct"]}, ctx())).state
        with self.assertRaises(GameRuleError):
            run(checkers.act(state3, uid, {"type": "move", "path": [0, 9]}, ctx()))

    def test_capture_turn_asks_hard_question(self):
        state = self.start().state
        state["board"] = CheckersRulesTest.board(s52="w", s43="b", s07="b")
        state["turn"] = 0
        state = run(checkers._begin_turn(state, ctx())).state
        self.assertEqual(state["question"]["difficulty"], 3)

    def test_draw_and_no_moves(self):
        state = self.start().state
        state["quiet_moves"] = checkers.DRAW_MOVES
        out = run(checkers._next_turn(state, ctx()))
        self.assertTrue(out.finished)
        self.assertIsNone(out.state["winner"])
        state = self.start().state
        state["board"] = CheckersRulesTest.board(s52="w")
        state["turn"] = 1
        out = run(checkers._begin_turn(state, ctx()))
        self.assertEqual(out.state["winner"], 0)

    def test_bot_turn(self):
        state = self.start(bot=True).state
        for _ in range(6):
            if state["phase"] == "finished":
                break
            if state["phase"] == "bot":
                state = run(checkers.timeout(state, ctx(seconds=2))).state
            else:
                uid = state["players"][state["turn"]]["id"]
                state = run(checkers.act(state, uid, {"type": "answer", "option": wrong(state["question"])}, ctx())).state
        assert_no_secrets(self, checkers.public_view(state))


class BattleshipTest(unittest.TestCase):
    FLEET = [[0, 1, 2], [4, 5], [24, 30], [14], [35]]

    def start(self, bot=False):
        infos = [PlayerInfo("u0", 0, "А"), PlayerInfo(BOT_ID, 1, "Бот", bot=True) if bot else PlayerInfo("u1", 1, "Б")]
        return run(battleship.start(infos, ["t1"], ["§1"], battleship.settings({}), ctx())).state

    def test_fleet_validation(self):
        self.assertEqual(len(battleship.validate_fleet(self.FLEET)), 5)
        for bad in ([[0, 1, 2], [3, 4], [24, 30], [14], [35]],     # тиіп тұр
                    [[0, 1, 2], [4, 5], [24, 30], [14]],           # кеме аз
                    [[0, 7, 14], [4, 5], [24, 30], [16], [35]],    # түзу емес
                    [[0, 1, 2], [4, 5], [24, 30], [14], [36]]):    # алаңнан тыс
            with self.assertRaises(GameRuleError):
                battleship.validate_fleet(bad)
        rng = random.Random(3)
        for _ in range(20):
            battleship.validate_fleet(battleship.random_fleet(rng))

    def placed(self):
        state = self.start()
        state = run(battleship.act(state, "u0", {"type": "place", "ships": self.FLEET}, ctx())).state
        self.assertEqual(state["phase"], "placement")
        state = run(battleship.act(state, "u1", {"type": "auto_place"}, ctx())).state
        self.assertEqual(state["phase"], "question")
        return state

    def test_shoot_flow(self):
        state = self.placed()
        shooter = state["players"][state["turn"]]["id"]
        target = next(p["id"] for p in state["players"] if p["id"] != shooter)
        ships = state["secret"][target]["ships"]
        state = run(battleship.act(state, shooter, {"type": "answer", "option": state["question"]["correct"]}, ctx())).state
        self.assertEqual(state["phase"], "shoot")
        single = next(s for s in ships if len(s) == 1)[0]
        state = run(battleship.act(state, shooter, {"type": "shoot", "cell": single}, ctx())).state
        self.assertEqual(state["last"]["result"], "sunk")
        self.assertEqual(state["players"][state["turn"]]["id"], shooter)  # тиді — тағы сұрақ
        self.assertEqual(state["phase"], "question")
        around = battleship._around(single) - {single}
        self.assertTrue(all(state["shots"][target][str(x)] == "miss" for x in around))
        occupied = {x for s in ships for x in s}
        empty = next(x for x in range(36) if x not in occupied and str(x) not in state["shots"][target])
        state = run(battleship.act(state, shooter, {"type": "answer", "option": state["question"]["correct"]}, ctx())).state
        state = run(battleship.act(state, shooter, {"type": "shoot", "cell": empty}, ctx())).state
        self.assertNotEqual(state["players"][state["turn"]]["id"], shooter)

    def test_win(self):
        state = self.placed()
        shooter = state["players"][state["turn"]]["id"]
        target = next(p["id"] for p in state["players"] if p["id"] != shooter)
        cells = [x for s in state["secret"][target]["ships"] for x in s]
        out = None
        for cell in cells:
            state = run(battleship.act(state, shooter, {"type": "answer", "option": state["question"]["correct"]},
                                       ctx())).state
            out = run(battleship.act(state, shooter, {"type": "shoot", "cell": cell}, ctx()))
            state = out.state
        self.assertTrue(out.finished)
        self.assertEqual(battleship.results(state)[0]["user_id"], shooter)

    def test_views_hide_ships(self):
        state = self.placed()
        public = battleship.public_view(state)
        assert_no_secrets(self, public)
        self.assertNotIn("my_ships", json.dumps(public))
        mine = battleship.private_view(state, "u0")["my_ships"]
        self.assertEqual(sorted(map(len, mine)), [1, 1, 2, 2, 3])
        theirs = battleship.private_view(state, "u1")["my_ships"]
        self.assertNotEqual(mine, theirs)

    def test_placement_timeout_and_bot(self):
        state = self.start(bot=True)
        state = run(battleship.timeout(state, ctx(seconds=91))).state
        self.assertIn(state["phase"], ("question", "bot"))
        for _ in range(10):
            if state["phase"] == "bot":
                state = run(battleship.timeout(state, ctx(seconds=2))).state
            elif state["phase"] == "question":
                state = run(battleship.act(state, "u0", {"type": "answer", "option": wrong(state["question"])},
                                           ctx())).state
        self.assertTrue(state["shots"]["u0"])  # бот атты

    def test_bot_target_follows_hits(self):
        shots = {"14": "hit"}
        target = battleship.bot_target(shots, [], random.Random(1))
        self.assertIn(target, {8, 20, 13, 15})
        shots = {"14": "hit", "15": "hit"}
        self.assertIn(battleship.bot_target(shots, [], random.Random(1)), {13, 16})


class DebateTest(unittest.TestCase):
    TOPIC = {"qid": "d1", "statement": "Абылай ханның саясаты дұрыс болды", "paragraph": "§30"}

    def start(self):
        return run(debate.start(players(2), ["t1"], ["§30"], {}, ctx(), topic=self.TOPIC)).state

    def test_rounds_and_judging(self):
        state = self.start()
        self.assertEqual(set(state["sides"].values()), {"pro", "con"})
        out = run(debate.act(state, "u0", {"type": "submit", "text": "Менің дәлелім", "moderation": "SAFE"}, ctx()))
        self.assertEqual(out.entries[0]["round"], 1)
        state = out.state
        self.assertEqual(debate.public_view(state)["entries"], [])  # екіншісі жазғанша ашылмайды
        self.assertEqual(debate.private_view(state, "u0")["my_entries"][0]["text"], "Менің дәлелім")
        state = run(debate.act(state, "u1", {"type": "submit", "text": "Қарсы", "moderation": "SAFE"}, ctx())).state
        self.assertEqual(state["round"], 2)
        self.assertEqual(len(debate.public_view(state)["entries"]), 2)
        state = run(debate.timeout(state, ctx(seconds=301))).state
        self.assertEqual(state["round"], 3)
        out = run(debate.timeout(state, ctx(seconds=602)))
        self.assertTrue(out.judge)
        self.assertEqual(out.state["phase"], "judging")
        rows = debate.transcript(out.state)
        self.assertEqual(len(rows), 6)
        self.assertIn(debate.MISSING_TEXT, [r["text"] for r in rows])
        final = debate.apply_verdict(out.state, {"winner": "pro", "scores": {}, "tips": {}, "summary": "ok"})
        self.assertTrue(final.finished)
        winner = next(r for r in debate.results(final.state) if r["place"] == 1)
        self.assertEqual(winner["side"], "pro")

    def test_limits_and_flagged_text(self):
        state = self.start()
        with self.assertRaises(GameRuleError):
            run(debate.act(state, "u0", {"type": "submit", "text": "х" * 601}, ctx()))
        state = run(debate.act(state, "u0", {"type": "submit", "text": "балағат", "moderation": "PROFANITY"},
                               ctx())).state
        state = run(debate.act(state, "u1", {"type": "submit", "text": "Жауап", "moderation": "SAFE"}, ctx())).state
        texts = [e["text"] for e in debate.public_view(state)["entries"]]
        self.assertIn(debate.HIDDEN_TEXT, texts)
        self.assertNotIn("балағат", json.dumps(debate.public_view(state), ensure_ascii=False))
        self.assertNotIn("балағат", json.dumps(debate.transcript(state), ensure_ascii=False))
        with self.assertRaises(GameRuleError):
            run(debate.act(state, "u0", {"type": "submit", "text": "х" * 401}, ctx()))

    def test_judge_failure_and_forfeit(self):
        state = self.start()
        state["phase"] = "judging"
        for _ in range(debate.JUDGE_ATTEMPTS - 1):
            state = debate.judge_failed(state, ctx()).state
            self.assertEqual(state["phase"], "judging")
        out = debate.judge_failed(state, ctx())
        self.assertTrue(out.finished)
        self.assertTrue(out.state["verdict"]["unavailable"])
        out = run(debate.leave(self.start(), "u0", ctx()))
        self.assertTrue(out.state["verdict"]["forfeit"])


class BaigeTest(unittest.TestCase):
    def start(self, n=2, stages=3):
        return run(baige.start(players(n), ["t1", "t2"], ["§1", "§2"], baige.settings({"stages": stages}), ctx())).state

    def answer_all(self, state, *, correct=True, who=None):
        question = state["question"]
        for uid in list(question["to"]):
            if who is not None and uid not in who:
                continue
            option = question["correct"] if correct else wrong(question)
            state = run(baige.act(state, uid, {"type": "answer", "option": option}, ctx())).state
            if state["phase"] != "question":
                break
        return state

    def test_difficulty_mapping(self):
        self.assertEqual([baige.difficulty_for(v) for v in range(1, 6)], [1, 1, 2, 2, 3])

    def test_stage_flow_stop_and_fall(self):
        state = self.start()
        self.assertEqual(state["phase"], "question")
        state = self.answer_all(state)                  # 1-сұрақ: екеуі де +1
        self.assertEqual(state["phase"], "decide")
        self.assertEqual(baige.public_view(state)["next"]["value"], 2)
        self.assertIsNone(baige.public_view(state)["question"])  # шешім кезінде сұрақ мәтіні жабық
        state = run(baige.act(state, "u0", {"type": "decide", "choice": "stop"}, ctx())).state
        state = run(baige.act(state, "u1", {"type": "decide", "choice": "continue"}, ctx())).state
        self.assertEqual(state["phase"], "question")
        self.assertEqual(state["question"]["to"], ["u1"])
        self.assertEqual(state["stats"]["u0"]["banked"], 1)
        state = self.answer_all(state, correct=False)   # u1 құлады: сақталмаған 1 ұпай күйді
        self.assertEqual(state["stats"]["u1"]["banked"], 0)
        self.assertEqual(state["stage"], 2)              # шабатын ешкім қалмады — келесі кезең
        self.assertEqual(state["phase"], "question")

    def test_full_stage_auto_banks_and_tiebreak(self):
        state = self.start(stages=3)
        for stage in range(3):
            state = self.answer_all(state)
            for _ in range(4):
                for uid in ("u0", "u1"):
                    state = run(baige.act(state, uid, {"type": "decide", "choice": "continue"}, ctx())).state
                state = self.answer_all(state)
        self.assertEqual(state["phase"], "finished")
        self.assertEqual(state["stats"]["u0"]["banked"], 45)
        rows = baige.results(state)
        self.assertEqual([r["place"] for r in rows], [1, 1])

    def test_timeouts_default_stop_and_fall(self):
        state = self.start()
        state = run(baige.act(state, "u0", {"type": "answer", "option": state["question"]["correct"]}, ctx())).state
        state = run(baige.timeout(state, ctx(seconds=21))).state  # u1 жауап бермеді — құлады
        self.assertEqual(state["stats"]["u1"]["status"], "fell")
        state = run(baige.timeout(state, ctx(seconds=32))).state  # u0 шешім қабылдамады — тоқтайды
        self.assertEqual(state["stats"]["u0"]["banked"], 1)
        self.assertEqual(state["stage"], 2)

    def test_solo_record_and_views(self):
        state = run(baige.start(players(1), ["t1"], ["§1"], baige.settings({"stages": 3}), ctx())).state
        out = None
        for _ in range(3):
            out = run(baige.act(state, "u0", {"type": "answer", "option": wrong(state["question"])}, ctx()))
            state = out.state
        self.assertTrue(out.finished)
        self.assertEqual(out.record, {"user_id": "u0", "score": 0, "correct": 0})
        assert_no_secrets(self, baige.public_view(state))

    def test_not_riding_cannot_answer(self):
        state = self.start()
        state = self.answer_all(state)
        state = run(baige.act(state, "u0", {"type": "decide", "choice": "stop"}, ctx())).state
        state = run(baige.act(state, "u1", {"type": "decide", "choice": "continue"}, ctx())).state
        with self.assertRaises(GameRuleError):
            run(baige.act(state, "u0", {"type": "answer", "option": "a"}, ctx()))


class ProjectionFuzzTest(unittest.TestCase):
    """CI тесті (api §8, D67): кездейсоқ ойын барысында ортақ проекцияда кілт пен жасырын дерек ешқашан жоқ."""

    def test_random_play_never_leaks(self):
        rng = random.Random(11)
        for seed in range(5):
            c = ctx(seed=seed)
            states = [
                (conquest, run(conquest.start(players(3), ["t1", "t2"], ["§1", "§2"], conquest.settings({"size": 5}), c)).state),
                (checkers, run(checkers.start(players(2), ["t1"], ["§1"], checkers.settings({}), c)).state),
                (battleship, run(battleship.start(players(2), ["t1"], ["§1"], battleship.settings({}), c)).state),
                (baige, run(baige.start(players(3), ["t1"], ["§1"], baige.settings({"stages": 3}), c)).state),
            ]
            for engine, state in states:
                for step in range(40):
                    if state["phase"] == "finished":
                        break
                    view = engine.public_view(state)
                    assert_no_secrets(self, view)
                    if engine is battleship and state["phase"] != "placement":
                        text = json.dumps(view)
                        for p in state["players"]:
                            self.assertNotIn("my_ships", text)
                    state = self._step(engine, state, rng, c)

    def _step(self, engine, state, rng, c):
        try:
            if engine is battleship and state["phase"] == "placement":
                for p in state["players"]:
                    if not state["secret"][p["id"]]["ships"]:
                        state = run(engine.act(state, p["id"], {"type": "auto_place"}, c)).state
                return state
            question = state.get("question")
            if state["phase"] == "question" and question:
                uid = question["to"][0]
                option = rng.choice([o["id"] for o in question["options"]])
                return run(engine.act(state, uid, {"type": "answer", "option": option}, c)).state
            if engine is conquest and state["phase"] == "pick":
                uid = state["players"][state["turn"]]["id"]
                cell = rng.choice(conquest.allowed_cells(state, uid))
                return run(engine.act(state, uid, {"type": "pick", "cell": cell}, c)).state
            if engine is checkers and state["phase"] == "move":
                uid = state["players"][state["turn"]]["id"]
                return run(engine.act(state, uid, {"type": "move", "path": checkers.private_view(state, uid)["moves"][0]}, c)).state
            if engine is battleship and state["phase"] == "shoot":
                uid = state["players"][state["turn"]]["id"]
                target = next(p["id"] for p in state["players"] if p["id"] != uid)
                free = [x for x in range(36) if str(x) not in state["shots"][target]]
                return run(engine.act(state, uid, {"type": "shoot", "cell": rng.choice(free)}, c)).state
            return run(engine.timeout(state, c)).state
        except GameRuleError:
            return run(engine.timeout(state, c)).state


if __name__ == "__main__":
    unittest.main()
