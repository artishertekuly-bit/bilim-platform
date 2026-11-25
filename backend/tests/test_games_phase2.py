"""D99: Games 2-кезең — «Білім аукционы», «Сенемін — Сенбеймін», «Эскейп рум».

Қозғалтқыш ережелері (ставка құлпы, екі қадамды ұпай, құлыптардың реті мен айыппұл), проекцияның қауіпсіздігі
(кілт, шындық, келесі құлып клиентке бармайды) және сервис арқылы $0 басталуы. LLM мен дерекқор жоқ.
"""

from __future__ import annotations

import json
import random
import unittest
import uuid
from types import SimpleNamespace
from unittest import mock

from app.games import provider as P
from app.games.bank.topic import MAX_GENERATE, TopicBatch, TopicItem, TopicTFF, TopicTFFBatch, build_topic_tff
from app.games.dto import ActionRequest, PreviewRequest
from app.games.engines import ENGINES, MIN_BANK, MODES, auction, deck_format, escape_room, fact_check
from app.games.engines.base import GameRuleError, Question
from tests.test_games_engines import OPTIONS, FakeQuestions, assert_no_secrets, ctx, players, run, wrong
from tests.test_games_unified_bank import HISTORY, UnifiedCase, exam_rows
from tests.test_games_service import HOST


def act(engine, state, uid, action, seconds=1):
    return run(engine.act(state, uid, action, ctx(seconds=seconds))).state


class CatalogTests(unittest.TestCase):
    def test_three_games_are_registered_with_solo_and_formats(self):
        for game in ("auction", "fact_check", "escape_room"):
            self.assertIn(game, ENGINES)
            self.assertEqual(MODES[game], frozenset({"multi", "solo"}))
            self.assertEqual(ENGINES[game].MIN_PLAYERS, 1)
            self.assertGreaterEqual(MIN_BANK[game], escape_room.LOCKS)
        self.assertEqual((deck_format("auction"), deck_format("fact_check"), deck_format("escape_room")),
                         ("mcq", "true_false_fix", "escape_step"))

    def test_actions_validate_in_the_dto(self):
        rid = uuid.uuid4()
        self.assertEqual(ActionRequest(client_request_id=rid, type="bet", amount=150).payload(),
                         {"type": "bet", "amount": 150})
        self.assertEqual(ActionRequest(client_request_id=rid, type="verdict", choice="false", option="b").payload(),
                         {"type": "verdict", "choice": "false", "option": "b"})
        self.assertEqual(ActionRequest(client_request_id=rid, type="code", code="7KQ2M").payload()["code"], "7KQ2M")


# ------------------------------------------------------------------ аукцион


