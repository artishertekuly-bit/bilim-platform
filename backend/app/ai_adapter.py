from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from .ai_engine import create_tutor_service, evaluate_answer_direct, generate_questions

MAX_GENERATED_QUESTIONS = 50


def _utc_iso() -> str:
    return datetime.now(UTC).isoformat()


def _clean_text(value: Any, limit: int | None = None) -> str:
    text = " ".join(str(value or "").replace("\x00", " ").split())
    return text[:limit] if limit else text


def _coerce_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _clamp_question_count(value: Any, default: int) -> int:
    return max(1, min(MAX_GENERATED_QUESTIONS, _coerce_int(value, default)))


def _normalize_context_text(value: Any, limit: int = 8000) -> str:
    if isinstance(value, dict):
        try:
            return _clean_text(json.dumps(value, ensure_ascii=False), limit)
        except Exception:
            return _clean_text(value, limit)

    if isinstance(value, list):
        try:
            return _clean_text(" ".join(_clean_text(item, 1000) for item in value), limit)
        except Exception:
            return _clean_text(value, limit)

    return _clean_text(value, limit)


def _resolve_generation_source(payload: dict[str, Any]) -> str:
    source_text = _clean_text(
        payload.get("source_text") or payload.get("sourceText"),
        20000,
    )
    topic = _clean_text(payload.get("topic"), 200)
    subject = _clean_text(payload.get("subject"), 120)
    title = _clean_text(payload.get("title"), 200)
    return source_text or topic or subject or title


def _resolve_requested_count(payload: dict[str, Any], default: int) -> int:
    return _clamp_question_count(
        payload.get("count")
        or payload.get("question_count")
        or payload.get("questionCount"),
        default,
    )


def _resolve_requested_kind(payload: dict[str, Any]) -> str:
    kind = _clean_text(payload.get("kind") or "mixed", 30).lower()
    return kind if kind in {"mixed", "multiple_choice", "short_answer"} else "mixed"


def _resolve_exam_mode(payload: dict[str, Any]) -> str:
    explicit = _clean_text(payload.get("exam_mode") or payload.get("examMode"), 30).lower()
    if explicit in {"unt", "ubt", "ent"}:
        return "unt"

    haystack = " ".join(
        [
            _clean_text(payload.get("title"), 200),
            _clean_text(payload.get("subject"), 200),
            _clean_text(payload.get("topic"), 300),
            _clean_text(payload.get("source_text") or payload.get("sourceText"), 1000),
        ]
    ).lower()

    if any(token in haystack for token in ["ұбт", "ент", "unt", "ubt", "ent"]):
        return "unt"

    return ""


def _normalize_question_type(answer_format: str) -> str:
    return "multiple_choice" if _clean_text(answer_format, 20).lower() == "mcq" else "short_answer"


def _build_option_objects(
    question_id: str,
    options: list[str],
    correct_answer: str = "",
) -> list[dict[str, Any]]:
    normalized_correct = _clean_text(correct_answer).lower()
    unique_options: list[str] = []
    seen: set[str] = set()

    for option in options:
        text = _clean_text(option, 300)
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        unique_options.append(text)

    if normalized_correct and normalized_correct not in seen:
        unique_options.append(_clean_text(correct_answer, 300))

    result: list[dict[str, Any]] = []
    for index, option in enumerate(unique_options, start=1):
        result.append(
            {
                "id": f"{question_id}-option-{index}",
                "text": option,
                "isCorrect": option.lower() == normalized_correct if normalized_correct else False,
            }
        )

    return result


def _filter_questions_by_kind(
    questions: list[dict[str, Any]],
    requested_kind: str,
) -> list[dict[str, Any]]:
    kind = _clean_text(requested_kind or "mixed", 30).lower()

    if kind == "multiple_choice":
        return [
            question
            for question in questions
            if _clean_text(question.get("answer_format")).lower() == "mcq"
        ]

    if kind == "short_answer":
        return [
            question
            for question in questions
            if _clean_text(question.get("answer_format")).lower() != "mcq"
        ]

    return questions


