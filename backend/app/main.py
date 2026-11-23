from __future__ import annotations

from contextlib import asynccontextmanager
import logging
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .ai_adapter import (
    evaluate_answer_for_bilimcorp,
    generate_questions_for_bilimcorp,
    generate_test_draft_for_bilimcorp,
)
from .ai_storage import (
    create_ai_exam_attempt,
    create_ai_exam_record,
    get_ai_exam_for_user,
    get_ai_exam_questions,
    get_latest_ai_exam_attempt_for_user,
    list_ai_exam_attempts_for_user,
    list_ai_exams_for_user,
    list_published_ai_exams,
    update_ai_exam_status,
)
from concurrent.futures import ThreadPoolExecutor
from .api.learning_analysis_api import router as learning_analysis_router
from .examiner.session.api import PREFIX as EXAMINER_PREFIX
from .examiner.session.api import close_service as close_examiner_service
from .examiner.session.api import install as install_examiner_api
from .tutor.api import PREFIX as TUTOR_PREFIX
from .tutor.api import close_service as close_tutor_service
from .tutor.api import install as install_tutor_api
from .dependencies.auth import get_current_user_id, require_author_role

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
ENV_FILES = [ROOT_DIR / ".env", BACKEND_DIR / ".env"]

logger = logging.getLogger("bilimcorp.ai.bridge")
logging.basicConfig(level=logging.INFO)

AI_EXAM_STATUSES = {"draft", "published", "archived"}


def _load_environment() -> None:
    for env_file in ENV_FILES:
        if env_file.exists():
            load_dotenv(env_file, override=False)


def _is_truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


_load_environment()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()

# Infer production environment when running on cloud platforms without explicit APP_ENV
_inferred_env = "production" if any(os.getenv(k) for k in ("RENDER", "VERCEL", "FLY_ALLOC_ID", "KUBERNETES_SERVICE_HOST")) else "development"
APP_ENV = os.getenv("APP_ENV", os.getenv("ENV", _inferred_env)).strip().lower()
ALLOW_DEBUG_USER_ID_FALLBACK = _is_truthy(
    os.getenv("ALLOW_DEBUG_USER_ID_FALLBACK", "false")
)
DEV_ENVS = {"local", "dev", "development", "test"}

DEBUG_USER_ID_FALLBACK_ENABLED = ALLOW_DEBUG_USER_ID_FALLBACK and APP_ENV in DEV_ENVS


def _is_development_env() -> bool:
    return APP_ENV in DEV_ENVS


def _build_allowed_origins() -> list[str]:
    configured = [
        origin.strip().rstrip("/")
        for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
        if origin.strip()
    ]

    if configured:
        return configured

    if _is_development_env():
        return [
            "http://localhost:8080",
            "http://127.0.0.1:8080",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
        ]

    logger.warning(
        "ALLOWED_ORIGINS is empty while APP_ENV=%s. "
        "Browser CORS requests will be rejected until production origins are configured.",
        APP_ENV,
    )
    return []


def _build_allow_origin_regex() -> str | None:
    if _is_development_env():
        return r"http://(localhost|127\.0\.0\.1)(:\d+)?"

    return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_examiner_service()
    await close_tutor_service()


