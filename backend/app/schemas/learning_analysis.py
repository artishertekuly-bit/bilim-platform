from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


class LearningAiMode(str, Enum):
    student_tracker = "student_tracker"
    student_course_advisor = "student_course_advisor"
    teacher_course_assistant = "teacher_course_assistant"
    teacher_student_assistant = "teacher_student_assistant"
    teacher_course_creator_advisor = "teacher_course_creator_advisor"


class LearningAiRole(str, Enum):
    student = "student"
    teacher = "teacher"


class LearningAiConversationRole(str, Enum):
    user = "user"
    assistant = "assistant"


def _normalize_text(value: Any, *, limit: int | None = None) -> str:
    text = " ".join(str(value or "").replace("\x00", " ").split()).strip()
    return text[:limit] if limit else text


def _normalize_optional_text(value: Any, *, limit: int | None = None) -> str | None:
    text = _normalize_text(value, limit=limit)
    return text or None


def _validate_uuid_text(value: str | None, field_name: str) -> str | None:
    if value is None:
        return None

    try:
        UUID(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be a valid UUID.") from exc

    return value


class LearningAiConversationMessage(BaseModel):
    role: LearningAiConversationRole
    content: str = Field(min_length=1, max_length=6000)

    @field_validator("content")
    @classmethod
    def normalize_content(cls, value: str) -> str:
        normalized = _normalize_text(value)

        if not normalized:
            raise ValueError("Conversation message content must not be empty.")

        return normalized

    model_config = {
        "populate_by_name": True,
        "extra": "ignore",
    }


class LearningAiScope(BaseModel):
    course_id: Optional[str] = Field(default=None, alias="courseId")
    student_id: Optional[str] = Field(default=None, alias="studentId")

    # Optional advisor hints.
    subject_id: Optional[str] = Field(default=None, alias="subjectId")
    subject_name: Optional[str] = Field(default=None, alias="subjectName", max_length=180)
    grade_level: Optional[str] = Field(default=None, alias="gradeLevel", max_length=120)
    target_audience: Optional[str] = Field(default=None, alias="targetAudience", max_length=240)

    @field_validator("course_id", "student_id", "subject_id", mode="before")
    @classmethod
    def normalize_id(cls, value: Any) -> str | None:
        return _normalize_optional_text(value, limit=140)

    @field_validator("course_id")
    @classmethod
    def validate_course_id(cls, value: str | None) -> str | None:
        return _validate_uuid_text(value, "courseId")

    @field_validator("student_id")
    @classmethod
    def validate_student_id(cls, value: str | None) -> str | None:
        return _validate_uuid_text(value, "studentId")

    @field_validator("subject_id")
    @classmethod
    def validate_subject_id(cls, value: str | None) -> str | None:
        return _validate_uuid_text(value, "subjectId")

    @field_validator("subject_name", "grade_level", "target_audience", mode="before")
    @classmethod
    def normalize_optional_hints(cls, value: Any) -> str | None:
        return _normalize_optional_text(value, limit=240)

    model_config = {
        "populate_by_name": True,
        "extra": "ignore",
    }


class LearningAiRequest(BaseModel):
    mode: LearningAiMode
    role: LearningAiRole
    prompt: str = Field(min_length=1, max_length=4000)
    selected_suggestion_id: Optional[str] = Field(default=None, alias="selectedSuggestionId")
    scope: Optional[LearningAiScope] = None

    # Short chat memory for continuation / clarification logic.
    # Frontend should send only the latest few messages, not the full infinite chat.
    conversation_history: list[LearningAiConversationMessage] = Field(
        default_factory=list,
        alias="conversationHistory",
        max_length=8,
    )

    @field_validator("prompt")
    @classmethod
    def normalize_prompt(cls, value: str) -> str:
        normalized = _normalize_text(value)

        if not normalized:
            raise ValueError("Prompt must not be empty.")

        return normalized

    @field_validator("selected_suggestion_id", mode="before")
    @classmethod
    def normalize_selected_suggestion_id(cls, value: Any) -> str | None:
        return _normalize_optional_text(value, limit=160)

    @model_validator(mode="after")
    def validate_mode_role_scope_contract(self) -> "LearningAiRequest":
        if self.mode in {
            LearningAiMode.student_tracker,
            LearningAiMode.student_course_advisor,
        }:
            if self.role != LearningAiRole.student:
                raise ValueError(f"{self.mode.value} requires student role.")

        if self.mode in {
            LearningAiMode.teacher_course_assistant,
            LearningAiMode.teacher_student_assistant,
            LearningAiMode.teacher_course_creator_advisor,
        }:
            if self.role != LearningAiRole.teacher:
                raise ValueError(f"{self.mode.value} requires teacher role.")

        if self.mode == LearningAiMode.teacher_course_assistant:
            if not self.scope or not self.scope.course_id:
                raise ValueError("teacher_course_assistant requires courseId.")

        if self.mode == LearningAiMode.teacher_student_assistant:
            if not self.scope or not self.scope.course_id or not self.scope.student_id:
                raise ValueError("teacher_student_assistant requires courseId and studentId.")

        return self

    model_config = {
        "populate_by_name": True,
        "extra": "ignore",
    }


class LearningAiUsedContext(BaseModel):
    source: Literal[
        "student_learning_snapshot",
        "student_course_advisor_context",
        "course_learning_snapshot",
        "teacher_student_learning_snapshot",
        "teacher_course_creator_context",
    ]
    course_id: Optional[str] = Field(default=None, alias="courseId")
    student_id: Optional[str] = Field(default=None, alias="studentId")

    # Optional metadata for frontend chat UI.
    course_title: Optional[str] = Field(default=None, alias="courseTitle")
    student_name: Optional[str] = Field(default=None, alias="studentName")
    subject_name: Optional[str] = Field(default=None, alias="subjectName")
    snapshot_generated_at: Optional[str] = Field(default=None, alias="snapshotGeneratedAt")

    @field_validator("course_id", "student_id", mode="before")
    @classmethod
    def normalize_context_ids(cls, value: Any) -> str | None:
        return _normalize_optional_text(value, limit=140)

    @field_validator("course_title", "student_name", "subject_name", "snapshot_generated_at", mode="before")
    @classmethod
    def normalize_context_metadata(cls, value: Any) -> str | None:
        return _normalize_optional_text(value, limit=300)

    model_config = {
        "populate_by_name": True,
        "extra": "ignore",
    }


class LearningAiResponse(BaseModel):
    answer: str = Field(min_length=1, max_length=30000)
    generated_at: str = Field(alias="generatedAt")
    mode: LearningAiMode
    used_context: LearningAiUsedContext = Field(alias="usedContext")

    # Optional fields for chat-first UI.
    # Frontend should avoid showing raw numeric contextSummary directly.
    context_summary: Optional[str] = Field(default=None, alias="contextSummary", max_length=1200)
    confidence: Optional[Literal["low", "medium", "high"]] = None
    warnings: list[str] = Field(default_factory=list, max_length=10)
    follow_up_prompts: list[str] = Field(default_factory=list, alias="followUpPrompts", max_length=6)

    @field_validator("answer")
    @classmethod
    def normalize_answer(cls, value: str) -> str:
        normalized = str(value or "").replace("\x00", " ").strip()

        if not normalized:
            raise ValueError("Answer must not be empty.")

        return normalized

    @field_validator("generated_at", mode="before")
    @classmethod
    def normalize_generated_at(cls, value: Any) -> str:
        return _normalize_text(value, limit=120)

    @field_validator("context_summary", mode="before")
    @classmethod
    def normalize_context_summary(cls, value: Any) -> str | None:
        return _normalize_optional_text(value, limit=1200)

    @field_validator("warnings", "follow_up_prompts", mode="before")
    @classmethod
    def normalize_string_list(cls, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []

        result: list[str] = []
        seen: set[str] = set()

        for item in value:
            text = _normalize_text(item, limit=400)
            if text and text not in seen:
                seen.add(text)
                result.append(text)

        return result

    model_config = {
        "populate_by_name": True,
        "extra": "ignore",
    }


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
