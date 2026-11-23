"""Tutor API DTO-лары (api-kelisimderi.md §4.2). Клиентке тек мәтін барады: тегтер, күй, сценарий,
мәнер және M мәндері ішкі дерек болып қалады."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

MAX_MESSAGE_CHARS = 2000

BlockedReason = Literal["cooldown", "teacher"]


class TutorSubject(BaseModel):
    id: str
    title: str
    grade: int  # пән кітаптарының ең кіші сыныбы; граф сыныппен шектелмейді (personarag §1)


class TutorMessage(BaseModel):
    message_id: str
    role: Literal["student", "tutor"]
    text: str
    created_at: datetime


class Conversation(BaseModel):
    conversation_id: str
    subject: TutorSubject
    messages: list[TutorMessage]  # соңғы 30
    blocked_until: datetime | None = None
    blocked_reason: BlockedReason | None = None


class MessagesPage(BaseModel):
    messages: list[TutorMessage]
    has_more: bool


class SendMessageRequest(BaseModel):
    client_request_id: UUID
    text: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)


class TeacherBlockRequest(BaseModel):
    client_request_id: UUID


class BlockState(BaseModel):
    student_id: str
    blocked_until: datetime | None = None
    blocked_reason: BlockedReason | None = None
