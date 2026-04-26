from fastapi import HTTPException, status

from app.schemas.learning_analysis import (
    LearningAiMode,
    LearningAiRequest,
    LearningAiResponse,
    LearningAiUsedContext,
    now_iso,
)


def _validate_request_contract(payload: LearningAiRequest) -> None:
    prompt = payload.prompt.strip()

    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Сұрақ бос болмауы керек.",
        )

    scope = payload.scope

    if payload.mode == LearningAiMode.teacher_course_assistant:
        if not scope or not scope.course_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Курс бойынша AI көмекші үшін courseId қажет.",
            )

    if payload.mode == LearningAiMode.teacher_student_assistant:
        if not scope or not scope.course_id or not scope.student_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Оқушы бойынша AI көмекші үшін courseId және studentId қажет.",
            )

    if payload.mode == LearningAiMode.student_tracker:
        if payload.role != "student":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="AI Tracker тек оқушы режиміне арналған.",
            )

    if payload.mode in {
        LearningAiMode.teacher_course_assistant,
        LearningAiMode.teacher_student_assistant,
    }:
        if payload.role != "teacher":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="AI көмекші тек мұғалім режиміне арналған.",
            )


def _resolve_used_context(payload: LearningAiRequest) -> LearningAiUsedContext:
    scope = payload.scope

    if payload.mode == LearningAiMode.student_tracker:
        return LearningAiUsedContext(
            source="student_learning_snapshot",
            studentId=scope.student_id if scope else None,
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


def _build_placeholder_answer(payload: LearningAiRequest) -> str:
    """
    Бұл уақытша жауап.
    Келесі кезеңде осы жерге:
    1. auth user тексеру
    2. Supabase snapshot жинау
    3. prompt builder
    4. LLM provider call
    қосылады.
    """

    if payload.mode == LearningAiMode.student_tracker:
        return (
            "AI Tracker backend endpoint жұмыс істеп тұр.\n\n"
            "Қазір бұл demo жауап. Келесі кезеңде backend оқушының оқу snapshot-ын "
            "жинап, progress, mini quiz, сақталған сабақтар және кейін қайталау "
            "белгілері бойынша нақты ұсыныс береді.\n\n"
            f"Сұрақ: {payload.prompt.strip()}"
        )

    if payload.mode == LearningAiMode.teacher_course_assistant:
        return (
            "AI курс көмекшісі backend endpoint жұмыс істеп тұр.\n\n"
            "Қазір бұл demo жауап. Келесі кезеңде backend таңдалған курс бойынша "
            "course learning snapshot жинап, қиын сабақтар, mini quiz өту көрсеткіші "
            "және орташа progress бойынша мұғалімге ұсыныс береді.\n\n"
            f"Сұрақ: {payload.prompt.strip()}"
        )

    return (
        "AI оқушы көмекшісі backend endpoint жұмыс істеп тұр.\n\n"
        "Қазір бұл demo жауап. Келесі кезеңде backend таңдалған оқушының осы курс "
        "бойынша оқу snapshot-ын жинап, мұғалімге педагогикалық ұсыныс береді.\n\n"
        f"Сұрақ: {payload.prompt.strip()}"
    )


async def create_learning_analysis(payload: LearningAiRequest) -> LearningAiResponse:
    _validate_request_contract(payload)

    return LearningAiResponse(
        answer=_build_placeholder_answer(payload),
        generatedAt=now_iso(),
        mode=payload.mode,
        usedContext=_resolve_used_context(payload),
    )