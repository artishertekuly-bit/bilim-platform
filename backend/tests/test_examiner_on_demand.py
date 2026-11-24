"""D93: the learner writes a topic, levels are always open and a short bank is generated on start.

No database and no LLM: a fake pool answers the few statements these paths use, and the generator is injected.
"""

from __future__ import annotations

import asyncio
import os
import unittest
from contextlib import asynccontextmanager
from typing import Any
from unittest import mock

import asyncpg

from app.examiner.session import service as S
from app.examiner.session import topics as T
from app.examiner.session.errors import ExaminerError
from app.examiner.session.service import ExaminerService, ResolvedScope

SUBJECT = "00000000-0000-0000-0000-000000000001"
SESSION = "00000000-0000-0000-0000-0000000000aa"
STUDENT = "00000000-0000-0000-0000-0000000000bb"


def scope(topics: tuple[str, ...] = ("kazakh6.md#§12",), scope_type: str = "topic") -> ResolvedScope:
    return ResolvedScope(
        type=scope_type, api_id=topics[0], db_id=topics[0], title="§12", book="kazakh6.md",
        book_title="Қазақстан тарихы", grade=6, subject_id=SUBJECT, topics=topics,
    )


class FakeConn:
    def __init__(self, pool: "FakePool") -> None:
        self.pool = pool

    async def fetch(self, sql: str, *args: Any) -> list[dict[str, Any]]:
        if "format_applicability" in sql:
            return []
        if "from corpus.paragraphs" in sql:
            return self.pool.paragraphs
        if "corpus.match_chunks" in sql:
            if self.pool.vector_error:
                raise asyncpg.InsufficientPrivilegeError("permission denied for function match_chunks")
            self.pool.vector_args = args
            return self.pool.hits
        raise AssertionError(f"unexpected fetch: {sql[:80]}")

    async def fetchval(self, sql: str, *args: Any) -> Any:
        return await self.pool.fetchval(sql, *args)

    async def execute(self, sql: str, *args: Any) -> str:
        return await self.pool.execute(sql, *args)


class FakePool:
    def __init__(self) -> None:
        self.status = "preparing"
        self.closed_with: str | None = None
        self.paragraphs: list[dict[str, Any]] = []
        self.hits: list[dict[str, Any]] = []
        self.vector_error = False
        self.vector_args: tuple | None = None

    @asynccontextmanager
    async def acquire(self):
        yield FakeConn(self)

    async def fetch(self, sql: str, *args: Any) -> list[dict[str, Any]]:
        return await FakeConn(self).fetch(sql, *args)

    async def fetchval(self, sql: str, *args: Any) -> Any:
        if "select status from examiner.sessions" in sql:
            return self.status
        raise AssertionError(f"unexpected fetchval: {sql[:80]}")

    async def execute(self, sql: str, *args: Any) -> str:
        if "jsonb_build_object('notice'" in sql and self.status == "preparing":
            self.status, self.closed_with = "abandoned", args[1]
            return "UPDATE 1"
        raise AssertionError(f"unexpected execute: {sql[:80]}")


class FakeGateway:
    def __init__(self, vector: list[float] | None = None) -> None:
        self.vector = vector
        self.calls: list[tuple[list[str], str]] = []

    async def embed(self, texts: list[str], *, model_key: str) -> list[list[float]]:
        self.calls.append((texts, model_key))
        if self.vector is None:
            from app.llm_gateway import LLMUnavailableError

            raise LLMUnavailableError("no embeddings")
        return [self.vector]


