from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from .ai_engine import create_tutor_service, evaluate_answer_direct, generate_questions

MAX_GENERATED_QUESTIONS = 50
MAX_GENERATION_SOURCE_CHARS = 20_000
MAX_CONTEXT_CHARS = 8_000
MAX_TUTOR_HISTORY_MESSAGES = 8
MAX_TUTOR_HISTORY_MESSAGE_CHARS = 4_000
MAX_TUTOR_CONTEXT_STRING_CHARS = 2_000

ALLOWED_REQUESTED_KINDS = {"mixed", "multiple_choice", "short_answer"}
ALLOWED_ENGINE_ANSWER_FORMATS = {"mcq", "text"}
ALLOWED_TUTOR_HISTORY_ROLES = {"user", "assistant"}


class AiAdapterError(ValueError):
    """Raised when adapter input/output cannot be normalized safely."""


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


def _coerce_int(value: Any, default: int = 0) -> int:
    if isinstance(value, bool):
        return default

    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _coerce_float(value: Any, default: float = 0.0) -> float:
    if isinstance(value, bool):
        return default

    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp_question_count(value: Any, default: int) -> int:
    return max(1, min(MAX_GENERATED_QUESTIONS, _coerce_int(value, default)))


def _dedupe_text_items(values: list[str], limit: int = 300) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()

    for value in values:
        text = _clean_text(value, limit)
        if not text:
            continue

        key = text.lower()
        if key in seen:
            continue

        seen.add(key)
        result.append(text)

    return result


def _extract_option_text(value: Any) -> str:
    if isinstance(value, dict):
        for key in ["text", "label", "value", "answer", "content"]:
            text = _clean_text(value.get(key), 300)
            if text:
                return text
        return ""

    return _clean_text(value, 300)


def _normalize_options(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []

    return _dedupe_text_items([_extract_option_text(item) for item in value], 300)


def _normalize_correct_answer(value: Any, options: list[str] | None = None) -> str:
    option_list = options or []

    if isinstance(value, list):
        if not value:
            return ""

        # Current frontend/test import supports one correct answer for generated MCQ.
        return _normalize_correct_answer(value[0], option_list)

    if isinstance(value, dict):
        for key in ["text", "label", "value", "answer", "content"]:
            text = _clean_text(value.get(key), 500)
            if text:
                return text
        return ""

    if isinstance(value, int) and option_list:
        if 0 <= value < len(option_list):
            return option_list[value]
        if 1 <= value <= len(option_list):
            return option_list[value - 1]

    text = _clean_text(value, 500)

    if text.isdigit() and option_list:
        index = int(text)
        if 0 <= index < len(option_list):
            return option_list[index]
        if 1 <= index <= len(option_list):
            return option_list[index - 1]

    return text


def _normalize_context_text(value: Any, limit: int = MAX_CONTEXT_CHARS) -> str:
    if isinstance(value, dict):
        try:
            text = json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)
        except Exception:
            text = str(value)
        return _clean_text(text, limit)

    if isinstance(value, list):
        parts = [_clean_text(item, 1000) for item in value]
        return _clean_text(" ".join(part for part in parts if part), limit)

    return _clean_text(value, limit)


