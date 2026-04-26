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


def _to_number(value: Any) -> float:
    if isinstance(value, bool):
        return 0

    if isinstance(value, (int, float)):
        return float(value)

    if isinstance(value, str) and value.strip():
        try:
            return float(value)
        except ValueError:
            return 0

    return 0


def _clean_text(value: Any) -> str:
    return " ".join(str(value or "").replace("\x00", " ").split()).strip()


def _get_course(context: dict[str, Any]) -> dict[str, Any]:
    return _as_dict(context.get("course"))


def _get_student(context: dict[str, Any]) -> dict[str, Any]:
    return _as_dict(context.get("student"))


def _get_totals(context: dict[str, Any]) -> dict[str, Any]:
    return _as_dict(context.get("totals"))


def _get_signals(context: dict[str, Any]) -> dict[str, Any]:
    return _as_dict(context.get("signals"))


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

    text = _clean_text(value)
    return text or None


def _extract_student_name(context: dict[str, Any]) -> str | None:
    student = _get_student(context)
    value = student.get("name") or student.get("fullName") or student.get("studentName")

    text = _clean_text(value)
    return text or None


def _extract_snapshot_generated_at(context: dict[str, Any]) -> str | None:
    value = (
        context.get("generatedAt")
        or context.get("snapshotGeneratedAt")
        or context.get("updatedAt")
    )

    text = _clean_text(value)
    return text or None


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


def _has_meaningful_text_items(items: list[dict[str, Any]]) -> bool:
    for item in items:
        title = _clean_text(item.get("title") or item.get("lessonTitle"))
        description = _clean_text(item.get("description") or item.get("reason"))

        if title or description:
            return True

    return False


def _has_usable_learning_context(
    *,
    payload: LearningAiRequest,
    context: dict[str, Any],
) -> bool:
    totals = _get_totals(context)
    weak_lessons = _get_weak_lessons(context)
    recommendations = _get_recommendations(context)
    mini_quizzes = _get_mini_quizzes(context)
    signals = _get_signals(context)

    if _has_meaningful_text_items(weak_lessons):
        return True

    meaningful_recommendations = [
        item
        for item in recommendations
        if _clean_text(item.get("reason")) != "no strong risk signal found"
    ]
    if _has_meaningful_text_items(meaningful_recommendations):
        return True

    supporting_signals = [
        _clean_text(item)
        for item in _as_list(signals.get("supportingSignals"))
        if _clean_text(item)
    ]
    if supporting_signals:
        return True

    if payload.mode == LearningAiMode.student_tracker:
        numeric_keys = [
            "enrolledCourses",
            "totalLessons",
            "completedLessons",
            "miniQuizAttempts",
            "testAttempts",
            "savedLessons",
            "reviewLaterItems",
        ]

        return any(_to_number(totals.get(key)) > 0 for key in numeric_keys)

    if payload.mode == LearningAiMode.teacher_course_assistant:
        numeric_keys = [
            "students",
            "lessons",
            "completedLessonRecords",
            "miniQuizAttempts",
            "testAttempts",
            "savedLessons",
            "reviewLaterItems",
        ]

        return any(_to_number(totals.get(key)) > 0 for key in numeric_keys)

    numeric_keys = [
        "totalLessons",
        "completedLessons",
        "miniQuizAttempts",
        "testAttempts",
        "savedLessons",
        "reviewLaterItems",
    ]

    return any(_to_number(totals.get(key)) > 0 for key in numeric_keys)


def _build_safe_context_summary(
    *,
    payload: LearningAiRequest,
    context: dict[str, Any],
) -> str | None:
    signals = _get_signals(context)
    primary_focus = _clean_text(signals.get("primaryFocus"))

    if primary_focus:
        return primary_focus

    if not _has_usable_learning_context(payload=payload, context=context):
        return None

    if payload.mode == LearningAiMode.student_tracker:
        return "Оқу context табылды, бірақ оны пайдаланушыға сандық есеп ретінде емес, қысқа ұсыныс ретінде түсіндіру керек."

    if payload.mode == LearningAiMode.teacher_course_assistant:
        return "Курс context табылды, бірақ мұғалімге толық analytics емес, педагогикалық ұсыныс берілуі керек."

    return "Оқушы context табылды, бірақ жауап оқушыға үкім шығармай, қолдау бағыты ретінде берілуі керек."


