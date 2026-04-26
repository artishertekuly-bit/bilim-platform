from __future__ import annotations

import logging
import os
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

from dotenv import load_dotenv
from fastapi import HTTPException, status
from supabase import Client, create_client

from app.schemas.learning_analysis import LearningAiMode, LearningAiRequest

ROOT_DIR = Path(__file__).resolve().parents[3]
ENV_FILE = ROOT_DIR / ".env"

logger = logging.getLogger("bilimcorp.learning_analysis.context")

if ENV_FILE.exists():
    load_dotenv(ENV_FILE)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()
APP_ENV = os.getenv("APP_ENV", os.getenv("ENV", "development")).strip().lower()

_supabase_data_client: Client | None = None


def _http_error(message: str, status_code: int = 400) -> HTTPException:
    return HTTPException(status_code=status_code, detail=message)


def _get_supabase_data_client() -> Client:
    global _supabase_data_client

    if _supabase_data_client is not None:
        return _supabase_data_client

    if not SUPABASE_URL:
        raise _http_error("SUPABASE_URL backend env ішінде көрсетілмеген.", 500)

    key = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY

    if not key:
        raise _http_error(
            "SUPABASE_SERVICE_ROLE_KEY немесе SUPABASE_ANON_KEY backend env ішінде көрсетілмеген.",
            500,
        )

    if APP_ENV == "production" and not SUPABASE_SERVICE_ROLE_KEY:
        raise _http_error(
            "Production режимінде AI analysis үшін SUPABASE_SERVICE_ROLE_KEY қажет. Оны тек backend Render env ішінде сақтаңыз.",
            500,
        )

    if not SUPABASE_SERVICE_ROLE_KEY:
        logger.warning(
            "Using SUPABASE_ANON_KEY for learning analysis context. "
            "Production үшін SUPABASE_SERVICE_ROLE_KEY қолдану керек."
        )

    _supabase_data_client = create_client(SUPABASE_URL, key)
    return _supabase_data_client


def _clean_text(value: Any, limit: int | None = None) -> str:
    text = " ".join(str(value or "").replace("\x00", " ").split())
    return text[:limit] if limit else text


def _to_number(value: Any) -> float | None:
    if value is None:
        return None

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _avg(values: Iterable[float | int | None]) -> float | None:
    nums = [float(value) for value in values if value is not None]

    if not nums:
        return None

    return round(sum(nums) / len(nums), 1)


def _pct(part: int | float, total: int | float) -> int:
    if not total:
        return 0

    return int(round((float(part) / float(total)) * 100))