class AuctionTests(unittest.TestCase):
    def start(self, n=2):
        return run(auction.start(players(n), ["t1", "t2", "t3"], ["§1", "§2", "§3"], auction.settings({}), ctx())).state

    def test_bet_phase_shows_only_topic_and_tier(self):
        state = self.start()
        view = auction.public_view(state)
        self.assertEqual((view["phase"], view["question"]), ("bet", None))
        self.assertEqual(set(view["lot"]), {"paragraph", "difficulty", "tier"})
        text = json.dumps(view, ensure_ascii=False)
        self.assertNotIn("Сұрақ", text)          # сұрақ мәтіні ставка кезінде жоқ
        self.assertNotIn('"options"', text)
        assert_no_secrets(self, view)

    def test_bet_bounds_and_lock_after_reveal(self):
        state = self.start()
        for amount in (49, 1001, "100", True):
            with self.assertRaises(GameRuleError) as err:
                act(auction, state, "u0", {"type": "bet", "amount": amount})
            self.assertEqual(err.exception.status, 422)
        state = act(auction, state, "u0", {"type": "bet", "amount": 100})
        state = act(auction, state, "u0", {"type": "bet", "amount": 300})   # ашылғанға дейін өзгертуге болады
        self.assertEqual(auction.private_view(state, "u0")["my_bet"], 300)
        self.assertFalse(any("bet" in p for p in auction.public_view(state)["players"]))  # басқаға сомасы көрінбейді
        state = act(auction, state, "u1", {"type": "bet", "amount": 50})
        self.assertEqual(state["phase"], "answer")
        self.assertIsNotNone(auction.public_view(state)["question"])
        with self.assertRaises(GameRuleError) as err:
            act(auction, state, "u0", {"type": "bet", "amount": 900})
        self.assertEqual(err.exception.code, "BET_LOCKED")
        assert_no_secrets(self, auction.public_view(state))

    def test_correct_doubles_stake_and_wrong_loses_it(self):
        state = self.start()
        state = act(auction, state, "u0", {"type": "bet", "amount": 300})
        state = act(auction, state, "u1", {"type": "bet", "amount": 200})
        q = state["question"]
        state = act(auction, state, "u0", {"type": "answer", "option": q["correct"]})
        out = run(auction.act(state, "u1", {"type": "answer", "option": wrong(q)}, ctx(seconds=2)))
        stats = out.state["stats"]
        self.assertEqual((stats["u0"]["balance"], stats["u1"]["balance"]), (1300, 800))
        self.assertEqual(out.state["last"]["players"][0], {"ok": True, "bet": 300, "delta": 300, "chosen": "a",
                                                            "auto": False})
        self.assertEqual((out.state["round"], out.state["phase"]), (2, "bet"))
        self.assertEqual({(e.user_id, e.correct) for e in out.log}, {("u0", True), ("u1", False)})

    def test_timeout_auto_bets_minimum_floor_zero_and_recovery_grant(self):
        state = self.start(1)
        state = run(auction.timeout(state, ctx(seconds=16))).state            # ставка жоқ — ең азы 50
        self.assertEqual((state["phase"], state["bets"]["u0"]), ("answer", 50))
        state["stats"]["u0"]["balance"] = 40                                  # 50-ден аз қалды
        state["bets"]["u0"] = 40
        state = run(auction.timeout(state, ctx(seconds=40))).state            # жауап жоқ — −ставка, 0-ден төмен емес
        self.assertEqual(state["stats"]["u0"]["balance"], 0 + auction.GRANT)  # жаңа раундта көмек
        self.assertEqual(state["granted"], [0])
        act(auction, state, "u0", {"type": "bet", "amount": 100})             # енді ставка қоя алады

    def test_finishes_after_rounds_with_results(self):
        state = run(auction.start(players(1), ["t1"], ["§1"], auction.settings({"rounds": 5}), ctx())).state
        for _ in range(5):
            state = act(auction, state, "u0", {"type": "bet", "amount": 50})
            out = run(auction.act(state, "u0", {"type": "answer", "option": state["question"]["correct"]}, ctx()))
            state = out.state
        self.assertTrue(out.finished)
        self.assertEqual(auction.results(state)[0]["score"], 1250)
        with self.assertRaises(GameRuleError):
            auction.settings({"rounds": 3})


# ------------------------------------------------------------------ сенемін — сенбеймін


