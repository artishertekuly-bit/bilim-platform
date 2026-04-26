from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException, status

from app.schemas.learning_analysis import (
    LearningAiMode,
    LearningAiRequest,
    LearningAiResponse,
    LearningAiRole,
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
        if payload.role != LearningAiRole.student:
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
        if payload.role != LearningAiRole.teacher:
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
        if payload.role != LearningAiRole.teacher:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="AI көмекші тек мұғалім режиміне арналған.",
            )

        if not scope or not scope.course_id or not scope.student_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Оқушы бойынша AI көмекші үшін courseId және studentId қажет.",
            )


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _format_value(value: Any) -> str:
    if value is None:
        return "—"

    return str(value)


def _get_course(context: dict[str, Any]) -> dict[str, Any]:
    return _as_dict(context.get("course"))


def _get_student(context: dict[str, Any]) -> dict[str, Any]:
    return _as_dict(context.get("student"))


def _get_totals(context: dict[str, Any]) -> dict[str, Any]:
    return _as_dict(context.get("totals"))


def _get_recommendations(context: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        item
        for item in _as_list(context.get("recommendations"))
        if isinstance(item, dict)
    ]


def _get_weak_lessons(context: dict[str, Any]) -> list[dict[str, Any]]:
    raw_items = context.get("weakLessons")

    if raw_items is None:
        raw_items = context.get("difficultLessons")

    return [
        item
        for item in _as_list(raw_items)
        if isinstance(item, dict)
    ]


def _get_mini_quizzes(context: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        item
        for item in _as_list(context.get("miniQuizzes"))
        if isinstance(item, dict)
    ]


def _extract_course_title(context: dict[str, Any]) -> str | None:
    course = _get_course(context)
    value = course.get("title") or course.get("courseTitle")

    return str(value).strip() if value else None


def _extract_student_name(context: dict[str, Any]) -> str | None:
    student = _get_student(context)
    value = student.get("name") or student.get("fullName") or student.get("studentName")

    return str(value).strip() if value else None


def _extract_snapshot_generated_at(context: dict[str, Any]) -> str | None:
    value = (
        context.get("generatedAt")
        or context.get("snapshotGeneratedAt")
        or context.get("updatedAt")
    )

    return str(value).strip() if value else None


def _resolve_used_context(
    payload: LearningAiRequest,
    current_user_id: str,
    context: dict[str, Any],
) -> LearningAiUsedContext:
    scope = payload.scope
    course_title = _extract_course_title(context)
    student_name = _extract_student_name(context)
    snapshot_generated_at = _extract_snapshot_generated_at(context)

    if payload.mode == LearningAiMode.student_tracker:
        return LearningAiUsedContext(
            source="student_learning_snapshot",
            studentId=current_user_id,
            studentName=student_name,
            snapshotGeneratedAt=snapshot_generated_at,
        )

    if payload.mode == LearningAiMode.teacher_course_assistant:
        return LearningAiUsedContext(
            source="course_learning_snapshot",
            courseId=scope.course_id if scope else None,
            courseTitle=course_title,
            snapshotGeneratedAt=snapshot_generated_at,
        )

    return LearningAiUsedContext(
        source="teacher_student_learning_snapshot",
        courseId=scope.course_id if scope else None,
        studentId=scope.student_id if scope else None,
        courseTitle=course_title,
        studentName=student_name,
        snapshotGeneratedAt=snapshot_generated_at,
    )


def _build_context_summary(
    *,
    payload: LearningAiRequest,
    context: dict[str, Any],
) -> str:
    totals = _get_totals(context)
    course_title = _extract_course_title(context)
    student_name = _extract_student_name(context)
    weak_lessons = _get_weak_lessons(context)
    recommendations = _get_recommendations(context)

    if payload.mode == LearningAiMode.student_tracker:
        return (
            f"Оқушы snapshot: progress={_format_value(totals.get('progressPct'))}%, "
            f"miniQuizAvg={_format_value(totals.get('miniQuizAvgScore'))}%, "
            f"weakLessons={len(weak_lessons)}, "
            f"recommendations={len(recommendations)}."
        )

    if payload.mode == LearningAiMode.teacher_course_assistant:
        return (
            f"Курс snapshot: course={_format_value(course_title)}, "
            f"students={_format_value(totals.get('students'))}, "
            f"avgProgress={_format_value(totals.get('avgProgressPct'))}%, "
            f"miniQuizPassRate={_format_value(totals.get('miniQuizPassRatePct'))}%, "
            f"difficultLessons={len(weak_lessons)}."
        )

    return (
        f"Оқушы-course snapshot: course={_format_value(course_title)}, "
        f"student={_format_value(student_name)}, "
        f"progress={_format_value(totals.get('progressPct'))}%, "
        f"miniQuizAvg={_format_value(totals.get('miniQuizAvgScore'))}%, "
        f"weakLessons={len(weak_lessons)}."
    )


