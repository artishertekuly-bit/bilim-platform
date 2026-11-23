"""Мұғалімнің сынып аналитикасы мен рейтингі (api §3.9; bagalau §4.3; D23, D35, D37, D38, D83).

- Тек сынып мұғаліміне: бөтен немесе жоқ сынып `404` (api §2.1).
- Тек сыныптың пәні бойынша (D38) және тек «Пән» масштабындағы емтиханнан (D35).
- Профиль оқулық бойынша құрылады (D63): бір пәннің бірнеше сыныпқа арналған оқулығы болуы мүмкін.
- Рейтинг бір оқулық ішінде `F` бойынша, тек төрт деңгейі түгел барлар арасында; `F` тең болса,
  `X.3`-тен өткен деңгей саны шешеді, мұғалім 3-тен төмен түзеткен `X.3` есептелмейді (D37).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .dto import (
    ClassBook,
    ClassProfilesResponse,
    ClassRatingResponse,
    ClassStudentProfiles,
    LevelResult,
    RatingEntry,
    SubjectInfo,
    SubjectProfile,
)
from .errors import not_found
from .review import _classes_ready


@dataclass(frozen=True)
class ClassScope:
    class_id: str
    subject_id: str
    subject_title: str
    students: list[str]
    books: list[ClassBook]


async def load_class(conn: Any, teacher_id: str, class_id: str) -> ClassScope:
    if not await _classes_ready(conn):
        raise not_found("Сынып табылмады.")
    row = await conn.fetchrow(
        """
        select c.subject_id::text as subject_id, coalesce(s.name_kk, '') as subject_title
        from public.classes c
        left join corpus.subjects s on s.id = c.subject_id
        where c.class_id = $1::uuid and c.teacher_id = $2::uuid
        """,
        class_id,
        teacher_id,
    )
    if row is None:
        raise not_found("Сынып табылмады.")
    members = await conn.fetch(
        "select student_id::text as student_id from public.class_members where class_id = $1::uuid order by joined_at",
        class_id,
    )
    books = await conn.fetch(
        "select book, title, grade from corpus.textbooks where subject_id = $1::uuid order by grade, book",
        row["subject_id"],
    )
    return ClassScope(
        class_id=class_id,
        subject_id=row["subject_id"],
        subject_title=row["subject_title"],
        students=[m["student_id"] for m in members],
        books=[ClassBook(book=b["book"], title=b["title"], grade=b["grade"]) for b in books],
    )


async def _latest_levels(conn: Any, scope: ClassScope) -> list[Any]:
    if not scope.students:
        return []
    return await conn.fetch(
        """
        select l.student_id::text as student_id, l.book, l.level::int as level, l.p::float8 as p, l.mastered,
               l.is_final, l.taken_at, r.x3_status, r.x3_rating_valid, t.title as book_title, t.grade
        from examiner.subject_level_latest l
        join examiner.session_results r on r.session_id = l.session_id
        join corpus.textbooks t on t.book = l.book
        where l.student_id = any($1::uuid[]) and l.subject_id = $2::uuid
        order by t.grade, l.book, l.level
        """,
        scope.students,
        scope.subject_id,
    )


def group_profiles(scope: ClassScope, rows: list[Any]) -> dict[tuple[str, str], SubjectProfile]:
    """(student_id, book) → SubjectProfile; F тек төрт деңгей түгел болғанда (bagalau §4.3)."""
    grouped: dict[tuple[str, str], SubjectProfile] = {}
    for row in rows:
        key = (row["student_id"], row["book"])
        profile = grouped.get(key)
        if profile is None:
            profile = grouped[key] = SubjectProfile(
                subject=SubjectInfo(id=scope.subject_id, title=scope.subject_title, grade=row["grade"],
                                    book=row["book"], book_title=row["book_title"]),
                levels=[LevelResult(level=level, p=None, mastered=False, is_final=False, taken_at=None)
                        for level in (1, 2, 3, 4)],
                f=None,
                f_is_final=False,
            )
        profile.levels[row["level"] - 1] = LevelResult(
            level=row["level"], p=row["p"], mastered=row["mastered"], is_final=row["is_final"],
            taken_at=row["taken_at"])
    for profile in grouped.values():
        if all(level.p is not None for level in profile.levels):
            profile.f = round(sum(level.p or 0 for level in profile.levels) / 4, 2)
            profile.f_is_final = all(level.is_final for level in profile.levels)
    return grouped


async def class_profiles(conn: Any, teacher_id: str, class_id: str) -> ClassProfilesResponse:
    scope = await load_class(conn, teacher_id, class_id)
    grouped = group_profiles(scope, await _latest_levels(conn, scope))
    students = [
        ClassStudentProfiles(
            student_id=student,
            profiles=[profile for (sid, _), profile in grouped.items() if sid == student],
        )
        for student in scope.students
    ]
    return ClassProfilesResponse(
        class_id=class_id,
        subject_id=scope.subject_id,
        subject_title=scope.subject_title,
        books=scope.books,
        students=students,
    )


def rank_entries(candidates: list[tuple[str, float, bool, int]]) -> list[RatingEntry]:
    """(student_id, F, f_is_final, x3_passed) → орын: F кемуі, тең болса X.3; толық тең болса бір орын."""
    ordered = sorted(candidates, key=lambda c: (-c[1], -c[3], c[0]))
    entries: list[RatingEntry] = []
    for index, (student, f, is_final, x3) in enumerate(ordered):
        if index and (f, x3) == (ordered[index - 1][1], ordered[index - 1][3]):
            rank = entries[-1].rank
        else:
            rank = index + 1
        entries.append(RatingEntry(rank=rank, student_id=student, f=f, f_is_final=is_final, x3_passed=x3))
    return entries


async def class_rating(conn: Any, teacher_id: str, class_id: str, book: str | None = None) -> ClassRatingResponse:
    scope = await load_class(conn, teacher_id, class_id)
    if book is not None and book not in {b.book for b in scope.books}:
        raise not_found("Оқулық бұл сыныптың пәніне жатпайды.")
    rows = await _latest_levels(conn, scope)
    grouped = group_profiles(scope, rows)
    x3_passed: dict[tuple[str, str], int] = {}
    for row in rows:
        if row["x3_status"] == "passed" and row["x3_rating_valid"] is not False:
            key = (row["student_id"], row["book"])
            x3_passed[key] = x3_passed.get(key, 0) + 1

    full = {key: profile for key, profile in grouped.items() if profile.f is not None}
    if book is None:
        # Оқулық берілмесе — толық профилі ең көп оқулық (тең болса, кіші сынып).
        counts = {b.book: sum(1 for (_, bk) in full if bk == b.book) for b in scope.books}
        book = max(scope.books, key=lambda b: (counts[b.book], -b.grade)).book if scope.books else None
    candidates = [
        (student, profile.f, profile.f_is_final, x3_passed.get((student, bk), 0))
        for (student, bk), profile in full.items()
        if bk == book and profile.f is not None
    ]
    return ClassRatingResponse(
        class_id=class_id,
        book=book,
        total=len(scope.students),
        full_count=len(candidates),
        entries=rank_entries(candidates),
    )
