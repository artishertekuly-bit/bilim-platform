from __future__ import annotations

import asyncio
import logging
import os
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

from dotenv import load_dotenv
from fastapi import HTTPException
from supabase import Client, create_client

from app.schemas.learning_analysis import LearningAiMode, LearningAiRequest

ROOT_DIR = Path(__file__).resolve().parents[3]
BACKEND_DIR = ROOT_DIR / "backend"
ENV_FILES = [ROOT_DIR / ".env", BACKEND_DIR / ".env"]

logger = logging.getLogger("bilimcorp.learning_analysis.context")

for env_file in ENV_FILES:
    if env_file.exists():
        load_dotenv(env_file, override=False)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()
APP_ENV = os.getenv("APP_ENV", os.getenv("ENV", "development")).strip().lower()

MAX_COURSES_RETURNED = 20
MAX_PUBLIC_COURSES_RETURNED = 18
MAX_TEACHER_COURSES_RETURNED = 16
MAX_TEACHER_LESSONS_RETURNED = 40
MAX_WEAK_LESSONS_RETURNED = 8
MAX_RECOMMENDATIONS_RETURNED = 6

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
    text = " ".join(str(value or "").replace("\x00", " ").split()).strip()
    return text[:limit] if limit else text


def _to_number(value: Any) -> float | None:
    if value is None:
        return None

    if isinstance(value, bool):
        return None

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _first_number(*values: Any) -> float | None:
    for value in values:
        parsed = _to_number(value)
        if parsed is not None:
            return parsed

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
        or _clean_text(course.get("course_title"), 240)
        or _clean_text(course.get("courseTitle"), 240)
        or "Курс"
    )


def _course_description(course: dict[str, Any] | None, limit: int = 500) -> str:
    if not course:
        return ""

    return (
        _clean_text(course.get("description"), limit)
        or _clean_text(course.get("summary"), limit)
        or _clean_text(course.get("short_description"), limit)
        or _clean_text(course.get("shortDescription"), limit)
        or ""
    )


def _course_subject_name(course: dict[str, Any] | None) -> str | None:
    if not course:
        return None

    value = _get_row_value(
        course,
        [
            "subject_name",
            "subjectName",
            "subject",
            "category",
            "category_name",
            "categoryName",
        ],
    )

    text = _clean_text(value, 180)
    return text or None


def _course_grade_level(course: dict[str, Any] | None) -> str | None:
    if not course:
        return None

    value = _get_row_value(
        course,
        [
            "grade_level",
            "gradeLevel",
            "grade",
            "class_level",
            "classLevel",
            "audience",
            "target_audience",
            "targetAudience",
        ],
    )

    text = _clean_text(value, 120)
    return text or None


def _course_access_value(course: dict[str, Any] | None) -> str:
    if not course:
        return ""

    value = _get_row_value(
        course,
        [
            "access_type",
            "accessType",
            "course_type",
            "courseType",
            "visibility",
            "enrollment_type",
            "enrollmentType",
            "type",
        ],
    )

    return _clean_text(value, 80).lower()


def _is_course_archived(course: dict[str, Any]) -> bool:
    if course.get("archived") is True or course.get("is_archived") is True:
        return True

    status_value = _clean_text(course.get("status"), 80).lower()
    return status_value in {"archived", "archive", "deleted", "removed"}


def _is_course_published(course: dict[str, Any]) -> bool:
    if course.get("published") is True or course.get("is_published") is True:
        return True

    if course.get("published_at") or course.get("publishedAt"):
        return True

    status_value = _clean_text(course.get("status"), 80).lower()
    publication_status = _clean_text(
        course.get("publication_status") or course.get("publicationStatus"),
        80,
    ).lower()

    return status_value in {"published", "active"} or publication_status == "published"


def _is_course_closed(course: dict[str, Any]) -> bool:
    access_value = _course_access_value(course)

    if course.get("is_private") is True or course.get("private") is True:
        return True

    closed_markers = {
        "closed",
        "private",
        "invite",
        "invite_only",
        "invite-only",
        "by_invite",
        "hidden",
        "жабық",
    }

    return any(marker in access_value for marker in closed_markers)


