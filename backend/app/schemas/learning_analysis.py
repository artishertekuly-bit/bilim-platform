from datetime import datetime, timezone
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


class LearningAiMode(str, Enum):
    student_tracker = "student_tracker"
    teacher_course_assistant = "teacher_course_assistant"
    teacher_student_assistant = "teacher_student_assistant"


class LearningAiRole(str, Enum):
    student = "student"
    teacher = "teacher"


class LearningAiScope(BaseModel):
    course_id: Optional[str] = Field(default=None, alias="courseId")
    student_id: Optional[str] = Field(default=None, alias="studentId")

    model_config = {
        "populate_by_name": True,
    }


class LearningAiRequest(BaseModel):
    mode: LearningAiMode
    role: LearningAiRole
    prompt: str = Field(min_length=1, max_length=4000)
    selected_suggestion_id: Optional[str] = Field(default=None, alias="selectedSuggestionId")
    scope: Optional[LearningAiScope] = None

    model_config = {
        "populate_by_name": True,
    }


class LearningAiUsedContext(BaseModel):
    source: Literal[
        "student_learning_snapshot",
        "course_learning_snapshot",
        "teacher_student_learning_snapshot",
    ]
    course_id: Optional[str] = Field(default=None, alias="courseId")
    student_id: Optional[str] = Field(default=None, alias="studentId")

    model_config = {
        "populate_by_name": True,
    }


class LearningAiResponse(BaseModel):
    answer: str
    generated_at: str = Field(alias="generatedAt")
    mode: LearningAiMode
    used_context: LearningAiUsedContext = Field(alias="usedContext")

    model_config = {
        "populate_by_name": True,
    }


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()