def _unique(values: Iterable[Any]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []

    for value in values:
        text = _clean_text(value, 140)
        if text and text not in seen:
            seen.add(text)
            result.append(text)

    return result


def _rows(
    table: str,
    *,
    select: str = "*",
    eq: dict[str, Any] | None = None,
    in_: dict[str, list[str]] | None = None,
    limit: int = 1000,
    optional: bool = False,
) -> list[dict[str, Any]]:
    client = _get_supabase_data_client()

    try:
        query = client.table(table).select(select)

        for key, value in (eq or {}).items():
            query = query.eq(key, value)

        for key, values in (in_ or {}).items():
            if not values:
                return []
            query = query.in_(key, values)

        if limit:
            query = query.limit(limit)

        response = query.execute()
        data = getattr(response, "data", None) or []

        if not isinstance(data, list):
            return []

        return [item for item in data if isinstance(item, dict)]

    except Exception:
        if optional:
            logger.info("Optional Supabase query failed: table=%s", table, exc_info=True)
            return []

        logger.exception("Supabase query failed: table=%s", table)
        raise _http_error(f"{table} деректерін жүктеу мүмкін болмады.", 500)


def _row_by_id(table: str, row_id: str, *, optional: bool = False) -> dict[str, Any] | None:
    rows = _rows(
        table,
        eq={"id": row_id},
        limit=1,
        optional=optional,
    )

    return rows[0] if rows else None


def _get_row_value(row: dict[str, Any], keys: list[str]) -> Any:
    for key in keys:
        if key in row and row.get(key) is not None:
            return row.get(key)

    return None


def _course_owner_id(course: dict[str, Any]) -> str | None:
    value = _get_row_value(
        course,
        [
            "teacher_id",
            "teacherId",
            "owner_id",
            "ownerId",
            "created_by",
            "createdBy",
            "instructor_id",
            "instructorId",
            "user_id",
            "userId",
        ],
    )

    text = _clean_text(value, 140)
    return text or None


def _course_title(course: dict[str, Any] | None) -> str:
    if not course:
        return "Курс"

    return (
        _clean_text(course.get("title"), 240)
        or _clean_text(course.get("name"), 240)
        or "Курс"
    )


def _lesson_title(lesson: dict[str, Any] | None) -> str:
    if not lesson:
        return "Сабақ"

    return (
        _clean_text(lesson.get("title"), 240)
        or _clean_text(lesson.get("name"), 240)
        or "Сабақ"
    )


def _student_name(profile: dict[str, Any] | None, student_id: str) -> str:
    if not profile:
        return f"Оқушы {student_id[:8]}"

    return (
        _clean_text(profile.get("full_name"), 180)
        or _clean_text(profile.get("fullName"), 180)
        or _clean_text(profile.get("name"), 180)
        or f"Оқушы {student_id[:8]}"
    )


def _is_completed_progress(row: dict[str, Any]) -> bool:
    if row.get("completed_at") or row.get("completedAt"):
        return True

    if row.get("completed") is True or row.get("is_completed") is True:
        return True

    status_value = _clean_text(row.get("status"), 40).lower()
    if status_value in {"completed", "done", "finished"}:
        return True

    progress_value = (
        _to_number(row.get("progress_percent"))
        or _to_number(row.get("progressPercent"))
        or _to_number(row.get("progress_pct"))
        or _to_number(row.get("progressPct"))
        or _to_number(row.get("progress"))
    )

    return bool(progress_value is not None and progress_value >= 100)


def _score_from_row(row: dict[str, Any]) -> float | None:
    return (
        _to_number(row.get("score"))
        or _to_number(row.get("score_pct"))
        or _to_number(row.get("scorePct"))
        or _to_number(row.get("percentage"))
        or _to_number(row.get("percent"))
    )


def _is_passed_attempt(row: dict[str, Any]) -> bool:
    if row.get("passed") is True:
        return True

    if row.get("is_passed") is True:
        return True

    score = _score_from_row(row)
    return bool(score is not None and score >= 70)


def _lesson_id_from_row(row: dict[str, Any]) -> str | None:
    value = _get_row_value(row, ["lesson_id", "lessonId"])
    text = _clean_text(value, 140)
    return text or None


def _course_id_from_row(row: dict[str, Any]) -> str | None:
    value = _get_row_value(row, ["course_id", "courseId"])
    text = _clean_text(value, 140)
    return text or None


def _student_id_from_row(row: dict[str, Any]) -> str | None:
    value = _get_row_value(row, ["student_id", "studentId", "user_id", "userId"])
    text = _clean_text(value, 140)
    return text or None


def _filter_rows_for_course(
    rows: list[dict[str, Any]],
    *,
    course_id: str,
    lesson_ids: set[str],
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []

    for row in rows:
        row_course_id = _course_id_from_row(row)
        row_lesson_id = _lesson_id_from_row(row)

        if row_course_id == course_id:
            result.append(row)
            continue

        if row_lesson_id and row_lesson_id in lesson_ids:
            result.append(row)

    return result


def _filter_rows_for_courses(
    rows: list[dict[str, Any]],
    *,
    course_ids: set[str],
    lesson_ids: set[str],
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []

    for row in rows:
        row_course_id = _course_id_from_row(row)
        row_lesson_id = _lesson_id_from_row(row)

        if row_course_id and row_course_id in course_ids:
            result.append(row)
            continue

        if row_lesson_id and row_lesson_id in lesson_ids:
            result.append(row)

    return result


def _load_course_lessons(course_id: str) -> list[dict[str, Any]]:
    return _rows(
        "lessons",
        eq={"course_id": course_id},
        limit=1000,
        optional=True,
    )


def _load_course_enrollments(course_id: str) -> list[dict[str, Any]]:
    return _rows(
        "course_enrollments",
        eq={"course_id": course_id},
        limit=1000,
        optional=True,
    )


def _load_profile(user_id: str) -> dict[str, Any] | None:
    rows = _rows(
        "profiles",
        eq={"user_id": user_id},
        limit=1,
        optional=True,
    )

    if rows:
        return rows[0]

    rows = _rows(
        "profiles",
        eq={"id": user_id},
        limit=1,
        optional=True,
    )

    return rows[0] if rows else None


def _assert_teacher_can_access_course(
    *,
    course: dict[str, Any] | None,
    course_id: str,
    current_user_id: str,
) -> dict[str, Any]:
    if not course:
        raise _http_error("Курс табылмады.", 404)

    owner_id = _course_owner_id(course)

    if owner_id and owner_id != current_user_id:
        raise _http_error("Бұл курс бойынша AI көмекші қолдануға рұқсат жоқ.", 403)

    if not owner_id:
        logger.warning(
            "Course owner field not found for course_id=%s. Permission check is weak.",
            course_id,
        )

    return course


def _assert_student_in_course(
    *,
    course_id: str,
    student_id: str,
) -> None:
    rows = _rows(
        "course_enrollments",
        eq={
            "course_id": course_id,
            "student_id": student_id,
        },
        limit=1,
        optional=True,
    )

    if rows:
        return

    rows = _rows(
        "course_enrollments",
        eq={
            "course_id": course_id,
            "user_id": student_id,
        },
        limit=1,
        optional=True,
    )

    if not rows:
        raise _http_error("Оқушы бұл курсқа тіркелмеген немесе дерек табылмады.", 403)


def _build_weak_lessons(
    *,
    lessons: list[dict[str, Any]],
    mini_quiz_attempts: list[dict[str, Any]],
    review_later_items: list[dict[str, Any]],
    limit: int = 8,
) -> list[dict[str, Any]]:
    lesson_by_id = {
        _clean_text(lesson.get("id"), 140): lesson
        for lesson in lessons
        if _clean_text(lesson.get("id"), 140)
    }

    attempts_by_lesson: dict[str, list[dict[str, Any]]] = defaultdict(list)
    review_lesson_ids = {
        lesson_id
        for lesson_id in (_lesson_id_from_row(row) for row in review_later_items)
        if lesson_id
    }

    for attempt in mini_quiz_attempts:
        lesson_id = _lesson_id_from_row(attempt)
        if lesson_id:
            attempts_by_lesson[lesson_id].append(attempt)

    weak_items: list[dict[str, Any]] = []

    for lesson_id, lesson in lesson_by_id.items():
        attempts = attempts_by_lesson.get(lesson_id, [])
        scores = [_score_from_row(row) for row in attempts]
        avg_score = _avg(scores)
        failed = sum(1 for row in attempts if not _is_passed_attempt(row))
        review_later = lesson_id in review_lesson_ids

        reasons: list[str] = []

        if avg_score is not None and avg_score < 65:
            reasons.append(f"mini quiz орташа нәтижесі төмен: {avg_score}%")

        if failed > 0:
            reasons.append(f"{failed} рет қайта қарауды қажет еткен attempt бар")

        if review_later:
            reasons.append("оқушы кейін қайталауға белгілеген")

        if not reasons:
            continue

        priority = "high" if failed >= 2 or (avg_score is not None and avg_score < 50) else "medium"

        weak_items.append(
            {
                "lessonId": lesson_id,
                "lessonTitle": _lesson_title(lesson),
                "avgScore": avg_score,
                "failedAttempts": failed,
                "reviewLater": review_later,
                "priority": priority,
                "reason": "; ".join(reasons),
            }
        )

    return sorted(
        weak_items,
        key=lambda item: (
            0 if item["priority"] == "high" else 1,
            item["avgScore"] if item["avgScore"] is not None else 101,
        ),
    )[:limit]


def _build_recommendations(
    *,
    progress_pct: int,
    mini_quiz_avg: float | None,
    weak_lessons: list[dict[str, Any]],
    review_later_count: int,
) -> list[dict[str, Any]]:
    recommendations: list[dict[str, Any]] = []

    if progress_pct < 40:
        recommendations.append(
            {
                "priority": "high",
                "title": "Курс progress төмен",
                "description": "Алдымен аяқталмаған негізгі сабақтарды ретімен өту ұсынылады.",
            }
        )
    elif progress_pct < 70:
        recommendations.append(
            {
                "priority": "medium",
                "title": "Progress-ті тұрақтандыру",
                "description": "Апталық оқу жоспарын қысқа сабақ блоктарына бөліп жалғастыру тиімді.",
            }
        )

    if mini_quiz_avg is not None and mini_quiz_avg < 65:
        recommendations.append(
            {
                "priority": "high",
                "title": "Mini quiz нәтижесін көтеру",
                "description": "Төмен нәтиже шыққан сабақтарды қайта қарап, mini quiz-ді қайта тапсыру ұсынылады.",
            }
        )

    if weak_lessons:
        recommendations.append(
            {
                "priority": "high" if weak_lessons[0].get("priority") == "high" else "medium",
                "title": "Қиын сабақтарды қайталау",
                "description": "Алдымен қиындық байқалған сабақтарды қысқа конспект және практика арқылы қайталау керек.",
            }
        )

    if review_later_count > 0:
        recommendations.append(
            {
                "priority": "medium",
                "title": "Кейін қайталау тізімін жабу",
                "description": "Кейін қайталауға белгіленген сабақтарды жеке жоспарға енгізу ұсынылады.",
            }
        )

    if not recommendations:
        recommendations.append(
            {
                "priority": "low",
                "title": "Оқуды жоспар бойынша жалғастыру",
                "description": "Қазіргі оқу нәтижелері бойынша айқын қауіп байқалмайды.",
            }
        )

    return recommendations[:6]


def collect_student_learning_context(
    *,
    current_user_id: str,
) -> dict[str, Any]:
    enrollments = _rows(
        "course_enrollments",
        eq={"student_id": current_user_id},
        limit=200,
        optional=True,
    )

    if not enrollments:
        enrollments = _rows(
            "course_enrollments",
            eq={"user_id": current_user_id},
            limit=200,
            optional=True,
        )

    course_ids = _unique(row.get("course_id") for row in enrollments)

    courses = _rows(
        "courses",
        in_={"id": course_ids},
        limit=200,
        optional=True,
    ) if course_ids else []

    lessons = _rows(
        "lessons",
        in_={"course_id": course_ids},
        limit=2000,
        optional=True,
    ) if course_ids else []

    lesson_ids = {
        _clean_text(lesson.get("id"), 140)
        for lesson in lessons
        if _clean_text(lesson.get("id"), 140)
    }

    progress_all = _rows(
        "lesson_progress",
        eq={"student_id": current_user_id},
        limit=3000,
        optional=True,
    )

    if not progress_all:
        progress_all = _rows(
            "lesson_progress",
            eq={"user_id": current_user_id},
            limit=3000,
            optional=True,
        )

    progress = _filter_rows_for_courses(
        progress_all,
        course_ids=set(course_ids),
        lesson_ids=lesson_ids,
    )

    mini_quiz_all = _rows(
        "lesson_mini_quiz_attempts",
        eq={"student_id": current_user_id},
        limit=3000,
        optional=True,
    )

    if not mini_quiz_all:
        mini_quiz_all = _rows(
            "lesson_mini_quiz_attempts",
            eq={"user_id": current_user_id},
            limit=3000,
            optional=True,
        )

    mini_quiz_attempts = _filter_rows_for_courses(
        mini_quiz_all,
        course_ids=set(course_ids),
        lesson_ids=lesson_ids,
    )

    test_attempts_all = _rows(
        "test_attempts",
        eq={"student_id": current_user_id},
        limit=2000,
        optional=True,
    )

    if not test_attempts_all:
        test_attempts_all = _rows(
            "test_attempts",
            eq={"user_id": current_user_id},
            limit=2000,
            optional=True,
        )

    test_attempts = _filter_rows_for_courses(
        test_attempts_all,
        course_ids=set(course_ids),
        lesson_ids=lesson_ids,
    )

    bookmarks_all = _rows(
        "student_lesson_bookmarks",
        eq={"student_id": current_user_id},
        limit=2000,
        optional=True,
    )

    if not bookmarks_all:
        bookmarks_all = _rows(
            "student_lesson_bookmarks",
            eq={"user_id": current_user_id},
            limit=2000,
            optional=True,
        )

    bookmarks = _filter_rows_for_courses(
        bookmarks_all,
        course_ids=set(course_ids),
        lesson_ids=lesson_ids,
    )

    review_later_all = _rows(
        "review_later_items",
        eq={"student_id": current_user_id},
        limit=2000,
        optional=True,
    )

    if not review_later_all:
        review_later_all = _rows(
            "review_later_items",
            eq={"user_id": current_user_id},
            limit=2000,
            optional=True,
        )

    review_later = _filter_rows_for_courses(
        review_later_all,
        course_ids=set(course_ids),
        lesson_ids=lesson_ids,
    )

    completed_lesson_ids = {
        lesson_id
        for lesson_id in (_lesson_id_from_row(row) for row in progress)
        if lesson_id and _is_completed_progress(row)
    }

    mini_quiz_scores = [_score_from_row(row) for row in mini_quiz_attempts]
    test_scores = [_score_from_row(row) for row in test_attempts]

    progress_pct = _pct(len(completed_lesson_ids), len(lesson_ids))
    mini_quiz_avg = _avg(mini_quiz_scores)

    weak_lessons = _build_weak_lessons(
        lessons=lessons,
        mini_quiz_attempts=mini_quiz_attempts,
        review_later_items=review_later,
    )

    recommendations = _build_recommendations(
        progress_pct=progress_pct,
        mini_quiz_avg=mini_quiz_avg,
        weak_lessons=weak_lessons,
        review_later_count=len(review_later),
    )

    return {
        "kind": "student_learning_snapshot",
        "student": {
            "id": current_user_id,
            "name": _student_name(_load_profile(current_user_id), current_user_id),
        },
        "totals": {
            "enrolledCourses": len(course_ids),
            "totalLessons": len(lesson_ids),
            "completedLessons": len(completed_lesson_ids),
            "progressPct": progress_pct,
            "miniQuizAttempts": len(mini_quiz_attempts),
            "miniQuizAvgScore": mini_quiz_avg,
            "miniQuizPassed": sum(1 for row in mini_quiz_attempts if _is_passed_attempt(row)),
            "miniQuizFailed": sum(1 for row in mini_quiz_attempts if not _is_passed_attempt(row)),
            "testAttempts": len(test_attempts),
            "testAvgScore": _avg(test_scores),
            "savedLessons": len(bookmarks),
            "reviewLaterItems": len(review_later),
        },
        "courses": [
            {
                "id": _clean_text(course.get("id"), 140),
                "title": _course_title(course),
            }
            for course in courses[:20]
        ],
        "weakLessons": weak_lessons,
        "recommendations": recommendations,
        "limits": {
            "maxCoursesReturned": 20,
            "maxWeakLessonsReturned": 8,
            "behaviorTrackingUsed": False,
        },
    }


def collect_course_learning_context(
    *,
    course_id: str,
    current_user_id: str,
) -> dict[str, Any]:
    course = _assert_teacher_can_access_course(
        course=_row_by_id("courses", course_id, optional=True),
        course_id=course_id,
        current_user_id=current_user_id,
    )

    lessons = _load_course_lessons(course_id)
    lesson_ids = {
        _clean_text(lesson.get("id"), 140)
        for lesson in lessons
        if _clean_text(lesson.get("id"), 140)
    }

    enrollments = _load_course_enrollments(course_id)
    student_ids = _unique(
        _student_id_from_row(row)
        for row in enrollments
    )

    progress_all = _rows(
        "lesson_progress",
        eq={"course_id": course_id},
        limit=5000,
        optional=True,
    )

    if not progress_all and lesson_ids:
        progress_all = _rows(
            "lesson_progress",
            in_={"lesson_id": list(lesson_ids)},
            limit=5000,
            optional=True,
        )

    progress = _filter_rows_for_course(
        progress_all,
        course_id=course_id,
        lesson_ids=lesson_ids,
    )

    mini_quiz_all = _rows(
        "lesson_mini_quiz_attempts",
        eq={"course_id": course_id},
        limit=5000,
        optional=True,
    )

    if not mini_quiz_all and lesson_ids:
        mini_quiz_all = _rows(
            "lesson_mini_quiz_attempts",
            in_={"lesson_id": list(lesson_ids)},
            limit=5000,
            optional=True,
        )

    mini_quiz_attempts = _filter_rows_for_course(
        mini_quiz_all,
        course_id=course_id,
        lesson_ids=lesson_ids,
    )

    test_attempts = _rows(
        "test_attempts",
        eq={"course_id": course_id},
        limit=5000,
        optional=True,
    )

    bookmarks = _rows(
        "student_lesson_bookmarks",
        eq={"course_id": course_id},
        limit=5000,
        optional=True,
    )

    if not bookmarks and lesson_ids:
        bookmarks = _rows(
            "student_lesson_bookmarks",
            in_={"lesson_id": list(lesson_ids)},
            limit=5000,
            optional=True,
        )

    review_later = _rows(
        "review_later_items",
        eq={"course_id": course_id},
        limit=5000,
        optional=True,
    )

    if not review_later and lesson_ids:
        review_later = _rows(
            "review_later_items",
            in_={"lesson_id": list(lesson_ids)},
            limit=5000,
            optional=True,
        )

    completed_pairs = set()

    for row in progress:
        student_id = _student_id_from_row(row)
        lesson_id = _lesson_id_from_row(row)

        if student_id and lesson_id and _is_completed_progress(row):
            completed_pairs.add((student_id, lesson_id))

    completed_by_student: dict[str, set[str]] = defaultdict(set)
    for student_id, lesson_id in completed_pairs:
        completed_by_student[student_id].add(lesson_id)

    per_student_progress = [
        _pct(len(completed_by_student.get(student_id, set())), len(lesson_ids))
        for student_id in student_ids
    ]

    mini_quiz_scores = [_score_from_row(row) for row in mini_quiz_attempts]
    test_scores = [_score_from_row(row) for row in test_attempts]

    weak_lessons = _build_weak_lessons(
        lessons=lessons,
        mini_quiz_attempts=mini_quiz_attempts,
        review_later_items=review_later,
    )

    mini_quiz_passed = sum(1 for row in mini_quiz_attempts if _is_passed_attempt(row))
    mini_quiz_failed = len(mini_quiz_attempts) - mini_quiz_passed

    recommendations = _build_recommendations(
        progress_pct=int(_avg(per_student_progress) or 0),
        mini_quiz_avg=_avg(mini_quiz_scores),
        weak_lessons=weak_lessons,
        review_later_count=len(review_later),
    )

    return {
        "kind": "course_learning_snapshot",
        "course": {
            "id": course_id,
            "title": _course_title(course),
        },
        "totals": {
            "students": len(student_ids),
            "lessons": len(lesson_ids),
            "completedLessonRecords": len(completed_pairs),
            "avgProgressPct": _avg(per_student_progress),
            "miniQuizAttempts": len(mini_quiz_attempts),
            "miniQuizAvgScore": _avg(mini_quiz_scores),
            "miniQuizPassed": mini_quiz_passed,
            "miniQuizFailed": mini_quiz_failed,
            "miniQuizPassRatePct": _pct(mini_quiz_passed, len(mini_quiz_attempts)),
            "testAttempts": len(test_attempts),
            "testAvgScore": _avg(test_scores),
            "savedLessons": len(bookmarks),
            "reviewLaterItems": len(review_later),
        },
        "weakLessons": weak_lessons,
        "recommendations": recommendations,
        "limits": {
            "maxWeakLessonsReturned": 8,
            "behaviorTrackingUsed": False,
        },
    }


def collect_teacher_student_learning_context(
    *,
    course_id: str,
    student_id: str,
    current_user_id: str,
) -> dict[str, Any]:
    course_context = collect_course_learning_context(
        course_id=course_id,
        current_user_id=current_user_id,
    )

    _assert_student_in_course(
        course_id=course_id,
        student_id=student_id,
    )

    lessons = _load_course_lessons(course_id)
    lesson_ids = {
        _clean_text(lesson.get("id"), 140)
        for lesson in lessons
        if _clean_text(lesson.get("id"), 140)
    }

    progress_all = _rows(
        "lesson_progress",
        eq={"student_id": student_id},
        limit=3000,
        optional=True,
    )

    if not progress_all:
        progress_all = _rows(
            "lesson_progress",
            eq={"user_id": student_id},
            limit=3000,
            optional=True,
        )

    progress = _filter_rows_for_course(
        progress_all,
        course_id=course_id,
        lesson_ids=lesson_ids,
    )

    mini_quiz_all = _rows(
        "lesson_mini_quiz_attempts",
        eq={"student_id": student_id},
        limit=3000,
        optional=True,
    )

    if not mini_quiz_all:
        mini_quiz_all = _rows(
            "lesson_mini_quiz_attempts",
            eq={"user_id": student_id},
            limit=3000,
            optional=True,
        )

    mini_quiz_attempts = _filter_rows_for_course(
        mini_quiz_all,
        course_id=course_id,
        lesson_ids=lesson_ids,
    )

    test_attempts_all = _rows(
        "test_attempts",
        eq={"student_id": student_id},
        limit=2000,
        optional=True,
    )

    if not test_attempts_all:
        test_attempts_all = _rows(
            "test_attempts",
            eq={"user_id": student_id},
            limit=2000,
            optional=True,
        )

    test_attempts = _filter_rows_for_course(
        test_attempts_all,
        course_id=course_id,
        lesson_ids=lesson_ids,
    )

    bookmarks_all = _rows(
        "student_lesson_bookmarks",
        eq={"student_id": student_id},
        limit=2000,
        optional=True,
    )

    if not bookmarks_all:
        bookmarks_all = _rows(
            "student_lesson_bookmarks",
            eq={"user_id": student_id},
            limit=2000,
            optional=True,
        )

    bookmarks = _filter_rows_for_course(
        bookmarks_all,
        course_id=course_id,
        lesson_ids=lesson_ids,
    )

    review_later_all = _rows(
        "review_later_items",
        eq={"student_id": student_id},
        limit=2000,
        optional=True,
    )

    if not review_later_all:
        review_later_all = _rows(
            "review_later_items",
            eq={"user_id": student_id},
            limit=2000,
            optional=True,
        )

    review_later = _filter_rows_for_course(
        review_later_all,
        course_id=course_id,
        lesson_ids=lesson_ids,
    )

    completed_lesson_ids = {
        lesson_id
        for lesson_id in (_lesson_id_from_row(row) for row in progress)
        if lesson_id and _is_completed_progress(row)
    }

    mini_quiz_scores = [_score_from_row(row) for row in mini_quiz_attempts]
    test_scores = [_score_from_row(row) for row in test_attempts]

    progress_pct = _pct(len(completed_lesson_ids), len(lesson_ids))
    mini_quiz_avg = _avg(mini_quiz_scores)

    weak_lessons = _build_weak_lessons(
        lessons=lessons,
        mini_quiz_attempts=mini_quiz_attempts,
        review_later_items=review_later,
    )

    recommendations = _build_recommendations(
        progress_pct=progress_pct,
        mini_quiz_avg=mini_quiz_avg,
        weak_lessons=weak_lessons,
        review_later_count=len(review_later),
    )

    return {
        "kind": "teacher_student_learning_snapshot",
        "course": course_context["course"],
        "student": {
            "id": student_id,
            "name": _student_name(_load_profile(student_id), student_id),
        },
        "totals": {
            "totalLessons": len(lesson_ids),
            "completedLessons": len(completed_lesson_ids),
            "progressPct": progress_pct,
            "miniQuizAttempts": len(mini_quiz_attempts),
            "miniQuizAvgScore": mini_quiz_avg,
            "miniQuizPassed": sum(1 for row in mini_quiz_attempts if _is_passed_attempt(row)),
            "miniQuizFailed": sum(1 for row in mini_quiz_attempts if not _is_passed_attempt(row)),
            "testAttempts": len(test_attempts),
            "testAvgScore": _avg(test_scores),
            "savedLessons": len(bookmarks),
            "reviewLaterItems": len(review_later),
        },
        "weakLessons": weak_lessons,
        "recommendations": recommendations,
        "teacherScopeNote": "Бұл дерек тек мұғалімнің өз курсындағы оқу нәтижелеріне негізделеді.",
        "limits": {
            "maxWeakLessonsReturned": 8,
            "behaviorTrackingUsed": False,
        },
    }


async def collect_learning_analysis_context(
    *,
    payload: LearningAiRequest,
    current_user_id: str,
) -> dict[str, Any]:
    scope = payload.scope

    if payload.mode == LearningAiMode.student_tracker:
        return collect_student_learning_context(
            current_user_id=current_user_id,
        )

    if payload.mode == LearningAiMode.teacher_course_assistant:
        if not scope or not scope.course_id:
            raise _http_error("courseId қажет.", 400)

        return collect_course_learning_context(
            course_id=scope.course_id,
            current_user_id=current_user_id,
        )

    if not scope or not scope.course_id or not scope.student_id:
        raise _http_error("courseId және studentId қажет.", 400)

    return collect_teacher_student_learning_context(
        course_id=scope.course_id,
        student_id=scope.student_id,
        current_user_id=current_user_id,
    )