def _is_course_paid(course: dict[str, Any]) -> bool:
    access_value = _course_access_value(course)

    if course.get("is_paid") is True or course.get("paid") is True:
        return True

    paid_markers = {"paid", "premium", "subscription", "ақылы"}
    return any(marker in access_value for marker in paid_markers)


def _is_course_open(course: dict[str, Any]) -> bool:
    access_value = _course_access_value(course)

    if course.get("is_public") is True or course.get("public") is True:
        return True

    open_markers = {"open", "free", "public", "ашық"}
    return any(marker in access_value for marker in open_markers)


def _is_publicly_recommendable_course(course: dict[str, Any]) -> bool:
    if _is_course_archived(course):
        return False

    if _is_course_closed(course):
        return False

    if not _is_course_published(course):
        return False

    return _is_course_open(course) or _is_course_paid(course)


def _course_access_label(course: dict[str, Any]) -> str:
    if _is_course_paid(course):
        return "Ақылы"

    if _is_course_open(course):
        return "Ашық"

    return "Қолжетімді"


def _course_price_payload(course: dict[str, Any]) -> dict[str, Any] | None:
    if not _is_course_paid(course):
        return None

    amount = _first_number(
        course.get("price"),
        course.get("amount"),
        course.get("cost"),
        course.get("price_amount"),
        course.get("priceAmount"),
    )
    currency = (
        _clean_text(course.get("currency"), 20)
        or _clean_text(course.get("price_currency"), 20)
        or _clean_text(course.get("priceCurrency"), 20)
        or None
    )

    if amount is None and not currency:
        return None

    return {
        "amount": amount,
        "currency": currency,
    }


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


def _profile_display_name(profile: dict[str, Any] | None, fallback_id: str) -> str:
    if not profile:
        return f"Пайдаланушы {fallback_id[:8]}"

    return (
        _clean_text(profile.get("full_name"), 180)
        or _clean_text(profile.get("fullName"), 180)
        or _clean_text(profile.get("name"), 180)
        or _clean_text(profile.get("display_name"), 180)
        or _clean_text(profile.get("displayName"), 180)
        or f"Пайдаланушы {fallback_id[:8]}"
    )


def _profile_bio(profile: dict[str, Any] | None) -> str:
    if not profile:
        return ""

    return (
        _clean_text(profile.get("bio"), 1200)
        or _clean_text(profile.get("about"), 1200)
        or _clean_text(profile.get("description"), 1200)
        or _clean_text(profile.get("teacher_bio"), 1200)
        or _clean_text(profile.get("teacherBio"), 1200)
        or ""
    )


def _profile_subject_name(profile: dict[str, Any] | None) -> str | None:
    if not profile:
        return None

    value = _get_row_value(
        profile,
        [
            "subject_name",
            "subjectName",
            "subject",
            "specialization",
            "speciality",
            "department",
        ],
    )

    text = _clean_text(value, 180)
    return text or None


def _is_completed_progress(row: dict[str, Any]) -> bool:
    if row.get("completed_at") or row.get("completedAt"):
        return True

    if row.get("completed") is True or row.get("is_completed") is True:
        return True

    status_value = _clean_text(row.get("status"), 40).lower()
    if status_value in {"completed", "done", "finished"}:
        return True

    progress_value = _first_number(
        row.get("progress_percent"),
        row.get("progressPercent"),
        row.get("progress_pct"),
        row.get("progressPct"),
        row.get("progress"),
    )

    return bool(progress_value is not None and progress_value >= 100)