class FactCheckTests(unittest.TestCase):
    def start(self, n=1, share=0.0):
        with mock.patch.object(fact_check, "TRUE_SHARE", share):
            return run(fact_check.start(players(n), ["t1"], ["§1"], fact_check.settings({}), ctx())).state

    def test_mcq_becomes_a_statement_about_half_true(self):
        q = FakeQuestions(n=1).bank[0]
        c = ctx(seed=11)
        statements = [fact_check.make_statement(q, c, ["u0"]) for _ in range(400)]
        share = sum(s["answer_key"]["truth"] for s in statements) / len(statements)
        self.assertTrue(0.4 < share < 0.6, share)
        false = next(s for s in statements if not s["answer_key"]["truth"])
        self.assertNotEqual(false["claim"], "A")                              # алдағыш көрсетілді
        self.assertEqual(len(false["options"]), 3)                            # түзету: көрсетілгенінен басқа 3 нұсқа
        self.assertIn(false["answer_key"]["fix"], {o["id"] for o in false["options"]})
        true = next(s for s in statements if s["answer_key"]["truth"])
        self.assertEqual((true["claim"], true["answer_key"]["fix"]), ("A", None))

    def test_question_view_hides_truth_fix_and_explanation(self):
        state = self.start()
        view = fact_check.public_view(state)
        self.assertIsNotNone(view["statement"]["claim"])
        text = json.dumps(view, ensure_ascii=False)
        for key in ('"truth"', '"fix"', '"explanation"', '"answer_key"'):
            self.assertNotIn(key, text)
        assert_no_secrets(self, view)

    def test_two_step_scoring_spot_fix_and_full(self):
        state = self.start(n=3, share=0.0)                                    # тұжырым қате, түзету — "a"
        fix = state["statement"]["answer_key"]["fix"]
        other = next(o["id"] for o in state["statement"]["options"] if o["id"] != fix)
        with self.assertRaises(GameRuleError) as err:
            act(fact_check, state, "u0", {"type": "verdict", "choice": "false"})
        self.assertEqual(err.exception.code, "FIX_REQUIRED")
        state = act(fact_check, state, "u0", {"type": "verdict", "choice": "false", "option": fix})
        state = act(fact_check, state, "u1", {"type": "verdict", "choice": "false", "option": other})
        out = run(fact_check.act(state, "u2", {"type": "verdict", "choice": "true"}, ctx()))
        last = out.state["last"]
        self.assertEqual(out.state["phase"], "reveal")
        self.assertEqual([last["players"][s]["points"] for s in (0, 1, 2)], [100, 50, 0])
        self.assertTrue(last["explanation"].startswith("Дұрыс жауап"))
        self.assertEqual(fact_check.public_view(out.state)["last"]["truth"], False)   # раундтан кейін ашылады
        self.assertEqual({(e.user_id, e.correct) for e in out.log}, {("u0", True), ("u1", False), ("u2", False)})

    def test_true_statement_scores_only_for_believe(self):
        state = self.start(n=2, share=1.0)
        state = act(fact_check, state, "u0", {"type": "verdict", "choice": "true"})
        some = state["statement"]["options"][0]["id"]
        state = act(fact_check, state, "u1", {"type": "verdict", "choice": "false", "option": some})
        self.assertEqual([state["last"]["players"][s]["points"] for s in (0, 1)], [100, 0])

    def test_reveal_advances_on_next_or_timeout(self):
        state = self.start()
        state = act(fact_check, state, "u0", {"type": "verdict", "choice": "true"})
        state = act(fact_check, state, "u0", {"type": "next"})
        self.assertEqual((state["phase"], state["round"]), ("question", 2))
        state = run(fact_check.timeout(state, ctx(seconds=60))).state         # уақыт бітті — 0 ұпай, ашылады
        state = run(fact_check.timeout(state, ctx(seconds=70))).state
        self.assertEqual(state["round"], 3)

    def test_cached_true_false_fix_item_is_used_as_is(self):
        q = Question("g1", "topic", "Тақырып", 2, "Абай 1845 жылы туған.", OPTIONS[:3], "",
                     format="true_false_fix", explanation="Абай 1845 жылы туған.", truth=True)
        s = fact_check.make_statement(q, ctx(), ["u0"])
        self.assertEqual((s["claim"], s["answer_key"]["truth"], s["answer_key"]["fix"]), (None, True, None))
        self.assertEqual(s["answer_key"]["explanation"], "Абай 1845 жылы туған.")


# ------------------------------------------------------------------ эскейп рум


