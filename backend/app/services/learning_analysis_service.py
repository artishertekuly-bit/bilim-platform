from fastapi import HTTPException, status

from app.schemas.learning_analysis import (
    LearningAiMode,
    LearningAiRequest,
    LearningAiResponse,
    LearningAiUsedContext,
    now_iso,
)


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


def _build_placeholder_answer(
    payload: LearningAiRequest,
    current_user_id: str,
) -> str:
    prompt = payload.prompt.strip()

    if payload.mode == LearningAiMode.student_tracker:
        return (
            "AI Tracker backend endpoint жұмыс істеп тұр.\n\n"
            "Қазір бұл demo жауап. Келесі кезеңде backend оқушының оқу snapshot-ын "
            "жинап, progress, mini quiz, сақталған сабақтар және кейін қайталау "
            "белгілері бойынша нақты ұсыныс береді.\n\n"
            f"Authenticated user: {current_user_id}\n"
            f"Сұрақ: {prompt}"
        )

    if payload.mode == LearningAiMode.teacher_course_assistant:
        course_id = payload.scope.course_id if payload.scope else None

        return (
            "AI курс көмекшісі backend endpoint жұмыс істеп тұр.\n\n"
            "Қазір бұл demo жауап. Келесі кезеңде backend таңдалған курс бойынша "
            "course learning snapshot жинап, қиын сабақтар, mini quiz өту көрсеткіші "
            "және орташа progress бойынша мұғалімге ұсыныс береді.\n\n"
            f"Teacher user: {current_user_id}\n"
            f"Course ID: {course_id}\n"
            f"Сұрақ: {prompt}"
        )

    course_id = payload.scope.course_id if payload.scope else None
    student_id = payload.scope.student_id if payload.scope else None

    return (
        "AI оқушы көмекшісі backend endpoint жұмыс істеп тұр.\n\n"
        "Қазір бұл demo жауап. Келесі кезеңде backend таңдалған оқушының осы курс "
        "бойынша оқу snapshot-ын жинап, мұғалімге педагогикалық ұсыныс береді.\n\n"
        f"Teacher user: {current_user_id}\n"
        f"Course ID: {course_id}\n"
        f"Student ID: {student_id}\n"
        f"Сұрақ: {prompt}"
    )


async def create_learning_analysis(
    payload: LearningAiRequest,
    current_user_id: str,
) -> LearningAiResponse:
    _validate_request_contract(
        payload=payload,
        current_user_id=current_user_id,
    )

    return LearningAiResponse(
        answer=_build_placeholder_answer(
            payload=payload,
            current_user_id=current_user_id,
        ),
        generatedAt=now_iso(),
        mode=payload.mode,
        usedContext=_resolve_used_context(
            payload=payload,
            current_user_id=current_user_id,
        ),
    )