def _estimate_confidence(
    *,
    payload: LearningAiRequest,
    context: dict[str, Any],
) -> str:
    if not _has_usable_learning_context(payload=payload, context=context):
        return "low"

    weak_lessons = _get_weak_lessons(context)
    recommendations = _get_recommendations(context)
    mini_quizzes = _get_mini_quizzes(context)
    signals = _get_signals(context)

    signal_count = 0

    if _has_meaningful_text_items(weak_lessons):
        signal_count += 1

    if _has_meaningful_text_items(recommendations):
        signal_count += 1

    if mini_quizzes:
        signal_count += 1

    if signals:
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
        "AI ұсыныс береді, соңғы шешімді адам қабылдайды.",
    ]

    if payload.mode == LearningAiMode.student_tracker:
        warnings.append(
            "AI Tracker жасырын click tracking немесе бетте отырған уақыт деректерін қолданбайды."
        )
    else:
        warnings.append(
            "AI оқушыға үкім шығармайды; жауап тек педагогикалық талқылауға арналған."
        )

    if not _has_usable_learning_context(payload=payload, context=context):
        warnings.append(
            "Оқу context жеткіліксіз болғандықтан, жеке талдау жасалмады."
        )

    if llm_error:
        warnings.append(
            "AI model уақытша жауап бере алмады; қауіпсіз fallback жауап қолданылды."
        )

    return warnings


def _build_follow_up_prompts(
    *,
    payload: LearningAiRequest,
    context: dict[str, Any],
) -> list[str]:
    if not _has_usable_learning_context(payload=payload, context=context):
        return []

    if payload.mode == LearningAiMode.student_tracker:
        return [
            "Осыны қысқа оқу жоспарына айналдыр.",
            "Бірінші қай тақырыптан бастайтынымды түсіндір.",
            "Қиын тақырыпты жеңіл тілмен түсіндір.",
        ]

    if payload.mode == LearningAiMode.teacher_course_assistant:
        return [
            "Осыны бір апталық қайталау жоспарына айналдыр.",
            "Қиын бағытты қайта түсіндіру стратегиясын ұсын.",
            "Оқушылармен талқылайтын сұрақтар дайында.",
        ]

    return [
        "Осы оқушыға жеке қолдау жоспарын жаса.",
        "Ата-анаға түсіндіретін қысқа мәтін дайында.",
        "Келесі сабақта қолданатын intervention ұсын.",
    ]


def _build_no_data_answer(payload: LearningAiRequest) -> str:
    if payload.mode == LearningAiMode.student_tracker:
        return "\n".join(
            [
                "Қазір жеке AI талдау жасауға жеткілікті оқу дерегі табылмады.",
                "",
                "Бұл аккаунтта курсқа тіркелу, сабақ progress-і, mini quiz немесе тест нәтижесі көрінбейді. Сондықтан мен нақты оқу жоспарын ойдан құра алмаймын.",
                "",
                "Не істеуге болады:",
                "1. Алдымен бір курсқа тіркеліңіз немесе сабақты бастаңыз.",
                "2. Бірнеше сабақ өтіп, mini quiz немесе тест нәтижесі пайда болғаннан кейін қайта сұраңыз.",
                "3. Сол кезде мен нақты оқу context бойынша қай тақырыпқа назар аудару керегін түсіндіре аламын.",
            ]
        )

    if payload.mode == LearningAiMode.teacher_course_assistant:
        return "\n".join(
            [
                "Бұл курс бойынша жеке педагогикалық талдау жасауға жеткілікті оқу дерегі табылмады.",
                "",
                "Курс таңдалғанымен, оқушы әрекеті, сабақ progress-і, mini quiz немесе тест нәтижесі жоқ сияқты. Сондықтан AI нақты қайталау жоспарын немесе қиын сабақтар талдауын ойдан шығармайды.",
                "",
                "Не істеуге болады:",
                "1. Курсқа сабақтар мен тапсырмалар қосылғанын тексеріңіз.",
                "2. Оқушылар курс материалымен жұмыс істегеннен кейін қайта сұраңыз.",
                "3. Дерек пайда болған соң AI course context бойынша нақты педагогикалық ұсыныс береді.",
            ]
        )

    return "\n".join(
        [
            "Бұл оқушы бойынша жеке қолдау ұсынысын жасауға жеткілікті оқу дерегі табылмады.",
            "",
            "Оқушы таңдалғанымен, осы курс бойынша progress, mini quiz, тест немесе қайталау белгісі көрінбейді. Сондықтан AI оқушы туралы қорытындыны ойдан шығармайды.",
            "",
            "Не істеуге болады:",
            "1. Оқушының осы курсқа нақты тіркелгенін тексеріңіз.",
            "2. Оқушы бірнеше сабақ өтіп немесе mini quiz тапсырғаннан кейін қайта сұраңыз.",
            "3. Дерек пайда болған кезде AI жеке қолдау бағытын жұмсақ әрі нақты ұсынады.",
        ]
    )


