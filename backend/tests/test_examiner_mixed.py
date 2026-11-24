"""D97: «Пән бойынша тест» — 10 / 20 / 50 items, 60 % MCQ / 40 % weighted random other formats, bank only ($0).

No database and no LLM: a fake pool answers the few reads `_plan_mixed` makes; the gateway and the generator record
every call so the tests can prove that a mixed start makes none.
"""

from __future__ import annotations

import json
import random
import unittest
import uuid
from collections import Counter
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any
from unittest import mock

from app.examiner.session import mixed as M
from app.examiner.session.dto import ExamSession, StartMixedRequest
from app.examiner.session.scoring import GradedItem
from app.examiner.session.service import ExaminerService

SUBJECT = "00000000-0000-0000-0000-000000000001"
STUDENT = "00000000-0000-0000-0000-0000000000bb"


def bank_mcq(qid: str, **kw: Any) -> dict[str, Any]:
    row = dict(question_id=qid, origin="imported", topic_id=None, tier="X1", era=None, subtopic=None,
               period_label=None, year_sort=None, fact_key=f"fk-{qid}", concept_key=None, similarity=None,
               leased_at=None)
    row.update(kw)
    return row


def other(qid: str, fmt: str, **kw: Any) -> dict[str, Any]:
    row = dict(question_id=qid, format=fmt, tier="X1", topic_id="kz7#§1", fact_key=None, concept_key=f"c-{qid}",
               leased_at=None)
    row.update(kw)
    return row


def history_bank() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """The live `history` shape: matching 41, short_answer 17, plenty of MCQs; plus dialog items that must not show."""
    mcqs = [bank_mcq(f"m{i}", era=f"era{i % 4}", subtopic=f"sub{i % 7}", year_sort=1000 + i) for i in range(200)]
    others = ([other(f"mt{i}", "matching") for i in range(41)] + [other(f"sa{i}", "short_answer") for i in range(17)]
              + [other("so", "socratic"), other("fe", "feynman"), other("ta", "teach_ai")])
    return mcqs, others


class FakeConn:
    def __init__(self, pool: "FakePool") -> None:
        self.pool = pool
        self.executed: list[tuple[str, tuple]] = []

    async def fetchrow(self, sql: str, *args: Any) -> Any:
        if "from corpus.subjects" in sql:
            return {"name_kk": self.pool.title, "slug": self.pool.slug}
        if "examiner.request_log" in sql:
            return None
        raise AssertionError(f"unexpected fetchrow: {sql[:80]}")

    async def fetch(self, sql: str, *args: Any) -> list[dict[str, Any]]:
        if "format_applicability" in sql:
            return []
        if "from corpus.paragraphs" in sql:
            return self.pool.paragraphs
        if "cross join lateral" in sql:  # _bank_mcqs
            self.pool.bank_calls.append(args)
            exclude = set(args[4])
            return [dict(r) for r in self.pool.mcqs if r["question_id"] not in exclude]
        if "q.concept_key, case when l.question_id" in sql:  # _mixed_non_mcq
            self.pool.non_mcq_calls.append(args)
            formats, tiers, topics = set(args[2]), set(args[3]), args[4]
            return [dict(r) for r in self.pool.others if r["format"] in formats and r["tier"] in tiers
                    and (topics is None or r["topic_id"] in topics)]
        if "returning session_id" in sql:  # _abandon_idle
            return []
        raise AssertionError(f"unexpected fetch: {sql[:80]}")

    async def fetchval(self, sql: str, *args: Any) -> Any:
        if "from corpus.textbooks" in sql:
            return self.pool.book
        if "status in ('preparing', 'active', 'blocked')" in sql:
            return None
        if "insert into examiner.sessions" in sql:
            self.pool.inserted.append(args)
            return "sess-1"
        raise AssertionError(f"unexpected fetchval: {sql[:80]}")

    async def execute(self, sql: str, *args: Any) -> str:
        self.pool.executed.append((sql, args))
        return "OK"

    @asynccontextmanager
    async def transaction(self):
        yield


