"""D85: страйк мұғалімнің дабыл кірісіне жазылады (ortaq §5) және ата-ана баласының профилін көреді (api §3.10).
Іске қосу: python -m unittest discover -s backend/tests -t backend"""

from __future__ import annotations

import json
import unittest
from contextlib import asynccontextmanager
from unittest import mock

import asyncpg
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.examiner.session.api import ExaminerError, install
from app.examiner.session.service import ExaminerService
from tests.test_examiner_ai_grading import FakeReviewConn

ITEM = {"item_id": "item-1", "question_id": "q-1", "tier": "X1"}


class AlertFailingConn(FakeReviewConn):
    async def execute(self, sql: str, *args) -> str:
        if "insert into public.security_alerts" in sql:
            raise asyncpg.exceptions.InsufficientPrivilegeError("permission denied")
        return await super().execute(sql, *args)


class StrikeAlertTests(unittest.IsolatedAsyncioTestCase):
    async def test_each_strike_writes_an_alert_and_links_it_to_the_event(self) -> None:
        conn = FakeReviewConn()
        service = ExaminerService(conn)  # type: ignore[arg-type]
        await service._apply_strike(conn, student_id="stu-1", session_id="sess-1", item=ITEM,
                                    category="PROFANITY", evidence_text="жаман сөз", raw_answer={"text": "x"})
        alerts = [(sql, args) for sql, args in conn.executed if "insert into public.security_alerts" in sql]
        events = [(sql, args) for sql, args in conn.executed if "insert into examiner.moderation_events" in sql]
        self.assertEqual(len(alerts), 1)
        _, alert_args = alerts[0]
        self.assertIn("'examiner'", alerts[0][0])  # тек өз source_system-імен
        self.assertEqual(alert_args[1:5], ("stu-1", "soft", "PROFANITY", "жаман сөз"))
        self.assertEqual(json.loads(alert_args[5])["strike_no"], 1)
        self.assertEqual(events[0][1][6], alert_args[0])  # false-positive alert_id бойынша табылады

        await service._apply_strike(conn, student_id="stu-1", session_id="sess-1", item=ITEM,
                                    category="PROFANITY", evidence_text="тағы", raw_answer={"text": "y"})
        second = [args for sql, args in conn.executed if "insert into public.security_alerts" in sql][-1]
        self.assertEqual(second[2], "hard")
        self.assertEqual(conn.session_status, "blocked")

    async def test_strike_survives_when_the_alert_cannot_be_written(self) -> None:
        conn = AlertFailingConn()
        service = ExaminerService(conn)  # type: ignore[arg-type]
        mod = await service._apply_strike(conn, student_id="stu-1", session_id="sess-1", item=ITEM,
                                          category="TOXIC", evidence_text="...", raw_answer={"text": "z"})
        self.assertEqual(mod.strike_count, 1)
        events = [args for sql, args in conn.executed if "insert into examiner.moderation_events" in sql]
        self.assertIsNone(events[0][6])

        conn.classes_ready = False  # кесте әлі жоқ (to_regclass → false)
        await service._apply_strike(conn, student_id="stu-2", session_id="sess-2", item=ITEM,
                                    category="TOXIC", evidence_text="...", raw_answer={"text": "z"})


class FakeParentPool:
    def __init__(self, links: set[tuple[str, str]], ready: bool = True) -> None:
        self.links = links
        self.ready = ready

    @asynccontextmanager
    async def acquire(self):
        yield self

    async def fetchval(self, sql: str, *args):
        if "to_regclass('public.parent_student_links')" in sql:
            return self.ready
        if "from public.parent_student_links" in sql:
            return (args[0], args[1]) in self.links
        return None

    async def fetch(self, sql: str, *args):
        return []


class ParentProfileTests(unittest.IsolatedAsyncioTestCase):
    async def test_only_a_confirmed_link_opens_the_child_profile(self) -> None:
        service = ExaminerService(FakeParentPool({("p1", "s1")}))  # type: ignore[arg-type]
        profile = await service.parent_child_profile("p1", "s1")
        self.assertEqual(profile.subjects, [])
        for parent, student in (("p1", "s2"), ("p2", "s1")):
            with self.assertRaises(ExaminerError) as ctx:
                await service.parent_child_profile(parent, student)
            self.assertEqual(ctx.exception.status, 404)
        missing = ExaminerService(FakeParentPool({("p1", "s1")}, ready=False))  # type: ignore[arg-type]
        with self.assertRaises(ExaminerError):
            await missing.parent_child_profile("p1", "s1")

    def test_parent_route_is_parent_only(self) -> None:
        from app.examiner.session import api as api_mod

        app = FastAPI()
        install(app)

        async def _fake_service():
            class _S:
                async def parent_child_profile(self, *a, **kw):
                    return {"subjects": []}
            return _S()

        app.dependency_overrides[api_mod.get_service] = _fake_service
        client = TestClient(app)
        path = "/api/examiner/v1/parent/children/8c1b7f50-1111-4222-8333-944444444444/profile"
        for role in ("student", "teacher", "admin"):
            with mock.patch("app.examiner.session.api.get_current_user_with_role", return_value=("u1", role)):
                self.assertEqual(client.get(path).status_code, 403, role)
        with mock.patch("app.examiner.session.api.get_current_user_with_role", return_value=("p1", "parent")):
            resp = client.get(path)
            self.assertEqual((resp.status_code, resp.json()), (200, {"subjects": []}))


if __name__ == "__main__":
    unittest.main()
