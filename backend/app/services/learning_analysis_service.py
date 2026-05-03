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


def _is_advisor_mode(mode: LearningAiMode) -> bool:
    return mode in {
        LearningAiMode.student_course_advisor,
        LearningAiMode.teacher_course_creator_advisor,
    }


def _is_analysis_mode(mode: LearningAiMode) -> bool:
    return mode in {
        LearningAiMode.student_tracker,
        LearningAiMode.teacher_course_assistant,
        LearningAiMode.teacher_student_assistant,
    }


def _validate_request_contract(
    payload: LearningAiRequest,
    current_user_id: str,
) -> None:
    prompt = _clean_text(getattr(payload, "prompt", ""))

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

    if payload.mode == LearningAiMode.student_course_advisor:
        if payload.role != LearningAiRole.student:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Course advisor тек оқушы режиміне арналған.",
            )

        requested_student_id = scope.student_id if scope else None

        if requested_student_id and requested_student_id != current_user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Course advisor тек өз аккаунтыңыз бойынша жұмыс істейді.",
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

    if payload.mode == LearningAiMode.teacher_course_creator_advisor:
        if payload.role != LearningAiRole.teacher:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Course creator advisor тек мұғалім режиміне арналған.",
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


def _get_teacher(context: dict[str, Any]) -> dict[str, Any]:
    return _as_dict(context.get("teacher"))


def _get_learning_snapshot(context: dict[str, Any]) -> dict[str, Any]:
    return _as_dict(context.get("learningSnapshot"))


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


def _get_available_course_catalog(context: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        item
        for item in _as_list(context.get("availableCourseCatalog"))
        if isinstance(item, dict)
    ]


def _get_public_catalog_signals(context: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        item
        for item in _as_list(context.get("publicCourseCatalogSignals"))
        if isinstance(item, dict)
    ]


def _get_teacher_courses(context: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        item
        for item in _as_list(context.get("teacherCourses"))
        if isinstance(item, dict)
    ]


