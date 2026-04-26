from datetime import datetime, timezone
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class LearningAiMode(str, Enum):
    student_tracker = "student_tracker"
    student_course_advisor = "student_course_advisor"
    teacher_course_assistant = "teacher_course_assistant"
    teacher_student_assistant = "teacher_student_assistant"
    teacher_course_creator_advisor = "teacher_course_creator_advisor"


class LearningAiRole(str, Enum):
    student = "student"
    teacher = "teacher"


class LearningAiScope(BaseModel):
    course_id: Optional[str] = Field(default=None, alias="courseId")
    student_id: Optional[str] = Field(default=None, alias="studentId")

    # Optional advisor hints.
    # These are not required, but can help advisor modes later.
    subject_id: Optional[str] = Field(default=None, alias="subjectId")
    subject_name: Optional[str] = Field(default=None, alias="subjectName")
    grade_level: Optional[str] = Field(default=None, alias="gradeLevel")
    target_audience: Optional[str] = Field(default=None, alias="targetAudience")

    model_config = {
        "populate_by_name": True,
    }


class LearningAiRequest(BaseModel):
    mode: LearningAiMode
    role: LearningAiRole
    prompt: str = Field(min_length=1, max_length=4000)
    selected_suggestion_id: Optional[str] = Field(default=None, alias="selectedSuggestionId")
    scope: Optional[LearningAiScope] = None

    @field_validator("prompt")
    @classmethod
    def normalize_prompt(cls, value: str) -> str:
        normalized = value.strip()

        if not normalized:
            raise ValueError("Prompt must not be empty.")

        return normalized

    model_config = {
        "populate_by_name": True,
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
    # Service may leave these as None.
    course_title: Optional[str] = Field(default=None, alias="courseTitle")
    student_name: Optional[str] = Field(default=None, alias="studentName")
    subject_name: Optional[str] = Field(default=None, alias="subjectName")
    snapshot_generated_at: Optional[str] = Field(default=None, alias="snapshotGeneratedAt")

    model_config = {
        "populate_by_name": True,
    }


class LearningAiResponse(BaseModel):
    answer: str
    generated_at: str = Field(alias="generatedAt")
    mode: LearningAiMode
    used_context: LearningAiUsedContext = Field(alias="usedContext")

    # Optional fields for chat-first UI.
    # Frontend should avoid showing raw numeric contextSummary directly.
    context_summary: Optional[str] = Field(default=None, alias="contextSummary")
    confidence: Optional[Literal["low", "medium", "high"]] = None
    warnings: list[str] = Field(default_factory=list)
    follow_up_prompts: list[str] = Field(default_factory=list, alias="followUpPrompts")

    model_config = {
        "populate_by_name": True,
    }


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()