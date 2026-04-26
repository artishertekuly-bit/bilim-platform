from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException, status

from app.schemas.learning_analysis import (
    LearningAiMode,
    LearningAiRequest,
    LearningAiResponse,
    LearningAiUsedContext,
    now_iso,
)
from app.services.learning_analysis_context import collect_learning_analysis_context
from app.services.learning_analysis_llm import (
    LearningAnalysisLlmError,
    generate_learning_analysis_with_llm,
    is_learning_analysis_llm_configured,
)

logger = logging.getLogger("bilimcorp.learning_analysis.service")


def _validate_request_contract(
    payload: LearningAiRequest,
    current_user_id: str,
) -> None:
    prompt = payload.prompt.strip()

    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Сұрақ бос болмауы керек.",
        )

    scope = payload.scope

    if payload.mode == LearningAiMode.student_tracker:
        if payload.role != "student":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="AI Tracker тек оқушы режиміне арналған.",
            )

        requested_student_id = scope.student_id if scope else None

        if requested_student_id and requested_student_id != current_user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="AI Tracker тек өз оқу деректеріңіз бойынша жұмыс істейді.",
            )

    if payload.mode == LearningAiMode.teacher_course_assistant:
        if payload.role != "teacher":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="AI көмекші тек мұғалім режиміне арналған.",
            )

        if not scope or not scope.course_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Курс бойынша AI көмекші үшін courseId қажет.",
            )

    if payload.mode == LearningAiMode.teacher_student_assistant:
        if payload.role != "teacher":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="AI көмекші тек мұғалім режиміне арналған.",
            )

        if not scope or not scope.course_id or not scope.student_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Оқушы бойынша AI көмекші үшін courseId және studentId қажет.",
            )


def _resolve_used_context(
    payload: LearningAiRequest,
    current_user_id: str,
) -> LearningAiUsedContext:
    scope = payload.scope

    if payload.mode == LearningAiMode.student_tracker:
        return LearningAiUsedContext(
            source="student_learning_snapshot",
            studentId=current_user_id,
        )

    if payload.mode == LearningAiMode.teacher_course_assistant:
        return LearningAiUsedContext(
            source="course_learning_snapshot",
            courseId=scope.course_id if scope else None,
        )

    return LearningAiUsedContext(
        source="teacher_student_learning_snapshot",
        courseId=scope.course_id if scope else None,
        studentId=scope.student_id if scope else None,
    )


def _format_value(value: Any) -> str:
    if value is None:
        return "—"

    return str(value)


def _build_context_based_fallback_answer(
    *,
    payload: LearningAiRequest,
    context: dict[str, Any],
    llm_error: str | None = None,
) -> str:
    totals = context.get("totals") or {}
    recommendations = context.get("recommendations") or []
    weak_lessons = context.get("weakLessons") or []
    prompt = payload.prompt.strip()

    if payload.mode == LearningAiMode.student_tracker:
        student = context.get("student") or {}

        lines = [
            "AI Tracker нақты оқу деректері бойынша жұмыс істеп тұр.",
            "",
            f"Оқушы: {_format_value(student.get('name'))}",
            f"Жалпы progress: {_format_value(totals.get('progressPct'))}%",
            f"Аяқталған сабақтар: {_format_value(totals.get('completedLessons'))}/{_format_value(totals.get('totalLessons'))}",
            f"Mini quiz орташа нәтиже: {_format_value(totals.get('miniQuizAvgScore'))}%",
            f"Кейін қайталау саны: {_format_value(totals.get('reviewLaterItems'))}",
            "",
            "Ұсыныс:",
        ]

    elif payload.mode == LearningAiMode.teacher_course_assistant:
        course = context.get("course") or {}

        lines = [
            "AI курс көмекшісі нақты курс деректері бойынша жұмыс істеп тұр.",
            "",
            f"Курс: {_format_value(course.get('title'))}",
            f"Оқушы саны: {_format_value(totals.get('students'))}",
            f"Орташа progress: {_format_value(totals.get('avgProgressPct'))}%",
            f"Mini quiz өту көрсеткіші: {_format_value(totals.get('miniQuizPassRatePct'))}%",
            f"Қиын сабақтар саны: {len(weak_lessons)}",
            "",
            "Ұсыныс:",
        ]

    else:
        course = context.get("course") or {}
        student = context.get("student") or {}

        lines = [
            "AI оқушы көмекшісі нақты курс-оқушы деректері бойынша жұмыс істеп тұр.",
            "",
            f"Курс: {_format_value(course.get('title'))}",
            f"Оқушы: {_format_value(student.get('name'))}",
            f"Progress: {_format_value(totals.get('progressPct'))}%",
            f"Аяқталған сабақтар: {_format_value(totals.get('completedLessons'))}/{_format_value(totals.get('totalLessons'))}",
            f"Mini quiz орташа нәтиже: {_format_value(totals.get('miniQuizAvgScore'))}%",
            f"Кейін қайталау саны: {_format_value(totals.get('reviewLaterItems'))}",
            "",
            "Ұсыныс:",
        ]

    if recommendations:
        for index, item in enumerate(recommendations[:5], start=1):
            title = _format_value(item.get("title"))
            description = _format_value(item.get("description"))
            lines.append(f"{index}. {title} — {description}")
    else:
        lines.append("1. Қазір нақты ұсыныс жасауға жеткілікті дерек аз.")

    if weak_lessons:
        lines.extend(["", "Қайталау керек сабақтар:"])

        for index, lesson in enumerate(weak_lessons[:5], start=1):
            title = _format_value(lesson.get("lessonTitle"))
            reason = _format_value(lesson.get("reason"))
            lines.append(f"{index}. {title}: {reason}")

    lines.extend(
        [
            "",
            "Педагогикалық ескерту:",
            "Бұл жауап оқушыны бақылау деректеріне емес, оқу нәтижелеріне ғана сүйенеді. Соңғы шешімді мұғалім немесе оқушы өзі қабылдайды.",
            "",
            f"Сұрақ: {prompt}",
        ]
    )

    if llm_error:
        lines.extend(
            [
                "",
                "Техникалық ескерту:",
                "AI model уақытша жауап бере алмады, сондықтан жүйе оқу деректерінен deterministic analysis көрсетті.",
            ]
        )

    return "\n".join(lines)


async def _build_answer(
    *,
    payload: LearningAiRequest,
    context: dict[str, Any],
) -> str:
    if not is_learning_analysis_llm_configured():
        return _build_context_based_fallback_answer(
            payload=payload,
            context=context,
            llm_error="OpenAI API key configured емес.",
        )

    try:
        return await generate_learning_analysis_with_llm(
            payload=payload,
            context=context,
        )
    except LearningAnalysisLlmError as exc:
        logger.warning("LLM answer failed, falling back to deterministic analysis: %s", exc)

        return _build_context_based_fallback_answer(
            payload=payload,
            context=context,
            llm_error=str(exc),
        )


async def create_learning_analysis(
    payload: LearningAiRequest,
    current_user_id: str,
) -> LearningAiResponse:
    _validate_request_contract(
        payload=payload,
        current_user_id=current_user_id,
    )

    context = await collect_learning_analysis_context(
        payload=payload,
        current_user_id=current_user_id,
    )

    answer = await _build_answer(
        payload=payload,
        context=context,
    )

    return LearningAiResponse(
        answer=answer,
        generatedAt=now_iso(),
        mode=payload.mode,
        usedContext=_resolve_used_context(
            payload=payload,
            current_user_id=current_user_id,
        ),
    )