"""Examiner сессиясының таза логикасы: құрам, тексеру, нәтиже, таңдау.
Іске қосу: python -m unittest discover -s backend/tests -t backend"""

from __future__ import annotations

import copy
import random
import unittest
from datetime import datetime, timezone

from app.examiner.bank.formats import (
    ErrorStepGen,
    FormulaGen,
    MatchingGen,
    MCQGen,
    SequenceGen,
    SliderGen,
)
from app.examiner.session.composition import Slot, build_composition, level_formats, x1_count
from app.examiner.session.grading import AnswerInvalid, check_answer
from app.examiner.session.scoring import GradedItem, level_score, x3_eligible
from app.examiner.session.selection import Candidate, Picker, level_availability, order_items
from app.examiner.session.shuffle import shuffle_content

COMMON = {"ecd_skill": "Дағды", "evidence": "Дәлел", "support_quote": "Оқулықтан алынған ұзын дәйексөз."}
HISTORY = {"formula_builder": False, "slider": False}


def package(model, **data):
    return model.model_validate({**COMMON, **data}).to_package(random.Random(3))


class CompositionTests(unittest.TestCase):
    def test_level1_is_code_only(self) -> None:
        composition = build_composition(1, {})
        self.assertEqual(composition.formats, {"mcq": 5, "matching": 3})
        self.assertEqual(composition.excluded, ("short_answer",))
        tiers = [(slot.tier, slot.format) for slot in composition.slots]
        self.assertEqual(tiers, [("X1", "mcq")] * 2 + [("X1", "matching")] + [("X2", "mcq")] * 3
                         + [("X2", "matching")] * 2)
        self.assertEqual(composition.n, 8)

    def test_level2_history_substitutes_formula_and_slider(self) -> None:
        composition = build_composition(2, HISTORY)
        self.assertEqual(composition.formats, {"sequence": 3, "error_step": 3})
        self.assertEqual(composition.excluded, ("true_false_fix",))
        self.assertEqual(level_formats(2, HISTORY), ["sequence", "error_step"])

    def test_levels_3_and_4_closed(self) -> None:
        with self.assertRaises(ValueError):
            build_composition(3, {})

    def test_x1_share(self) -> None:
        self.assertEqual([x1_count(n) for n in (1, 2, 3, 5)], [0, 1, 1, 2])


class GradingTests(unittest.TestCase):
    def check(self, pkg, answer) -> int:
        return check_answer(pkg.format, pkg.content, pkg.key, answer)

    def test_mcq(self) -> None:
        pkg = package(MCQGen, stem="?", options=["а", "ә", "б", "в"], correct_index=2)
        correct = pkg.key["correct_option_id"]
        wrong = next(o["id"] for o in pkg.content["options"] if o["id"] != correct)
        self.assertEqual(self.check(pkg, {"option_id": correct}), 1)
        self.assertEqual(self.check(pkg, {"option_id": wrong}), 0)
        with self.assertRaises(AnswerInvalid):
            self.check(pkg, {"option_id": "z"})

    def test_matching(self) -> None:
        pkg = package(MatchingGen, stem="?", pairs=[{"left": "A", "right": "1"}, {"left": "B", "right": "2"},
                                                     {"left": "C", "right": "3"}])
        self.assertEqual(self.check(pkg, {"pairs": pkg.key["pairs"]}), 1)
        swapped = [dict(p) for p in pkg.key["pairs"]]
        swapped[0]["right_id"], swapped[1]["right_id"] = swapped[1]["right_id"], swapped[0]["right_id"]
        self.assertEqual(self.check(pkg, {"pairs": swapped}), 0)
        with self.assertRaises(AnswerInvalid):
            self.check(pkg, {"pairs": pkg.key["pairs"][:2]})
        dup = [dict(p) for p in pkg.key["pairs"]]
        dup[1]["right_id"] = dup[0]["right_id"]
        with self.assertRaises(AnswerInvalid):
            self.check(pkg, {"pairs": dup})

    def test_sequence(self) -> None:
        pkg = package(SequenceGen, stem="?", steps=["бір", "екі", "үш", "төрт"])
        self.assertEqual(self.check(pkg, {"order": pkg.key["order"]}), 1)
        self.assertEqual(self.check(pkg, {"order": list(reversed(pkg.key["order"]))}), 0)
        with self.assertRaises(AnswerInvalid):
            self.check(pkg, {"order": pkg.key["order"][:3]})

    def test_error_step(self) -> None:
        pkg = package(ErrorStepGen, stem="?", steps=["а", "ә", "б"], error_index=1, correction="ә дұрыс")
        self.assertEqual(self.check(pkg, {"step_id": "e2"}), 1)
        self.assertEqual(self.check(pkg, {"step_id": "e1"}), 0)

    def test_formula_commutative(self) -> None:
        pkg = package(FormulaGen, stem="?", result="P", numerator=["U", "I"], denominator=[], distractors=["R"])
        placement = pkg.key["placement"]
        self.assertEqual(self.check(pkg, {"placement": placement}), 1)
        swapped = {"num_1": placement["num_2"], "num_2": placement["num_1"]}
        self.assertEqual(self.check(pkg, {"placement": swapped}), 1)
        tokens = {t["label"]: t["id"] for t in pkg.content["tokens"]}
        self.assertEqual(self.check(pkg, {"placement": {"num_1": tokens["U"], "num_2": tokens["R"]}}), 0)
        with self.assertRaises(AnswerInvalid):
            self.check(pkg, {"placement": {"num_1": tokens["U"]}})

    def test_slider_interval(self) -> None:
        pkg = package(SliderGen, stem="?", input_name="R", input_unit="Ом", min=1, max=12, step=1, output_name="I",
                      output_unit="А", formula="I = 12 / R", accept_min=4, accept_max=6)
        self.assertEqual(self.check(pkg, {"value": 5}), 1)
        self.assertEqual(self.check(pkg, {"value": 8}), 0)
        with self.assertRaises(AnswerInvalid):
            self.check(pkg, {"value": 20})
        with self.assertRaises(AnswerInvalid):
            self.check(pkg, {"value": True})

    def test_ai_formats_not_code_checked(self) -> None:
        with self.assertRaises(AnswerInvalid):
            check_answer("short_answer", {}, {}, {"text": "x"})