def _top_up_filtered_questions(
    questions: list[dict[str, Any]],
    *,
    requested_count: int,
    requested_kind: str,
    generation_source: str,
    subject: str,
    topic: str,
    exam_mode: str,
) -> list[dict[str, Any]]:
    filtered = _filter_questions_by_kind(questions, requested_kind)
    if len(filtered) >= requested_count or requested_kind == "mixed":
        return filtered[:requested_count]

    fallback_target = min(MAX_GENERATED_QUESTIONS, max(requested_count * 2, requested_count + 6))
    extra_result = generate_questions(
        generation_source,
        requested_count=fallback_target,
        subject=subject,
        topic=topic,
        requested_kind=requested_kind,
        exam_mode=exam_mode,
    )
    extra_questions = list(extra_result.get("questions") or [])
    extra_filtered = _filter_questions_by_kind(extra_questions, requested_kind)

    combined: list[dict[str, Any]] = []
    seen: set[str] = set()

    for row in [*filtered, *extra_filtered]:
        question_text = _clean_text(row.get("question"), 2000).lower()
        if not question_text or question_text in seen:
            continue
        seen.add(question_text)
        combined.append(row)
        if len(combined) >= requested_count:
            break

    return combined[:requested_count]


def _map_engine_question_to_builder(
    question: dict[str, Any],
    fallback_topic: str = "",
) -> dict[str, Any]:
    question_id = _clean_text(question.get("id") or f"Q-{uuid4().hex[:8]}", 80)
    answer_format = _clean_text(question.get("answer_format") or "text", 20).lower()
    correct_answer = _clean_text(question.get("correct_answer"), 500)
    reference_answer = _clean_text(question.get("reference_answer"), 2000)

    return {
        "id": question_id,
        "type": _normalize_question_type(answer_format),
        "question": _clean_text(question.get("question"), 2000),
        "options": _build_option_objects(
            question_id=question_id,
            options=[str(x) for x in (question.get("options") or [])],
            correct_answer=correct_answer,
        ),
        "correctAnswer": correct_answer or None,
        "explanation": reference_answer or None,
        "difficulty": _clean_text(question.get("difficulty"), 60) or None,
        "topic": _clean_text(question.get("topic"), 200) or fallback_topic or None,
    }


def _map_engine_question_to_test_question(
    question: dict[str, Any],
    sort_order: int,
) -> dict[str, Any]:
    answer_format = _clean_text(question.get("answer_format") or "text", 20).lower()
    correct_answer = _clean_text(question.get("correct_answer"), 500)
    options = [
        _clean_text(option, 300)
        for option in (question.get("options") or [])
        if _clean_text(option)
    ]

    deduped_options: list[str] = []
    seen: set[str] = set()
    for option in options:
        key = option.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped_options.append(option)
    options = deduped_options

    if answer_format == "mcq" and correct_answer and options:
        if correct_answer.lower() not in {option.lower() for option in options}:
            options.append(correct_answer)

    correct_indexes: list[int] = []
    if answer_format == "mcq" and correct_answer and options:
        for index, option in enumerate(options):
            if option.lower() == correct_answer.lower():
                correct_indexes.append(index)

    question_type = "multiple_choice" if len(correct_indexes) > 1 else "single_choice"

    return {
        "questionText": _clean_text(question.get("question"), 2000),
        "options": options,
        "correctAnswer": correct_indexes,
        "explanation": _clean_text(question.get("reference_answer"), 2000) or "",
        "questionType": question_type,
        "sortOrder": sort_order,
        "difficulty": _clean_text(question.get("difficulty"), 60) or "",
        "topic": _clean_text(question.get("topic"), 200) or "",
    }