def _build_context_based_fallback_answer(
    *,
    payload: LearningAiRequest,
    context: dict[str, Any],
    llm_error: str | None = None,
) -> str:
    if not _has_usable_learning_context(payload=payload, context=context):
        return _build_no_data_answer(payload)

    recommendations = _get_recommendations(context)
    weak_lessons = _get_weak_lessons(context)
    signals = _get_signals(context)
    primary_focus = _clean_text(signals.get("primaryFocus"))
    prompt = payload.prompt.strip()

    lines: list[str] = []

    if payload.mode == LearningAiMode.student_tracker:
        lines.extend(
            [
                "Қысқаша жауап:",
                primary_focus
                or "Оқу context бойынша бірінші кезекте нақты бір бағытты таңдап, қысқа жоспармен жұмыс істеген дұрыс.",
                "",
                "Неге бұлай?",
            ]
        )
    elif payload.mode == LearningAiMode.teacher_course_assistant:
        lines.extend(
            [
                "Қысқаша қорытынды:",
                primary_focus
                or "Курс context бойынша мұғалімге сабақты жоспарлау және қайталау жұмысын нақтылау пайдалы.",
                "",
                "Негізгі сигнал:",
            ]
        )
    else:
        lines.extend(
            [
                "Қысқаша қорытынды:",
                primary_focus
                or "Оқушы context бойынша жеке қолдау бағытын жұмсақ түрде нақтылау пайдалы.",
                "",
                "Негізгі сигнал:",
            ]
        )

    supporting_signals = [
        _clean_text(item)
        for item in _as_list(signals.get("supportingSignals"))
        if _clean_text(item)
    ]

    if supporting_signals:
        for signal in supporting_signals[:3]:
            lines.append(f"- {signal}")
    elif weak_lessons:
        for lesson in weak_lessons[:2]:
            title = _clean_text(lesson.get("lessonTitle")) or "Қайталау қажет сабақ"
            reason = _clean_text(lesson.get("reason")) or "Қосымша бекіту пайдалы болуы мүмкін"
            lines.append(f"- {title}: {reason}")
    elif recommendations:
        for item in recommendations[:2]:
            title = _clean_text(item.get("title")) or "Ұсыныс"
            description = _clean_text(item.get("description")) or "Оқу бағытын нақтылау пайдалы"
            lines.append(f"- {title}: {description}")
    else:
        lines.append("- Context шектеулі, сондықтан ұсыныс жалпы бағыт ретінде беріледі.")

    lines.extend(["", "Келесі әрекет:"])

    if recommendations:
        for index, item in enumerate(recommendations[:3], start=1):
            description = _clean_text(item.get("description")) or _clean_text(item.get("title"))
            if description:
                lines.append(f"{index}. {description}")
    else:
        lines.extend(
            [
                "1. Бір ғана оқу бағытын таңдаңыз.",
                "2. Сол бағыт бойынша қысқа қайталау жасаңыз.",
                "3. Нәтижені шағын тапсырма арқылы тексеріңіз.",
            ]
        )

    lines.extend(
        [
            "",
            "Ескерту:",
            "Бұл жауап оқу context-іне сүйенген көмекші ұсыныс. Соңғы шешімді адам қабылдайды.",
        ]
    )

    if llm_error:
        lines.extend(
            [
                "",
                "Техникалық ескерту:",
                "AI model уақытша жауап бере алмады, сондықтан қауіпсіз fallback жауап қолданылды.",
            ]
        )

    if prompt:
        lines.extend(["", f"Сұрақ: {prompt}"])

    return "\n".join(lines)


async def _build_answer(
    *,
    payload: LearningAiRequest,
    context: dict[str, Any],
) -> tuple[str, str | None]:
    if not _has_usable_learning_context(payload=payload, context=context):
        return _build_no_data_answer(payload), None

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

    has_learning_context = _has_usable_learning_context(
        payload=payload,
        context=context,
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
        contextSummary=(
            _build_safe_context_summary(payload=payload, context=context)
            if has_learning_context
            else None
        ),
        confidence=_estimate_confidence(payload=payload, context=context),
        warnings=_build_warnings(
            payload=payload,
            context=context,
            llm_error=llm_error,
        ),
        followUpPrompts=_build_follow_up_prompts(
            payload=payload,
            context=context,
        ),
    )