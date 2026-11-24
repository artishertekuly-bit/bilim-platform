"""D96: hybrid MCQ retrieval, deficit-only generation, audit protection of imported rows, $0 explanations.

No database and no LLM: a fake pool answers the statements these paths use; generators and the gateway are fakes.
"""

from __future__ import annotations

import random
import unittest
import uuid
from collections import Counter
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any
from unittest import mock

from app.examiner.bank.audit import BankQuestion, audit
from app.examiner.bank.import_json import parse_item, to_row
from app.examiner.session import retrieval as R
from app.examiner.session import service as S
from app.examiner.session.composition import build_composition
from app.examiner.session.dto import AnswerRequest, ExamSession
from app.examiner.session.service import ExaminerService, ResolvedScope

SUBJECT = "00000000-0000-0000-0000-000000000001"
STUDENT = "00000000-0000-0000-0000-0000000000bb"
SESSION = "00000000-0000-0000-0000-0000000000aa"
ITEM = "00000000-0000-0000-0000-0000000000cc"
ERAS = {"Ежелгі дүние тарихы": -500, "Орта ғасырлар тарихы": 800, "Жаңа заман тарихы": 1700,
        "Қазіргі заман тарихы": 1950}


def mcq(qid: str, **kw: Any) -> dict[str, Any]:
    row = dict(question_id=qid, origin="imported", topic_id=None, tier="X1", era=None, subtopic=None,
               period_label=None, year_sort=None, fact_key=f"fk-{qid}", concept_key=None, similarity=None,
               leased_at=None)
    row.update(kw)
    return row


def items(rows: list[dict[str, Any]]) -> list[R.BankMcq]:
    return [R.BankMcq(**row) for row in rows]


def world_bank(per_subtopic: int = 10) -> list[dict[str, Any]]:
    rows = []
    for era, start in ERAS.items():
        for sub in range(3):
            for n in range(per_subtopic):
                rows.append(mcq(f"{start}-{sub}-{n}", era=era, subtopic=f"{era} / {sub}", year_sort=start + n))
    return rows


class FakeConn:
    def __init__(self, pool: "FakePool") -> None:
        self.pool = pool

    async def fetch(self, sql: str, *args: Any) -> list[dict[str, Any]]:
        if "cross join lateral" in sql:  # _bank_mcqs
            self.pool.bank_calls.append(args)
            vector, exclude, only = args[2], set(args[4]), args[5]
            rows = [dict(r) for r in self.pool.bank if r["question_id"] not in exclude
                    and (only is None or r["question_id"] in only)]
            for row in rows:
                row["similarity"] = self.pool.sims.get(row["question_id"]) if vector is not None else None
            return rows
        if "max(1 - (n.content_embedding" in sql:  # _closeness
            return [dict(question_id=q, similarity=s) for q, s in self.pool.closeness.items() if q in args[0]]
        raise AssertionError(f"unexpected fetch: {sql[:80]}")


class FakePool:
    def __init__(self, bank: list[dict[str, Any]], title: str = "Дүниежүзі тарихы") -> None:
        self.bank = bank
        self.title = title
        self.sims: dict[str, float] = {}
        self.closeness: dict[str, float] = {}
        self.bank_calls: list[tuple] = []

    @asynccontextmanager
    async def acquire(self):
        yield FakeConn(self)

    async def fetchval(self, sql: str, *args: Any) -> Any:
        if "from corpus.subjects" in sql:
            return self.title
        raise AssertionError(f"unexpected fetchval: {sql[:80]}")


class FakeGateway:
    def __init__(self) -> None:
        self.embed_calls: list[tuple[list[str], str]] = []

    async def embed(self, texts: list[str], *, model_key: str) -> list[list[float]]:
        self.embed_calls.append((texts, model_key))
        return [[0.1, 0.2, 0.3]]


class RecordingGenerator:
    def __init__(self, pool: FakePool, new_rows: list[dict[str, Any]] = ()) -> None:
        self.pool = pool
        self.new_rows = list(new_rows)
        self.calls: list[tuple[str, R.McqQuery, int]] = []

    async def __call__(self, subject_id: str, query: R.McqQuery, missing: int) -> list[str]:
        self.calls.append((subject_id, query, missing))
        self.pool.bank += self.new_rows[:missing]
        return [r["question_id"] for r in self.new_rows[:missing]]