def _get_teacher_lessons(context: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        item
        for item in _as_list(context.get("teacherLessons"))
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


def _extract_teacher_subject_name(context: dict[str, Any]) -> str | None:
    teacher = _get_teacher(context)
    value = teacher.get("subjectName") or teacher.get("subject_name")

    if not value:
        signals = _get_signals(context)
        value = signals.get("profileSubject")

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
    subject_name = _extract_teacher_subject_name(context)
    snapshot_generated_at = _extract_snapshot_generated_at(context)

    if payload.mode == LearningAiMode.student_tracker:
        return LearningAiUsedContext(
            source="student_learning_snapshot",
            studentId=current_user_id,
            studentName=student_name,
            snapshotGeneratedAt=snapshot_generated_at,
        )

    if payload.mode == LearningAiMode.student_course_advisor:
        return LearningAiUsedContext(
            source="student_course_advisor_context",
            studentId=current_user_id,
            studentName=student_name,
            subjectName=subject_name,
            snapshotGeneratedAt=snapshot_generated_at,
        )

    if payload.mode == LearningAiMode.teacher_course_assistant:
        return LearningAiUsedContext(
            source="course_learning_snapshot",
            courseId=scope.course_id if scope else None,
            courseTitle=course_title,
            snapshotGeneratedAt=snapshot_generated_at,
        )

    if payload.mode == LearningAiMode.teacher_course_creator_advisor:
        return LearningAiUsedContext(
            source="teacher_course_creator_context",
            subjectName=subject_name,
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


def _meaningful_recommendations(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        item
        for item in items
        if _clean_text(item.get("reason")) != "no strong risk signal found"
    ]


def _has_real_learning_activity(totals: dict[str, Any]) -> bool:
    """
    Counts only learner-generated signals. Static structure such as course/lesson
    existence is not enough for a personal learning analysis.
    """
    activity_keys = [
        "completedLessons",
        "completedLessonRecords",
        "miniQuizAttempts",
        "testAttempts",
        "savedLessons",
        "reviewLaterItems",
    ]

    return any(_to_number(totals.get(key)) > 0 for key in activity_keys)


def _has_usable_learning_context(
    *,
    payload: LearningAiRequest,
    context: dict[str, Any],
) -> bool:
    if _is_advisor_mode(payload.mode):
        return True

    totals = _get_totals(context)
    weak_lessons = _get_weak_lessons(context)
    recommendations = _get_recommendations(context)
    mini_quizzes = _get_mini_quizzes(context)
    signals = _get_signals(context)

    if _has_meaningful_text_items(weak_lessons):
        return True

    meaningful_recommendations = _meaningful_recommendations(recommendations)
    if _has_meaningful_text_items(meaningful_recommendations):
        return True

    supporting_signals = [
        _clean_text(item)
        for item in _as_list(signals.get("supportingSignals"))
        if _clean_text(item)
    ]
    if supporting_signals and _has_real_learning_activity(totals):
        return True

    return _has_real_learning_activity(totals)


def _advisor_context_strength(
    *,
    payload: LearningAiRequest,
    context: dict[str, Any],
) -> str:
    if payload.mode == LearningAiMode.student_course_advisor:
        catalog = _get_available_course_catalog(context)
        learning_snapshot = _get_learning_snapshot(context)
        student = _get_student(context)

        has_student_profile = bool(
            _clean_text(student.get("bio"))
            or _clean_text(student.get("subjectName"))
        )
        has_learning_history = bool(_as_list(learning_snapshot.get("courses")))
        has_catalog = bool(catalog)

        score = sum([has_student_profile, has_learning_history, has_catalog])

        if score >= 2:
            return "high"
        if score == 1:
            return "medium"
        return "low"

    if payload.mode == LearningAiMode.teacher_course_creator_advisor:
        teacher = _get_teacher(context)
        teacher_courses = _get_teacher_courses(context)
        teacher_lessons = _get_teacher_lessons(context)
        public_catalog = _get_public_catalog_signals(context)

        has_profile = bool(
            _clean_text(teacher.get("bio"))
            or _clean_text(teacher.get("subjectName"))
        )
        has_own_courses = bool(teacher_courses)
        has_own_lessons = bool(teacher_lessons)
        has_catalog = bool(public_catalog)

        score = sum([has_profile, has_own_courses, has_own_lessons, has_catalog])

        if score >= 3:
            return "high"
        if score >= 1:
            return "medium"
        return "low"

    return "low"


def _build_safe_context_summary(
    *,
    payload: LearningAiRequest,
    context: dict[str, Any],
) -> str | None:
    signals = _get_signals(context)
    primary_focus = _clean_text(signals.get("primaryFocus"))

    if primary_focus:
        return primary_focus

    if _is_advisor_mode(payload.mode):
        if payload.mode == LearningAiMode.student_course_advisor:
            return "Course advisor context дайын. AI сұраққа қарай платформадағы қолжетімді курстарды немесе жалпы оқу бағытын ұсынады."

        return "Course creator advisor context дайын. AI мұғалімге курс немесе сабақ идеяларын ұсына алады."

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
    if _is_advisor_mode(payload.mode):
        return _advisor_context_strength(payload=payload, context=context)

    if not _has_usable_learning_context(payload=payload, context=context):
        return "low"

    weak_lessons = _get_weak_lessons(context)
    recommendations = _get_recommendations(context)
    mini_quizzes = _get_mini_quizzes(context)
    signals = _get_signals(context)

    signal_count = 0

    if _has_meaningful_text_items(weak_lessons):
        signal_count += 1

    meaningful_recommendations = _meaningful_recommendations(recommendations)

    if _has_meaningful_text_items(meaningful_recommendations):
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

    elif payload.mode == LearningAiMode.student_course_advisor:
        warnings.append(
            "AI тек жарияланған ашық немесе ақылы курстарды ұсына алады; жабық курстар ұсынылмайды."
        )

        if _advisor_context_strength(payload=payload, context=context) == "low":
            warnings.append(
                "Жеке дерек аз болғандықтан, ұсыныс жалпы бағыт ретінде беріледі."
            )

    elif payload.mode == LearningAiMode.teacher_course_creator_advisor:
        warnings.append(
            "AI курс немесе сабақ идеясын ұсынады, бірақ соңғы оқу бағдарламасын мұғалім өзі бекітеді."
        )

        if _advisor_context_strength(payload=payload, context=context) == "low":
            warnings.append(
                "Мұғалім туралы дерек аз болғандықтан, нақтылау үшін пән, аудитория және мақсат қажет болуы мүмкін."
            )

    else:
        warnings.append(
            "AI оқушыға үкім шығармайды; жауап тек педагогикалық талқылауға арналған."
        )

    if _is_analysis_mode(payload.mode) and not _has_usable_learning_context(
        payload=payload,
        context=context,
    ):
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
    if payload.mode == LearningAiMode.student_course_advisor:
        return [
            "Маған 3 курс бағытын салыстырып бер.",
            "Менің деңгейіме сай оқу жолын ұсын.",
            "Платформадағы қолжетімді курстардан бастау жоспарын жаса.",
        ]

    if payload.mode == LearningAiMode.teacher_course_creator_advisor:
        return [
            "Осы идеяны толық курс құрылымына айналдыр.",
            "Осы курсқа 6 сабақ тақырыбын ұсын.",
            "Курсқа mini quiz және практикалық тапсырмалар идеясын қос.",
        ]

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


def _course_line(course: dict[str, Any]) -> str:
    title = _clean_text(course.get("title")) or "Курс"
    subject = _clean_text(course.get("subjectName"))
    grade = _clean_text(course.get("gradeLevel"))
    access_type = _clean_text(course.get("accessType"))
    description = _clean_text(course.get("description"))

    parts = [title]

    if subject:
        parts.append(subject)
    if grade:
        parts.append(grade)
    if access_type:
        parts.append(access_type)

    line = " · ".join(parts)

    if description:
        line = f"{line}: {description}"

    return line


def _build_student_advisor_fallback_answer(
    *,
    context: dict[str, Any],
) -> str:
    catalog = _get_available_course_catalog(context)
    student = _get_student(context)
    student_subject = _clean_text(student.get("subjectName"))

    lines = [
        "Қысқаша жауап:",
    ]

    if catalog:
        lines.append(
            "Сізге нақты ұсынысты платформадағы қолжетімді курстарға сүйеніп бере аламын."
        )
    else:
        lines.append(
            "Платформада қазір ұсынылатын ашық немесе ақылы курстар табылмады, сондықтан жалпы оқу бағыты бойынша ғана кеңес бере аламын."
        )

    lines.extend(["", "Ұсыныс логикасы:"])

    if student_subject:
        lines.append(f"- Профильдегі бағыт: {student_subject}.")
    else:
        lines.append("- Сіздің нақты қызығушылық бағытыңыз көрсетілмеген, сондықтан ұсыныс жалпы болады.")

    if catalog:
        lines.append("- Жабық курстар ұсынысқа кірмейді; тек жарияланған ашық немесе ақылы курстар қаралады.")

        lines.extend(["", "Қарауға болатын бағыттар:"])
        for index, course in enumerate(catalog[:4], start=1):
            lines.append(f"{index}. {_course_line(course)}")
    else:
        lines.extend(
            [
                "",
                "Нақтырақ ұсыну үшін маған мынаны жазыңыз:",
                "1. Қай пән немесе сала қызықтырады?",
                "2. Қай деңгейдесіз: бастауыш, орта, advanced?",
                "3. Мақсатыңыз қандай: емтихан, жоба, мамандық, жалпы даму?",
            ]
        )

    lines.extend(
        [
            "",
            "Келесі қадам:",
            "Өзіңізге қызық 1 бағытты жазыңыз. Мен соған қарай оқу жолын немесе курс таңдау критерийін нақтылап беремін.",
        ]
    )

    return "\n".join(lines)


def _build_teacher_creator_fallback_answer(
    *,
    context: dict[str, Any],
) -> str:
    teacher = _get_teacher(context)
    signals = _get_signals(context)
    teacher_courses = _get_teacher_courses(context)
    teacher_lessons = _get_teacher_lessons(context)
    subject_name = _clean_text(teacher.get("subjectName")) or _clean_text(
        signals.get("profileSubject")
    )

    lines = [
        "Қысқаша жауап:",
    ]

    if teacher_courses:
        lines.append(
            "Сізде бұрыннан курс деректері бар, сондықтан жаңа курс идеясын сол бағыттарды жалғастыратындай етіп құруға болады."
        )
    elif subject_name:
        lines.append(
            f"Профильдегі бағытқа сүйеніп, {subject_name} бойынша жаңа курс немесе сабақ идеясын ұсынуға болады."
        )
    else:
        lines.append(
            "Сіз туралы пән, аудитория немесе мақсат дерегі аз. Сондықтан әзірге жалпы курс идеяларын ұсынамын."
        )

    lines.extend(["", "Курс идеясы үшін бағыттар:"])

    if teacher_courses:
        for index, course in enumerate(teacher_courses[:3], start=1):
            title = _clean_text(course.get("title")) or "Курс"
            subject = _clean_text(course.get("subjectName"))
            suffix = f" · {subject}" if subject else ""
            lines.append(f"{index}. {title}{suffix} бағытын тереңдететін жалғастыру курсы.")
    elif subject_name:
        lines.extend(
            [
                f"1. {subject_name} бойынша кіріспе курс.",
                f"2. {subject_name} бойынша практикалық тапсырмалар курсы.",
                f"3. {subject_name} бойынша емтиханға немесе бақылауға дайындық курсы.",
            ]
        )
    else:
        lines.extend(
            [
                "1. Бастапқы деңгейге арналған кіріспе курс.",
                "2. Практикалық тапсырмаларға негізделген қысқа курс.",
                "3. Қайталау және бекітуге арналған mini course.",
            ]
        )

    if teacher_lessons:
        lines.extend(["", "Сабақ идеяларын таңдағанда бұрынғы сабақ тақырыптарын қайталамай, олардың жалғасын жасаған дұрыс."])

    lines.extend(
        [
            "",
            "Нақтылау үшін:",
            "1. Қай пән бойынша курс жасағыңыз келеді?",
            "2. Курс кімге арналған: оқушы, студент, мұғалім, ата-ана?",
            "3. Нәтижесінде learner не істей алуы керек?",
        ]
    )

    return "\n".join(lines)


def _build_context_based_fallback_answer(
    *,
    payload: LearningAiRequest,
    context: dict[str, Any],
    llm_error: str | None = None,
) -> str:
    if payload.mode == LearningAiMode.student_course_advisor:
        answer = _build_student_advisor_fallback_answer(context=context)
    elif payload.mode == LearningAiMode.teacher_course_creator_advisor:
        answer = _build_teacher_creator_fallback_answer(context=context)
    else:
        if not _has_usable_learning_context(payload=payload, context=context):
            return _build_no_data_answer(payload)

        recommendations = _get_recommendations(context)
        weak_lessons = _get_weak_lessons(context)
        signals = _get_signals(context)
        primary_focus = _clean_text(signals.get("primaryFocus"))
        prompt = _clean_text(getattr(payload, "prompt", ""))

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

        if prompt:
            lines.extend(["", f"Сұрақ: {prompt}"])

        answer = "\n".join(lines)

    if llm_error:
        answer = "\n".join(
            [
                answer,
                "",
                "Техникалық ескерту:",
                "AI model уақытша жауап бере алмады, сондықтан қауіпсіз fallback жауап қолданылды.",
            ]
        )

    return answer


async def _build_answer(
    *,
    payload: LearningAiRequest,
    context: dict[str, Any],
) -> tuple[str, str | None]:
    if _is_analysis_mode(payload.mode) and not _has_usable_learning_context(
        payload=payload,
        context=context,
    ):
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

        cleaned_answer = _clean_text(answer)

        if not cleaned_answer:
            llm_error = "LLM бос жауап қайтарды."
            return (
                _build_context_based_fallback_answer(
                    payload=payload,
                    context=context,
                    llm_error=llm_error,
                ),
                llm_error,
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