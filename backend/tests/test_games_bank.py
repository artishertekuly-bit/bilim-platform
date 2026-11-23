"""Ойын банкінің генерациясы (geimifikatsiya §3, D45): Т6, Т7 дәйексөз, қайталау және шешуші тексеру."""

from __future__ import annotations

import asyncio
import json
import random
import unittest
from types import SimpleNamespace

from app.examiner.bank.checks import SolverAnswer
from app.games.bank import generate as G

TEXT = ("Қазақ хандығы 1465 жылы құрылды. Хандықтың негізін Керей мен Жәнібек қалады. "
        "Олар Әбілқайыр ханның билігіне наразы болып, Моғолстанға көшіп кетті. "
        "Абылай хан XVIII ғасырда өмір сүрді.")


def run(coro):
    return asyncio.run(coro)


def mcq(stem, options, correct, quote, difficulty=1):
    return {"stem": stem, "options": options, "correct_index": correct, "difficulty": difficulty,
            "ecd_skill": "Дерек еске түсіру", "evidence": "Оқушы фактіні біледі", "support_quote": quote}


class FakeGateway:
    def __init__(self, mcq_items=(), debate_items=(), solver=None) -> None:
        self.mcq_items = list(mcq_items)
        self.debate_items = list(debate_items)
        self.solver = solver or {}
        self.calls: list[tuple[str, str | None]] = []

    async def complete(self, task, prompt, messages, *, schema=None, variant=None):
        self.calls.append((str(task), variant))
        if schema is G.GameMCQBatch:
            return SimpleNamespace(parsed=G.GameMCQBatch.model_validate({"items": self.mcq_items}))
        if schema is G.DebateBatch:
            return SimpleNamespace(parsed=G.DebateBatch.model_validate({"items": self.debate_items}))
        if schema is SolverAnswer:
            question = json.loads(messages[1].content.split("<question>")[1].split("</question>")[0])
            wanted = self.solver.get(question["stem"], "right")
            right = next(o["id"] for o in question["options"] if o["text"] == self.solver.get(
                question["stem"] + ":text", ""))
            ids = [o["id"] for o in question["options"]]
            chosen = [right] if wanted == "right" else [i for i in ids if i != right][:1]
            return SimpleNamespace(parsed=SolverAnswer(correct_option_ids=chosen))
        raise AssertionError(schema)


class FakeConn:
    def __init__(self, existing=()) -> None:
        self.inserts: list[tuple] = []
        self.existing = list(existing)

    async def fetchrow(self, sql, *args):
        return {"topic_id": "t1", "book": "hist8", "subject_id": "00000000-0000-0000-0000-000000000001",
                "paragraph_no": "1", "paragraph_title": "Қазақ хандығы"}

    async def fetch(self, sql, *args):
        if "bank_chunks" in sql:
            return [{"chunk_id": "c1", "content": TEXT}]
        return self.existing

    async def execute(self, sql, *args):
        self.inserts.append(args)


class BankTest(unittest.TestCase):
    def test_mcq_checks(self):
        good = mcq("Қазақ хандығы қай жылы құрылды?", ["1465", "1456", "1511", "1723"], 0,
                   "Қазақ хандығы 1465 жылы құрылды.")
        deixis = mcq("Мәтінде хандықты кім құрды делінген?", ["Керей мен Жәнібек", "Абылай", "Тәуке", "Қасым"], 0,
                     "Хандықтың негізін Керей мен Жәнібек қалады.")
        fake_quote = mcq("Абылай хан қай ғасырда өмір сүрді?", ["XVIII", "XV", "XVI", "XIX"], 0,
                         "Абылай хан XVII ғасырда туған.")
        solver_fails = mcq("Керей мен Жәнібек қайда көшті?", ["Моғолстанға", "Бұхараға", "Хиуаға", "Ресейге"], 0,
                           "Олар Әбілқайыр ханның билігіне наразы болып, Моғолстанға көшіп кетті.", 2)
        repeat = mcq("Қазақ хандығы қай жылы құрылды?", ["1465", "1466", "1500", "1600"], 0,
                     "Қазақ хандығы 1465 жылы құрылды.")
        solver = {
            good["stem"] + ":text": "1465",
            solver_fails["stem"] + ":text": "Моғолстанға", solver_fails["stem"]: "wrong",
            repeat["stem"] + ":text": "1465",
        }
        gateway = FakeGateway([good, deixis, fake_quote, solver_fails, repeat], solver=solver)
        conn = FakeConn()
        report = run(G.generate_topic(conn, gateway, "t1", mcq=5, debate=0, write=True, rng=random.Random(1)))
        statuses = [item.status for item in report.items]
        self.assertEqual(statuses, ["active", "rejected", "rejected", "rejected", "rejected"])
        self.assertIn("оқулық мәтініне сілтейді", " ".join(report.items[1].problems))
        self.assertIn("support_quote", " ".join(report.items[2].problems))
        self.assertIn("шешуші", " ".join(report.items[3].problems))
        self.assertIn("қайталанады", " ".join(report.items[4].problems))
        self.assertEqual(len(conn.inserts), 5)
        first = conn.inserts[0]
        self.assertEqual(first[0], "mcq")
        self.assertEqual(first[9], "active")
        content, key = json.loads(first[6]), json.loads(first[7])
        right = next(o for o in content["options"] if o["id"] == key["correct_option_id"])
        self.assertEqual(right["text"], "1465")
        self.assertIn(("generation_fast", "game_mcq"), gateway.calls)
        self.assertEqual(sum(1 for t, _ in gateway.calls if t == "mcq_solver_check"), 2)  # тек Т6/Т7-ден өткендер

    def test_option_limit_is_shorter_for_games(self):
        long = mcq("Хандықтың негізін кім қалады?", ["Керей мен Жәнібек" + " х" * 60, "Абылай", "Тәуке", "Қасым"], 0,
                   "Хандықтың негізін Керей мен Жәнібек қалады.")
        problems = G.GameMCQ.model_validate(long).problems()
        self.assertTrue(any("100 таңбадан ұзын" in p for p in problems))

    def test_debate_checks(self):
        good = {"statement": "Керей мен Жәнібектің Моғолстанға көшуі дұрыс шешім болды",
                "pro": ["Жаңа хандық құрылды", "Әбілқайырдан құтылды"], "con": ["Ел екіге бөлінді", "Соғыс күшейді"],
                "support_quote": "Олар Әбілқайыр ханның билігіне наразы болып, Моғолстанға көшіп кетті."}
        question = dict(good, statement="Көшу дұрыс па?")
        thin = dict(good, statement="Абылай ханның рөлі зор болды", pro=["Бір дәлел"])
        duplicate = dict(good)
        gateway = FakeGateway(debate_items=[good, question, thin, duplicate])
        report = run(G.generate_topic(FakeConn(), gateway, "t1", mcq=0, debate=4, write=False))
        self.assertEqual([i.status for i in report.items], ["active", "rejected", "rejected", "rejected"])
        self.assertIn("сұрақ емес", " ".join(report.items[1].problems))
        self.assertIn("2–3", " ".join(report.items[2].problems))
        self.assertIn("қайталанады", " ".join(report.items[3].problems))
        self.assertEqual(report.items[0].reference_context[:20], TEXT[:20])
        self.assertIn(("generation_fast", "game_debate"), gateway.calls)


if __name__ == "__main__":
    unittest.main()
