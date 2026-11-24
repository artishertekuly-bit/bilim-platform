"""Examiner API-ның DTO-лары (api-kelisimderi.md §3.3–§3.8). Фронтендтің типтері осылардан шығады."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

ScopeType = Literal["topic", "chapter", "subject"]
Tier = Literal["X1", "X2", "X3"]
# preparing (D93): the bank had too few questions, so they are being generated for this session.
SessionStatus = Literal["preparing", "active", "completed", "blocked", "abandoned"]
Availability = Literal["ready", "low_stock", "unavailable"]


# ------------------------------------------------------------------ сұраныстар


class StartSessionRequest(BaseModel):
    """Either a textbook scope (`scope_type` + `scope_id`) or, since D93, a subject and the topic the learner or
    teacher wrote (`subject_id` + `topic`): the platform takes the matching textbook text itself."""

    client_request_id: UUID
    scope_type: ScopeType | None = None
    scope_id: str | None = Field(default=None, min_length=1, max_length=200)
    subject_id: UUID | None = None
    topic: str | None = Field(default=None, min_length=2, max_length=200)
    level: int = Field(ge=1, le=4)

    @model_validator(mode="after")
    def _one_way(self) -> "StartSessionRequest":
        by_scope = self.scope_type is not None and self.scope_id is not None
        by_topic = self.subject_id is not None and self.topic is not None and bool(self.topic.strip())
        if by_scope == by_topic:
            raise ValueError("scope_type + scope_id немесе subject_id + topic беріледі")
        return self


class AnswerRequest(BaseModel):
    client_request_id: UUID
    answer: dict[str, Any]


class AbandonRequest(BaseModel):
    client_request_id: UUID


class DialogTurnRequest(BaseModel):
    client_request_id: UUID
    text: str = Field(min_length=1, max_length=4000)


class AppealRequest(BaseModel):
    client_request_id: UUID
    reason: str = Field(min_length=3, max_length=1000)


class ConfirmGradeRequest(BaseModel):
    client_request_id: UUID


class OverrideGradeRequest(BaseModel):
    client_request_id: UUID
    new_score: int = Field(ge=0, le=4)
    reason: str = Field(min_length=3, max_length=1000)


class FalsePositiveRequest(BaseModel):
    client_request_id: UUID
    reason: str = Field(min_length=3, max_length=1000)
    new_score: int | None = Field(default=None, ge=0, le=4)


# ------------------------------------------------------------------ масштаб пен каталог


class Scope(BaseModel):
    type: ScopeType
    id: str  # topic → topic_id; chapter → '<кітап>#ch<нөмір>'; subject → кітап (D63)
    title: str


class Book(BaseModel):
    book: str
    title: str
    grade: int
    has_chapters: bool


class SubjectCatalogItem(BaseModel):
    subject_id: str
    title: str
    books: list[Book]


class Chapter(BaseModel):
    id: str
    no: str  # оқулықтағыдай, рим цифрымен: «I», «II»
    title: str


class Topic(BaseModel):
    id: str
    no: str
    title: str
    chapter_id: str | None


class ScopeCatalog(BaseModel):
    book: Book
    subject_id: str
    subject_title: str
    chapters: list[Chapter]
    topics: list[Topic]



# ------------------------------------------------------------------ сессия


class Progress(BaseModel):
    answered: int
    total: int


class DialogTurnDTO(BaseModel):
    turn_no: int
    student_text: str
    examiner_text: str | None = None


class SessionItem(BaseModel):
    item_id: str
    position: int
    tier: Tier
    block: Literal["A", "D"] | None
    format: str
    content: dict[str, Any]
    served_at: datetime | None
    deadline_at: datetime | None
    state: Literal["open", "answered", "grading", "graded"]
    turns: list[DialogTurnDTO] | None = None


class ExamSession(BaseModel):
    session_id: str
    status: SessionStatus
    level: int
    scope: Scope
    progress: Progress
    current: SessionItem | None
    upcoming: list[SessionItem]
    strike_count: int
    started_at: datetime
    # Set when preparation failed and the session was closed (D93); shown to the learner as is.
    notice: str | None = None


class Moderation(BaseModel):
    strike_count: int
    message: str
    retry_allowed: bool


class AnswerResult(BaseModel):
    item_id: str
    check: Literal["correct", "incorrect", "pending"]
    late: bool
    explanation: Literal["pending", "none"]
    moderation: Moderation | None
    session: ExamSession


class ExplanationResponse(BaseModel):
    status: Literal["pending", "ready", "failed"]
    text: str | None = None


class AppealResponse(BaseModel):
    item_id: str
    grade_id: str
    status: Literal["appealed"]


# ------------------------------------------------------------------ нәтиже мен профиль


class LevelResult(BaseModel):
    level: int
    p: float | None
    mastered: bool
    is_final: bool
    taken_at: datetime | None


class SubjectInfo(BaseModel):
    id: str
    title: str
    grade: int
    book: str
    book_title: str


class SubjectProfile(BaseModel):
    subject: SubjectInfo
    levels: list[LevelResult]
    f: float | None
    f_is_final: bool = False


class StudentProfile(BaseModel):
    subjects: list[SubjectProfile]


class BreakdownRow(BaseModel):
    format: str
    block: Literal["A", "D"] | None
    tasks: int
    score: int
    max: int


class Total(BaseModel):
    score: int
    max: int


class X3Result(BaseModel):
    status: Literal["not_eligible", "passed", "failed"]
    reason: str | None = None


class ResultItemSummary(BaseModel):
    item_id: str
    position: int
    format: str
    score: int
    max_score: int = 4
    grade_status: Literal["pending", "provisional", "final"]
    appealable: bool
    appealed: bool


class SessionResult(BaseModel):
    session_id: str
    level: int
    scope: Scope
    p: float
    threshold: int
    mastered: bool
    is_final: bool
    part_d: float | None = None
    part_a: float | None = None
    x3_rating_valid: bool = True
    breakdown: list[BreakdownRow]
    total: Total
    x3: X3Result
    items: list[ResultItemSummary] = []
    subject_profile: SubjectProfile


# ------------------------------------------------------------------ мұғалім кезегі (api §3.9)


class ReviewQueueItem(BaseModel):
    grade_id: str
    session_id: str
    student_id: str
    level: int
    format: str
    x_tier: Tier
    review_reason: str | None
    original_score: int | None
    effective_score: int | None
    grade_source: str | None
    appealed: bool
    created_at: datetime


class ReviewQueueResponse(BaseModel):
    items: list[ReviewQueueItem]
    total: int


class ClassBook(BaseModel):
    book: str
    title: str
    grade: int


class ClassStudentProfiles(BaseModel):
    student_id: str
    profiles: list[SubjectProfile]  # тек сыныптың пәні бойынша, нәтижесі бар әр оқулыққа біреу


class ClassProfilesResponse(BaseModel):
    """api §3.9, D38: сынып оқушыларының сынып пәні бойынша P1…P4 кестесі."""

    class_id: str
    subject_id: str
    subject_title: str
    books: list[ClassBook]
    students: list[ClassStudentProfiles]


class RatingEntry(BaseModel):
    rank: int
    student_id: str
    f: float
    f_is_final: bool
    x3_passed: int  # тең F-ті шешеді (bagalau §4.3, D37)


class ClassRatingResponse(BaseModel):
    """D23: F бойынша, тек толық профилі (төрт деңгей) барлар арасында, бір оқулық ішінде."""

    class_id: str
    book: str | None
    total: int
    full_count: int
    entries: list[RatingEntry]


class GradeOverrideDTO(BaseModel):
    override_id: str
    teacher_id: str
    new_score: int
    reason: str
    kind: Literal["review", "false_positive"]
    created_at: datetime


class TeacherGradeDetail(BaseModel):
    grade_id: str
    session_id: str
    item_id: str
    student_id: str
    level: int
    format: str
    x_tier: Tier
    question_content: dict[str, Any]
    rubric_0_4: list[dict[str, Any]] | None
    reference_text: str | None
    answer: dict[str, Any]
    answer_text: str | None
    dialog_turns: list[DialogTurnDTO]
    original_score: int | None
    effective_score: int | None
    grade_source: str | None
    grade_status: Literal["pending", "provisional", "final"]
    review_reason: str | None
    evidence_quotes: list[dict[str, Any]]
    grade_reason: str | None
    appeal_text: str | None
    grader_model: str | None
    prompt_version: str | None
    overrides: list[GradeOverrideDTO]


class TeacherGradeActionResponse(BaseModel):
    grade_id: str
    effective_score: int | None
    grade_status: Literal["final"]
    session_p: float | None = None
    session_is_final: bool | None = None
    x3_rating_valid: bool | None = None


class FalsePositiveResponse(BaseModel):
    event_id: str
    session_id: str
    strike_count: int
    grade_id: str | None = None
    effective_score: int | None = None
    session_p: float | None = None
    session_is_final: bool | None = None
    x3_rating_valid: bool | None = None


class LevelCard(BaseModel):
    level: int
    title: str
    formats: list[str]          # экранға арналған атаулар
    tasks: int                  # X1 + X2
    minutes: int
    available: bool             # 4-қадамда тек 1–2-деңгей (D62)
    # ready — бос қор жетеді; low_stock — басталады, бірақ бекітілген сұрақтар қайта беріледі;
    # unavailable — оқушыға Е2-ден өткен сұрақ n-ге жетпейді, сессия басталмайды (D64, D65)
    availability: Availability
    note: str | None
    last: LevelResult


class LevelsResponse(BaseModel):
    scope: Scope
    levels: list[LevelCard]
