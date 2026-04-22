from __future__ import annotations

import os
from copy import deepcopy
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from dotenv import load_dotenv

if TYPE_CHECKING:
    from supabase import Client as SupabaseClient
else:
    SupabaseClient = Any

try:
    from supabase import create_client
except Exception:  # pragma: no cover
    create_client = None  # type: ignore


ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")

AI_EXAMS_TABLE = "ai_exams"
AI_ATTEMPTS_TABLE = "ai_exam_attempts"
AI_TUTOR_SESSIONS_TABLE = "ai_tutor_sessions"
AI_TUTOR_MESSAGES_TABLE = "ai_tutor_messages"

VALID_AI_EXAM_STATUSES = {"draft", "published", "archived"}
VALID_TUTOR_ROLES = {"user", "assistant", "system"}


def _utc_iso() -> str:
    return datetime.now(UTC).isoformat()


def _clean_text(value: Any, limit: int | None = None) -> str:
    text = " ".join(str(value or "").replace("\x00", " ").split())
    return text[:limit] if limit else text


def _deep_clone(value: Any) -> Any:
    return deepcopy(value)


def _normalize_status(status: Any) -> str:
    normalized = _clean_text(status or "draft", 20).lower() or "draft"
    if normalized not in VALID_AI_EXAM_STATUSES:
        return "draft"
    return normalized


def _pick_first(*values: Any) -> Any:
    for value in values:
        if value is not None:
            return value
    return None


def _to_positive_int_or_none(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


@lru_cache(maxsize=1)
def _get_supabase() -> SupabaseClient:
    url = (
        os.getenv("SUPABASE_URL")
        or os.getenv("VITE_SUPABASE_URL")
        or ""
    ).strip()
    key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_SECRET_KEY")
        or ""
    ).strip()

    if not url:
        raise RuntimeError("SUPABASE_URL немесе VITE_SUPABASE_URL табылмады")
    if not key:
        raise RuntimeError("Backend үшін SUPABASE_SERVICE_ROLE_KEY қажет")
    if create_client is None:
        raise RuntimeError("supabase пакеті орнатылмаған. backend requirements-ке supabase қосыңыз")

    return create_client(url, key)


def _rows_from_response(response: Any) -> list[dict[str, Any]]:
    data = getattr(response, "data", None)
    if data is None:
        return []
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    if isinstance(data, dict):
        return [data]
    return []