class TopicRankingTests(unittest.TestCase):
    def paragraph(self, topic_id: str, title: str, grade: int = 6) -> T.Paragraph:
        return T.Paragraph(topic_id=topic_id, book="kazakh6.md", book_title="Тарих", grade=grade,
                           paragraph_no=topic_id.split("§")[-1], paragraph_title=title)

    def test_stems_ignore_kazakh_suffixes_and_question_words(self) -> None:
        self.assertEqual(T.lexical_score("Абылай хан туралы", "Абылайдың хандығы"), 1.0)
        self.assertEqual(T.lexical_score("Қазақ хандығының құрылуы", "Қазақ хандығы"), 2 / 3)
        self.assertEqual(T.lexical_score("туралы деген", "Қазақ хандығы"), 0.0)

    def test_title_hit_outranks_vector_only_and_vector_breaks_ties(self) -> None:
        paragraphs = [
            self.paragraph("kazakh6.md#§1", "Сақтар"),
            self.paragraph("kazakh6.md#§12", "Қазақ хандығының құрылуы"),
            self.paragraph("kazakh6.md#§13", "Қазақ хандығының нығаюы"),
        ]
        ranked = T.rank_topics("Қазақ хандығының құрылуы", paragraphs,
                               {"kazakh6.md#§1": 0.35, "kazakh6.md#§13": 0.5, "kazakh6.md#§12": 0.55})
        self.assertEqual([r.paragraph.topic_id for r in ranked], ["kazakh6.md#§12", "kazakh6.md#§13", "kazakh6.md#§1"])

    def test_nothing_matches_gives_empty_list(self) -> None:
        self.assertEqual(T.rank_topics("Пифагор теоремасы", [self.paragraph("kazakh6.md#§1", "Сақтар")], {}), [])

    def test_at_most_three(self) -> None:
        paragraphs = [self.paragraph(f"kazakh6.md#§{i}", f"Хан {i}") for i in range(1, 7)]
        self.assertEqual(len(T.rank_topics("хан", paragraphs, {})), 3)


class TopicSearchServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.pool = FakePool()
        self.pool.paragraphs = [
            dict(topic_id="kazakh6.md#§12", book="kazakh6.md", grade=6, book_title="Тарих 6",
                 paragraph_no="12", paragraph_title="Қазақ хандығының құрылуы"),
            dict(topic_id="kazakh8.md#§3", book="kazakh8.md", grade=8, book_title="Тарих 8",
                 paragraph_no="3", paragraph_title="Абылай хан"),
        ]

    async def test_vector_hit_finds_a_paragraph_without_title_words(self) -> None:
        self.pool.hits = [dict(topic_id="kazakh8.md#§3", distance=0.4), dict(topic_id="other.md#§1", distance=0.1)]
        svc = ExaminerService(self.pool, gateway=FakeGateway([0.1, 0.2]))  # type: ignore[arg-type]
        # The other subject's § is closer but ignored; all grades of this subject are considered.
        self.assertEqual(await svc.resolve_topic(SUBJECT, "  Жоңғарларға қарсы күрес  "), "kazakh8.md#§3")
        self.assertEqual(self.pool.vector_args[1], T.VECTOR_CHUNKS)

    async def test_without_grant_or_embedding_titles_still_resolve(self) -> None:
        self.pool.vector_error = True
        svc = ExaminerService(self.pool, gateway=FakeGateway([0.1]))  # type: ignore[arg-type]
        self.assertEqual(await svc.resolve_topic(SUBJECT, "Абылай"), "kazakh8.md#§3")
        self.pool.vector_error = False
        svc = ExaminerService(self.pool, gateway=FakeGateway(None))  # type: ignore[arg-type]
        self.assertEqual(await svc.resolve_topic(SUBJECT, "хандығы"), "kazakh6.md#§12")

    async def test_a_written_section_title_needs_no_embedding_call(self) -> None:
        gateway = FakeGateway([0.1])
        svc = ExaminerService(self.pool, gateway=gateway)  # type: ignore[arg-type]
        self.assertEqual(await svc.resolve_topic(SUBJECT, "Абылай хан"), "kazakh8.md#§3")
        self.assertEqual(gateway.calls, [])
        self.assertIsNone(self.pool.vector_args)

    def test_halfvec_literal_is_compact(self) -> None:
        self.assertEqual(T.halfvec_literal([0.123456, -0.000012345, 1.0]), "[0.1235,-1.234e-05,1]")

    async def test_topic_with_nothing_in_the_database_is_404(self) -> None:
        svc = ExaminerService(self.pool, gateway=FakeGateway(None))  # type: ignore[arg-type]
        with self.assertRaises(ExaminerError) as ctx:
            await svc.resolve_topic(SUBJECT, "Пифагор теоремасы")
        self.assertEqual((ctx.exception.status, ctx.exception.code), (404, "TOPIC_NOT_FOUND"))

    async def test_short_topic_is_rejected(self) -> None:
        with self.assertRaises(ExaminerError) as ctx:
            await ExaminerService(self.pool, gateway=FakeGateway(None)).resolve_topic(SUBJECT, " a ")  # type: ignore[arg-type]
        self.assertEqual(ctx.exception.code, "VALIDATION_ERROR")


class PrepareTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.pool = FakePool()
        self.generated: list[tuple[int, tuple[str, ...]]] = []
        self.activated: list[str] = []

    def service(self, generator=None, activate_error: Exception | None = None) -> ExaminerService:
        async def default_generator(sc, level, topics, applicable) -> None:
            self.generated.append((level, tuple(topics)))

        svc = ExaminerService(self.pool, generator=generator or default_generator)  # type: ignore[arg-type]

        async def activate(student_id, session_id, sc, level) -> None:
            if activate_error is not None:
                raise activate_error
            self.activated.append(session_id)
            self.pool.status = "active"

        svc._activate = activate  # type: ignore[method-assign]
        return svc

    async def test_generates_then_activates(self) -> None:
        await self.service()._prepare(STUDENT, SESSION, scope(), 2)
        self.assertEqual(self.generated, [(2, ("kazakh6.md#§12",))])
        self.assertEqual((self.activated, self.pool.status), ([SESSION], "active"))

    async def test_session_left_meanwhile_skips_generation(self) -> None:
        self.pool.status = "abandoned"
        await self.service()._prepare(STUDENT, SESSION, scope(), 1)
        self.assertEqual((self.generated, self.activated), ([], []))

    async def test_generation_error_closes_with_notice(self) -> None:
        async def broken(*_: Any) -> None:
            raise RuntimeError("provider down")

        await self.service(generator=broken)._prepare(STUDENT, SESSION, scope(), 1)
        self.assertEqual((self.pool.status, self.pool.closed_with), ("abandoned", S.PREPARE_FAILED))

    async def test_still_short_after_one_top_up_closes_with_notice(self) -> None:
        short = ExaminerError(409, "BANK_NOT_READY", "x")
        await self.service(activate_error=short)._prepare(STUDENT, SESSION, scope(), 1)
        self.assertEqual(len(self.generated), 2)  # the session-sized round and one top-up, no more
        self.assertEqual(self.pool.closed_with, S.PREPARE_SHORT)

    async def test_gap_after_rejections_is_topped_up_once_then_activates(self) -> None:
        svc = self.service()
        calls = 0

        async def activate(student_id, session_id, sc, level) -> None:
            nonlocal calls
            calls += 1
            if calls == 1:
                raise ExaminerError(409, "BANK_NOT_READY", "x")
            self.pool.status = "active"

        svc._activate = activate  # type: ignore[method-assign]
        await svc._prepare(STUDENT, SESSION, scope(), 1)
        self.assertEqual((len(self.generated), calls, self.pool.status), (2, 2, "active"))

    async def test_one_generation_per_scope_and_level_at_a_time(self) -> None:
        running = 0
        peak = 0

        async def slow(*_: Any) -> None:
            nonlocal running, peak
            running += 1
            peak = max(peak, running)
            await asyncio.sleep(0.01)
            running -= 1

        svc = self.service(generator=slow)
        svc._activate = mock.AsyncMock()  # type: ignore[method-assign]
        await asyncio.gather(svc._prepare(STUDENT, SESSION, scope(), 1), svc._prepare(STUDENT, SESSION, scope(), 1))
        self.assertEqual(peak, 1)

    async def test_wide_scope_generates_for_a_few_paragraphs(self) -> None:
        topics = tuple(f"kazakh6.md#§{i}" for i in range(1, 11))
        await self.service()._prepare(STUDENT, SESSION, scope(topics, "subject"), 1)
        chosen = self.generated[0][1]
        self.assertEqual(len(chosen), S.GENERATION_TOPICS)
        self.assertTrue(set(chosen) <= set(topics))

    async def test_level_three_also_fills_code_questions_of_level_one(self) -> None:
        calls: list[dict[str, Any]] = []

        class FakePipeline:
            def __init__(self, *_: Any, **__: Any) -> None:
                pass

            async def generate_now(self, books, level, **kwargs):
                calls.append(dict(level=level, **kwargs))
                return mock.Mock(accepted=0, rejected=0, failed=0)

        svc = ExaminerService(self.pool, gateway=mock.Mock())  # type: ignore[arg-type]
        with mock.patch("app.examiner.bank.pipeline.BankPipeline", FakePipeline):
            await svc._generate_with_pipeline(scope(), 3, ["kazakh6.md#§12"], {})
        self.assertEqual([(c["level"], c["formats"]) for c in calls],
                         [(3, ["socratic", "feynman", "teach_ai"]), (1, ["mcq", "matching"])])
        # One session-sized round, all at once, wider concurrency.
        self.assertTrue(all(c["rounds"] == 1 and c["warmup"] is False and c["concurrency"] == S.ON_DEMAND_CONCURRENCY
                            for c in calls))
        self.assertEqual(calls[1]["targets"], {("mcq", "X1"): 2, ("matching", "X1"): 1,
                                               ("mcq", "X2"): 4, ("matching", "X2"): 2})


