from __future__ import annotations

import logging
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from supabase import Client, create_client

from .ai_adapter import (
    evaluate_answer_for_bilimcorp,
    generate_questions_for_bilimcorp,
    generate_test_draft_for_bilimcorp,
    tutor_reply_for_bilimcorp,
)
from .ai_storage import (
    append_tutor_message_batch,
    create_ai_exam_attempt,
    create_ai_exam_record,
    create_tutor_session_record,
    get_ai_exam_for_user,
    get_ai_exam_questions,
    get_latest_ai_exam_attempt_for_user,
    get_tutor_session_for_user,
    list_ai_exam_attempts_for_user,
    list_ai_exams_for_user,
    list_published_ai_exams,
    list_tutor_messages,
    update_ai_exam_status,
)

ROOT_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT_DIR / ".env"

logger = logging.getLogger("bilimcorp.ai.bridge")
logging.basicConfig(level=logging.INFO)

AI_EXAM_STATUSES = {"draft", "published", "archived"}


def _load_environment() -> None:
    if ENV_FILE.exists():
        load_dotenv(ENV_FILE)


def _is_truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


_load_environment()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()
APP_ENV = os.getenv("APP_ENV", os.getenv("ENV", "development")).strip().lower()
ALLOW_DEBUG_USER_ID_FALLBACK = _is_truthy(
    os.getenv("ALLOW_DEBUG_USER_ID_FALLBACK", "false")
)
DEBUG_USER_ID_FALLBACK_ENABLED = ALLOW_DEBUG_USER_ID_FALLBACK and APP_ENV in {
    "local",
    "dev",
    "development",
    "test",
}

app = FastAPI(
    title="Bilimcorp AI Bridge",
    version="1.6.0",
)


def _build_allowed_origins() -> list[str]:
    configured = [
        origin.strip()
        for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
        if origin.strip()
    ]
    if configured:
        return configured

    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_build_allowed_origins(),
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_supabase_auth_client: Client | None = None


def _utc_iso() -> str:
    return datetime.now(UTC).isoformat()


def _clean_text(value: Any, limit: int | None = None) -> str:
    text = " ".join(str(value or "").replace("\x00", " ").split())
    return text[:limit] if limit else text


def _http_error(message: str, status_code: int = 400) -> HTTPException:
    return HTTPException(status_code=status_code, detail=message)


def _get_supabase_auth_client() -> Client:
    global _supabase_auth_client

    if _supabase_auth_client is not None:
        return _supabase_auth_client

    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise _http_error(
            "Supabase auth конфигурациясы табылмады. SUPABASE_URL және SUPABASE_ANON_KEY қажет.",
            500,
        )

    _supabase_auth_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    return _supabase_auth_client


def _extract_bearer_token(authorization: str | None) -> str:
    auth_value = _clean_text(authorization, 4000)
    if not auth_value:
        raise _http_error("Authorization header қажет", 401)

    scheme, _, token = auth_value.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _http_error("Authorization Bearer token форматында болуы керек", 401)

    return token.strip()


def _resolve_user_id_from_bearer_token(token: str) -> str:
    try:
        supabase = _get_supabase_auth_client()
        user_response = supabase.auth.get_user(token)
    except HTTPException:
        raise
    except Exception:
        logger.exception("supabase auth get_user failed")
        raise _http_error(
            "Пайдаланушы токенін тексеру кезінде серверлік қате пайда болды",
            500,
        )

    user = getattr(user_response, "user", None)
    user_id = _clean_text(getattr(user, "id", None), 120)

    if not user_id:
        raise _http_error("Жарамсыз немесе мерзімі өткен токен", 401)

    return user_id