def _resolve_generation_source(payload: dict[str, Any]) -> str:
    source_text = _clean_multiline_text(
        payload.get("source_text") or payload.get("sourceText"),
        MAX_GENERATION_SOURCE_CHARS,
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
    return kind if kind in ALLOWED_REQUESTED_KINDS else "mixed"


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


def _normalize_answer_format(value: Any, options: list[str] | None = None) -> str:
    answer_format = _clean_text(value or "text", 20).lower()

    if answer_format in {"multiple_choice", "single_choice", "choice", "mcq"}:
        return "mcq"

    if answer_format in {"short_answer", "text", "free_text"}:
        return "text"

    return "mcq" if options else "text"


def _normalize_question_type(answer_format: str) -> str:
    return "multiple_choice" if _normalize_answer_format(answer_format) == "mcq" else "short_answer"


def _is_valid_engine_question(question: Any) -> bool:
    if not isinstance(question, dict):
        return False

    return bool(_clean_text(question.get("question"), 2000))


def _sanitize_engine_questions(questions: Any) -> list[dict[str, Any]]:
    if not isinstance(questions, list):
        return []

    result: list[dict[str, Any]] = []
    seen: set[str] = set()

    for row in questions:
        if not _is_valid_engine_question(row):
            continue

        question_text = _clean_text(row.get("question"), 2000)
        key = question_text.lower()
        if key in seen:
            continue

        seen.add(key)
        result.append(row)

    return result


def _build_option_objects(
    *,
    question_id: str,
    options: list[str],
    correct_answer: str = "",
) -> list[dict[str, Any]]:
    normalized_correct = _clean_text(correct_answer).lower()
    unique_options = _dedupe_text_items(options, 300)

    if normalized_correct and normalized_correct not in {item.lower() for item in unique_options}:
        unique_options.append(_clean_text(correct_answer, 300))

    result: list[dict[str, Any]] = []
    for index, option in enumerate(unique_options, start=1):
        result.append(
            {
                "id": f"{question_id}-option-{index}",
                "text": option,
                "isCorrect": bool(normalized_correct and option.lower() == normalized_correct),
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
            if _normalize_answer_format(question.get("answer_format"), _normalize_options(question.get("options"))) == "mcq"
        ]

    if kind == "short_answer":
        return [
            question
            for question in questions
            if _normalize_answer_format(question.get("answer_format"), _normalize_options(question.get("options"))) != "mcq"
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
    filtered = _filter_questions_by_kind(_sanitize_engine_questions(questions), requested_kind)
    if len(filtered) >= requested_count or requested_kind == "mixed":
        return filtered[:requested_count]

    fallback_target = min(
        MAX_GENERATED_QUESTIONS,
        max(requested_count * 2, requested_count + 6),
    )
    extra_result = generate_questions(
        generation_source,
        requested_count=fallback_target,
        subject=subject,
        topic=topic,
        requested_kind=requested_kind,
        exam_mode=exam_mode,
    )
    extra_filtered = _filter_questions_by_kind(
        _sanitize_engine_questions(extra_result.get("questions")),
        requested_kind,
    )

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
    options = _normalize_options(question.get("options"))
    answer_format = _normalize_answer_format(question.get("answer_format"), options)
    correct_answer = _normalize_correct_answer(question.get("correct_answer"), options)
    reference_answer = _clean_multiline_text(question.get("reference_answer"), 2000)

    if answer_format == "mcq" and correct_answer and correct_answer.lower() not in {item.lower() for item in options}:
        options.append(correct_answer)

    return {
        "id": question_id,
        "type": _normalize_question_type(answer_format),
        "question": _clean_multiline_text(question.get("question"), 2000),
        "options": _build_option_objects(
            question_id=question_id,
            options=options,
            correct_answer=correct_answer,
        ) if answer_format == "mcq" else [],
        "correctAnswer": correct_answer or None,
        "explanation": reference_answer or None,
        "difficulty": _clean_text(question.get("difficulty"), 60) or None,
        "topic": _clean_text(question.get("topic"), 200) or fallback_topic or None,
    }


def _map_engine_question_to_test_question(
    question: dict[str, Any],
    sort_order: int,
) -> dict[str, Any] | None:
    options = _normalize_options(question.get("options"))
    answer_format = _normalize_answer_format(question.get("answer_format"), options)
    correct_answer = _normalize_correct_answer(question.get("correct_answer"), options)
    question_text = _clean_multiline_text(question.get("question"), 2000)

    if answer_format != "mcq" or not question_text or len(options) < 2 or not correct_answer:
        return None

    if correct_answer.lower() not in {option.lower() for option in options}:
        options.append(correct_answer)

    correct_indexes = [
        index
        for index, option in enumerate(options)
        if option.lower() == correct_answer.lower()
    ]

    if not correct_indexes:
        return None

    question_type = "multiple_choice" if len(correct_indexes) > 1 else "single_choice"

    return {
        "questionText": question_text,
        "options": options,
        "correctAnswer": correct_indexes,
        "explanation": _clean_multiline_text(question.get("reference_answer"), 2000) or "",
        "questionType": question_type,
        "sortOrder": sort_order,
        "difficulty": _clean_text(question.get("difficulty"), 60) or "",
        "topic": _clean_text(question.get("topic"), 200) or "",
    }


def _build_test_questions(selected_questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []

    for question in selected_questions:
        mapped = _map_engine_question_to_test_question(
            question,
            sort_order=len(result) + 1,
        )
        if mapped:
            result.append(mapped)

    return result


def generate_questions_for_bilimcorp(payload: dict[str, Any]) -> dict[str, Any]:
    generation_source = _resolve_generation_source(payload)
    topic = _clean_text(payload.get("topic"), 200)
    subject = _clean_text(payload.get("subject"), 120)
    requested_count = _resolve_requested_count(payload, 5)
    requested_kind = _resolve_requested_kind(payload)
    exam_mode = _resolve_exam_mode(payload)

    if not generation_source:
        raise AiAdapterError("Мәтін немесе мазмұн енгізу қажет.")

    engine_result = generate_questions(
        generation_source,
        requested_count=requested_count,
        subject=subject,
        topic=topic,
        requested_kind=requested_kind,
        exam_mode=exam_mode,
    )
    selected_questions = _top_up_filtered_questions(
        _sanitize_engine_questions(engine_result.get("questions")),
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
    normalized_questions = [item for item in normalized_questions if item.get("question")]

    if not normalized_questions:
        raise AiAdapterError("AI сұрақ құра алмады. Мәтінді нақтылап немесе көлемін көбейтіп қайта көріңіз.")

    return {
        "questions": normalized_questions,
        "meta": {
            "mode": engine_result.get("mode") or "fallback",
            "subject": subject or engine_result.get("subject") or "general",
            "topic": topic or None,
            "passage": _clean_multiline_text(engine_result.get("passage"), 4000),
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
        raise AiAdapterError("Draft test құру үшін topic немесе source text қажет.")

    engine_result = generate_questions(
        generation_source,
        requested_count=requested_count,
        subject=subject,
        topic=topic,
        requested_kind=requested_kind,
        exam_mode=exam_mode,
    )
    selected_questions = _top_up_filtered_questions(
        _sanitize_engine_questions(engine_result.get("questions")),
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
    builder_questions = [item for item in builder_questions if item.get("question")]

    if not builder_questions:
        raise AiAdapterError("AI draft test үшін сұрақ құра алмады. Мәтінді нақтылап қайта көріңіз.")

    test_questions = _build_test_questions(selected_questions)

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
            "passage": _clean_multiline_text(engine_result.get("passage"), 4000),
            "requestedCount": requested_count,
            "returnedCount": len(builder_questions),
            "importableQuestionCount": len(test_questions),
            "requestedKind": requested_kind,
            "examMode": exam_mode or None,
        },
    }


def evaluate_answer_for_bilimcorp(payload: dict[str, Any]) -> dict[str, Any]:
    question = _clean_multiline_text(payload.get("question"), 2000)
    student_answer = _clean_multiline_text(
        payload.get("student_answer") or payload.get("studentAnswer"),
        4000,
    )
    context = _normalize_context_text(payload.get("context"), MAX_CONTEXT_CHARS)
    expected_answer = _clean_multiline_text(
        payload.get("expected_answer") or payload.get("expectedAnswer"),
        2000,
    )
    reference_answer = _clean_multiline_text(
        payload.get("reference_answer") or payload.get("referenceAnswer"),
        2000,
    )

    options = _normalize_options(payload.get("options") or [])
    answer_format = _normalize_answer_format(
        payload.get("answer_format") or payload.get("answerFormat"),
        options,
    )

    if not question:
        raise AiAdapterError("Сұрақ мәтіні бос болмауы керек.")

    if not student_answer:
        raise AiAdapterError("Оқушы жауабы бос болмауы керек.")

    if answer_format == "mcq" and options and expected_answer:
        expected_answer = _normalize_correct_answer(expected_answer, options)

    result = evaluate_answer_direct(
        question=question,
        user_answer=student_answer,
        source_text=context,
        answer_format=answer_format,
        options=options,
        correct_answer=expected_answer,
        reference_answer=reference_answer,
    )

    score = _coerce_float(result.get("score"), 0.0)
    max_score = _coerce_float(result.get("max_score"), 10.0)
    if max_score <= 0:
        max_score = 10.0

    score = max(0.0, min(score, max_score))

    strengths: list[str] = []
    weaknesses: list[str] = []

    if result.get("is_correct"):
        strengths.append("Жауап негізгі талапқа сәйкес келеді.")
    else:
        weaknesses.append("Жауапта дәлдік немесе негізгі ой толық емес.")

    if _clean_multiline_text(result.get("ideal_answer")):
        strengths.append("Үлгі дұрыс жауап қолжетімді.")

    return {
        "score": score,
        "max_score": max_score,
        "is_correct": bool(result.get("is_correct")),
        "feedback": _clean_multiline_text(result.get("feedback"), 2000),
        "explanation": _clean_multiline_text(result.get("ideal_answer"), 2000),
        "suggestion": _clean_multiline_text(result.get("suggestion"), 2500),
        "strengths": strengths,
        "weaknesses": weaknesses,
        "meta": {
            "mode": result.get("mode") or "fallback",
            "answerFormat": answer_format,
        },
    }


def _sanitize_tutor_context(context: Any) -> dict[str, Any]:
    if not isinstance(context, dict):
        return {}

    allowed_keys = {
        "lesson_id",
        "lessonId",
        "subject",
        "topic",
        "passage",
        "courseTitle",
        "lessonTitle",
        "moduleTitle",
    }
    sanitized: dict[str, Any] = {}

    for key, value in context.items():
        if key not in allowed_keys:
            continue

        if isinstance(value, (str, int, float, bool)) or value is None:
            sanitized[key] = _clean_multiline_text(value, MAX_TUTOR_CONTEXT_STRING_CHARS)
        elif isinstance(value, list):
            sanitized[key] = [
                _clean_multiline_text(item, 500)
                for item in value[:12]
                if _clean_multiline_text(item, 500)
            ]
        elif isinstance(value, dict):
            sanitized[key] = _normalize_context_text(value, 2000)

    return sanitized


def _sanitize_tutor_history(history_payload: Any) -> list[dict[str, str]]:
    history: list[dict[str, str]] = []

    if not isinstance(history_payload, list):
        return history

    for row in history_payload[-MAX_TUTOR_HISTORY_MESSAGES:]:
        if not isinstance(row, dict):
            continue

        role = _clean_text(row.get("role"), 20).lower() or "user"
        if role not in ALLOWED_TUTOR_HISTORY_ROLES:
            # Client-provided system messages are intentionally ignored.
            continue

        content = _clean_multiline_text(row.get("content"), MAX_TUTOR_HISTORY_MESSAGE_CHARS)
        if not content:
            continue

        history.append({"role": role, "content": content})

    return history


def tutor_reply_for_bilimcorp(payload: dict[str, Any]) -> dict[str, Any]:
    message = _clean_multiline_text(payload.get("message"), 4000)
    if not message:
        raise AiAdapterError("Tutor хабарламасы бос болмауы керек.")

    context = _sanitize_tutor_context(payload.get("context") or {})
    history = _sanitize_tutor_history(payload.get("history") or [])

    service = create_tutor_service()
    result = service.tutor_reply(
        user_message=message,
        context=context,
        history=history,
    )

    reply_text = _clean_multiline_text(result.get("answer"), 12000)
    if not reply_text:
        reply_text = "Кешіріңіз, жауап дайындау кезінде қате пайда болды. Сұрақты нақтылап қайта жіберіңіз."

    return {
        "reply": {
            "id": f"assistant-{uuid4().hex}",
            "role": "assistant",
            "content": reply_text,
            "created_at": _utc_iso(),
        },
        "used_model": _clean_text(result.get("used_model"), 120) or "fallback",
        "fallback": bool(result.get("fallback")),
    }