class FakePool:
    def __init__(self, mcqs: list[dict[str, Any]], others: list[dict[str, Any]], *, title: str = "Қазақстан тарихы",
                 slug: str = "history", book: str | None = "kz7") -> None:
        self.mcqs, self.others = mcqs, others
        self.title, self.slug, self.book = title, slug, book
        self.paragraphs: list[dict[str, Any]] = []
        self.bank_calls: list[tuple] = []
        self.non_mcq_calls: list[tuple] = []
        self.inserted: list[tuple] = []
        self.executed: list[tuple[str, tuple]] = []

    @asynccontextmanager
    async def acquire(self):
        yield FakeConn(self)

    async def fetchval(self, sql: str, *args: Any) -> Any:
        if "from corpus.subjects" in sql:
            return self.title
        raise AssertionError(f"unexpected fetchval: {sql[:80]}")


class NoLlm:
    """Gateway and MCQ generator in one: any call is recorded (and must not happen)."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    async def embed(self, texts: list[str], *, model_key: str) -> list[list[float]]:
        self.calls.append(f"embed:{model_key}")
        return [[0.0]]

    async def __call__(self, *args: Any) -> list[str]:
        self.calls.append("generate")
        return []


def service(pool: FakePool, llm: NoLlm, seed: int = 7) -> ExaminerService:
    return ExaminerService(pool, gateway=llm, mcq_generator=llm, rng=random.Random(seed))  # type: ignore[arg-type]


class SplitTests(unittest.TestCase):
    def test_sixty_forty_for_each_count(self) -> None:
        self.assertEqual([M.split(n) for n in (10, 20, 50)], [(6, 4), (12, 8), (30, 20)])

    def test_other_counts_are_refused(self) -> None:
        for bad in (0, 15, 51):
            with self.assertRaises(ValueError):
                M.split(bad)

    def test_dialog_and_long_formats_are_not_in_the_pool(self) -> None:
        self.assertNotIn("mcq", M.NON_MCQ_FORMATS)
        for name in ("socratic", "teach_ai", "feynman"):
            self.assertNotIn(name, M.NON_MCQ_FORMATS)


class WeightedPickTests(unittest.TestCase):
    def items(self, fmt: str, n: int, **kw: Any) -> list[M.BankItem]:
        return [M.BankItem(f"{fmt}{i}", fmt, "X1", concept_key=f"{fmt}-{i}", **kw) for i in range(n)]

    def test_formats_are_drawn_by_weight_not_by_pool_size(self) -> None:
        # 1000 matching vs 50 short_answer: weights 3 : 2 still give short_answer about 40 % of the draws.
        pool = self.items("matching", 1000) + self.items("short_answer", 50)
        totals: Counter[str] = Counter()
        for seed in range(200):
            totals.update(i.format for i in M.pick_non_mcq(pool, 20, random.Random(seed)))
        share = totals["short_answer"] / sum(totals.values())
        self.assertAlmostEqual(share, 2 / 5, delta=0.03)

    def test_random_but_reproducible(self) -> None:
        pool = self.items("matching", 30) + self.items("sequence", 30) + self.items("short_answer", 30)
        a = [i.question_id for i in M.pick_non_mcq(pool, 8, random.Random(1))]
        b = [i.question_id for i in M.pick_non_mcq(pool, 8, random.Random(1))]
        c = [i.question_id for i in M.pick_non_mcq(pool, 8, random.Random(2))]
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)

    def test_one_item_per_concept_and_unknown_formats_skipped(self) -> None:
        pool = [M.BankItem("a", "matching", "X1", concept_key="same"), M.BankItem("b", "matching", "X1",
                                                                                  concept_key="same"),
                M.BankItem("c", "socratic", "X1"), M.BankItem("d", "short_answer", "X1", fact_key="f")]
        picked = M.pick_non_mcq(pool, 4, random.Random(0), taken=["fact:f"])
        self.assertEqual(len(picked), 1)
        self.assertEqual(picked[0].format, "matching")

    def test_free_rows_first(self) -> None:
        leased = datetime(2026, 11, 1, tzinfo=timezone.utc)
        pool = self.items("matching", 5, leased_at=leased) + [M.BankItem("free", "matching", "X1")]
        self.assertEqual(M.pick_non_mcq(pool, 1, random.Random(0))[0].question_id, "free")

    def test_written_topic_matches_paragraph_titles_without_embedding(self) -> None:
        from app.examiner.session.topics import Paragraph

        paras = [Paragraph("kz7#§3", "kz7", "", 7, "3", "Түрік қағанаты"),
                 Paragraph("kz7#§4", "kz7", "", 7, "4", "Батыс түрік қағанаты"),
                 Paragraph("kz7#§9", "kz7", "", 7, "9", "Қазақ хандығының құрылуы")]
        self.assertEqual(M.topic_ids("Түрік қағанаты", paras), ["kz7#§3", "kz7#§4"])
        self.assertEqual(M.topic_ids("Ай мен жұлдыз", paras), [])


class PlanTests(unittest.IsolatedAsyncioTestCase):
    async def test_sixty_forty_split_for_10_20_50_with_zero_llm_calls(self) -> None:
        for count, (mcq, rest) in {10: (6, 4), 20: (12, 8), 50: (30, 20)}.items():
            mcqs, others = history_bank()
            pool, llm = FakePool(mcqs, others), NoLlm()
            items, snapshot, book = await service(pool, llm)._plan_mixed(STUDENT, SUBJECT, count, None)
            formats = Counter(fmt for _, _, fmt in items)
            self.assertEqual(len(items), count)
            self.assertEqual((formats["mcq"], count - formats["mcq"]), (mcq, rest))
            self.assertEqual(snapshot["mix"], {"requested": count, "mcq": mcq, "other": rest, "topic": None})
            self.assertEqual(snapshot["mode"], "mixed")
            self.assertLessEqual(set(formats) - {"mcq"}, {"matching", "short_answer"})
            self.assertEqual(llm.calls, [])  # $0: no embedding, no generation
            self.assertEqual(len({qid for _, qid, _ in items}), count)
            self.assertEqual(book, "kz7")

    async def test_non_mcq_query_asks_only_single_turn_formats_and_x1_x2(self) -> None:
        mcqs, others = history_bank()
        pool = FakePool(mcqs, others)
        await service(pool, NoLlm())._plan_mixed(STUDENT, SUBJECT, 20, None)
        formats, tiers, topics = pool.non_mcq_calls[0][2], pool.non_mcq_calls[0][3], pool.non_mcq_calls[0][4]
        self.assertEqual(tuple(formats), M.NON_MCQ_FORMATS)
        self.assertEqual(tiers, ["X1", "X2"])
        self.assertIsNone(topics)  # empty topic → the whole subject

    async def test_shortfall_is_backfilled_with_bank_mcqs(self) -> None:
        mcqs, _ = history_bank()
        pool, llm = FakePool(mcqs, [other("mt0", "matching"), other("mt1", "matching"), other("sa0", "short_answer")]), NoLlm()
        items, snapshot, _ = await service(pool, llm)._plan_mixed(STUDENT, SUBJECT, 10, None)
        self.assertEqual(snapshot["mix"]["other"], 3)
        self.assertEqual(snapshot["mix"]["mcq"], 7)
        self.assertEqual(len(items), 10)
        self.assertEqual(llm.calls, [])

    async def test_world_history_is_all_bank_mcq_and_shuffled(self) -> None:
        mcqs = [bank_mcq(f"w{i}", era=f"era{i % 4}", subtopic=f"s{i % 9}", year_sort=i) for i in range(300)]
        pool, llm = FakePool(mcqs, [], title="Дүниежүзі тарихы", slug="world_history", book=None), NoLlm()
        items, snapshot, book = await service(pool, llm)._plan_mixed(STUDENT, SUBJECT, 50, "")
        self.assertEqual(snapshot["mix"], {"requested": 50, "mcq": 50, "other": 0, "topic": None})
        self.assertEqual(book, "world_history")  # no textbook: sessions.book keeps the slug
        self.assertEqual(llm.calls, [])
        self.assertEqual(len({qid for _, qid, _ in items}), 50)

    async def test_final_order_is_shuffled(self) -> None:
        mcqs, others = history_bank()
        items, _, _ = await service(FakePool(mcqs, others), NoLlm(), seed=11)._plan_mixed(STUDENT, SUBJECT, 20, None)
        order = [fmt == "mcq" for _, _, fmt in items]
        self.assertNotEqual(order, sorted(order))  # not «all others, then all MCQs»

    async def test_written_topic_narrows_non_mcq_to_matching_paragraphs(self) -> None:
        mcqs, others = history_bank()
        others = [other(f"t{i}", "matching", topic_id="kz7#§3") for i in range(6)] + others
        pool = FakePool(mcqs, others)
        pool.paragraphs = [dict(topic_id="kz7#§3", book="kz7", grade=7, book_title="", paragraph_no="3",
                                paragraph_title="Түрік қағанаты"),
                           dict(topic_id="kz7#§1", book="kz7", grade=7, book_title="", paragraph_no="1",
                                paragraph_title="Ежелгі тайпалар")]
        llm = NoLlm()
        items, snapshot, _ = await service(pool, llm)._plan_mixed(STUDENT, SUBJECT, 10, " Түрік  қағанаты ")
        self.assertEqual(pool.non_mcq_calls[0][4], ["kz7#§3"])
        self.assertEqual(snapshot["mix"]["topic"], "Түрік қағанаты")
        self.assertTrue(all(qid.startswith("t") for _, qid, fmt in items if fmt != "mcq"))
        self.assertEqual(llm.calls, [])

    async def test_empty_bank_is_a_clear_409(self) -> None:
        from app.examiner.session.errors import ExaminerError

        with self.assertRaises(ExaminerError) as ctx:
            await service(FakePool([], []), NoLlm())._plan_mixed(STUDENT, SUBJECT, 10, None)
        self.assertEqual(ctx.exception.code, "BANK_NOT_READY")


class StartMixedTests(unittest.IsolatedAsyncioTestCase):
    async def test_start_writes_an_active_mixed_session_with_all_items(self) -> None:
        mcqs, others = history_bank()
        pool, llm = FakePool(mcqs, others), NoLlm()
        svc = service(pool, llm)
        fake = ExamSession(session_id="sess-1", status="active", level=1,
                           scope={"type": "subject", "id": SUBJECT, "title": "Қазақстан тарихы"},
                           progress={"answered": 0, "total": 20}, current=None, upcoming=[], strike_count=0,
                           started_at=datetime(2026, 11, 25, tzinfo=timezone.utc), mode="mixed",
                           mix={"requested": 20, "mcq": 12, "other": 8})
        with mock.patch.object(svc, "_session", mock.AsyncMock(return_value=fake)):
            session = await svc.start_mixed(STUDENT, StartMixedRequest(client_request_id=uuid.uuid4(),
                                                                       subject_id=uuid.UUID(SUBJECT), count=20))
        self.assertEqual(session.mode, "mixed")
        args = pool.inserted[0]
        self.assertEqual(args[1], args[2])  # scope_id = subject_id (subject scope check)
        snapshot = json.loads(args[3])
        self.assertEqual((snapshot["mode"], snapshot["level"], len(snapshot["slots"])), ("mixed", 1, 20))
        item_insert = next(a for sql, a in pool.executed if "insert into examiner.session_items" in sql)
        self.assertEqual(len(item_insert[2]), 20)
        self.assertEqual(set(item_insert[4]), {None})  # no A / D blocks, no deadlines
        self.assertTrue(any("examiner.request_log" in sql for sql, _ in pool.executed))  # idempotent replay
        self.assertEqual(llm.calls, [])

    def test_count_must_be_10_20_or_50(self) -> None:
        from pydantic import ValidationError

        for bad in (5, 30, 100):
            with self.assertRaises(ValidationError):
                StartMixedRequest(client_request_id=uuid.uuid4(), subject_id=uuid.UUID(SUBJECT), count=bad)


class RecordingConn:
    def __init__(self) -> None:
        self.executed: list[str] = []

    async def execute(self, sql: str, *args: Any) -> str:
        self.executed.append(sql)
        return "OK"


class CompletionTests(unittest.IsolatedAsyncioTestCase):
    async def test_mixed_completion_writes_no_level_result(self) -> None:
        conn = RecordingConn()
        svc = ExaminerService(mock.MagicMock())  # type: ignore[arg-type]
        session = {"session_id": "sess-1", "level": 1, "composition": json.dumps({"mode": "mixed"})}
        graded = [GradedItem("X1", "mcq", None, 4), GradedItem("X1", "matching", None, 2)]
        await svc._complete(conn, session, graded, x3_available=False)
        self.assertTrue(any("status = 'completed'" in sql for sql in conn.executed))
        self.assertFalse(any("session_results" in sql for sql in conn.executed))

    async def test_level_completion_still_writes_the_result(self) -> None:
        conn = RecordingConn()
        svc = ExaminerService(mock.MagicMock())  # type: ignore[arg-type]
        session = {"session_id": "sess-1", "level": 1, "composition": json.dumps({"level": 1})}
        graded = [GradedItem("X1", "mcq", None, 4), GradedItem("X1", "matching", None, 2)]
        await svc._complete(conn, session, graded, x3_available=False)
        self.assertTrue(any("session_results" in sql for sql in conn.executed))


if __name__ == "__main__":
    unittest.main()
