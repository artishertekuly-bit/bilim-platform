"""Tutor математикасы мен күй машинасы (personarag §3–§6)."""

from __future__ import annotations

import math
import unittest
from dataclasses import replace
from datetime import UTC, datetime, timedelta

from app.tutor import engine as E
from app.tutor.engine import NodeState, RouteInput, Status, Tags

NOW = datetime(2026, 11, 24, 12, 0, tzinfo=UTC)


def state(m: float, **kw) -> NodeState:
    kw.setdefault("last_interaction", NOW)
    return NodeState(mastery=m, **kw)


class DecayTests(unittest.TestCase):
    def test_no_time_no_decay(self) -> None:
        self.assertAlmostEqual(E.effective_mastery(state(0.8), NOW), 0.8)

    def test_bloom_lambda_and_review_count(self) -> None:
        old = NOW - timedelta(days=10)
        s = state(0.8, bloom_level="REMEMBER", review_count=1, last_interaction=old)
        self.assertAlmostEqual(E.effective_mastery(s, NOW), 0.8 * math.exp(-0.04 * 10), places=6)
        s2 = replace(s, review_count=2)
        self.assertAlmostEqual(E.effective_mastery(s2, NOW), 0.8 * math.exp(-0.02 * 10), places=6)
        s3 = replace(s, bloom_level="EVALUATE")
        self.assertAlmostEqual(E.effective_mastery(s3, NOW), 0.8 * math.exp(-0.01 * 10), places=6)

    def test_unseen_is_zero(self) -> None:
        self.assertEqual(E.effective_mastery(None, NOW), 0.0)


class StatusTests(unittest.TestCase):
    def test_order(self) -> None:
        # MISC бәрінен бұрын, тіпті UNSEEN-нен де.
        self.assertIs(E.node_status(None, 0.0, "MISC"), Status.STRUGGLING_MISC)
        self.assertIs(E.node_status(None, 0.0, "NONE"), Status.UNSEEN)
        # DECAYED GAP-тан бұрын (§5.1).
        decayed = state(0.8)
        self.assertIs(E.node_status(decayed, 0.5, "GAP"), Status.DECAYED)
        self.assertIs(E.node_status(state(0.6), 0.6, "GAP"), Status.STRUGGLING_GAP)
        self.assertIs(E.node_status(state(0.8), 0.8, "NONE"), Status.MASTERED)
        self.assertIs(E.node_status(state(0.3), 0.3, "NONE"), Status.EXPOSED)
        self.assertIs(E.node_status(state(0.5), 0.5, "NONE"), Status.DEVELOPING)

    def test_gap_has_no_mastery_condition(self) -> None:
        # v1-дегі «M_eff < 0.50» шарты алынды: 0.50–0.75 аралығында да GAP.
        self.assertIs(E.node_status(state(0.6), 0.6, "GAP"), Status.STRUGGLING_GAP)


class UpdateTests(unittest.TestCase):
    def test_full_argument_grows(self) -> None:
        tags = Tags(evidence_mode="ACTIVE_CLAIM", arg_depth="FULL", bloom_level="ANALYZE")
        new = E.update_node(state(0.5), tags, now=NOW)
        assert new is not None
        self.assertAlmostEqual(new.mastery, 0.8)
        self.assertEqual(new.review_count, 2)  # ΔM > 0 және M ≥ 0.70
        self.assertEqual(new.bloom_level, "ANALYZE")
        self.assertEqual(new.fail_streak, 0)

    def test_echo_gamma(self) -> None:
        tags = Tags(evidence_mode="ACTIVE_CLAIM", arg_depth="ECHO", bloom_level="UNDERSTAND")
        new = E.update_node(state(0.5), tags, now=NOW)
        assert new is not None
        self.assertAlmostEqual(new.mastery, 0.5 + 0.3 * 0.20)

    def test_passive_ask_caps_growth_but_never_lowers(self) -> None:
        tags = Tags(evidence_mode="PASSIVE_ASK", arg_depth="FULL", bloom_level="APPLY")
        low = E.update_node(state(0.1), tags, now=NOW)
        assert low is not None
        self.assertAlmostEqual(low.mastery, 0.25)  # C_mode = 0.25
        high = E.update_node(state(0.6), tags, now=NOW)
        assert high is not None
        self.assertAlmostEqual(high.mastery, 0.6)  # шек бар деңгейді түсірмейді

    def test_errors_penalise_and_count(self) -> None:
        gap = E.update_node(state(0.6, fail_streak=1, review_count=3), Tags(error_type="GAP"), now=NOW)
        assert gap is not None
        self.assertAlmostEqual(gap.mastery, 0.45)
        self.assertEqual(gap.fail_streak, 2)
        self.assertEqual(gap.review_count, 2)
        self.assertEqual(gap.error_type, "GAP")
        misc = E.update_node(state(0.1), Tags(error_type="MISC"), now=NOW)
        assert misc is not None
        self.assertEqual(misc.mastery, 0.0)

    def test_no_jump_from_exposed_to_mastered(self) -> None:
        # §3.2 инварианты: бір жауаппен EXPOSED-тен MASTERED-ке секіру жоқ.
        tags = Tags(evidence_mode="ACTIVE_CLAIM", arg_depth="FULL", bloom_level="CREATE")
        new = E.update_node(state(0.30), tags, now=NOW)
        assert new is not None
        self.assertLess(new.mastery, E.MASTERED_MIN)
        self.assertLessEqual(new.mastery, E.FEYNMAN_CAP)

    def test_paste_suspect_freezes(self) -> None:
        tags = Tags(evidence_mode="ACTIVE_CLAIM", arg_depth="FULL", bloom_level="ANALYZE")
        self.assertIsNone(E.update_node(state(0.5), tags, now=NOW, paste_suspect=True))

    def test_bridge_weight_and_errors(self) -> None:
        tags = Tags(evidence_mode="ACTIVE_CLAIM", arg_depth="FULL", bloom_level="ANALYZE")
        bridge = E.update_node(state(0.4), tags, now=NOW, weight=E.W_BRIDGE)
        assert bridge is not None
        self.assertAlmostEqual(bridge.mastery, 0.4 + 0.2 * 0.30)
        self.assertIsNone(E.update_node(state(0.4), Tags(error_type="GAP"), now=NOW, weight=E.W_BRIDGE))

    def test_decay_is_applied_before_update(self) -> None:
        old = NOW - timedelta(days=30)
        s = state(0.9, last_interaction=old)
        new = E.update_node(s, Tags(evidence_mode="PASSIVE_ASK"), now=NOW)
        assert new is not None
        self.assertAlmostEqual(new.mastery, round(0.9 * math.exp(-0.04 * 30), 4))
        self.assertEqual(new.last_interaction, NOW)


class ExposureTests(unittest.TestCase):
    def test_fact_and_topic(self) -> None:
        fact = E.update_node(None, Tags(intent="FACT_LOOKUP"), now=NOW)
        topic = E.update_node(None, Tags(intent="TOPIC_EXPLORE"), now=NOW)
        assert fact is not None and topic is not None
        self.assertEqual(fact.mastery, 0.15)
        self.assertEqual(topic.mastery, 0.20)

    def test_deep_claim_on_new_node(self) -> None:
        tags = Tags(intent="ANSWER", evidence_mode="ACTIVE_CLAIM", arg_depth="FULL", bloom_level="ANALYZE")
        new = E.update_node(None, tags, now=NOW)
        assert new is not None
        self.assertAlmostEqual(new.mastery, 0.45 + 0.30)
        shallow = E.update_node(None, replace(tags, bloom_level="UNDERSTAND"), now=NOW)
        assert shallow is not None
        self.assertAlmostEqual(shallow.mastery, 0.20)

    def test_misconception_opens_row(self) -> None:
        new = E.update_node(None, Tags(error_type="MISC"), now=NOW)
        assert new is not None
        self.assertEqual((new.mastery, new.fail_streak, new.error_type), (0.0, 1, "MISC"))


class GateTests(unittest.TestCase):
    def test_gate(self) -> None:
        self.assertIs(E.gate(Tags(toxicity_target="INTERPERSONAL_OR_PROFANITY")), E.Gate.HARD_ALERT)
        self.assertIs(E.gate(Tags(toxicity_target="HISTORICAL_CONTEXT")), E.Gate.NONE)
        self.assertIs(E.gate(Tags(intent="META_REFLECTION")), E.Gate.META_REFLECTION)
        self.assertIs(E.gate(Tags(intent="FRUSTRATION")), E.Gate.OPEN_EMPATHETIC_DIALOG)
        # Агрессия мета-сұраныстан бұрын тексеріледі.
        both = Tags(toxicity_target="INTERPERSONAL_OR_PROFANITY", intent="META_REFLECTION")
        self.assertIs(E.gate(both), E.Gate.HARD_ALERT)


