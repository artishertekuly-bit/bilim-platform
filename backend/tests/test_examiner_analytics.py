"""Мұғалімнің сынып аналитикасы мен рейтингі (api §3.9; bagalau §4.3; D23, D37, D38, D83).
Іске қосу: python -m unittest discover -s backend/tests -t backend"""

from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.examiner.session.analytics import class_profiles, class_rating, rank_entries
from app.examiner.session.api import ExaminerError, install

SUBJECT = "subj-history"
NOW = datetime(2026, 11, 23, tzinfo=timezone.utc)


def _levels(student: str, book: str, ps: list[float | None], *, x3: list[str] | None = None,
            valid: list[bool | None] | None = None, final: bool = True, grade: int = 5) -> list[dict]:
    rows = []
    for index, p in enumerate(ps):
        if p is None:
            continue
        rows.append({
            "student_id": student, "book": book, "level": index + 1, "p": p, "mastered": p >= 80,
            "is_final": final, "taken_at": NOW, "x3_status": (x3 or ["not_eligible"] * 4)[index],
            "x3_rating_valid": (valid or [None] * 4)[index], "book_title": f"Тарих {grade}", "grade": grade,
        })
    return rows


class FakeAnalyticsConn:
    def __init__(self, members: list[str], rows: list[dict], classes_ready: bool = True) -> None:
        self.members = members
        self.rows = rows
        self.classes_ready = classes_ready
        self.level_args: tuple | None = None

    async def fetchval(self, sql: str, *args):
        if "to_regclass" in sql:
            return self.classes_ready
        return None

    async def fetchrow(self, sql: str, *args):
        if "from public.classes c" in sql:
            if args == ("class-own", "t1"):
                return {"subject_id": SUBJECT, "subject_title": "Тарих"}
            return None
        return None

    async def fetch(self, sql: str, *args):
        if "from public.class_members" in sql:
            return [{"student_id": student} for student in self.members]
        if "from corpus.textbooks where subject_id" in sql:
            return [{"book": "kazakn5.md", "title": "Тарих 5", "grade": 5},
                    {"book": "kazakh6.md", "title": "Тарих 6", "grade": 6}]
        if "from examiner.subject_level_latest" in sql:
            self.level_args = args
            return [row for row in self.rows if row["student_id"] in args[0]]
        return []


class ClassAnalyticsTests(unittest.IsolatedAsyncioTestCase):
    async def test_foreign_class_or_missing_tables_is_404(self) -> None:
        conn = FakeAnalyticsConn(["s1"], [])
        for call in (lambda: class_profiles(conn, "t1", "class-other"),
                     lambda: class_rating(conn, "t2", "class-own")):
            with self.assertRaises(ExaminerError) as ctx:
                await call()
            self.assertEqual(ctx.exception.status, 404)
        conn.classes_ready = False
        with self.assertRaises(ExaminerError):
            await class_profiles(conn, "t1", "class-own")

    async def test_profiles_only_class_subject_and_f_only_with_four_levels(self) -> None:
        rows = _levels("s1", "kazakn5.md", [90, 88, 60, 70]) + _levels("s2", "kazakn5.md", [None, None, None, 90])
        conn = FakeAnalyticsConn(["s1", "s2", "s3"], rows)
        result = await class_profiles(conn, "t1", "class-own")
        self.assertEqual(conn.level_args[1], SUBJECT)  # D38: тек сыныптың пәні
        by_student = {s.student_id: s.profiles for s in result.students}
        self.assertEqual(by_student["s1"][0].f, 77.0)  # bagalau §4.3, 1-мысал
        self.assertIsNone(by_student["s2"][0].f)  # 2-мысал: тек 4-деңгей → F жоқ
        self.assertEqual([lvl.p for lvl in by_student["s2"][0].levels], [None, None, None, 90])
        self.assertEqual(by_student["s3"], [])  # әлі тапсырмаған оқушы да тізімде
        self.assertEqual([b.book for b in result.books], ["kazakn5.md", "kazakh6.md"])

    async def test_rating_full_profiles_only_and_x3_breaks_ties(self) -> None:
        rows = (
            _levels("s1", "kazakn5.md", [80, 80, 80, 80], x3=["passed", "not_eligible", "not_eligible", "not_eligible"])
            + _levels("s2", "kazakn5.md", [80, 80, 80, 80], x3=["passed", "passed", "not_eligible", "not_eligible"])
            # D37: мұғалім 3-тен төмен түзеткен X.3 тең балды шешпейді
            + _levels("s3", "kazakn5.md", [80, 80, 80, 80], x3=["passed", "passed", "passed", "not_eligible"],
                      valid=[None, False, False, None])
            + _levels("s4", "kazakn5.md", [95, 90, 85, 90], final=False)
            + _levels("s5", "kazakn5.md", [99, 99, None, None])
            + _levels("s6", "kazakh6.md", [70, 70, 70, 70], grade=6)
        )
        conn = FakeAnalyticsConn(["s1", "s2", "s3", "s4", "s5", "s6", "s7"], rows)
        rating = await class_rating(conn, "t1", "class-own")
        self.assertEqual(rating.book, "kazakn5.md")  # толық профилі ең көп оқулық
        self.assertEqual((rating.total, rating.full_count), (7, 4))
        self.assertEqual([(e.rank, e.student_id) for e in rating.entries],
                         [(1, "s4"), (2, "s2"), (3, "s1"), (3, "s3")])
        self.assertFalse(rating.entries[0].f_is_final)

        other = await class_rating(conn, "t1", "class-own", "kazakh6.md")
        self.assertEqual([(e.rank, e.student_id, e.f) for e in other.entries], [(1, "s6", 70.0)])
        with self.assertRaises(ExaminerError) as ctx:
            await class_rating(conn, "t1", "class-own", "fizika7.md")
        self.assertEqual(ctx.exception.status, 404)

    def test_rank_entries_shares_a_place_on_full_tie(self) -> None:
        ranks = [e.rank for e in rank_entries([("a", 90.0, True, 1), ("b", 90.0, True, 1), ("c", 80.0, True, 0)])]
        self.assertEqual(ranks, [1, 1, 3])

    def test_class_routes_are_teacher_only(self) -> None:
        from app.examiner.session import api as api_mod

        app = FastAPI()
        install(app)

        async def _fake_service():
            class _S:
                async def teacher_class_profiles(self, *a, **kw):
                    return {"class_id": "c", "subject_id": "s", "subject_title": "Тарих", "books": [], "students": []}

                async def teacher_class_rating(self, *a, **kw):
                    return {"class_id": "c", "book": None, "total": 0, "full_count": 0, "entries": []}
            return _S()

        app.dependency_overrides[api_mod.get_service] = _fake_service
        client = TestClient(app)
        class_id = "8c1b7f50-1111-4222-8333-944444444444"
        for path in (f"/api/examiner/v1/teacher/classes/{class_id}/profiles",
                     f"/api/examiner/v1/teacher/classes/{class_id}/rating"):
            for role in ("student", "admin"):
                with mock.patch("app.examiner.session.api.get_current_user_with_role", return_value=("u1", role)):
                    self.assertEqual(client.get(path).status_code, 403, (path, role))
            with mock.patch("app.examiner.session.api.get_current_user_with_role", return_value=("t1", "teacher")):
                self.assertEqual(client.get(path).status_code, 200, path)


if __name__ == "__main__":
    unittest.main()