class ScoringTests(unittest.TestCase):
    def items(self, scores, x3=None):
        base = [GradedItem("X1" if i < 3 else "X2", "mcq" if i < 5 else "matching", None, s)
                for i, s in enumerate(scores)]
        return base + ([GradedItem("X3", "mcq", None, x3)] if x3 is not None else [])

    def test_p_and_mastery(self) -> None:
        score = level_score(1, self.items([4, 4, 4, 4, 4, 4, 4, 0]))
        self.assertEqual(score.p, 87.5)
        self.assertTrue(score.mastered)
        self.assertEqual(score.x3_status, "not_eligible")
        self.assertEqual({(r.format, r.score, r.max) for r in score.breakdown}, {("mcq", 20, 20), ("matching", 8, 12)})

    def test_x3_does_not_change_p(self) -> None:
        passed = level_score(1, self.items([4] * 8, x3=4))
        failed = level_score(1, self.items([4] * 8, x3=0))
        self.assertEqual((passed.p, passed.x3_status), (100.0, "passed"))
        self.assertEqual((failed.p, failed.x3_status), (100.0, "failed"))

    def test_x3_missing_from_bank(self) -> None:
        score = level_score(2, self.items([4] * 8), x3_available=False)
        self.assertEqual(score.x3_status, "not_eligible")
        self.assertIn("банкте", score.x3_reason)

    def test_eligibility(self) -> None:
        self.assertTrue(x3_eligible(self.items([4] * 8)))
        self.assertFalse(x3_eligible(self.items([4] * 7 + [0])))
        with self.assertRaises(ValueError):
            level_score(1, self.items([4] * 7 + [None]))