def _estimate_confidence(context: dict[str, Any]) -> str:
    totals = _get_totals(context)
    weak_lessons = _get_weak_lessons(context)
    recommendations = _get_recommendations(context)
    mini_quizzes = _get_mini_quizzes(context)

    signal_count = 0

    if totals:
        signal_count += 1

    if weak_lessons:
        signal_count += 1

    if recommendations:
        signal_count += 1

    if mini_quizzes:
        signal_count += 1

    if signal_count >= 3:
        return "high"

    if signal_count >= 1:
        return "medium"

    return "low"


def _build_warnings(
    *,
    payload: LearningAiRequest,
    context: dict[str, Any],
    llm_error: str | None = None,
) -> list[str]:
    warnings: list[str] = [
        "AI жауабы оқу нәтижелеріне сүйенеді; соңғы педагогикалық шешімді мұғалім немесе оқушы өзі қабылдайды.",
    ]

    if payload.mode == LearningAiMode.student_tracker:
        warnings.append(
            "AI Tracker жасырын click tracking немесе бетте отырған уақыт деректерін қолданбайды."
        )

    if _estimate_confidence(context) == "low":
        warnings.append(
            "Context дерегі аз болғандықтан, жауап жалпы ұсыныс сипатында болуы мүмкін."
        )

    if llm_error:
        warnings.append(
            "LLM уақытша жауап бере алмады; deterministic fallback analysis қолданылды."
        )

    return warnings


def _build_follow_up_prompts(payload: LearningAiRequest) -> list[str]:
    if payload.mode == LearningAiMode.student_tracker:
        return [
            "Осыны 3 күндік жоспарға айналдыр.",
            "Маған ең бірінші қай тақырыптан бастау керек екенін айт.",
            "Қиын тақырыпты жеңіл тілмен түсіндір.",
        ]

    if payload.mode == LearningAiMode.teacher_course_assistant:
        return [
            "Осыны бір апталық қайталау жоспарына айналдыр.",
            "Қиын сабақтарды қайта түсіндіру стратегиясын ұсын.",
            "Оқушылармен талқылайтын сұрақтар дайында.",
        ]

    return [
        "Осы оқушыға жеке қолдау жоспарын жаса.",
        "Ата-анаға түсіндіретін қысқа мәтін дайында.",
        "Келесі сабақта қолданатын intervention ұсын.",
    ]