class QueryParsingTests(unittest.TestCase):
    def test_subject_name_or_empty_is_broad(self) -> None:
        self.assertTrue(R.parse_query("Дүниежүзі тарихы", "Дүниежүзі тарихы").broad)
        self.assertTrue(R.parse_query("  Қазақстан тарихы ", "Қазақстан тарихы").broad)
        self.assertTrue(R.parse_query(None, "Қазақстан тарихы").broad)

    def test_years_and_centuries_are_extracted(self) -> None:
        q = R.parse_query("Қазақ хандығының құрылуы 1465 ж.", "Қазақстан тарихы")
        self.assertEqual((q.words, q.years), (("хандығының", "құрылуы"), (1465, 1465)))
        self.assertEqual(R.parse_query("1916–1920 жылдар").years, (1916, 1920))
        century = R.parse_query("XV ғасыр")
        self.assertEqual((century.words, century.years), ((), (1401, 1500)))
        self.assertFalse(century.broad)


class SelectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.rng = random.Random(7)

    def test_year_and_subtopic_filtering(self) -> None:
        bank = items([
            mcq("hit", subtopic="Қазақ хандығының құрылуы", year_sort=1465),
            mcq("wrong-year", subtopic="Қазақ хандығының құрылуы", year_sort=1620),
            mcq("same-year-other-topic", subtopic="Темір империясы", year_sort=1466),
            mcq("no-year-similar", origin="generated", topic_id="kz7#§3", fact_key=None, similarity=0.8),
        ])
        q = R.parse_query("хандығы 1465", "Қазақстан тарихы")
        self.assertEqual({i.question_id for i in R.select(bank, q, 10, self.rng)}, {"hit", "no-year-similar"})
        years_only = R.parse_query("1465")
        self.assertEqual({i.question_id for i in R.select(bank, years_only, 10, self.rng)},
                         {"hit", "same-year-other-topic"})

    def test_similarity_threshold_and_metadata_rank_first(self) -> None:
        bank = items([
            mcq("close", origin="generated", topic_id="t1", fact_key=None, similarity=0.80),
            mcq("far", origin="generated", topic_id="t1", fact_key=None, similarity=0.70),
            mcq("meta", subtopic="Абылай хан"),
        ])
        chosen = R.select(bank, R.parse_query("Абылай"), 10, self.rng)
        self.assertEqual([i.question_id for i in chosen], ["meta", "close"])

    def test_one_question_per_fact_or_concept(self) -> None:
        bank = items([mcq("a", subtopic="Абылай", fact_key="same"), mcq("b", subtopic="Абылай", fact_key="same"),
                      mcq("c", origin="generated", topic_id="t", fact_key=None, concept_key="k", similarity=0.9),
                      mcq("d", origin="generated", topic_id="t", fact_key=None, concept_key="k", similarity=0.9)])
        chosen = R.select(bank, R.parse_query("Абылай"), 10, self.rng)
        self.assertEqual(len(chosen), 2)
        self.assertEqual(len({i.diversity_key for i in chosen}), 2)

    def test_broad_fifty_is_stratified_across_eras_and_subtopics(self) -> None:
        bank = items(world_bank()) + items([mcq("g1", origin="generated", topic_id="wh#§1", fact_key=None)])
        chosen = R.select(bank, R.parse_query("Дүниежүзі тарихы", "Дүниежүзі тарихы"), 50, self.rng)
        self.assertEqual(len(chosen), 50)
        per_era = Counter(i.era or "" for i in chosen)
        imported = [per_era[era] for era in ERAS]
        self.assertLessEqual(max(imported) - min(imported), 1)  # periods evenly represented
        per_sub = Counter(i.subtopic for i in chosen if i.era == "Жаңа заман тарихы")
        self.assertLessEqual(max(per_sub.values()) - min(per_sub.values()), 1)

    def test_near_duplicates_of_chosen_are_dropped(self) -> None:
        fresh = items([mcq("dup"), mcq("edge"), mcq("new")])
        kept = R.drop_near_duplicates(fresh, {"dup": 0.93, "edge": 0.88})
        self.assertEqual([i.question_id for i in kept], ["edge", "new"])


class AssemblyTests(unittest.IsolatedAsyncioTestCase):
    def service(self, pool: FakePool, generator: RecordingGenerator, gateway: FakeGateway) -> ExaminerService:
        return ExaminerService(pool, gateway=gateway, mcq_generator=generator,  # type: ignore[arg-type]
                               rng=random.Random(3))

    async def test_full_bank_hit_makes_no_llm_call(self) -> None:
        pool = FakePool([mcq(f"q{i}", subtopic="Қазақ хандығы", year_sort=1465 + i) for i in range(30)],
                        title="Қазақстан тарихы")
        gen, gateway = RecordingGenerator(pool), FakeGateway()
        result = await self.service(pool, gen, gateway).assemble_mcqs(STUDENT, SUBJECT, "Қазақ хандығы", 20)
        self.assertEqual((len(result.question_ids), result.from_bank, result.generated), (20, 20, 0))
        self.assertEqual((gen.calls, gateway.embed_calls), ([], []))  # $0: no embedding, no generation
        self.assertEqual(len(pool.bank_calls), 1)

    async def test_partial_hit_generates_only_the_deficit_and_dedups(self) -> None:
        bank = [mcq(f"q{i}", subtopic="Абылай хан") for i in range(3)]
        bank.append(mcq("sim", origin="generated", topic_id="kz8#§3", fact_key=None))
        pool = FakePool(bank, title="Қазақстан тарихы")
        pool.sims = {"sim": 0.81}
        new = [mcq(f"n{i}", origin="generated", topic_id="kz8#§3", fact_key=None, concept_key=f"c{i}")
               for i in range(6)]
        pool.closeness = {"n0": 0.95}  # too close to a chosen imported MCQ
        gen, gateway = RecordingGenerator(pool, new), FakeGateway()
        result = await self.service(pool, gen, gateway).assemble_mcqs(STUDENT, SUBJECT, "Абылай хан", 8)
        self.assertEqual(len(gateway.embed_calls), 1)  # metadata fell short → one query embedding
        self.assertEqual(gateway.embed_calls[0][1], S.QUESTION_EMBEDDING_KEY)
        self.assertEqual([c[2] for c in gen.calls], [4])  # 8 needed − 4 found
        self.assertEqual((result.from_bank, result.generated), (4, 3))  # n0 dropped as a near duplicate
        self.assertNotIn("n0", result.question_ids)
        self.assertEqual(pool.bank_calls[-1][5], ["n0", "n1", "n2", "n3"])  # only the fresh ids are read back

    async def test_broad_fifty_world_history_is_bank_only_and_even(self) -> None:
        pool = FakePool(world_bank())
        gen, gateway = RecordingGenerator(pool), FakeGateway()
        result = await self.service(pool, gen, gateway).assemble_mcqs(STUDENT, SUBJECT, "Дүниежүзі тарихы", 50)
        self.assertTrue(result.broad)
        self.assertEqual((len(result.question_ids), result.generated, gen.calls, gateway.embed_calls),
                         (50, 0, [], []))
        eras = Counter(qid.split("-")[0] for qid in result.question_ids)
        self.assertLessEqual(max(eras.values()) - min(eras.values()), 1)
        self.assertTrue(pool.bank_calls[0][6])  # broad: the SQL prefilter is off

    async def test_size_is_bounded(self) -> None:
        svc = self.service(FakePool([]), RecordingGenerator(FakePool([])), FakeGateway())
        for bad in (0, 51):
            with self.assertRaises(S.ExaminerError):
                await svc.assemble_mcqs(STUDENT, SUBJECT, "x", bad)