def _score_from_row(row: dict[str, Any]) -> float | None:
    return _first_number(
        row.get("score"),
        row.get("score_pct"),
        row.get("scorePct"),
        row.get("percentage"),
        row.get("percent"),
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


def _module_id_from_row(row: dict[str, Any]) -> str | None:
    value = _get_row_value(row, ["module_id", "moduleId"])
    text = _clean_text(value, 140)
    return text or None


def _with_course_id(row: dict[str, Any], course_id: str | None) -> dict[str, Any]:
    if not course_id:
        return row

    if _course_id_from_row(row):
        return row

    return {
        **row,
        "course_id": course_id,
    }


def _dedupe_rows_by_id(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    result: list[dict[str, Any]] = []

    for row in rows:
        row_id = _clean_text(row.get("id"), 140)

        if not row_id:
            result.append(row)
            continue

        if row_id in seen:
            continue

        seen.add(row_id)
        result.append(row)

    return result


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
    direct_rows = _rows(
        "lessons",
        eq={"course_id": course_id},
        limit=1000,
        optional=True,
    )

    if direct_rows:
        return [_with_course_id(row, course_id) for row in direct_rows]

    modules = _rows(
        "modules",
        eq={"course_id": course_id},
        limit=1000,
        optional=True,
    )
    module_ids = [
        _clean_text(module.get("id"), 140)
        for module in modules
        if _clean_text(module.get("id"), 140)
    ]

    if not module_ids:
        return []

    module_lessons = _rows(
        "lessons",
        in_={"module_id": module_ids},
        limit=2000,
        optional=True,
    )

    return [_with_course_id(row, course_id) for row in module_lessons]


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


def _load_public_course_catalog(limit: int = MAX_PUBLIC_COURSES_RETURNED) -> list[dict[str, Any]]:
    rows = _rows(
        "courses",
        limit=1000,
        optional=True,
    )

    visible_courses = [
        course
        for course in rows
        if _is_publicly_recommendable_course(course)
    ]

    result: list[dict[str, Any]] = []

    for course in visible_courses[:limit]:
        result.append(
            {
                "id": _clean_text(course.get("id"), 140),
                "title": _course_title(course),
                "description": _course_description(course, 500),
                "subjectName": _course_subject_name(course),
                "gradeLevel": _course_grade_level(course),
                "accessType": _course_access_label(course),
                "price": _course_price_payload(course),
                "published": True,
                "closedCourseExcluded": False,
            }
        )

    return result


def _load_teacher_courses(
    *,
    teacher_id: str,
    limit: int = MAX_TEACHER_COURSES_RETURNED,
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []

    for column in [
        "teacher_id",
        "owner_id",
        "created_by",
        "instructor_id",
        "user_id",
    ]:
        candidates.extend(
            _rows(
                "courses",
                eq={column: teacher_id},
                limit=200,
                optional=True,
            )
        )

    candidates.extend(
        _rows(
            "courses",
            limit=200,
            optional=True,
        )
    )

    seen: set[str] = set()
    result: list[dict[str, Any]] = []

    for course in candidates:
        course_id = _clean_text(course.get("id"), 140)

        if not course_id or course_id in seen:
            continue

        seen.add(course_id)
        result.append(course)

        if len(result) >= limit:
            break

    return result


def _load_lessons_for_courses(
    course_ids: list[str],
    limit: int = MAX_TEACHER_LESSONS_RETURNED,
) -> list[dict[str, Any]]:
    if not course_ids:
        return []

    direct_rows = [
        _with_course_id(row, _course_id_from_row(row))
        for row in _rows(
            "lessons",
            in_={"course_id": course_ids},
            limit=2000,
            optional=True,
        )
    ]

    modules = _rows(
        "modules",
        in_={"course_id": course_ids},
        limit=2000,
        optional=True,
    )
    module_course_map = {
        _clean_text(module.get("id"), 140): _clean_text(module.get("course_id"), 140)
        for module in modules
        if _clean_text(module.get("id"), 140)
        and _clean_text(module.get("course_id"), 140)
    }

    module_rows: list[dict[str, Any]] = []

    if module_course_map:
        raw_module_rows = _rows(
            "lessons",
            in_={"module_id": list(module_course_map.keys())},
            limit=4000,
            optional=True,
        )
        module_rows = [
            _with_course_id(row, module_course_map.get(_module_id_from_row(row) or ""))
            for row in raw_module_rows
        ]

    return _dedupe_rows_by_id([*direct_rows, *module_rows])[:limit]


def _compact_teacher_course(course: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": _clean_text(course.get("id"), 140),
        "title": _course_title(course),
        "description": _course_description(course, 500),
        "subjectName": _course_subject_name(course),
        "gradeLevel": _course_grade_level(course),
        "status": _clean_text(course.get("status"), 80) or None,
        "published": _is_course_published(course),
        "archived": _is_course_archived(course),
        "accessType": _course_access_label(course),
    }


def _compact_public_course(course: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": _clean_text(course.get("id"), 140),
        "title": _course_title(course),
        "description": _course_description(course, 500),
        "subjectName": course.get("subjectName"),
        "gradeLevel": course.get("gradeLevel"),
        "accessType": course.get("accessType"),
        "price": course.get("price"),
    }


def _build_catalog_signals(public_courses: list[dict[str, Any]]) -> dict[str, Any]:
    subjects = _unique(course.get("subjectName") for course in public_courses)
    grades = _unique(course.get("gradeLevel") for course in public_courses)
    access_types = _unique(course.get("accessType") for course in public_courses)

    if public_courses:
        primary_focus = (
            "Платформада қолжетімді курстар бар. AI ұсынысты сол каталог пен пайдаланушы сұрағына сүйеніп бере алады."
        )
    else:
        primary_focus = (
            "Платформада ұсынылатын ашық немесе ақылы курстар табылмады. AI жалпы оқу бағыты бойынша ғана кеңес бере алады."
        )

    return {
        "primaryFocus": primary_focus,
        "availableSubjects": subjects[:12],
        "availableGradeLevels": grades[:12],
        "availableAccessTypes": access_types[:4],
        "catalogCourseCount": len(public_courses),
    }


def _build_teacher_creator_signals(
    *,
    profile: dict[str, Any] | None,
    teacher_courses: list[dict[str, Any]],
    teacher_lessons: list[dict[str, Any]],
    public_courses: list[dict[str, Any]],
) -> dict[str, Any]:
    profile_subject = _profile_subject_name(profile)
    own_subjects = _unique(_course_subject_name(course) for course in teacher_courses)
    lesson_titles = _unique(_lesson_title(lesson) for lesson in teacher_lessons)

    if teacher_courses:
        primary_focus = (
            "Мұғалімнің бұрынғы курстары бар. AI жаңа курс немесе сабақ идеясын сол тәжірибеге сүйеніп ұсына алады."
        )
    elif profile_subject:
        primary_focus = (
            "Мұғалім профилінде пән/бағыт белгісі бар. AI курс идеясын осы бағытқа сүйеніп ұсына алады."
        )
    else:
        primary_focus = (
            "Мұғалім туралы дерек аз. AI жалпы курс идеяларын ұсына алады, бірақ нақтылау үшін пән, аудитория және мақсат сұрауы керек."
        )

    return {
        "primaryFocus": primary_focus,
        "profileSubject": profile_subject,
        "ownCourseSubjects": own_subjects[:12],
        "existingLessonThemes": lesson_titles[:20],
        "ownCourseCount": len(teacher_courses),
        "publicCatalogCourseCount": len(public_courses),
    }


def _assert_teacher_can_access_course(
    *,
    course: dict[str, Any] | None,
    course_id: str,
    current_user_id: str,
) -> dict[str, Any]:
    if not course:
        raise _http_error("Курс табылмады.", 404)

    _ = (course_id, current_user_id)
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


def _priority_rank(priority: str | None) -> int:
    if priority == "high":
        return 0
    if priority == "medium":
        return 1
    return 2


def _score_band(score: float | None) -> str:
    if score is None:
        return "unknown"

    if score < 50:
        return "needs_immediate_review"

    if score < 65:
        return "needs_review"

    if score < 80:
        return "developing"

    return "stable"


def _progress_band(progress_pct: int | float | None) -> str:
    if progress_pct is None:
        return "unknown"

    if progress_pct < 40:
        return "needs_structure"

    if progress_pct < 70:
        return "developing"

    return "stable"


def _build_weak_lessons(
    *,
    lessons: list[dict[str, Any]],
    mini_quiz_attempts: list[dict[str, Any]],
    review_later_items: list[dict[str, Any]],
    limit: int = MAX_WEAK_LESSONS_RETURNED,
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
        score_band = _score_band(avg_score)

        reasons: list[str] = []

        if score_band in {"needs_immediate_review", "needs_review"}:
            reasons.append(
                "mini quiz нәтижесі бұл сабақты қайта қарау пайдалы екенін көрсетеді"
            )

        if failed > 0:
            reasons.append("қайта орындау немесе қосымша бекіту белгісі бар")

        if review_later:
            reasons.append("оқушы бұл сабақты кейін қайталауға белгілеген")

        if not reasons:
            continue

        priority = (
            "high"
            if failed >= 2 or score_band == "needs_immediate_review"
            else "medium"
        )

        weak_items.append(
            {
                "lessonId": lesson_id,
                "lessonTitle": _lesson_title(lesson),
                "avgScore": avg_score,
                "failedAttempts": failed,
                "reviewLater": review_later,
                "scoreBand": score_band,
                "priority": priority,
                "reason": "; ".join(reasons),
            }
        )

    return sorted(
        weak_items,
        key=lambda item: (
            _priority_rank(item.get("priority")),
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
    progress_band = _progress_band(progress_pct)
    quiz_band = _score_band(mini_quiz_avg)

    if progress_band == "needs_structure":
        recommendations.append(
            {
                "priority": "high",
                "title": "Оқу құрылымын реттеу",
                "description": "Алдымен аяқталмаған негізгі сабақтарды шағын, реттелген оқу жоспарына бөлу пайдалы.",
                "reason": "progress signal indicates that learning structure should be strengthened",
            }
        )
    elif progress_band == "developing":
        recommendations.append(
            {
                "priority": "medium",
                "title": "Progress-ті тұрақтандыру",
                "description": "Оқуды қысқа сабақ блоктарына бөліп, тұрақты қайталау режимін сақтау тиімді.",
                "reason": "progress signal is developing but not yet stable",
            }
        )

    if quiz_band in {"needs_immediate_review", "needs_review"}:
        recommendations.append(
            {
                "priority": "high",
                "title": "Түсінуді бекіту",
                "description": "Mini quiz нәтижесі төмендеу шыққан сабақтарды қайта қарап, қысқа практика арқылы бекіту ұсынылады.",
                "reason": "mini quiz signal indicates that conceptual review may be needed",
            }
        )

    if weak_lessons:
        first_priority = weak_lessons[0].get("priority")
        recommendations.append(
            {
                "priority": "high" if first_priority == "high" else "medium",
                "title": "Қиындық байқалған сабақтарды қайталау",
                "description": "Алдымен қиындық белгісі бар сабақтарды қысқа түсіндіру, мысал және practice арқылы қайталау керек.",
                "reason": "weak lesson signals are present",
            }
        )

    if review_later_count > 0:
        recommendations.append(
            {
                "priority": "medium",
                "title": "Қайталау тізімін реттеу",
                "description": "Кейін қайталауға белгіленген сабақтарды жеке оқу жоспарына енгізу пайдалы.",
                "reason": "review later items are present",
            }
        )

    if not recommendations:
        recommendations.append(
            {
                "priority": "low",
                "title": "Оқуды жоспар бойынша жалғастыру",
                "description": "Қазіргі оқу сигналдары бойынша шұғыл қиындық байқалмайды. Жоспарлы оқу мен қысқа қайталауды жалғастыру жеткілікті.",
                "reason": "no strong risk signal found",
            }
        )

    return recommendations[:MAX_RECOMMENDATIONS_RETURNED]


def _build_assistant_policy() -> dict[str, Any]:
    return {
        "humanAiCollaboration": True,
        "aiRole": "explain_support_and_suggest",
        "humanRole": "make_final_decision",
        "numbersAreForInternalReasoningOnly": True,
        "avoidRawAnalyticsInFinalAnswer": True,
        "avoidStudentLabeling": True,
        "behaviorTrackingUsed": False,
        "displayGuidance": (
            "Use numeric metrics internally to infer learning signals, but do not list all "
            "numbers back to the user. Return a concise explanation and next actions."
        ),
    }


def _build_advisor_policy() -> dict[str, Any]:
    return {
        "humanAiCollaboration": True,
        "aiRole": "suggest_options_generate_ideas_and_ask_clarifying_questions",
        "humanRole": "choose_goal_context_and_final_direction",
        "advisorMode": True,
        "analysisDataRequired": False,
        "avoidInventingUnavailableCourses": True,
        "onlyRecommendVisibleCoursesFromCatalog": True,
        "closedCoursesExcluded": True,
        "numbersAreForInternalReasoningOnly": True,
        "avoidRawAnalyticsInFinalAnswer": True,
        "displayGuidance": (
            "Advisor modes may work without learning progress data. "
            "Use available user profile, teacher courses, public catalog, and the user question. "
            "If context is thin, say that recommendations are general and ask for the missing details."
        ),
    }


def _build_student_signals(
    *,
    progress_pct: int,
    mini_quiz_avg: float | None,
    weak_lessons: list[dict[str, Any]],
    review_later_count: int,
) -> dict[str, Any]:
    signals: list[str] = []

    progress_band = _progress_band(progress_pct)
    quiz_band = _score_band(mini_quiz_avg)

    if progress_band == "needs_structure":
        signals.append("Оқу ретін және аяқталмаған сабақтарды реттеу пайдалы.")
    elif progress_band == "developing":
        signals.append("Оқу progress-ін тұрақтандыру үшін қысқа жоспар керек.")
    else:
        signals.append("Оқу бағыты жалпы тұрақты, жоспарлы қайталау жеткілікті.")

    if quiz_band in {"needs_immediate_review", "needs_review"}:
        signals.append("Кейбір тақырыптар бойынша түсінуді бекіту қажет болуы мүмкін.")

    if weak_lessons:
        signals.append("Қайталауға басымдық беретін сабақтар бар.")

    if review_later_count > 0:
        signals.append("Кейін қайталау тізіміндегі сабақтарды жоспарға енгізу пайдалы.")

    return {
        "primaryFocus": signals[0] if signals else "Оқу бағытын жоспарлы түрде жалғастыру.",
        "supportingSignals": signals[:4],
        "progressBand": progress_band,
        "quizBand": quiz_band,
    }


def _build_course_signals(
    *,
    avg_progress_pct: float | None,
    mini_quiz_avg: float | None,
    weak_lessons: list[dict[str, Any]],
    review_later_count: int,
) -> dict[str, Any]:
    signals: list[str] = []

    progress_band = _progress_band(avg_progress_pct)
    quiz_band = _score_band(mini_quiz_avg)

    if progress_band == "needs_structure":
        signals.append("Курс бойынша оқу ретін және қайталау құрылымын күшейту керек.")
    elif progress_band == "developing":
        signals.append("Курс progress-ін тұрақтандыру үшін ортақ қайталау жоспары пайдалы.")
    else:
        signals.append("Курс бағыты жалпы тұрақты, бірақ нақты әлсіз сабақтарды бақылау керек.")

    if weak_lessons:
        signals.append("Бірнеше сабақ қайта түсіндіру немесе бекітуге сұранып тұр.")

    if quiz_band in {"needs_immediate_review", "needs_review"}:
        signals.append("Mini quiz сигналдары түсінуді қайта бекітуді ұсынады.")

    if review_later_count > 0:
        signals.append("Қайталау тізіміндегі сабақтарды ортақ жоспарға енгізуге болады.")

    return {
        "primaryFocus": signals[0] if signals else "Курс бойынша жоспарлы оқуды жалғастыру.",
        "supportingSignals": signals[:4],
        "progressBand": progress_band,
        "quizBand": quiz_band,
    }


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

    courses = (
        _rows(
            "courses",
            in_={"id": course_ids},
            limit=200,
            optional=True,
        )
        if course_ids
        else []
    )

    lessons = (
        _load_lessons_for_courses(course_ids, limit=2000)
        if course_ids
        else []
    )

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
        "signals": _build_student_signals(
            progress_pct=progress_pct,
            mini_quiz_avg=mini_quiz_avg,
            weak_lessons=weak_lessons,
            review_later_count=len(review_later),
        ),
        "courses": [
            {
                "id": _clean_text(course.get("id"), 140),
                "title": _course_title(course),
                "subjectName": _course_subject_name(course),
                "gradeLevel": _course_grade_level(course),
            }
            for course in courses[:MAX_COURSES_RETURNED]
        ],
        "weakLessons": weak_lessons,
        "recommendations": recommendations,
        "assistantPolicy": _build_assistant_policy(),
        "limits": {
            "maxCoursesReturned": MAX_COURSES_RETURNED,
            "maxWeakLessonsReturned": MAX_WEAK_LESSONS_RETURNED,
            "maxRecommendationsReturned": MAX_RECOMMENDATIONS_RETURNED,
            "behaviorTrackingUsed": False,
        },
    }


def collect_student_course_advisor_context(
    *,
    current_user_id: str,
) -> dict[str, Any]:
    profile = _load_profile(current_user_id)
    learning_snapshot = collect_student_learning_context(
        current_user_id=current_user_id,
    )
    public_courses = _load_public_course_catalog()

    enrolled_course_ids = {
        _clean_text(course.get("id"), 140)
        for course in learning_snapshot.get("courses", [])
        if isinstance(course, dict)
    }

    recommendable_courses = [
        course
        for course in public_courses
        if course.get("id") and course.get("id") not in enrolled_course_ids
    ]

    return {
        "kind": "student_course_advisor_context",
        "student": {
            "id": current_user_id,
            "name": _student_name(profile, current_user_id),
            "subjectName": _profile_subject_name(profile),
            "bio": _profile_bio(profile),
        },
        "learningSnapshot": learning_snapshot,
        "availableCourseCatalog": [
            _compact_public_course(course)
            for course in recommendable_courses[:MAX_PUBLIC_COURSES_RETURNED]
        ],
        "alreadyEnrolledCourses": learning_snapshot.get("courses", []),
        "signals": {
            **_build_catalog_signals(recommendable_courses),
            "advisorFocus": (
                "Оқушы болашақта қандай курс оқу керегін сұраса, AI платформадағы ашық/ақылы жарияланған курстарды және оқушының сұрағын қолданады."
            ),
        },
        "advisorPolicy": _build_advisor_policy(),
        "limits": {
            "maxPublicCoursesReturned": MAX_PUBLIC_COURSES_RETURNED,
            "closedCoursesExcluded": True,
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
    student_ids = _unique(_student_id_from_row(row) for row in enrollments)

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
    avg_progress_pct = _avg(per_student_progress)
    mini_quiz_avg = _avg(mini_quiz_scores)

    recommendations = _build_recommendations(
        progress_pct=int(avg_progress_pct or 0),
        mini_quiz_avg=mini_quiz_avg,
        weak_lessons=weak_lessons,
        review_later_count=len(review_later),
    )

    return {
        "kind": "course_learning_snapshot",
        "course": {
            "id": course_id,
            "title": _course_title(course),
            "subjectName": _course_subject_name(course),
            "gradeLevel": _course_grade_level(course),
            "description": _course_description(course, 500),
        },
        "totals": {
            "students": len(student_ids),
            "lessons": len(lesson_ids),
            "completedLessonRecords": len(completed_pairs),
            "avgProgressPct": avg_progress_pct,
            "miniQuizAttempts": len(mini_quiz_attempts),
            "miniQuizAvgScore": mini_quiz_avg,
            "miniQuizPassed": mini_quiz_passed,
            "miniQuizFailed": mini_quiz_failed,
            "miniQuizPassRatePct": _pct(mini_quiz_passed, len(mini_quiz_attempts)),
            "testAttempts": len(test_attempts),
            "testAvgScore": _avg(test_scores),
            "savedLessons": len(bookmarks),
            "reviewLaterItems": len(review_later),
        },
        "signals": _build_course_signals(
            avg_progress_pct=avg_progress_pct,
            mini_quiz_avg=mini_quiz_avg,
            weak_lessons=weak_lessons,
            review_later_count=len(review_later),
        ),
        "weakLessons": weak_lessons,
        "recommendations": recommendations,
        "assistantPolicy": _build_assistant_policy(),
        "limits": {
            "maxWeakLessonsReturned": MAX_WEAK_LESSONS_RETURNED,
            "maxRecommendationsReturned": MAX_RECOMMENDATIONS_RETURNED,
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
        "signals": _build_student_signals(
            progress_pct=progress_pct,
            mini_quiz_avg=mini_quiz_avg,
            weak_lessons=weak_lessons,
            review_later_count=len(review_later),
        ),
        "weakLessons": weak_lessons,
        "recommendations": recommendations,
        "teacherScopeNote": "Бұл дерек тек мұғалімнің өз курсындағы оқу нәтижелеріне негізделеді.",
        "assistantPolicy": _build_assistant_policy(),
        "limits": {
            "maxWeakLessonsReturned": MAX_WEAK_LESSONS_RETURNED,
            "maxRecommendationsReturned": MAX_RECOMMENDATIONS_RETURNED,
            "behaviorTrackingUsed": False,
        },
    }


def collect_teacher_course_creator_context(
    *,
    current_user_id: str,
) -> dict[str, Any]:
    profile = _load_profile(current_user_id)
    teacher_courses_raw = _load_teacher_courses(
        teacher_id=current_user_id,
    )
    teacher_course_ids = [
        _clean_text(course.get("id"), 140)
        for course in teacher_courses_raw
        if _clean_text(course.get("id"), 140)
    ]
    teacher_lessons = _load_lessons_for_courses(teacher_course_ids)
    public_courses = _load_public_course_catalog()

    compact_teacher_courses = [
        _compact_teacher_course(course)
        for course in teacher_courses_raw[:MAX_TEACHER_COURSES_RETURNED]
    ]

    compact_teacher_lessons = [
        {
            "id": _clean_text(lesson.get("id"), 140),
            "courseId": _course_id_from_row(lesson),
            "title": _lesson_title(lesson),
            "description": _clean_text(
                lesson.get("description") or lesson.get("summary"),
                500,
            ),
        }
        for lesson in teacher_lessons[:MAX_TEACHER_LESSONS_RETURNED]
    ]

    compact_public_courses = [
        _compact_public_course(course)
        for course in public_courses[:MAX_PUBLIC_COURSES_RETURNED]
    ]

    return {
        "kind": "teacher_course_creator_context",
        "teacher": {
            "id": current_user_id,
            "name": _profile_display_name(profile, current_user_id),
            "subjectName": _profile_subject_name(profile),
            "bio": _profile_bio(profile),
        },
        "teacherCourses": compact_teacher_courses,
        "teacherLessons": compact_teacher_lessons,
        "publicCourseCatalogSignals": compact_public_courses,
        "signals": _build_teacher_creator_signals(
            profile=profile,
            teacher_courses=teacher_courses_raw,
            teacher_lessons=teacher_lessons,
            public_courses=public_courses,
        ),
        "advisorPolicy": _build_advisor_policy(),
        "limits": {
            "maxTeacherCoursesReturned": MAX_TEACHER_COURSES_RETURNED,
            "maxTeacherLessonsReturned": MAX_TEACHER_LESSONS_RETURNED,
            "maxPublicCoursesReturned": MAX_PUBLIC_COURSES_RETURNED,
            "closedCoursesExcludedFromPublicCatalog": True,
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
        return await asyncio.to_thread(
            collect_student_learning_context,
            current_user_id=current_user_id,
        )

    if payload.mode == LearningAiMode.student_course_advisor:
        return await asyncio.to_thread(
            collect_student_course_advisor_context,
            current_user_id=current_user_id,
        )

    if payload.mode == LearningAiMode.teacher_course_assistant:
        if not scope or not scope.course_id:
            raise _http_error("courseId қажет.", 400)

        return await asyncio.to_thread(
            collect_course_learning_context,
            course_id=scope.course_id,
            current_user_id=current_user_id,
        )

    if payload.mode == LearningAiMode.teacher_course_creator_advisor:
        return await asyncio.to_thread(
            collect_teacher_course_creator_context,
            current_user_id=current_user_id,
        )

    if not scope or not scope.course_id or not scope.student_id:
        raise _http_error("courseId және studentId қажет.", 400)

    return await asyncio.to_thread(
        collect_teacher_student_learning_context,
        course_id=scope.course_id,
        student_id=scope.student_id,
        current_user_id=current_user_id,
    )