def _build_context_based_fallback_answer(
    *,
    payload: LearningAiRequest,
    context: dict[str, Any],
    llm_error: str | None = None,
) -> str:
    totals = _get_totals(context)
    recommendations = _get_recommendations(context)
    weak_lessons = _get_weak_lessons(context)
    prompt = payload.prompt.strip()

    if payload.mode == LearningAiMode.student_tracker:
        student = _get_student(context)

        lines = [
            "Қысқаша қорытынды:",
            "AI Tracker оқу нәтижелеріңізге сүйеніп, келесі оқу қадамын ұсынады.",
            "",
            "Негізгі context:",
            f"- Оқушы: {_format_value(student.get('name'))}",
            f"- Жалпы progress: {_format_value(totals.get('progressPct'))}%",
            f"- Аяқталған сабақтар: {_format_value(totals.get('completedLessons'))}/{_format_value(totals.get('totalLessons'))}",
            f"- Mini quiz орташа нәтиже: {_format_value(totals.get('miniQuizAvgScore'))}%",
            f"- Кейін қайталау саны: {_format_value(totals.get('reviewLaterItems'))}",
            "",
            "Ұсынылатын әрекет:",
        ]

    elif payload.mode == LearningAiMode.teacher_course_assistant:
        course = _get_course(context)

        lines = [
            "Қысқаша қорытынды:",
            "AI курс көмекшісі курс нәтижелеріне сүйеніп, мұғалімге нақты педагогикалық әрекет ұсынады.",
            "",
            "Негізгі context:",
            f"- Курс: {_format_value(course.get('title'))}",
            f"- Оқушы саны: {_format_value(totals.get('students'))}",
            f"- Орташа progress: {_format_value(totals.get('avgProgressPct'))}%",
            f"- Mini quiz өту көрсеткіші: {_format_value(totals.get('miniQuizPassRatePct'))}%",
            f"- Қиын сабақтар саны: {len(weak_lessons)}",
            "",
            "Ұсынылатын әрекет:",
        ]

    else:
        course = _get_course(context)
        student = _get_student(context)

        lines = [
            "Қысқаша қорытынды:",
            "AI оқушы көмекшісі нақты курс пен оқушы нәтижелеріне сүйеніп, жеке қолдау бағытын ұсынады.",
            "",
            "Негізгі context:",
            f"- Курс: {_format_value(course.get('title'))}",
            f"- Оқушы: {_format_value(student.get('name'))}",
            f"- Progress: {_format_value(totals.get('progressPct'))}%",
            f"- Аяқталған сабақтар: {_format_value(totals.get('completedLessons'))}/{_format_value(totals.get('totalLessons'))}",
            f"- Mini quiz орташа нәтиже: {_format_value(totals.get('miniQuizAvgScore'))}%",
            f"- Кейін қайталау саны: {_format_value(totals.get('reviewLaterItems'))}",
            "",
            "Ұсынылатын әрекет:",
        ]

    if recommendations:
        for index, item in enumerate(recommendations[:5], start=1):
            title = _format_value(item.get("title"))
            description = _format_value(item.get("description"))
            lines.append(f"{index}. {title} — {description}")
    else:
        lines.append("1. Қазір нақты ұсыныс жасауға жеткілікті дерек аз. Негізгі progress пен mini quiz нәтижелерін бақылап, қысқа қайталаудан бастаңыз.")

    if weak_lessons:
        lines.extend(["", "Қайталау керек сабақтар:"])

        for index, lesson in enumerate(weak_lessons[:5], start=1):
            title = _format_value(lesson.get("lessonTitle"))
            reason = _format_value(lesson.get("reason"))
            lines.append(f"{index}. {title}: {reason}")

    lines.extend(
        [
            "",
            "Келесі қадам:",
            "1. Бірінші әлсіз тақырыпты таңдаңыз.",
            "2. Сол тақырып бойынша қысқа қайталау жасаңыз.",
            "3. Mini quiz немесе шағын тапсырма арқылы нәтижені қайта тексеріңіз.",
            "",
            "Педагогикалық ескерту:",
            "Бұл жауап оқу нәтижелеріне ғана сүйенеді. Соңғы шешімді мұғалім немесе оқушы өзі қабылдайды.",
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
) -> tuple[str, str | None]:
    if not is_learning_analysis_llm_configured():
        llm_error = "OpenAI API key configured емес."

        return (
            _build_context_based_fallback_answer(
                payload=payload,
                context=context,
                llm_error=llm_error,
            ),
            llm_error,
        )

    try:
        answer = await generate_learning_analysis_with_llm(
            payload=payload,
            context=context,
        )

        return answer, None
    except LearningAnalysisLlmError as exc:
        logger.warning("LLM answer failed, falling back to deterministic analysis: %s", exc)

        llm_error = str(exc)

        return (
            _build_context_based_fallback_answer(
                payload=payload,
                context=context,
                llm_error=llm_error,
            ),
            llm_error,
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

    answer, llm_error = await _build_answer(
        payload=payload,
        context=context,
    )

    return LearningAiResponse(
        answer=answer.strip(),
        generatedAt=now_iso(),
        mode=payload.mode,
        usedContext=_resolve_used_context(
            payload=payload,
            current_user_id=current_user_id,
            context=context,
        ),
        contextSummary=_build_context_summary(
            payload=payload,
            context=context,
        ),
        confidence=_estimate_confidence(context),
        warnings=_build_warnings(
            payload=payload,
            context=context,
            llm_error=llm_error,
        ),
        followUpPrompts=_build_follow_up_prompts(payload),
    )