class EscapeRoomTests(unittest.TestCase):
    def start(self, n=1, source=None):
        self.source = source or FakeQuestions()
        c = ctx(self.source)
        return run(escape_room.start(players(n), ["t1", "t2", "t3"], ["§"], escape_room.settings({}), c)).state

    def step(self, state, uid, action, seconds=1):
        return run(escape_room.act(state, uid, action, ctx(self.source, seconds=seconds))).state

    def test_only_current_lock_is_fetched_and_sent(self):
        state = self.start()
        self.assertEqual(len(self.source.calls), 1)                           # тек 1-құлып алынды
        private = escape_room.private_view(state, "u0")
        self.assertEqual((private["stage"], private["code_slots"]), (1, [None] * 5))
        self.assertNotIn("correct", private["challenge"])
        public = json.dumps(escape_room.public_view(state), ensure_ascii=False)
        self.assertNotIn('"challenge"', public)
        self.assertNotIn("Сұрақ", public)
        assert_no_secrets(self, escape_room.public_view(state))
        assert_no_secrets(self, private)
        with self.assertRaises(GameRuleError) as err:
            self.step(state, "u0", {"type": "code", "code": "AAAAA"})       # құлып ашылмай код қабылданбайды
        self.assertEqual(err.exception.code, "LOCKED")

    def test_wrong_attempt_adds_penalty_and_rerolls_the_same_lock(self):
        state = self.start()
        first = state["runs"]["u0"]["challenge"]["qid"]
        state = self.step(state, "u0", {"type": "answer", "option": wrong(state["runs"]["u0"]["challenge"])})
        run_ = state["runs"]["u0"]
        self.assertEqual((run_["stage"], run_["solved"], run_["penalty"]), (1, 0, escape_room.PENALTY_S))
        self.assertNotEqual(run_["challenge"]["qid"], first)
        self.assertEqual(escape_room.private_view(state, "u0")["feedback"], {"ok": False, "lock": 1, "penalty": 10})

    def test_solving_unlocks_one_char_and_next_stage(self):
        state = self.start()
        state = self.step(state, "u0", {"type": "answer", "option": state["runs"]["u0"]["challenge"]["correct"]})
        private = escape_room.private_view(state, "u0")
        self.assertEqual((private["stage"], private["solved"]), (2, 1))
        self.assertEqual(private["code_slots"][0], state["runs"]["u0"]["secret"][0])
        self.assertEqual(private["code_slots"][1:], [None] * 4)
        self.assertEqual(len(self.source.calls), 2)

    def solve(self, state, uid, seconds):
        for _ in range(escape_room.LOCKS):
            state = self.step(state, uid, {"type": "answer", "option": state["runs"][uid]["challenge"]["correct"]},
                              seconds)
        return state

    def test_exit_code_escape_and_time_leaderboard(self):
        state = self.start(n=2)
        state = self.solve(state, "u0", 90)
        self.assertTrue(escape_room.private_view(state, "u0")["need_code"])
        with self.assertRaises(GameRuleError) as err:
            self.step(state, "u0", {"type": "answer", "option": "a"})
        self.assertEqual(err.exception.code, "CODE_STEP")
        state = self.step(state, "u0", {"type": "code", "code": "22222"}, 95)  # қате код: +10 с
        state = self.step(state, "u0", {"type": "code", "code": state["runs"]["u0"]["secret"].lower()}, 100)
        self.assertEqual(state["runs"]["u0"]["time_s"], 110)
        state = self.solve(state, "u1", 80)
        out = run(escape_room.act(state, "u1", {"type": "code", "code": state["runs"]["u1"]["secret"]},
                                  ctx(self.source, seconds=120)))
        self.assertTrue(out.finished)                                         # бәрі шықты
        rows = escape_room.results(out.state)
        self.assertEqual([(r["user_id"], r["place"], r["time_s"]) for r in rows], [("u0", 1, 110), ("u1", 2, 120)])

    def test_timeout_ranks_by_locks_cleared(self):
        state = self.start(n=2)
        state = self.step(state, "u1", {"type": "answer", "option": state["runs"]["u1"]["challenge"]["correct"]})
        out = run(escape_room.timeout(state, ctx(self.source, seconds=601)))
        self.assertTrue(out.finished)
        self.assertEqual([r["user_id"] for r in escape_room.results(out.state)], ["u1", "u0"])
        self.assertIsNone(escape_room.private_view(out.state, "u0")["challenge"])


# ------------------------------------------------------------------ сервис: $0 бастау, кэш, балама атау


class TffGenerator:
    def __init__(self) -> None:
        self.calls: list[int] = []

    async def __call__(self, gateway, subject, topic, count, existing, rng):
        self.calls.append(count)
        items = [TopicItem(2, {"stem": f"{topic}: {len(existing) + i}-тұжырым.", "options": OPTIONS[:3]},
                           {"is_true": i % 2 == 0, "correct_option_id": "" if i % 2 == 0 else "b"}, "Түсіндірме.")
                 for i in range(count)]
        return TopicBatch(items=items, requested=count, cost_usd=0.001, model="small")


class Phase2ServiceTests(UnifiedCase):
    def act(self, view, **action):
        return run(self.service.act(HOST, view["room"]["room_id"],
                                    ActionRequest(client_request_id=uuid.uuid4(), **action)))

    def assert_clean_broadcasts(self):
        text = json.dumps([b["public"] for b in self.db.broadcasts], ensure_ascii=False)
        for key in ('"correct"', '"answer_key"', '"secret"', '"challenge"'):
            self.assertNotIn(key, text)
        live = [b["public"] for b in self.db.broadcasts if (b["public"].get("public") or {}).get("phase") == "question"]
        self.assertTrue(live)
        self.assertNotIn('"truth"', json.dumps(live, ensure_ascii=False))   # шындық тек раундтан кейін

    def test_three_games_start_from_bank_at_zero_cost(self):
        self.db.exam_pool = exam_rows(HISTORY, 60)
        view = self.create(game="auction", source="bank", subject_id=HISTORY)
        self.assertEqual((view["public"]["phase"], view["public"]["question"]), ("bet", None))
        view = self.act(view, type="bet", amount=200)
        self.assertTrue(view["public"]["question"]["stem"].startswith("Емтихан сұрағы"))
        self.assertEqual(view["private"]["my_bet"], 200)

        view = self.create(game="fact_check", source="bank", subject_id=HISTORY)
        statement = view["public"]["statement"]
        self.assertTrue(statement["stem"].startswith("Емтихан сұрағы"))
        view = self.act(view, type="verdict", choice="false", option=statement["options"][0]["id"])
        self.assertEqual(view["public"]["phase"], "reveal")

        view = self.create(game="escape_room", source="bank", subject_id=HISTORY)
        self.assertIsNotNone(view["private"]["challenge"])
        view = self.act(view, type="answer", option="c")                      # FakeDB: емтихан кілті — "c"
        self.assertEqual(view["private"]["solved"], 1)
        self.assertEqual((self.gateway.calls, self.generator.calls), ([], []))  # $0
        self.assert_clean_broadcasts()

    def test_fact_check_topic_generates_only_true_false_fix_deficit_then_caches(self):
        self.service._bank._generator = generator = TffGenerator()
        view = self.create(game="fact_check", source="topic", subject_text="Әдебиет", topic_query="Абай өлеңдері")
        self.assertEqual(generator.calls, [P.TOPIC_TARGET])
        self.assertEqual({g["format"] for g in self.db.generated}, {"true_false_fix"})
        self.assertEqual({d.get("f") for d in self.scope(view)["deck"]}, {"true_false_fix"})
        self.assertIsNotNone(view["public"]["statement"])
        self.create(game="fact_check", source="topic", subject_text="әдебиет", topic_query="Абай өлеңдері!")
        self.assertEqual(generator.calls, [P.TOPIC_TARGET])                   # кэш: екінші шақыру жоқ

    def test_cached_mcq_counts_for_the_new_games(self):
        self.create(game="baige", source="topic", subject_text="Информатика", topic_query="Excel")
        self.assertEqual(self.generator.calls, [P.TOPIC_TARGET])
        for game in ("fact_check", "escape_room", "auction"):
            self.create(game=game, source="topic", subject_text="Информатика", topic_query="Excel")
        self.assertEqual(self.generator.calls, [P.TOPIC_TARGET])              # mcq кэші $0 түрленеді

    def test_subject_aliases_map_to_the_history_bank(self):
        self.db.exam_pool = exam_rows(HISTORY, 30, eras=("Түрік қағанаты",))
        for title in ("Қазақ тарихы", "ҚАЗАҚСТАН  тарихы"):
            view = self.create(game="fact_check", source="topic", subject_text=title, topic_query="Түрік қағанаты")
            self.assertEqual(self.scope(view)["from_bank"], P.TOPIC_TARGET)
        self.db.bank[0]["title"] = "Тарих (Қазақстан)"                        # атауы басқа — slug бойынша
        data = run(self.service.preview(PreviewRequest(game_type="escape_room", source="topic",
                                                       subject_text="Қазақ тарихы", topic_query="Түрік қағанаты")))
        self.assertEqual((data["from_bank"], data["generate"]), (P.TOPIC_TARGET, False))
        self.assertEqual(self.generator.calls, [])

    def test_alias_helpers(self):
        self.assertEqual(P.subject_slug("Қазақ  тарихы"), "history")
        self.assertEqual(P.canonical_subject_key("қазақ тарихы"), "қазақстан тарихы")
        self.assertEqual(P.subject_slug("Әлем тарихы"), "world_history")
        self.assertIsNone(P.subject_slug("Информатика"))
        self.assertEqual(P.canonical_subject_key("информатика"), "информатика")