class RouteTests(unittest.TestCase):
    def r(self, status: Status, **kw) -> str:
        tags = kw.pop("tags", Tags())
        return E.choose_scenario(RouteInput(status=status, tags=tags, **kw))

    def test_unseen(self) -> None:
        self.assertEqual(self.r(Status.UNSEEN, tags=Tags(intent="FACT_LOOKUP")), "1")
        self.assertEqual(self.r(Status.UNSEEN, tags=Tags(intent="TOPIC_EXPLORE")), "2")
        self.assertEqual(self.r(Status.UNSEEN, tags=Tags(intent="TOPIC_EXPLORE"), unanswered_questions=3), "1")
        # Дұрыс ACTIVE_CLAIM: маршрут M_new бойынша қайта таңдалады.
        self.assertEqual(self.r(Status.UNSEEN, m_new=0.5), "11")

    def test_misc(self) -> None:
        self.assertEqual(self.r(Status.STRUGGLING_MISC, has_prerequisite=True, parent_m_eff=0.4), "6A")
        self.assertEqual(self.r(Status.STRUGGLING_MISC, has_prerequisite=True, parent_m_eff=0.8), "6B")
        self.assertEqual(self.r(Status.STRUGGLING_MISC, has_prerequisite=False), "6B")

    def test_gap(self) -> None:
        self.assertEqual(self.r(Status.STRUGGLING_GAP, fail_streak=1, has_prerequisite=True), "4")
        self.assertEqual(self.r(Status.STRUGGLING_GAP, fail_streak=2, has_prerequisite=True), "5")
        self.assertEqual(self.r(Status.STRUGGLING_GAP, fail_streak=3, has_prerequisite=False), "4")

    def test_decayed(self) -> None:
        self.assertEqual(self.r(Status.DECAYED), "7")
        deep = Tags(evidence_mode="ACTIVE_CLAIM", arg_depth="FULL")
        self.assertEqual(self.r(Status.DECAYED, tags=deep), "10")

    def test_mastered(self) -> None:
        self.assertEqual(self.r(Status.MASTERED, tags=Tags(arg_depth="ECHO", evidence_mode="ACTIVE_CLAIM")), "8")
        self.assertEqual(self.r(Status.MASTERED, tags=Tags(bloom_level="REMEMBER")), "8")
        deep = Tags(bloom_level="ANALYZE", evidence_mode="ACTIVE_CLAIM", arg_depth="FULL")
        self.assertEqual(self.r(Status.MASTERED, tags=deep, bridge_available=True), "9")
        self.assertEqual(self.r(Status.MASTERED, tags=deep, bridge_available=False), "10")

    def test_exposed_and_developing(self) -> None:
        self.assertEqual(self.r(Status.EXPOSED, tags=Tags(evidence_mode="PASSIVE_ASK")), "3A")
        self.assertEqual(self.r(Status.EXPOSED, tags=Tags(evidence_mode="ACTIVE_CLAIM")), "3B")
        self.assertEqual(self.r(Status.DEVELOPING), "11")

    def test_route_style_and_graph_action(self) -> None:
        out = E.route(RouteInput(status=Status.STRUGGLING_GAP, tags=Tags(), fail_streak=2, has_prerequisite=True))
        self.assertEqual((out.scenario, out.style, out.graph_action), ("5", "ROOT_CONNECTOR", "BACKWARD"))
        deep = Tags(bloom_level="ANALYZE", evidence_mode="ACTIVE_CLAIM", arg_depth="FULL")
        fwd = E.route(RouteInput(status=Status.MASTERED, tags=deep, bridge_available=True))
        self.assertEqual((fwd.scenario, fwd.style, fwd.graph_action), ("9", "STORYTELLING_DILEMMA", "FORWARD"))

    def test_rhythm_rule(self) -> None:
        deep = Tags(bloom_level="ANALYZE", evidence_mode="ACTIVE_CLAIM", arg_depth="FULL")
        out = E.route(RouteInput(status=Status.MASTERED, tags=deep, bridge_available=True,
                                 recent_styles=("CLEAR_EXPLAINER", "PLAYFUL_CHALLENGER")))
        self.assertEqual(out.style, "CLEAR_EXPLAINER")
        older = E.route(RouteInput(status=Status.MASTERED, tags=deep, bridge_available=True,
                                   recent_styles=("PLAYFUL_CHALLENGER", "CLEAR_EXPLAINER", "CLEAR_EXPLAINER")))
        self.assertEqual(older.style, "STORYTELLING_DILEMMA")

    def test_every_status_reaches_one_scenario(self) -> None:
        # Кез келген комбинация бір ғана сценарийге түседі (§5.1).
        for status in Status:
            for intent in ("FACT_LOOKUP", "TOPIC_EXPLORE", "ANSWER"):
                for mode in ("PASSIVE_ASK", "ACTIVE_CLAIM", "BROAD"):
                    for depth in ("NONE", "ECHO", "FULL"):
                        tags = Tags(intent=intent, evidence_mode=mode, arg_depth=depth)
                        scenario = E.choose_scenario(RouteInput(status=status, tags=tags))
                        self.assertIn(scenario, E.SCENARIO_STYLE)


class HelperTests(unittest.TestCase):
    def test_state_code(self) -> None:
        self.assertEqual(E.state_code("n4", None, NOW), "n4:U")
        s = state(0.62, error_type="GAP", review_count=2)
        self.assertEqual(E.state_code("n3", s, NOW), "n3:M.62/GAP/R2")

    def test_paste_suspect(self) -> None:
        long = "а" * 450
        self.assertTrue(E.paste_suspect(long, [20, 30, 40]))
        self.assertFalse(E.paste_suspect(long, [200, 300, 400]))
        self.assertFalse(E.paste_suspect(long, [20]))
        self.assertFalse(E.paste_suspect("қысқа", [20, 30, 40]))

    def test_unanswered(self) -> None:
        self.assertEqual(E.next_unanswered(2, Tags(alignment=0)), 3)
        self.assertEqual(E.next_unanswered(2, Tags(alignment=1, intent="ANSWER")), 0)
        self.assertEqual(E.next_unanswered(2, Tags(alignment=1, intent="FACT_LOOKUP")), 2)


if __name__ == "__main__":
    unittest.main()