app = FastAPI(
    title="Bilimcorp AI Bridge",
    version="1.6.1",
    description=(
        "AI bridge service for Bilimcorp. Provides legacy AI tools and "
        "scoped learning-analysis endpoints for AI Tracker and AI Assistant."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_build_allowed_origins(),
    allow_origin_regex=_build_allow_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(learning_analysis_router)
install_examiner_api(app)
install_tutor_api(app)


@app.exception_handler(RequestValidationError)
async def _service_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Examiner мен Tutor-дың ортақ қате пішімі (api §2.4): 400 VALIDATION_ERROR. Басқа жолдарда — FastAPI әдепкісі."""
    if not request.url.path.startswith((EXAMINER_PREFIX, TUTOR_PREFIX)):
        return await request_validation_exception_handler(request, exc)
    fields = [".".join(str(part) for part in error.get("loc", ())[1:]) for error in exc.errors()]
    body = {"error": {"code": "VALIDATION_ERROR", "message": "Сұраныстың өрістері қате.", "details": {"fields": fields}}}
    return JSONResponse(body, status_code=400)


def _utc_iso() -> str:
    return datetime.now(UTC).isoformat()


def _clean_text(value: Any, limit: int | None = None) -> str:
    text = " ".join(str(value or "").replace("\x00", " ").split()).strip()
    return text[:limit] if limit else text


def _clean_multiline_text(value: Any, limit: int | None = None) -> str:
    text = str(value or "").replace("\x00", " ").strip()
    if limit:
        text = text[:limit]
    lines = [" ".join(line.split()).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line).strip()


def _http_error(message: str, status_code: int = 400) -> HTTPException:
    return HTTPException(status_code=status_code, detail=message)


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
        "version": app.version,
        "docs": "/docs",
        "health": "/health",
        "learning_analysis_endpoint": "/api/learning-analysis",
    }


@app.get("/health")
def healthcheck():
    return {
        "ok": True,
        "service": "bilimcorp-ai-bridge",
        "version": app.version,
        "env": APP_ENV,
        "env_file_present": any(env_file.exists() for env_file in ENV_FILES),
        "allowed_origins": _build_allowed_origins(),
        "allow_origin_regex": _build_allow_origin_regex(),
        "cors_localhost_enabled": _is_development_env(),
        "supabase_auth_configured": bool(SUPABASE_URL and SUPABASE_ANON_KEY),
        "learning_analysis_enabled": True,
        "learning_analysis_endpoint": "/api/learning-analysis",
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


@app.post("/api/ai/exams")
def api_create_ai_exam(
    payload: dict[str, Any],
    user_id: str = Depends(require_author_role),
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
    user_id: str = Depends(require_author_role),
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
    user_id: str = Depends(require_author_role),
):
    status_value = _clean_text(payload.get("status"), 20).lower()
    if status_value not in AI_EXAM_STATUSES:
        raise _http_error("AI exam статусы дұрыс емес", 400)

    try:
        stored = update_ai_exam_status(
            exam_id=exam_id,
            owner_id=user_id,
            status=status_value,
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

    valid_items: list[tuple[str, str, dict[str, Any]]] = []
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

        valid_items.append((question_id, user_answer, question_map[question_id]))

    if not valid_items:
        raise _http_error("Тексеруге жарамды жауаптар жоқ", 400)

    context_topic = exam.get("topic") or exam.get("title")

    def _eval_one(item: tuple[str, str, dict[str, Any]]) -> dict[str, Any]:
        q_id, ans, q = item
        options = [
            option.get("text", "")
            for option in (q.get("options") or [])
            if isinstance(option, dict)
        ]
        expected_answer = _clean_text(q.get("correctAnswer"), 500)
        explanation = _clean_text(q.get("explanation"), 2000)
        answer_format = "mcq" if q.get("type") == "multiple_choice" else "text"

        eval_res = evaluate_answer_for_bilimcorp(
            {
                "question": q.get("question"),
                "student_answer": ans,
                "expected_answer": expected_answer,
                "reference_answer": explanation,
                "options": options,
                "answer_format": answer_format,
                "context": context_topic,
            }
        )
        return {
            "question_id": q_id,
            "answer": ans,
            "evaluation": eval_res,
        }

    workers = min(len(valid_items), 8)
    try:
        with ThreadPoolExecutor(max_workers=workers) as executor:
            evaluated_items = list(executor.map(_eval_one, valid_items))
    except ValueError as exc:
        raise _http_error(str(exc), 400)
    except HTTPException:
        raise
    except Exception:
        logger.exception("submit_ai_exam evaluation failed")
        raise _http_error("Жауаптарды тексеруде серверлік қате пайда болды", 500)

    breakdown: list[dict[str, Any]] = []
    total_score = 0.0
    max_score = 0.0
    normalized_answers: list[dict[str, Any]] = []

    for item in evaluated_items:
        question_id = item["question_id"]
        user_answer = item["answer"]
        evaluation = item["evaluation"]

        score = float(evaluation.get("score", 0))
        max_part = float(evaluation.get("max_score", 10))

        total_score += score
        max_score += max_part

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

    if max_score <= 0:
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