class TffBuilderTests(unittest.TestCase):
    @staticmethod
    def item(i: int, **extra) -> TopicTFF:
        data = {"statement": f"Абай Құнанбайұлы {1845 + i} жылы туған.", "is_true": i % 2 == 0,
                "fixes": [f"{1840 + i}", f"{1850 + i}", f"{1860 + i}"], "correct_fix_index": -1 if i % 2 == 0 else 2,
                "difficulty": 1, "explanation": "Абай 1845 жылы Шыңғыстауда туған."} | extra
        return TopicTFF(**data)

    def test_builder_checks_maps_fix_and_caps(self):
        items = [self.item(i) for i in range(4)] + [self.item(9, fixes=["1", "2"]), self.item(0)]
        items += [self.item(10 + i) for i in range(30)]
        calls = []

        async def complete(task, prompt, messages, *, schema=None, variant=None):
            calls.append((variant, prompt.id, messages[-1].content))
            return SimpleNamespace(parsed=TopicTFFBatch(items=items), outcome="ok", cost_usd=0.01, model="mini")

        batch = run(build_topic_tff(SimpleNamespace(complete=complete), "Әдебиет", "Абай", 25, [], random.Random(1)))
        self.assertEqual(batch.requested, MAX_GENERATE)
        self.assertEqual(len(batch.items) + batch.rejected, MAX_GENERATE)
        self.assertEqual(batch.rejected, 2)                                   # 2 түзету + қайталау
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][:2], ("game_topic_mcq", "games.bank.topic_true_false_fix"))
        false = batch.items[1]
        fix = next(o["text"] for o in false.content["options"] if o["id"] == false.answer_key["correct_option_id"])
        self.assertEqual(fix, "1861")
        self.assertEqual(batch.items[0].answer_key, {"is_true": True, "correct_option_id": ""})


if __name__ == "__main__":
    unittest.main()
