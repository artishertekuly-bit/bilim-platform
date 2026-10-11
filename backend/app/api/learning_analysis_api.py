from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies.auth import get_current_user_with_role
from app.schemas.learning_analysis import LearningAiMode, LearningAiRequest, LearningAiResponse
from app.services.learning_analysis_service import create_learning_analysis

logger = logging.getLogger("bilimcorp.learning_analysis.api")

router = APIRouter(prefix="/api", tags=["learning-analysis"])


def _http_error(message: str, status_code: int = status.HTTP_400_BAD_REQUEST) -> HTTPException:
    return HTTPException(status_code=status_code, detail=message)


def _clean_text(value: Any, limit: int | None = None) -> str:
    text = " ".join(str(value or "").replace("\x00", " ").split()).strip()
    return text[:limit] if limit else text


def _get_scope_value(scope: Any, *names: str) -> str:
    if scope is None:
        return ""

    for name in names:
        if isinstance(scope, dict):
            value = scope.get(name)
        else:
            value = getattr(scope, name, None)

        text = _clean_text(value, 160)
        if text:
            return text

    return ""


def _validate_learning_analysis_request(payload: LearningAiRequest) -> None:
    """
    Endpoint-level validation for mode/scope consistency.

    Detailed authorization remains in the service/context layer, where the
    backend can verify course ownership and enrollment using Supabase data.
    This function only rejects structurally invalid requests early.
    """
    mode = payload.mode
    scope = getattr(payload, "scope", None)

    if mode in {
        LearningAiMode.student_tracker,
        LearningAiMode.student_course_advisor,
        LearningAiMode.teacher_course_creator_advisor,
    }:
        return

    if mode == LearningAiMode.teacher_course_assistant:
        course_id = _get_scope_value(scope, "course_id", "courseId")
        if not course_id:
            raise _http_error("courseId қажет.", status.HTTP_400_BAD_REQUEST)
        return

    course_id = _get_scope_value(scope, "course_id", "courseId")
    student_id = _get_scope_value(scope, "student_id", "studentId")

    if not course_id or not student_id:
        raise _http_error(
            "courseId және studentId қажет.",
            status.HTTP_400_BAD_REQUEST,
        )


@router.post(
    "/learning-analysis",
    response_model=LearningAiResponse,
    response_model_exclude_none=True,
    status_code=status.HTTP_200_OK,
    summary="Create learning AI analysis",
    description=(
        "Creates a scoped AI learning analysis for student tracker, "
        "student course advisor, teacher course assistant, teacher course "
        "creator advisor, or teacher student assistant. Authentication is "
        "required. Ownership, enrollment, and scope authorization are enforced "
        "inside the learning analysis service/context layer."
    ),
)
async def learning_analysis(
    payload: LearningAiRequest,
    user_with_role: tuple[str, str] = Depends(get_current_user_with_role),
) -> LearningAiResponse:
    user_id, actual_role = user_with_role

    if payload.role.value == "teacher" and actual_role not in {"teacher", "admin"}:
        raise _http_error(
            "Мұғалім режиміндегі талдау үшін 'teacher' немесе 'admin' рөлі қажет.",
            status.HTTP_403_FORBIDDEN,
        )

    _validate_learning_analysis_request(payload)

    try:
        return await create_learning_analysis(
            payload=payload,
            current_user_id=user_id,
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "learning_analysis endpoint failed: mode=%s user_id=%s",
            getattr(payload, "mode", None),
            user_id,
        )
        raise _http_error(
            "AI learning analysis кезінде серверлік қате пайда болды.",
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )