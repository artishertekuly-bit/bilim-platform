from __future__ import annotations

import logging
import os
from copy import deepcopy
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

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
ENV_FILE = ROOT_DIR / ".env"
if ENV_FILE.exists():
    load_dotenv(ENV_FILE)

logger = logging.getLogger("bilimcorp.ai.storage")

AI_EXAMS_TABLE = "ai_exams"
AI_ATTEMPTS_TABLE = "ai_exam_attempts"
AI_TUTOR_SESSIONS_TABLE = "ai_tutor_sessions"
AI_TUTOR_MESSAGES_TABLE = "ai_tutor_messages"

VALID_AI_EXAM_STATUSES = {"draft", "published", "archived"}
PUBLIC_AI_EXAM_STATUSES = {"published"}

# Do not persist client-provided system/developer messages. Storage is for user-visible tutor chat only.
VALID_TUTOR_ROLES = {"user", "assistant"}

MAX_TEXT_TITLE = 200
MAX_TEXT_SUBJECT = 120
MAX_TEXT_TOPIC = 200
MAX_TEXT_CONTEXT = 4000
MAX_TUTOR_MESSAGE_CHARS = 12000
MAX_TUTOR_MESSAGES_PER_BATCH = 20
MAX_STORED_EXAM_QUESTIONS = 80
MAX_STORED_ANSWERS = 120
MAX_STORED_JSON_CHARS = 250_000
MAX_PUBLIC_EXAMS_RETURNED = 200
MAX_USER_EXAMS_RETURNED = 500
MAX_ATTEMPTS_RETURNED = 200
MAX_TUTOR_SESSIONS_RETURNED = 300
MAX_TUTOR_MESSAGES_RETURNED = 500


def _utc_iso() -> str:
    return datetime.now(UTC).isoformat()


def _app_env() -> str:
    return (os.getenv("APP_ENV") or os.getenv("ENV") or "development").strip().lower()


def _is_local_like_env() -> bool:
    return _app_env() in {"local", "dev", "development", "test"}


def _is_truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _clean_text(value: Any, limit: int | None = None) -> str:
    text = " ".join(str(value or "").replace("\x00", " ").split()).strip()
    return text[:limit] if limit else text


def _is_uuid(value: Any) -> bool:
    text = _clean_text(value, 140)
    if not text:
        return False

    try:
        UUID(text)
        return True
    except (TypeError, ValueError):
        return False


def _require_uuid(value: Any, field_name: str) -> str:
    text = _clean_text(value, 140)
    if not _is_uuid(text):
        raise ValueError(f"{field_name} UUID форматында болуы керек")
    return text


def _safe_id(value: Any, fallback_prefix: str, limit: int = 120) -> str:
    """
    AI exam/session IDs in this project are string IDs such as draft-* or tutor-*.
    Keep them string-based but reject whitespace/control-heavy values.
    """
    text = _clean_text(value, limit)
    if not text:
        return f"{fallback_prefix}-{uuid4().hex}"

    allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-:")
    if any(ch not in allowed for ch in text):
        return f"{fallback_prefix}-{uuid4().hex}"

    return text


def _deep_clone(value: Any) -> Any:
    return deepcopy(value)


def _json_safe(value: Any, *, max_chars: int = MAX_STORED_JSON_CHARS) -> Any:
    """
    Supabase JSON columns should receive serializable, bounded payloads.
    If a payload is too large or not serializable, fail before DB insert.
    """
    cloned = _deep_clone(value)

    try:
        encoded = os.fsdecode(
            __import__("json").dumps(
                cloned,
                ensure_ascii=False,
                default=str,
                separators=(",", ":"),
            )
        )
    except Exception as exc:
        raise ValueError("JSON payload сақтау үшін жарамсыз") from exc

    if len(encoded) > max_chars:
        raise ValueError("JSON payload тым үлкен")

    return cloned


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


