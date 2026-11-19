"""Examiner API-ның DTO-лары (api-kelisimderi.md §3.3–§3.8). Фронтендтің типтері осылардан шығады."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

ScopeType = Literal["topic", "chapter", "subject"]
Tier = Literal["X1", "X2", "X3"]
SessionStatus = Literal["active", "completed", "blocked", "abandoned"]  # preparing жоқ (D64)
Availability = Literal["ready", "low_stock", "unavailable"]


# ------------------------------------------------------------------ сұраныстар


class StartSessionRequest(BaseModel):
    client_request_id: UUID
    scope_type: ScopeType
    scope_id: str = Field(min_length=1, max_length=200)
    level: int = Field(ge=1, le=4)


class AnswerRequest(BaseModel):
    client_request_id: UUID
    answer: dict[str, Any]


class AbandonRequest(BaseModel):
    client_request_id: UUID


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


class SessionResult(BaseModel):
    session_id: str
    level: int
    scope: Scope
    p: float
    threshold: int
    mastered: bool
    is_final: bool
    breakdown: list[BreakdownRow]
    total: Total
    x3: X3Result
    subject_profile: SubjectProfile


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