class SessionTargetsTests(unittest.TestCase):
    def test_level_one_asks_for_one_session_with_margin_not_the_whole_paragraph(self) -> None:
        [(level, formats, targets)] = S.session_targets(1, {})
        self.assertEqual((level, formats), (1, ["mcq", "matching", "short_answer"]))
        # Session: mcq 2+3, matching 1+2, short answer 1+1; ×1.5 rounded up, plus the level's X3 item.
        self.assertEqual(targets, {("mcq", "X1"): 3, ("mcq", "X2"): 5, ("matching", "X1"): 2, ("matching", "X2"): 3,
                                   ("short_answer", "X1"): 2, ("short_answer", "X2"): 2, ("mcq", "X3"): 1})
        self.assertEqual(sum(targets.values()), 18)  # the first on-demand run planned 51 requests for this level

    def test_level_three_splits_the_d_block_and_the_code_a_block(self) -> None:
        plans = S.session_targets(3, {})
        self.assertEqual([p[0] for p in plans], [3, 1])
        self.assertEqual(plans[0][2], {("socratic", "X1"): 2, ("feynman", "X2"): 2, ("socratic", "X3"): 1})
        self.assertEqual(sum(plans[1][2].values()), 9)  # A block: 6 code items × 1.5


class StartRequestTests(unittest.TestCase):
    def test_either_scope_or_subject_and_topic(self) -> None:
        import uuid

        from pydantic import ValidationError

        from app.examiner.session.dto import StartSessionRequest

        rid = uuid.uuid4()
        StartSessionRequest(client_request_id=rid, scope_type="topic", scope_id="kazakh6.md#§1", level=1)
        StartSessionRequest(client_request_id=rid, subject_id=uuid.uuid4(), topic="Абылай хан", level=4)
        for bad in (dict(), dict(subject_id=uuid.uuid4()), dict(topic="Абылай хан"),
                    dict(scope_type="topic", scope_id="x", subject_id=uuid.uuid4(), topic="Абылай хан")):
            with self.assertRaises(ValidationError):
                StartSessionRequest(client_request_id=rid, level=1, **bad)


class SwitchTests(unittest.TestCase):
    def test_on_demand_is_on_by_default_and_can_be_turned_off(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop(S.ON_DEMAND_ENV, None)
            self.assertTrue(S.on_demand_enabled())
        for off in ("0", "false", "OFF"):
            with mock.patch.dict(os.environ, {S.ON_DEMAND_ENV: off}):
                self.assertFalse(S.on_demand_enabled())

    def test_daily_limit_defaults_and_bad_values(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop(S.ON_DEMAND_DAILY_ENV, None)
            self.assertEqual(S.on_demand_daily_limit(), S.DEFAULT_ON_DEMAND_DAILY)
        with mock.patch.dict(os.environ, {S.ON_DEMAND_DAILY_ENV: "12"}):
            self.assertEqual(S.on_demand_daily_limit(), 12)
        with mock.patch.dict(os.environ, {S.ON_DEMAND_DAILY_ENV: "many"}):
            self.assertEqual(S.on_demand_daily_limit(), S.DEFAULT_ON_DEMAND_DAILY)


if __name__ == "__main__":
    unittest.main()