class UnlinkedServingTests(unittest.IsolatedAsyncioTestCase):
    async def test_unlinked_world_history_mcqs_fill_level_one_slots(self) -> None:
        pool = FakePool(world_bank(3) + [mcq("x2", era="Орта ғасырлар тарихы", subtopic="Крест жорықтары",
                                              tier="X2")])
        svc = ExaminerService(pool, rng=random.Random(1))  # type: ignore[arg-type]
        scope = ResolvedScope(type="topic", api_id="wh#§1", db_id="wh#§1", title="Крест жорықтары", book="wh.md",
                              book_title="Дүниежүзі тарихы", grade=7, subject_id=SUBJECT, topics=("wh#§1",),
                              query="Крест жорықтары")
        slots = list(build_composition(1, {}).slots)
        async with pool.acquire() as conn:
            found = await svc._hybrid_candidates(conn, STUDENT, scope, slots, ["X1"])
        self.assertEqual(found, [])  # the only Crusades MCQ is X2
        async with pool.acquire() as conn:
            found = await svc._hybrid_candidates(conn, STUDENT, scope, slots, ["X1", "X2"])
        self.assertEqual([(c.question_id, c.format, c.tier) for c in found], [("x2", "mcq", "X2")])
        self.assertEqual(found[0].topic_id, "Орта ғасырлар тарихы/Крест жорықтары")  # no § needed
        self.assertIsNone(pool.bank_calls[-1][2])  # metadata only inside the transaction: no vector

    def test_bank_query_has_no_topic_filter(self) -> None:
        import inspect

        source = inspect.getsource(ExaminerService._bank_mcqs)
        self.assertNotIn("topic_id is not null", source)
        self.assertNotIn("topic_id = any", source)


class DeficitOnlySessionTests(unittest.TestCase):
    def test_missing_slots_get_targets_not_the_whole_session(self) -> None:
        [(level, formats, targets)] = S.session_targets(1, {}, ["X2/mcq", "X2/mcq", "X1/short_answer"])
        self.assertEqual((level, formats), (1, ["mcq", "matching", "short_answer"]))
        # 2 missing mcq × 1.3 → 3; short answer has no margin; the X3 item as before.
        self.assertEqual(targets, {("mcq", "X2"): 3, ("short_answer", "X1"): 1, ("mcq", "X3"): 1})
        full = S.session_targets(1, {})[0][2]
        self.assertLess(sum(targets.values()), sum(full.values()))


class DeficitPrepareTests(unittest.IsolatedAsyncioTestCase):
    async def test_prepare_passes_the_gap_and_caps_the_run(self) -> None:
        calls: list[dict[str, Any]] = []

        class FakePipeline:
            def __init__(self, *_: Any, **__: Any) -> None:
                pass

            async def generate_now(self, books, level, **kwargs):
                from app.examiner.bank.pipeline import ProcessReport

                calls.append(kwargs)
                return ProcessReport()

        scope = ResolvedScope(type="chapter", api_id="kz6#ch1", db_id="kz6#ch1", title="1", book="kz6.md",
                              book_title="Қазақстан тарихы", grade=6, subject_id=SUBJECT,
                              topics=("kz6.md#§1", "kz6.md#§2", "kz6.md#§3"))
        svc = ExaminerService(mock.Mock(), gateway=mock.Mock())  # type: ignore[arg-type]
        with mock.patch("app.examiner.bank.pipeline.BankPipeline", FakePipeline):
            await svc._generate_with_pipeline(scope, 1, list(scope.topics), {}, ["X2/mcq"])
        self.assertEqual(calls[0]["targets"], {("mcq", "X2"): 2, ("mcq", "X3"): 1})
        self.assertEqual(calls[0]["max_requests"], 3)  # three § do not each generate the gap


class AuditProtectionTests(unittest.TestCase):
    def question(self, qid: str, origin: str, minute: int, embedding=None) -> BankQuestion:
        item = parse_item({
            "question": "Абылай хан қай жылы дүниеге келді?", "options": {"A": "1711", "B": "1723", "C": "1741",
                                                                         "D": "1781"},
            "correct_answer": "A", "fact_key": f"kz-{qid}", "era": "Қазақ хандығы дәуірі",
            "subtopic": "Абылай хан", "period_label": "1711 ж.", "year_sort": 1711,
            "explanation": "Абылай хан 1711 жылы дүниеге келген, ол Орта жүздің ханы болды.",
        })
        assert item is not None
        row = to_row(item, topic_id=None, embedding=None)
        evidence = row["ecd_evidence"]
        return BankQuestion(
            question_id=qid, topic_id=None, level=1, format="mcq", x_tier="X1",
            created_at=datetime(2026, 11, 26, 9, minute, tzinfo=timezone.utc), content=row["question_content"],
            key=evidence["code_check_target"], ecd_skill=row["ecd_skill"], evidence=evidence["evidence"],
            support_quote=evidence["support_quote"], reference_text=row["reference_context"]["text"],
            embedding=embedding, origin=origin, subject="history",
        )

    def test_imported_rows_are_not_flagged_for_empty_support_quote(self) -> None:
        self.assertEqual(audit([self.question("a", "imported", 0)]), [])
        [finding] = audit([self.question("b", "generated", 0)])
        self.assertTrue(any("support_quote" in reason for reason in finding.reasons))

    def test_imported_duplicates_are_left_to_the_importer_but_generated_ones_are_caught(self) -> None:
        vec = [1.0, 0.0, 0.0]
        imported = [self.question("i1", "imported", 0, vec), self.question("i2", "imported", 1, vec)]
        self.assertEqual(audit(imported), [])
        later = BankQuestion(**{**self.question("g", "imported", 2, vec).__dict__, "origin": "generated",
                                "support_quote": "Абылай хан 1711 жылы дүниеге келген."})
        flagged = {f.question.question_id for f in audit([*imported, later])}
        self.assertEqual(flagged, {"g"})