def _normalize_questions(questions: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []

    for index, row in enumerate((questions or [])[:MAX_STORED_EXAM_QUESTIONS], start=1):
        if not isinstance(row, dict):
            continue

        question = _clean_text(row.get("question") or row.get("questionText"), 4000)
        if not question:
            continue

        item = _deep_clone(row)
        item["id"] = _clean_text(item.get("id"), 120) or f"Q{index}"
        item["question"] = question
        normalized.append(item)

    return _json_safe(normalized)


def _normalize_answers(answers: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []

    for row in (answers or [])[:MAX_STORED_ANSWERS]:
        if not isinstance(row, dict):
            continue

        item = _deep_clone(row)
        if "answer" in item:
            item["answer"] = _clean_text(item.get("answer"), 8000)
        normalized.append(item)

    return _json_safe(normalized)


@lru_cache(maxsize=1)
def _get_supabase() -> SupabaseClient:
    url = (os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL") or "").strip()
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SECRET_KEY") or "").strip()

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
    if not filters:
        raise RuntimeError("Unscoped delete is disabled. Use _delete_all_rows_for_reset().")

    query = _get_supabase().table(table_name).delete()
    for key, value in filters.items():
        query = query.eq(key, value)
    query.execute()


def _delete_all_rows_for_reset(table_name: str) -> None:
    # Supabase/postgrest delete usually needs a filter; neq with a non-null id scopes all generated rows.
    _get_supabase().table(table_name).delete().neq("id", "__never__").execute()


def _normalize_exam_row(
    *,
    owner_id: str,
    exam: dict[str, Any],
    questions: list[dict[str, Any]] | None = None,
    test_import_payload: dict[str, Any] | None = None,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    clean_owner_id = _require_uuid(owner_id, "owner_id")

    now = _utc_iso()
    exam_id = _safe_id(exam.get("id"), "draft")
    created_at = _clean_text(exam.get("created_at"), 64) or now
    status_value = _normalize_status(exam.get("status"))
    published_at = _clean_text(exam.get("published_at"), 64) or None

    if status_value == "published" and not published_at:
        published_at = now

    duration_minutes = _to_positive_int_or_none(
        _pick_first(exam.get("duration_minutes"), exam.get("durationMinutes"))
    )
    question_count = _to_positive_int_or_none(
        _pick_first(exam.get("question_count"), exam.get("questionCount"))
    )
    normalized_questions = _normalize_questions(questions)

    return {
        "id": exam_id,
        "owner_id": clean_owner_id,
        "title": _clean_text(exam.get("title"), MAX_TEXT_TITLE) or "AI Exam",
        "subject": _clean_text(exam.get("subject"), MAX_TEXT_SUBJECT) or None,
        "topic": _clean_text(exam.get("topic"), MAX_TEXT_TOPIC) or None,
        "status": status_value,
        "duration_minutes": duration_minutes,
        "question_count": question_count if question_count is not None else len(normalized_questions),
        "questions": normalized_questions,
        "test_import_payload": _json_safe(test_import_payload or {}),
        "meta": _json_safe(meta or {}),
        "created_at": created_at,
        "updated_at": now,
        "published_at": published_at,
    }


def _exam_summary_from_row(row: dict[str, Any], *, include_owner: bool = True) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": row.get("id"),
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

    if include_owner:
        payload["owner_id"] = row.get("owner_id")

    return payload


def _clone_exam_record_from_row(row: dict[str, Any], *, include_owner: bool = True) -> dict[str, Any]:
    return {
        "exam": _deep_clone(_exam_summary_from_row(row, include_owner=include_owner)),
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

    stored = _select_one(AI_EXAMS_TABLE, filters={"id": row["id"], "owner_id": row["owner_id"]})
    if not stored:
        raise RuntimeError("AI exam сақталғаннан кейін табылмады")

    return _clone_exam_record_from_row(stored)


def list_ai_exams_for_user(owner_id: str) -> list[dict[str, Any]]:
    clean_owner_id = _require_uuid(owner_id, "owner_id")

    rows = _select_rows(
        AI_EXAMS_TABLE,
        filters={"owner_id": clean_owner_id},
        order_by="created_at",
        descending=True,
        limit=MAX_USER_EXAMS_RETURNED,
    )
    return [_deep_clone(_exam_summary_from_row(row, include_owner=True)) for row in rows]


def list_published_ai_exams() -> list[dict[str, Any]]:
    rows = _select_rows(
        AI_EXAMS_TABLE,
        filters={"status": "published"},
        order_by="published_at",
        descending=True,
        limit=MAX_PUBLIC_EXAMS_RETURNED,
    )
    return [_deep_clone(_exam_summary_from_row(row, include_owner=False)) for row in rows]


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
    clean_user_id = _require_uuid(user_id, "user_id")
    if not clean_exam_id:
        return None

    row = _select_one(AI_EXAMS_TABLE, filters={"id": clean_exam_id})
    if not row:
        return None

    if row.get("owner_id") == clean_user_id:
        return _clone_exam_record_from_row(row, include_owner=True)

    if allow_published_read and row.get("status") in PUBLIC_AI_EXAM_STATUSES:
        return _clone_exam_record_from_row(row, include_owner=False)

    return None


def update_ai_exam_status(
    *,
    exam_id: str,
    owner_id: str,
    status: str,
) -> dict[str, Any] | None:
    clean_exam_id = _clean_text(exam_id, 120)
    clean_owner_id = _require_uuid(owner_id, "owner_id")
    clean_status = _normalize_status(status)

    if not clean_exam_id:
        return None

    row = _select_one(AI_EXAMS_TABLE, filters={"id": clean_exam_id, "owner_id": clean_owner_id})
    if not row:
        return None

    now = _utc_iso()
    payload: dict[str, Any] = {
        "status": clean_status,
        "updated_at": now,
    }

    if clean_status == "published" and not row.get("published_at"):
        payload["published_at"] = now

    if clean_status != "published":
        payload["published_at"] = None

    _update_rows(
        AI_EXAMS_TABLE,
        filters={"id": clean_exam_id, "owner_id": clean_owner_id},
        payload=payload,
    )

    updated = _select_one(AI_EXAMS_TABLE, filters={"id": clean_exam_id, "owner_id": clean_owner_id})
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
    clean_user_id = _require_uuid(user_id, "user_id")

    if not clean_exam_id:
        raise ValueError("exam_id қажет")

    # Prevent attempts for missing or non-published exams.
    exam = _select_one(AI_EXAMS_TABLE, filters={"id": clean_exam_id})
    if not exam:
        raise ValueError("AI exam табылмады")
    if exam.get("status") != "published":
        raise ValueError("Жарияланбаған AI exam үшін attempt сақталмайды")

    now = _utc_iso()
    attempt_id = f"attempt-{uuid4().hex}"

    row = {
        "id": attempt_id,
        "exam_id": clean_exam_id,
        "user_id": clean_user_id,
        "answers": _normalize_answers(answers),
        "result": _json_safe(result or {}),
        "created_at": now,
        "updated_at": now,
        "submitted_at": now,
    }

    _insert_row(AI_ATTEMPTS_TABLE, row)

    stored = _select_one(AI_ATTEMPTS_TABLE, filters={"id": attempt_id, "user_id": clean_user_id})
    if not stored:
        raise RuntimeError("AI attempt сақталғаннан кейін табылмады")

    return _clone_attempt_from_row(stored)


def get_ai_exam_attempt_for_user(
    *,
    attempt_id: str,
    user_id: str,
) -> dict[str, Any] | None:
    clean_attempt_id = _clean_text(attempt_id, 120)
    clean_user_id = _require_uuid(user_id, "user_id")
    if not clean_attempt_id:
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
    clean_user_id = _require_uuid(user_id, "user_id")
    if not clean_exam_id:
        return []

    rows = _select_rows(
        AI_ATTEMPTS_TABLE,
        filters={
            "exam_id": clean_exam_id,
            "user_id": clean_user_id,
        },
        order_by="submitted_at",
        descending=True,
        limit=MAX_ATTEMPTS_RETURNED,
    )

    return [_clone_attempt_from_row(row) for row in rows]


def get_latest_ai_exam_attempt_for_user(
    *,
    exam_id: str,
    user_id: str,
) -> dict[str, Any] | None:
    clean_exam_id = _clean_text(exam_id, 120)
    clean_user_id = _require_uuid(user_id, "user_id")
    if not clean_exam_id:
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
    clean_user_id = _require_uuid(user_id, "user_id")

    session_id = f"tutor-{uuid4().hex}"
    now = _utc_iso()

    row = {
        "id": session_id,
        "user_id": clean_user_id,
        "title": _clean_text(title, MAX_TEXT_TITLE) or "AI Tutor Session",
        "lesson_id": _clean_text(lesson_id, 120) or None,
        "subject": _clean_text(subject, MAX_TEXT_SUBJECT) or None,
        "topic": _clean_text(topic, MAX_TEXT_TOPIC) or None,
        "initial_context": _clean_text(initial_context, MAX_TEXT_CONTEXT) or None,
        "created_at": now,
        "updated_at": now,
    }

    _insert_row(AI_TUTOR_SESSIONS_TABLE, row)

    stored = _select_one(AI_TUTOR_SESSIONS_TABLE, filters={"id": session_id, "user_id": clean_user_id})
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
    clean_user_id = _require_uuid(user_id, "user_id")
    if not clean_session_id:
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
    clean_user_id = _require_uuid(user_id, "user_id")

    rows = _select_rows(
        AI_TUTOR_SESSIONS_TABLE,
        filters={"user_id": clean_user_id},
        order_by="updated_at",
        descending=True,
        limit=MAX_TUTOR_SESSIONS_RETURNED,
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
    clean_user_id = _require_uuid(user_id, "user_id")
    if not clean_session_id:
        return []

    rows = _select_rows(
        AI_TUTOR_MESSAGES_TABLE,
        filters={
            "session_id": clean_session_id,
            "user_id": clean_user_id,
        },
        order_by="created_at",
        descending=False,
        limit=MAX_TUTOR_MESSAGES_RETURNED,
    )

    return [
        {
            "id": row.get("id"),
            "role": row.get("role"),
            "content": row.get("content"),
            "created_at": row.get("created_at"),
        }
        for row in rows
        if row.get("role") in VALID_TUTOR_ROLES
    ]


def append_tutor_message(
    *,
    session_id: str,
    user_id: str,
    role: str,
    content: str,
) -> dict[str, Any]:
    clean_session_id = _clean_text(session_id, 120)
    clean_user_id = _require_uuid(user_id, "user_id")
    clean_role = _clean_text(role, 20).lower()
    message_content = _clean_text(content, MAX_TUTOR_MESSAGE_CHARS)

    if not clean_session_id:
        raise ValueError("session_id қажет")
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
    clean_user_id = _require_uuid(user_id, "user_id")

    if not clean_session_id:
        raise ValueError("session_id қажет")

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

    for row in messages[:MAX_TUTOR_MESSAGES_PER_BATCH]:
        if not isinstance(row, dict):
            continue

        clean_role = _clean_text(row.get("role", "user"), 20).lower()
        clean_content = _clean_text(row.get("content", ""), MAX_TUTOR_MESSAGE_CHARS)

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
    """
    Dangerous helper for local/dev/test only.
    Never run global wipe in production or staging.
    """
    if not _is_truthy(os.getenv("ALLOW_AI_STORAGE_RESET")):
        return

    if not _is_local_like_env():
        logger.warning("AI storage reset ignored outside local/dev/test. env=%s", _app_env())
        return

    _delete_all_rows_for_reset(AI_TUTOR_MESSAGES_TABLE)
    _delete_all_rows_for_reset(AI_TUTOR_SESSIONS_TABLE)
    _delete_all_rows_for_reset(AI_ATTEMPTS_TABLE)
    _delete_all_rows_for_reset(AI_EXAMS_TABLE)