def get_current_user_id(
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> str:
    if authorization:
        token = _extract_bearer_token(authorization)
        return _resolve_user_id_from_bearer_token(token)

    if DEBUG_USER_ID_FALLBACK_ENABLED:
        debug_user_id = _clean_text(x_user_id, 120)
        if debug_user_id:
            logger.warning(
                "Using insecure debug X-User-Id fallback for user_id=%s in env=%s",
                debug_user_id,
                APP_ENV,
            )
            return debug_user_id

    raise _http_error("Авторизация қажет", 401)


def _public_tutor_session(session: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": session["id"],
        "title": session.get("title"),
        "lesson_id": session.get("lesson_id"),
        "subject": session.get("subject"),
        "topic": session.get("topic"),
        "created_at": session.get("created_at"),
    }


def _public_attempt(attempt: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": attempt.get("id"),
        "exam_id": attempt.get("exam_id"),
        "user_id": attempt.get("user_id"),
        "answers": attempt.get("answers") or [],
        "result": attempt.get("result") or {},
        "created_at": attempt.get("created_at"),
        "updated_at": attempt.get("updated_at"),
        "submitted_at": attempt.get("submitted_at"),
    }


def _normalize_context(
    payload_context: Any,
    session: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if isinstance(payload_context, dict):
        context = dict(payload_context)
    elif isinstance(payload_context, str) and payload_context.strip():
        context = {"passage": payload_context.strip()}
    else:
        context = {}

    if not session:
        return context

    if session.get("lesson_id") and not context.get("lesson_id"):
        context["lesson_id"] = session["lesson_id"]
    if session.get("subject") and not context.get("subject"):
        context["subject"] = session["subject"]
    if session.get("topic") and not context.get("topic"):
        context["topic"] = session["topic"]
    if session.get("initial_context") and not context.get("passage"):
        context["passage"] = session["initial_context"]

    return context


def _normalize_mapped_evaluation_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "question": payload.get("question"),
        "student_answer": payload.get("student_answer") or payload.get("studentAnswer"),
        "expected_answer": payload.get("expected_answer") or payload.get("expectedAnswer"),
        "reference_answer": payload.get("reference_answer") or payload.get("referenceAnswer"),
        "context": payload.get("context"),
        "options": payload.get("options") or [],
        "answer_format": payload.get("answer_format") or payload.get("answerFormat"),
    }


def _extract_answer_value(answer_row: dict[str, Any]) -> str:
    user_answer = (
        answer_row.get("answer")
        or answer_row.get("answerText")
        or answer_row.get("answer_text")
        or answer_row.get("value")
    )

    if isinstance(user_answer, list):
        cleaned_items = []
        for item in user_answer:
            cleaned = _clean_text(item, 300)
            if cleaned:
                cleaned_items.append(cleaned)
        return ", ".join(cleaned_items)

    return _clean_text(user_answer, 4000)


@app.get("/")
def root():
    return {
        "ok": True,
        "service": "bilimcorp-ai-bridge",
        "docs": "/docs",
    }


@app.get("/health")
def healthcheck():
    return {
        "ok": True,
        "service": "bilimcorp-ai-bridge",
        "env": APP_ENV,
        "env_file_present": ENV_FILE.exists(),
        "allowed_origins": _build_allowed_origins(),
        "supabase_auth_configured": bool(SUPABASE_URL and SUPABASE_ANON_KEY),
        "debug_user_id_fallback": DEBUG_USER_ID_FALLBACK_ENABLED,
        "debug_user_id_fallback_configured": ALLOW_DEBUG_USER_ID_FALLBACK,
    }


@app.get("/healthz")
def healthcheck_alias():
    return healthcheck()


@app.post("/api/ai/generate-questions")
def api_generate_questions(
    payload: dict[str, Any],
    user_id: str = Depends(get_current_user_id),
):
    _ = user_id

    try:
        return generate_questions_for_bilimcorp(payload)
    except ValueError as exc:
        raise _http_error(str(exc), 400)
    except Exception:
        logger.exception("generate_questions failed")
        raise _http_error("Сұрақ генерациясында серверлік қате пайда болды", 500)


@app.post("/api/ai/evaluate-answer")
def api_evaluate_answer(
    payload: dict[str, Any],
    user_id: str = Depends(get_current_user_id),
):
    _ = user_id

    try:
        return evaluate_answer_for_bilimcorp(
            _normalize_mapped_evaluation_payload(payload)
        )
    except ValueError as exc:
        raise _http_error(str(exc), 400)
    except Exception:
        logger.exception("evaluate_answer failed")
        raise _http_error("Жауапты тексеруде серверлік қате пайда болды", 500)


@app.post("/api/ai/tutor/session")
def api_create_tutor_session(
    payload: dict[str, Any],
    user_id: str = Depends(get_current_user_id),
):
    topic = _clean_text(payload.get("topic"), 200)
    subject = _clean_text(payload.get("subject"), 120)
    lesson_id = _clean_text(payload.get("lesson_id") or payload.get("lessonId"), 120)
    initial_context = _clean_text(
        payload.get("initial_context") or payload.get("initialContext"),
        4000,
    )

    title = topic or subject or "AI Tutor Session"

    try:
        session = create_tutor_session_record(
            user_id=user_id,
            title=title,
            lesson_id=lesson_id or None,
            subject=subject or None,
            topic=topic or None,
            initial_context=initial_context or None,
        )
    except Exception:
        logger.exception("create_tutor_session failed")
        raise _http_error(
            "Tutor session құру кезінде серверлік қате пайда болды",
            500,
        )

    return {
        "session": _public_tutor_session(session),
        "messages": [],
    }


@app.post("/api/ai/tutor/chat")
def api_tutor_chat(
    payload: dict[str, Any],
    user_id: str = Depends(get_current_user_id),
):
    session_id = _clean_text(payload.get("session_id") or payload.get("sessionId"), 120)
    message = _clean_text(payload.get("message"), 4000)

    if not session_id:
        raise _http_error("Tutor session_id қажет", 400)
    if not message:
        raise _http_error("Tutor хабарламасы бос болмауы керек", 400)

    session = get_tutor_session_for_user(session_id=session_id, user_id=user_id)
    if not session:
        raise _http_error("Tutor session табылмады", 404)

    session_messages = list_tutor_messages(session_id=session_id, user_id=user_id)
    history = [
        {"role": row.get("role", "user"), "content": row.get("content", "")}
        for row in session_messages[-8:]
    ]

    context = _normalize_context(payload.get("context"), session)

    try:
        tutor_result = tutor_reply_for_bilimcorp(
            {
                "message": message,
                "context": context,
                "history": history,
            }
        )

        reply = tutor_result.get("reply") or {}
        reply_content = _clean_text(reply.get("content"), 12000)
        if not reply_content:
            raise _http_error("Tutor бос жауап қайтарды", 502)

        append_tutor_message_batch(
            session_id=session_id,
            user_id=user_id,
            messages=[
                {"role": "user", "content": message},
                {"role": "assistant", "content": reply_content},
            ],
        )
    except HTTPException:
        raise
    except ValueError as exc:
        raise _http_error(str(exc), 400)
    except Exception:
        logger.exception("tutor_chat failed")
        raise _http_error("Tutor чатында серверлік қате пайда болды", 500)

    fresh_messages = list_tutor_messages(session_id=session_id, user_id=user_id)

    return {
        "session_id": session_id,
        "reply": {
            "id": reply.get("id"),
            "role": "assistant",
            "content": reply_content,
            "created_at": reply.get("created_at") or _utc_iso(),
        },
        "messages": fresh_messages,
        "used_model": tutor_result.get("used_model", "fallback"),
        "fallback": bool(tutor_result.get("fallback")),
    }


@app.post("/api/ai/exams")
def api_create_ai_exam(
    payload: dict[str, Any],
    user_id: str = Depends(get_current_user_id),
):
    mapped_payload = {
        "title": payload.get("title"),
        "source_text": payload.get("source_text") or payload.get("sourceText"),
        "subject": payload.get("subject"),
        "topic": payload.get("topic"),
        "difficulty": payload.get("difficulty"),
        "kind": payload.get("kind"),
        "exam_mode": payload.get("exam_mode") or payload.get("examMode"),
        "question_count": payload.get("question_count") or payload.get("questionCount"),
        "duration_minutes": payload.get("duration_minutes")
        or payload.get("durationMinutes"),
    }

    try:
        result = generate_test_draft_for_bilimcorp(mapped_payload)
        stored = create_ai_exam_record(
            owner_id=user_id,
            exam={
                **result["exam"],
                "status": "draft",
            },
            questions=result.get("questions") or [],
            test_import_payload=result.get("test_import_payload") or {},
            meta=result.get("meta") or {},
        )
    except ValueError as exc:
        raise _http_error(str(exc), 400)
    except Exception:
        logger.exception("create_ai_exam failed")
        raise _http_error("AI exam құру кезінде серверлік қате пайда болды", 500)

    return {
        "exam": stored["exam"],
        "questions": stored.get("questions") or [],
    }


@app.get("/api/ai/exams")
def api_list_ai_exams(
    user_id: str = Depends(get_current_user_id),
):
    try:
        exams = list_ai_exams_for_user(user_id)
    except Exception:
        logger.exception("list_ai_exams failed")
        raise _http_error(
            "AI exam тізімін жүктеу кезінде серверлік қате пайда болды",
            500,
        )

    return {"exams": exams}


@app.get("/api/ai/exams/published")
def api_list_published_ai_exams(
    user_id: str = Depends(get_current_user_id),
):
    _ = user_id

    try:
        exams = list_published_ai_exams()
    except Exception:
        logger.exception("list_published_ai_exams failed")
        raise _http_error(
            "Published AI exam тізімін жүктеу кезінде серверлік қате пайда болды",
            500,
        )

    return {"exams": exams}


@app.get("/api/ai/exams/{exam_id}")
def api_get_ai_exam(
    exam_id: str,
    user_id: str = Depends(get_current_user_id),
):
    stored = get_ai_exam_for_user(
        exam_id=exam_id,
        user_id=user_id,
        allow_published_read=True,
    )
    if not stored:
        raise _http_error("AI exam табылмады немесе рұқсат жоқ", 404)

    latest_attempt = get_latest_ai_exam_attempt_for_user(
        exam_id=exam_id,
        user_id=user_id,
    )

    return {
        "exam": stored["exam"],
        "questions": stored.get("questions") or [],
        "attempt_id": latest_attempt.get("id") if latest_attempt else None,
        "started_at": latest_attempt.get("created_at") if latest_attempt else None,
        "latest_result": latest_attempt.get("result") if latest_attempt else None,
        "latest_answers": latest_attempt.get("answers") if latest_attempt else [],
        "latest_submitted_at": latest_attempt.get("submitted_at") if latest_attempt else None,
    }


@app.get("/api/ai/exams/{exam_id}/attempts")
def api_list_ai_exam_attempts(
    exam_id: str,
    user_id: str = Depends(get_current_user_id),
):
    stored = get_ai_exam_for_user(
        exam_id=exam_id,
        user_id=user_id,
        allow_published_read=True,
    )
    if not stored:
        raise _http_error("AI exam табылмады немесе рұқсат жоқ", 404)

    try:
        attempts = list_ai_exam_attempts_for_user(
            exam_id=exam_id,
            user_id=user_id,
        )
    except Exception:
        logger.exception("list_ai_exam_attempts failed")
        raise _http_error(
            "Attempt history жүктеу кезінде серверлік қате пайда болды",
            500,
        )

    return {
        "attempts": [_public_attempt(attempt) for attempt in attempts],
        "count": len(attempts),
    }


@app.patch("/api/ai/exams/{exam_id}/status")
def api_update_ai_exam_status(
    exam_id: str,
    payload: dict[str, Any],
    user_id: str = Depends(get_current_user_id),
):
    status = _clean_text(payload.get("status"), 20).lower()
    if status not in AI_EXAM_STATUSES:
        raise _http_error("AI exam статусы дұрыс емес", 400)

    try:
        stored = update_ai_exam_status(
            exam_id=exam_id,
            owner_id=user_id,
            status=status,
        )
    except ValueError as exc:
        raise _http_error(str(exc), 400)
    except Exception:
        logger.exception("update_ai_exam_status failed")
        raise _http_error(
            "AI exam статусын жаңартуда серверлік қате пайда болды",
            500,
        )

    if not stored:
        raise _http_error("AI exam табылмады немесе рұқсат жоқ", 404)

    return {
        "exam": stored["exam"],
        "questions": stored.get("questions") or [],
    }


@app.post("/api/ai/exams/{exam_id}/submit")
def api_submit_ai_exam(
    exam_id: str,
    payload: dict[str, Any],
    user_id: str = Depends(get_current_user_id),
):
    stored = get_ai_exam_for_user(
        exam_id=exam_id,
        user_id=user_id,
        allow_published_read=True,
    )
    if not stored:
        raise _http_error("AI exam табылмады немесе рұқсат жоқ", 404)

    exam = stored["exam"]
    if exam.get("status") != "published":
        raise _http_error("Бұл AI exam әлі жарияланбаған", 400)

    questions = get_ai_exam_questions(exam_id)
    question_map = {str(q.get("id")): q for q in questions if q.get("id")}

    raw_answers = payload.get("answers") or []
    if not isinstance(raw_answers, list) or not raw_answers:
        raise _http_error("Кемінде бір жауап жіберілуі керек", 400)

    breakdown: list[dict[str, Any]] = []
    total_score = 0.0
    max_score = 0.0
    processed_count = 0
    normalized_answers: list[dict[str, Any]] = []

    for answer_row in raw_answers:
        if not isinstance(answer_row, dict):
            continue

        question_id = _clean_text(
            answer_row.get("question_id") or answer_row.get("questionId"),
            120,
        )
        user_answer = _extract_answer_value(answer_row)

        if not question_id or question_id not in question_map:
            continue
        if not user_answer:
            continue

        question = question_map[question_id]
        options = [
            option.get("text", "")
            for option in (question.get("options") or [])
            if isinstance(option, dict)
        ]
        expected_answer = _clean_text(question.get("correctAnswer"), 500)
        explanation = _clean_text(question.get("explanation"), 2000)
        answer_format = "mcq" if question.get("type") == "multiple_choice" else "text"

        try:
            evaluation = evaluate_answer_for_bilimcorp(
                {
                    "question": question.get("question"),
                    "student_answer": user_answer,
                    "expected_answer": expected_answer,
                    "reference_answer": explanation,
                    "options": options,
                    "answer_format": answer_format,
                    "context": exam.get("topic") or exam.get("title"),
                }
            )
        except ValueError as exc:
            raise _http_error(str(exc), 400)
        except Exception:
            logger.exception("submit_ai_exam evaluation failed")
            raise _http_error("Жауаптарды тексеруде серверлік қате пайда болды", 500)

        score = float(evaluation.get("score", 0))
        max_part = float(evaluation.get("max_score", 10))

        total_score += score
        max_score += max_part
        processed_count += 1

        normalized_answers.append(
            {
                "question_id": question_id,
                "answer": user_answer,
            }
        )

        breakdown.append(
            {
                "question_id": question_id,
                "score": score,
                "max_score": max_part,
                "feedback": evaluation.get("feedback") or "",
                "is_correct": evaluation.get("is_correct"),
            }
        )

    if processed_count == 0 or max_score <= 0:
        raise _http_error("Тексеруге жарамды жауаптар жоқ", 400)

    percentage = round((total_score / max_score) * 100, 1)

    if percentage >= 85:
        feedback = "Өте жақсы нәтиже. Негізгі мазмұн дұрыс игерілген."
    elif percentage >= 65:
        feedback = "Жақсы нәтиже. Кейбір сұрақтарды тереңірек қайталау пайдалы."
    else:
        feedback = (
            "Қайта қарап шығу керек тақырыптар бар. Practice пен tutor бөлімін қолданып көріңіз."
        )

    result_payload = {
        "score": round(total_score, 1),
        "max_score": round(max_score, 1),
        "percentage": percentage,
        "feedback": feedback,
        "breakdown": breakdown,
    }

    try:
        attempt = create_ai_exam_attempt(
            exam_id=exam_id,
            user_id=user_id,
            answers=normalized_answers,
            result=result_payload,
        )
    except ValueError as exc:
        raise _http_error(str(exc), 400)
    except Exception:
        logger.exception("create_ai_exam_attempt failed")
        raise _http_error("Attempt сақтау кезінде серверлік қате пайда болды", 500)

    return {
        "attempt_id": attempt["id"],
        "submitted_by": user_id,
        "submitted_at": attempt.get("submitted_at") or _utc_iso(),
        **result_payload,
    }