class RecordingTxConn:
    def __init__(self) -> None:
        self.executed: list[tuple[str, tuple]] = []

    @asynccontextmanager
    async def transaction(self):
        yield

    async def fetchval(self, sql: str, *args: Any) -> Any:
        return datetime.now(timezone.utc)

    async def execute(self, sql: str, *args: Any) -> str:
        self.executed.append((sql, args))
        return "INSERT 0 1"


class ExplanationReuseTests(unittest.IsolatedAsyncioTestCase):
    async def answer_wrong(self, bank_text: str | None):
        conn = RecordingTxConn()

        class Pool:
            @asynccontextmanager
            async def acquire(self):
                yield conn

        svc = ExaminerService(Pool(), gateway=mock.Mock())  # type: ignore[arg-type]
        item = dict(item_id=ITEM, state="open", tier="X1", block=None, position=1, served_at=None, deadline_at=None,
                    question_id="q1", format="mcq", question_content={"stem": "?", "options": []},
                    ecd_evidence={"code_check_target": {"correct_option_id": "a"}}, rubric_0_4=None,
                    socratic_checkpoints=None, reference_context={"text": "x"}, explanation=bank_text)
        svc._replay = mock.AsyncMock(return_value=None)  # type: ignore[method-assign]
        svc._session_row = mock.AsyncMock(return_value={"status": "active", "composition": {}})  # type: ignore
        svc._fetch_open_current_item = mock.AsyncMock(return_value=item)  # type: ignore[method-assign]
        svc._advance = mock.AsyncMock()  # type: ignore[method-assign]
        svc._session = mock.AsyncMock(return_value=ExamSession.model_construct())  # type: ignore[method-assign]
        svc._remember = mock.AsyncMock()  # type: ignore[method-assign]
        spawned: list[Any] = []
        svc._spawn = spawned.append  # type: ignore[method-assign,assignment]
        with mock.patch.object(S, "check_answer", return_value=0), \
                mock.patch.object(S, "generate_explanation", new=mock.Mock()) as llm:
            result = await svc.answer(STUDENT, SESSION, ITEM, AnswerRequest(client_request_id=uuid.uuid4(),
                                                                            answer={"option_id": "b"}))
        return result, conn, llm, spawned

    async def test_stored_explanation_is_returned_without_llm(self) -> None:
        result, conn, llm, spawned = await self.answer_wrong("  Абылай хан 1711 жылы туған.  ")
        self.assertEqual((result.check, result.explanation), ("incorrect", "pending"))  # client reads it once
        llm.assert_not_called()
        self.assertEqual(spawned, [])
        [(sql, args)] = [e for e in conn.executed if "examiner.explanations" in e[0]]
        self.assertIn("'ready'", sql)
        self.assertEqual(args, (ITEM, "Абылай хан 1711 жылы туған.", S.BANK_EXPLANATION_MODEL))

    async def test_without_stored_explanation_the_llm_is_queued(self) -> None:
        result, conn, llm, spawned = await self.answer_wrong(None)
        self.assertEqual(result.explanation, "pending")
        llm.assert_called_once()
        self.assertEqual(len(spawned), 1)
        [(sql, _)] = [e for e in conn.executed if "examiner.explanations" in e[0]]
        self.assertIn("'pending'", sql)


if __name__ == "__main__":
    unittest.main()