def generate_questions_for_bilimcorp(payload: dict[str, Any]) -> dict[str, Any]:
    generation_source = _resolve_generation_source(payload)
    topic = _clean_text(payload.get("topic"), 200)
    subject = _clean_text(payload.get("subject"), 120)
    requested_count = _resolve_requested_count(payload, 5)
    requested_kind = _resolve_requested_kind(payload)
    exam_mode = _resolve_exam_mode(payload)

    if not generation_source:
        raise ValueError("Мәтін немесе мазмұн енгізу қажет.")

    engine_result = generate_questions(
        generation_source,
        requested_count=requested_count,
        subject=subject,
        topic=topic,
        requested_kind=requested_kind,
        exam_mode=exam_mode,
    )
    raw_questions = list(engine_result.get("questions") or [])
    selected_questions = _top_up_filtered_questions(
        raw_questions,
        requested_count=requested_count,
        requested_kind=requested_kind,
        generation_source=generation_source,
        subject=subject,
        topic=topic,
        exam_mode=exam_mode,
    )

    normalized_questions = [
        _map_engine_question_to_builder(question, fallback_topic=topic)
        for question in selected_questions
    ]

    return {
        "questions": normalized_questions,
        "meta": {
            "mode": engine_result.get("mode") or "fallback",
            "subject": subject or engine_result.get("subject") or "general",
            "topic": topic or None,
            "passage": engine_result.get("passage") or "",
            "requestedCount": requested_count,
            "returnedCount": len(normalized_questions),
            "requestedKind": requested_kind,
            "examMode": exam_mode or None,
        },
    }


def generate_test_draft_for_bilimcorp(payload: dict[str, Any]) -> dict[str, Any]:
    title = _clean_text(payload.get("title") or "AI draft test", 200) or "AI draft test"
    subject = _clean_text(payload.get("subject"), 120)
    topic = _clean_text(payload.get("topic"), 200)
    requested_kind = _resolve_requested_kind(payload)
    exam_mode = _resolve_exam_mode(payload)
    duration_minutes = max(
        5,
        min(180, _coerce_int(payload.get("duration_minutes") or payload.get("durationMinutes"), 30)),
    )
    requested_count = _resolve_requested_count(payload, 10)
    generation_source = _resolve_generation_source(payload)

    if not generation_source:
        raise ValueError("Draft test құру үшін topic немесе source text қажет.")

    engine_result = generate_questions(
        generation_source,
        requested_count=requested_count,
        subject=subject,
        topic=topic,
        requested_kind=requested_kind,
        exam_mode=exam_mode,
    )
    raw_questions = list(engine_result.get("questions") or [])
    selected_questions = _top_up_filtered_questions(
        raw_questions,
        requested_count=requested_count,
        requested_kind=requested_kind,
        generation_source=generation_source,
        subject=subject,
        topic=topic,
        exam_mode=exam_mode,
    )

    builder_questions = [
        _map_engine_question_to_builder(question, fallback_topic=topic)
        for question in selected_questions
    ]

    test_questions = [
        _map_engine_question_to_test_question(question, sort_order=index)
        for index, question in enumerate(selected_questions, start=1)
        if _clean_text(question.get("answer_format")).lower() == "mcq"
        and len(question.get("options") or []) >= 2
        and _clean_text(question.get("correct_answer"))
    ]

    return {
        "exam": {
            "id": f"draft-{uuid4().hex}",
            "title": title,
            "subject": subject or None,
            "topic": topic or None,
            "status": "draft",
            "duration_minutes": duration_minutes,
            "question_count": len(builder_questions),
            "created_at": _utc_iso(),
        },
        "questions": builder_questions,
        "test_import_payload": {
            "titleSuggestion": title,
            "subject": subject or None,
            "topic": topic or None,
            "questions": test_questions,
            "skippedCount": max(len(builder_questions) - len(test_questions), 0),
            "examMode": exam_mode or None,
        },
        "meta": {
            "mode": engine_result.get("mode") or "fallback",
            "subject": subject or engine_result.get("subject") or "general",
            "topic": topic or None,
            "passage": engine_result.get("passage") or "",
            "requestedCount": requested_count,
            "returnedCount": len(builder_questions),
            "requestedKind": requested_kind,
            "examMode": exam_mode or None,
        },
    }