def _select_rows(
    table_name: str,
    *,
    filters: dict[str, Any] | None = None,
    order_by: str | None = None,
    descending: bool = False,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    query = _get_supabase().table(table_name).select("*")

    for key, value in (filters or {}).items():
        query = query.eq(key, value)

    if order_by:
        query = query.order(order_by, desc=descending)

    if limit is not None:
        query = query.limit(limit)

    response = query.execute()
    return _rows_from_response(response)


def _select_one(
    table_name: str,
    *,
    filters: dict[str, Any],
) -> dict[str, Any] | None:
    rows = _select_rows(table_name, filters=filters, limit=1)
    return rows[0] if rows else None


def _insert_row(table_name: str, payload: dict[str, Any]) -> None:
    _get_supabase().table(table_name).insert(payload).execute()


def _insert_rows(table_name: str, payloads: list[dict[str, Any]]) -> None:
    if not payloads:
        return
    _get_supabase().table(table_name).insert(payloads).execute()


def _update_rows(
    table_name: str,
    *,
    filters: dict[str, Any],
    payload: dict[str, Any],
) -> None:
    query = _get_supabase().table(table_name).update(payload)
    for key, value in filters.items():
        query = query.eq(key, value)
    query.execute()


def _delete_rows(
    table_name: str,
    *,
    filters: dict[str, Any] | None = None,
) -> None:
    query = _get_supabase().table(table_name).delete()
    for key, value in (filters or {}).items():
        query = query.eq(key, value)
    query.execute()


def _normalize_exam_row(
    *,
    owner_id: str,
    exam: dict[str, Any],
    questions: list[dict[str, Any]] | None = None,
    test_import_payload: dict[str, Any] | None = None,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    clean_owner_id = _clean_text(owner_id, 120)
    if not clean_owner_id:
        raise ValueError("owner_id қажет")

    now = _utc_iso()
    exam_id = _clean_text(exam.get("id"), 120) or f"draft-{uuid4().hex}"
    created_at = _clean_text(exam.get("created_at"), 64) or now
    status = _normalize_status(exam.get("status"))
    published_at = _clean_text(exam.get("published_at"), 64) or None

    if status == "published" and not published_at:
        published_at = now

    duration_minutes = _to_positive_int_or_none(
        _pick_first(exam.get("duration_minutes"), exam.get("durationMinutes"))
    )
    question_count = _to_positive_int_or_none(
        _pick_first(exam.get("question_count"), exam.get("questionCount"))
    )
    normalized_questions = _deep_clone(questions or [])

    return {
        "id": exam_id,
        "owner_id": clean_owner_id,
        "title": _clean_text(exam.get("title"), 200) or "AI Exam",
        "subject": _clean_text(exam.get("subject"), 120) or None,
        "topic": _clean_text(exam.get("topic"), 200) or None,
        "status": status,
        "duration_minutes": duration_minutes,
        "question_count": question_count if question_count is not None else len(normalized_questions),
        "questions": normalized_questions,
        "test_import_payload": _deep_clone(test_import_payload or {}),
        "meta": _deep_clone(meta or {}),
        "created_at": created_at,
        "updated_at": now,
        "published_at": published_at,
    }


def _exam_summary_from_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "owner_id": row.get("owner_id"),
        "title": row.get("title"),
        "subject": row.get("subject"),
        "topic": row.get("topic"),
        "status": row.get("status"),
        "duration_minutes": row.get("duration_minutes"),
        "question_count": row.get("question_count"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "published_at": row.get("published_at"),
    }


def _clone_exam_record_from_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "exam": _deep_clone(_exam_summary_from_row(row)),
        "questions": _deep_clone(row.get("questions") or []),
        "test_import_payload": _deep_clone(row.get("test_import_payload") or {}),
        "meta": _deep_clone(row.get("meta") or {}),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _clone_attempt_from_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "exam_id": row.get("exam_id"),
        "user_id": row.get("user_id"),
        "answers": _deep_clone(row.get("answers") or []),
        "result": _deep_clone(row.get("result") or {}),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "submitted_at": row.get("submitted_at"),
    }


def _clone_tutor_session_from_row(
    row: dict[str, Any],
    messages: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "user_id": row.get("user_id"),
        "title": row.get("title"),
        "lesson_id": row.get("lesson_id"),
        "subject": row.get("subject"),
        "topic": row.get("topic"),
        "initial_context": row.get("initial_context"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "messages": _deep_clone(messages or []),
    }


# -----------------------------
# AI EXAMS
# -----------------------------
def create_ai_exam_record(
    *,
    owner_id: str,
    exam: dict[str, Any],
    questions: list[dict[str, Any]] | None = None,
    test_import_payload: dict[str, Any] | None = None,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    row = _normalize_exam_row(
        owner_id=owner_id,
        exam=exam,
        questions=questions,
        test_import_payload=test_import_payload,
        meta=meta,
    )

    _insert_row(AI_EXAMS_TABLE, row)

    stored = _select_one(AI_EXAMS_TABLE, filters={"id": row["id"]})
    if not stored:
        raise RuntimeError("AI exam сақталғаннан кейін табылмады")

    return _clone_exam_record_from_row(stored)


def list_ai_exams_for_user(owner_id: str) -> list[dict[str, Any]]:
    clean_owner_id = _clean_text(owner_id, 120)
    if not clean_owner_id:
        return []

    rows = _select_rows(
        AI_EXAMS_TABLE,
        filters={"owner_id": clean_owner_id},
        order_by="created_at",
        descending=True,
    )
    return [_deep_clone(_exam_summary_from_row(row)) for row in rows]


def list_published_ai_exams() -> list[dict[str, Any]]:
    rows = _select_rows(
        AI_EXAMS_TABLE,
        filters={"status": "published"},
        order_by="published_at",
        descending=True,
    )
    return [_deep_clone(_exam_summary_from_row(row)) for row in rows]


def get_ai_exam_record(exam_id: str) -> dict[str, Any] | None:
    clean_exam_id = _clean_text(exam_id, 120)
    if not clean_exam_id:
        return None

    row = _select_one(AI_EXAMS_TABLE, filters={"id": clean_exam_id})
    if not row:
        return None
    return _clone_exam_record_from_row(row)


def get_ai_exam_for_user(
    *,
    exam_id: str,
    user_id: str,
    allow_published_read: bool = True,
) -> dict[str, Any] | None:
    clean_exam_id = _clean_text(exam_id, 120)
    clean_user_id = _clean_text(user_id, 120)
    if not clean_exam_id or not clean_user_id:
        return None

    row = _select_one(AI_EXAMS_TABLE, filters={"id": clean_exam_id})
    if not row:
        return None

    if row.get("owner_id") == clean_user_id:
        return _clone_exam_record_from_row(row)

    if allow_published_read and row.get("status") == "published":
        return _clone_exam_record_from_row(row)

    return None


def update_ai_exam_status(
    *,
    exam_id: str,
    owner_id: str,
    status: str,
) -> dict[str, Any] | None:
    clean_exam_id = _clean_text(exam_id, 120)
    clean_owner_id = _clean_text(owner_id, 120)
    clean_status = _normalize_status(status)

    if not clean_exam_id or not clean_owner_id:
        return None

    row = _select_one(AI_EXAMS_TABLE, filters={"id": clean_exam_id})
    if not row:
        return None
    if row.get("owner_id") != clean_owner_id:
        return None

    now = _utc_iso()
    payload: dict[str, Any] = {
        "status": clean_status,
        "updated_at": now,
    }

    if clean_status == "published" and not row.get("published_at"):
        payload["published_at"] = now

    _update_rows(
        AI_EXAMS_TABLE,
        filters={"id": clean_exam_id, "owner_id": clean_owner_id},
        payload=payload,
    )

    updated = _select_one(AI_EXAMS_TABLE, filters={"id": clean_exam_id})
    if not updated:
        return None

    return _clone_exam_record_from_row(updated)


def get_ai_exam_questions(exam_id: str) -> list[dict[str, Any]]:
    clean_exam_id = _clean_text(exam_id, 120)
    if not clean_exam_id:
        return []

    row = _select_one(AI_EXAMS_TABLE, filters={"id": clean_exam_id})
    if not row:
        return []
    return _deep_clone(row.get("questions") or [])


def get_ai_exam_import_payload(exam_id: str) -> dict[str, Any]:
    clean_exam_id = _clean_text(exam_id, 120)
    if not clean_exam_id:
        return {}

    row = _select_one(AI_EXAMS_TABLE, filters={"id": clean_exam_id})
    if not row:
        return {}
    return _deep_clone(row.get("test_import_payload") or {})


# -----------------------------
# AI ATTEMPTS
# -----------------------------
def create_ai_exam_attempt(
    *,
    exam_id: str,
    user_id: str,
    answers: list[dict[str, Any]] | None = None,
    result: dict[str, Any] | None = None,
) -> dict[str, Any]:
    clean_exam_id = _clean_text(exam_id, 120)
    clean_user_id = _clean_text(user_id, 120)

    if not clean_exam_id:
        raise ValueError("exam_id қажет")
    if not clean_user_id:
        raise ValueError("user_id қажет")

    now = _utc_iso()
    attempt_id = f"attempt-{uuid4().hex}"

    row = {
        "id": attempt_id,
        "exam_id": clean_exam_id,
        "user_id": clean_user_id,
        "answers": _deep_clone(answers or []),
        "result": _deep_clone(result or {}),
        "created_at": now,
        "updated_at": now,
        "submitted_at": now,
    }

    _insert_row(AI_ATTEMPTS_TABLE, row)

    stored = _select_one(AI_ATTEMPTS_TABLE, filters={"id": attempt_id})
    if not stored:
        raise RuntimeError("AI attempt сақталғаннан кейін табылмады")

    return _clone_attempt_from_row(stored)


def get_ai_exam_attempt_for_user(
    *,
    attempt_id: str,
    user_id: str,
) -> dict[str, Any] | None:
    clean_attempt_id = _clean_text(attempt_id, 120)
    clean_user_id = _clean_text(user_id, 120)
    if not clean_attempt_id or not clean_user_id:
        return None

    row = _select_one(
        AI_ATTEMPTS_TABLE,
        filters={
            "id": clean_attempt_id,
            "user_id": clean_user_id,
        },
    )
    if not row:
        return None

    return _clone_attempt_from_row(row)


def list_ai_exam_attempts_for_user(
    *,
    exam_id: str,
    user_id: str,
) -> list[dict[str, Any]]:
    clean_exam_id = _clean_text(exam_id, 120)
    clean_user_id = _clean_text(user_id, 120)
    if not clean_exam_id or not clean_user_id:
        return []

    rows = _select_rows(
        AI_ATTEMPTS_TABLE,
        filters={
            "exam_id": clean_exam_id,
            "user_id": clean_user_id,
        },
        order_by="submitted_at",
        descending=True,
    )

    return [_clone_attempt_from_row(row) for row in rows]


def get_latest_ai_exam_attempt_for_user(
    *,
    exam_id: str,
    user_id: str,
) -> dict[str, Any] | None:
    clean_exam_id = _clean_text(exam_id, 120)
    clean_user_id = _clean_text(user_id, 120)
    if not clean_exam_id or not clean_user_id:
        return None

    rows = _select_rows(
        AI_ATTEMPTS_TABLE,
        filters={
            "exam_id": clean_exam_id,
            "user_id": clean_user_id,
        },
        order_by="submitted_at",
        descending=True,
        limit=1,
    )
    if not rows:
        return None
    return _clone_attempt_from_row(rows[0])


# -----------------------------
# TUTOR SESSIONS
# -----------------------------
def create_tutor_session_record(
    *,
    user_id: str,
    title: str,
    lesson_id: str | None = None,
    subject: str | None = None,
    topic: str | None = None,
    initial_context: str | None = None,
) -> dict[str, Any]:
    clean_user_id = _clean_text(user_id, 120)
    if not clean_user_id:
        raise ValueError("user_id қажет")

    session_id = f"tutor-{uuid4().hex}"
    now = _utc_iso()

    row = {
        "id": session_id,
        "user_id": clean_user_id,
        "title": _clean_text(title, 200) or "AI Tutor Session",
        "lesson_id": _clean_text(lesson_id, 120) or None,
        "subject": _clean_text(subject, 120) or None,
        "topic": _clean_text(topic, 200) or None,
        "initial_context": _clean_text(initial_context, 4000) or None,
        "created_at": now,
        "updated_at": now,
    }

    _insert_row(AI_TUTOR_SESSIONS_TABLE, row)

    stored = _select_one(AI_TUTOR_SESSIONS_TABLE, filters={"id": session_id})
    if not stored:
        raise RuntimeError("Tutor session сақталғаннан кейін табылмады")

    return _clone_tutor_session_from_row(stored, messages=[])


def get_tutor_session_record(session_id: str) -> dict[str, Any] | None:
    clean_session_id = _clean_text(session_id, 120)
    if not clean_session_id:
        return None

    row = _select_one(AI_TUTOR_SESSIONS_TABLE, filters={"id": clean_session_id})
    if not row:
        return None

    messages = list_tutor_messages(
        session_id=clean_session_id,
        user_id=_clean_text(row.get("user_id"), 120),
    )
    return _clone_tutor_session_from_row(row, messages=messages)


def get_tutor_session_for_user(
    *,
    session_id: str,
    user_id: str,
) -> dict[str, Any] | None:
    clean_session_id = _clean_text(session_id, 120)
    clean_user_id = _clean_text(user_id, 120)
    if not clean_session_id or not clean_user_id:
        return None

    row = _select_one(
        AI_TUTOR_SESSIONS_TABLE,
        filters={
            "id": clean_session_id,
            "user_id": clean_user_id,
        },
    )
    if not row:
        return None

    messages = list_tutor_messages(session_id=clean_session_id, user_id=clean_user_id)
    return _clone_tutor_session_from_row(row, messages=messages)


def list_tutor_sessions_for_user(user_id: str) -> list[dict[str, Any]]:
    clean_user_id = _clean_text(user_id, 120)
    if not clean_user_id:
        return []

    rows = _select_rows(
        AI_TUTOR_SESSIONS_TABLE,
        filters={"user_id": clean_user_id},
        order_by="updated_at",
        descending=True,
    )

    return [
        {
            "id": row.get("id"),
            "title": row.get("title"),
            "lesson_id": row.get("lesson_id"),
            "subject": row.get("subject"),
            "topic": row.get("topic"),
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
        }
        for row in rows
    ]


def list_tutor_messages(
    *,
    session_id: str,
    user_id: str,
) -> list[dict[str, Any]]:
    clean_session_id = _clean_text(session_id, 120)
    clean_user_id = _clean_text(user_id, 120)
    if not clean_session_id or not clean_user_id:
        return []

    rows = _select_rows(
        AI_TUTOR_MESSAGES_TABLE,
        filters={
            "session_id": clean_session_id,
            "user_id": clean_user_id,
        },
        order_by="created_at",
        descending=False,
    )

    return [
        {
            "id": row.get("id"),
            "role": row.get("role"),
            "content": row.get("content"),
            "created_at": row.get("created_at"),
        }
        for row in rows
    ]


def append_tutor_message(
    *,
    session_id: str,
    user_id: str,
    role: str,
    content: str,
) -> dict[str, Any]:
    clean_session_id = _clean_text(session_id, 120)
    clean_user_id = _clean_text(user_id, 120)
    clean_role = _clean_text(role, 20).lower()
    message_content = _clean_text(content, 12000)

    if not clean_session_id:
        raise ValueError("session_id қажет")
    if not clean_user_id:
        raise ValueError("user_id қажет")
    if clean_role not in VALID_TUTOR_ROLES:
        raise ValueError("Tutor role дұрыс емес")
    if not message_content:
        raise ValueError("Tutor хабарламасы бос болмауы керек")

    session = _select_one(
        AI_TUTOR_SESSIONS_TABLE,
        filters={
            "id": clean_session_id,
            "user_id": clean_user_id,
        },
    )
    if not session:
        raise ValueError("Tutor session табылмады")

    message_id = f"{clean_role}-{uuid4().hex}"
    now = _utc_iso()

    row = {
        "id": message_id,
        "session_id": clean_session_id,
        "user_id": clean_user_id,
        "role": clean_role,
        "content": message_content,
        "created_at": now,
    }

    _insert_row(AI_TUTOR_MESSAGES_TABLE, row)
    _update_rows(
        AI_TUTOR_SESSIONS_TABLE,
        filters={"id": clean_session_id, "user_id": clean_user_id},
        payload={"updated_at": now},
    )

    return {
        "id": message_id,
        "role": clean_role,
        "content": message_content,
        "created_at": now,
    }


def append_tutor_message_batch(
    *,
    session_id: str,
    user_id: str,
    messages: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    clean_session_id = _clean_text(session_id, 120)
    clean_user_id = _clean_text(user_id, 120)

    if not clean_session_id:
        raise ValueError("session_id қажет")
    if not clean_user_id:
        raise ValueError("user_id қажет")

    session = _select_one(
        AI_TUTOR_SESSIONS_TABLE,
        filters={
            "id": clean_session_id,
            "user_id": clean_user_id,
        },
    )
    if not session:
        raise ValueError("Tutor session табылмады")

    now = _utc_iso()
    payloads: list[dict[str, Any]] = []
    created: list[dict[str, Any]] = []

    for row in messages:
        if not isinstance(row, dict):
            continue

        clean_role = _clean_text(row.get("role", "user"), 20).lower()
        clean_content = _clean_text(row.get("content", ""), 12000)

        if clean_role not in VALID_TUTOR_ROLES or not clean_content:
            continue

        message_id = f"{clean_role}-{uuid4().hex}"
        payload = {
            "id": message_id,
            "session_id": clean_session_id,
            "user_id": clean_user_id,
            "role": clean_role,
            "content": clean_content,
            "created_at": now,
        }
        payloads.append(payload)
        created.append(
            {
                "id": message_id,
                "role": clean_role,
                "content": clean_content,
                "created_at": now,
            }
        )

    if payloads:
        _insert_rows(AI_TUTOR_MESSAGES_TABLE, payloads)
        _update_rows(
            AI_TUTOR_SESSIONS_TABLE,
            filters={"id": clean_session_id, "user_id": clean_user_id},
            payload={"updated_at": now},
        )

    return created


# -----------------------------
# DEBUG / RESET
# -----------------------------
def reset_ai_memory_store() -> None:
    if os.getenv("ALLOW_AI_STORAGE_RESET", "").strip().lower() != "true":
        return

    _delete_rows(AI_TUTOR_MESSAGES_TABLE)
    _delete_rows(AI_TUTOR_SESSIONS_TABLE)
    _delete_rows(AI_ATTEMPTS_TABLE)
    _delete_rows(AI_EXAMS_TABLE)