class SelectionTests(unittest.TestCase):
    def test_substitutes_within_tier_and_spreads_topics(self) -> None:
        composition = build_composition(1, {})
        candidates = [Candidate(f"m{t}{i}", f"§{t}", "mcq", tier) for t in (1, 2) for i in range(4)
                      for tier in ("X1", "X2")]
        picker = Picker(candidates, ["mcq", "matching"], random.Random(1))
        chosen = [picker.take(slot) for slot in composition.slots]
        self.assertTrue(all(chosen))
        self.assertEqual({c.format for c in chosen}, {"mcq"})  # matching жоқ → mcq-мен алмастырылды
        self.assertTrue(all(c.tier == slot.tier for c, slot in zip(chosen, composition.slots)))
        topics = [c.topic_id for c in chosen]
        self.assertLessEqual(abs(topics.count("§1") - topics.count("§2")), 1)
        ordered = order_items(composition.slots, chosen)
        self.assertEqual([slot.tier for slot, _ in ordered], [slot.tier for slot in composition.slots])

    def test_shortage_returns_none(self) -> None:
        picker = Picker([Candidate("q", "§1", "mcq", "X2")], ["mcq", "matching"], random.Random(1))
        slot = build_composition(1, {}).slots[0]
        self.assertIsNone(picker.take(slot))  # X1 жоқ; X2 санатқа ауыспайды

    def test_free_first_then_earliest_leased(self) -> None:
        """D65: алдымен бос сұрақ, содан кейін ең ерте бекітілгені; өз форматы басқа форматтан бұрын."""
        utc = timezone.utc
        early, late = datetime(2026, 11, 19, 8, tzinfo=utc), datetime(2026, 11, 19, 9, tzinfo=utc)
        candidates = [
            Candidate("late", "§1", "mcq", "X1", late),
            Candidate("free", "§1", "mcq", "X1"),
            Candidate("early", "§1", "mcq", "X1", early),
            Candidate("other", "§1", "matching", "X1"),
        ]
        picker = Picker(candidates, ["mcq", "matching"], random.Random(1))
        slot = Slot("X1", "mcq")
        taken = [picker.take(slot) for _ in range(4)]
        self.assertEqual([c.question_id for c in taken], ["free", "early", "late", "other"])
        self.assertTrue(taken[1].reused and not taken[0].reused)
        self.assertIsNone(picker.take(slot))

    def test_level_availability(self) -> None:
        slots = build_composition(1, {}).slots  # X1 — 3, X2 — 5
        self.assertEqual(level_availability(slots, {"X1": (3, 3), "X2": (6, 5)}), "ready")
        self.assertEqual(level_availability(slots, {"X1": (3, 1), "X2": (6, 5)}), "low_stock")
        self.assertEqual(level_availability(slots, {"X1": (3, 3), "X2": (4, 4)}), "unavailable")
        self.assertEqual(level_availability(slots, {"X2": (9, 9)}), "unavailable")


class ShuffleTests(unittest.TestCase):
    def test_stable_per_item_and_differs_between_items(self) -> None:
        pkg = package(MCQGen, stem="?", options=["a", "b", "c", "d", "e"], correct_index=0)
        original = copy.deepcopy(pkg.content)
        first = shuffle_content("mcq", pkg.content, pkg.ecd_evidence["code_check_target"], "item-1")
        self.assertEqual(first, shuffle_content("mcq", pkg.content, pkg.ecd_evidence["code_check_target"], "item-1"))
        orders = {tuple(o["id"] for o in shuffle_content("mcq", pkg.content, {}, f"item-{i}")["options"])
                  for i in range(20)}
        self.assertGreater(len(orders), 1)
        self.assertEqual(sorted(o["id"] for o in first["options"]), sorted(o["id"] for o in pkg.content["options"]))
        self.assertEqual(pkg.content, original)  # банктегі content өзгермейді

    def test_sequence_never_shows_correct_order(self) -> None:
        pkg = package(SequenceGen, stem="Ретте", steps=["бір", "екі", "үш"])
        key = pkg.ecd_evidence["code_check_target"]
        for i in range(50):
            shown = shuffle_content("sequence", pkg.content, key, f"s-{i}")
            self.assertNotEqual([step["id"] for step in shown["steps"]], key["order"])

    def test_matching_never_aligned(self) -> None:
        pkg = package(MatchingGen, stem="Сәйкестендір", pairs=[
            {"left": "A", "right": "1"}, {"left": "B", "right": "2"}, {"left": "C", "right": "3"}])
        key = pkg.ecd_evidence["code_check_target"]
        partner = {pair["left_id"]: pair["right_id"] for pair in key["pairs"]}
        for i in range(50):
            shown = shuffle_content("matching", pkg.content, key, f"m-{i}")
            aligned = all(partner[left["id"]] == right["id"] for left, right in zip(shown["left"], shown["right"]))
            self.assertFalse(aligned)
            self.assertEqual(check_answer("matching", shown, key, {"pairs": key["pairs"]}), 1)

    def test_error_step_keeps_order(self) -> None:
        pkg = package(ErrorStepGen, stem="Қатені тап", steps=["бір", "екі", "үш"], error_index=1, correction="2")
        shown = shuffle_content("error_step", pkg.content, pkg.ecd_evidence["code_check_target"], "e-1")
        self.assertEqual(shown["steps"], pkg.content["steps"])


if __name__ == "__main__":
    unittest.main()