def evaluate_answer_for_bilimcorp(payload: dict[str, Any]) -> dict[str, Any]:
    question = _clean_text(payload.get("question"), 2000)
    student_answer = _clean_text(
        payload.get("student_answer") or payload.get("studentAnswer"),
        4000,
    )
    context = _normalize_context_text(payload.get("context"), 8000)
    expected_answer = _clean_text(
        payload.get("expected_answer") or payload.get("expectedAnswer"),
        2000,
    )
    reference_answer = _clean_text(
        payload.get("reference_answer") or payload.get("referenceAnswer"),
        2000,
    )

    options_raw = payload.get("options") or []
    options = [_clean_text(option, 300) for option in options_raw if _clean_text(option)]

    answer_format = _clean_text(payload.get("answer_format") or payload.get("answerFormat"), 20).lower()
    if answer_format not in {"mcq", "text"}:
        answer_format = "mcq" if options else "text"

    result = evaluate_answer_direct(
        question=question,
        user_answer=student_answer,
        source_text=context,
        answer_format=answer_format,
        options=options,
        correct_answer=expected_answer,
        reference_answer=reference_answer,
    )

    strengths: list[str] = []
    weaknesses: list[str] = []

    if result.get("is_correct"):
        strengths.append("Жауап негізгі талапқа сәйкес келеді.")
    else:
        weaknesses.append("Жауапта дәлдік немесе негізгі ой толық емес.")

    if _clean_text(result.get("ideal_answer")):
        strengths.append("Үлгі дұрыс жауап қолжетімді.")

    return {
        "score": float(result.get("score", 0)),
        "max_score": float(result.get("max_score", 10.0)),
        "is_correct": bool(result.get("is_correct")),
        "feedback": _clean_text(result.get("feedback"), 2000),
        "explanation": _clean_text(result.get("ideal_answer"), 2000),
        "suggestion": _clean_text(result.get("suggestion"), 2500),
        "strengths": strengths,
        "weaknesses": weaknesses,
        "meta": {
            "mode": result.get("mode") or "fallback",
            "answerFormat": answer_format,
        },
    }


def tutor_reply_for_bilimcorp(payload: dict[str, Any]) -> dict[str, Any]:
    message = _clean_text(payload.get("message"), 4000)
    if not message:
        raise ValueError("Tutor хабарламасы бос болмауы керек.")

    context = payload.get("context") or {}
    if not isinstance(context, dict):
        context = {}

    history_payload = payload.get("history") or []
    history: list[dict[str, str]] = []

    if isinstance(history_payload, list):
        for row in history_payload[-8:]:
            if not isinstance(row, dict):
                continue

            role = _clean_text(row.get("role"), 20).lower() or "user"
            if role not in {"user", "assistant", "system"}:
                role = "user"

            content = _clean_text(row.get("content"), 4000)
            if not content:
                continue

            history.append({"role": role, "content": content})

    service = create_tutor_service()
    result = service.tutor_reply(
        user_message=message,
        context=context,
        history=history,
    )

    reply_text = _clean_text(result.get("answer"), 12000)
    if not reply_text:
        reply_text = "Кешіріңіз, жауап дайындау кезінде қате пайда болды. Сұрақты нақтылап қайта жіберіңіз."

    return {
        "reply": {
            "id": f"assistant-{uuid4().hex}",
            "role": "assistant",
            "content": reply_text,
            "created_at": _utc_iso(),
        },
        "used_model": result.get("used_model") or "fallback",
        "fallback": bool(result.get("fallback")),
    }