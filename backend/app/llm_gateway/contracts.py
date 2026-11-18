"""LLM gateway-дің ортақ типтері (architect/v2/api-kelisimderi.md §7)."""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum, StrEnum
from typing import Literal

from pydantic import BaseModel


class Task(StrEnum):
    """Gateway арқылы өтетін тапсырмалар. Модельді шақырушы емес, тапсырма анықтайды (ortaq §2.1)."""

    MODERATION = "moderation"
    TUTOR_TAGS = "tutor_tags"
    MCQ_SOLVER_CHECK = "mcq_solver_check"  # bagalau Т7
    OFFICIAL_GRADING = "official_grading"
    SECOND_GRADING = "second_grading"  # bagalau Т8
    EXPLANATION = "explanation"  # Examiner 2-сатысы
    TUTOR_REPLY = "tutor_reply"
    EXAMINER_DIALOG = "examiner_dialog"
    GENERATION = "generation"  # Batch API


class Priority(IntEnum):
    """Кезектегі басымдық: сан неғұрлым аз болса, соғұрлым бұрын (ortaq §2.3)."""

    OFFICIAL = 0
    INTERACTIVE = 1
    BACKGROUND = 2


TASK_PRIORITY: dict[Task, Priority] = {
    # Ресми бағалау және оның алдындағы модерация — ең жоғары басымдық.
    Task.OFFICIAL_GRADING: Priority.OFFICIAL,
    Task.MODERATION: Priority.OFFICIAL,
    # Оқушы жауап күтіп отырған интерактивті жолдар.
    Task.TUTOR_TAGS: Priority.INTERACTIVE,
    Task.TUTOR_REPLY: Priority.INTERACTIVE,
    Task.EXAMINER_DIALOG: Priority.INTERACTIVE,
    Task.EXPLANATION: Priority.INTERACTIVE,
    # Фондық жұмыс.
    Task.SECOND_GRADING: Priority.BACKGROUND,
    Task.MCQ_SOLVER_CHECK: Priority.BACKGROUND,
    Task.GENERATION: Priority.BACKGROUND,
}

# Резерв провайдер тек Tutor мен генерация үшін (ortaq §2.4).
FALLBACK_ALLOWED: frozenset[Task] = frozenset(
    {Task.TUTOR_TAGS, Task.TUTOR_REPLY, Task.GENERATION, Task.MCQ_SOLVER_CHECK}
)

# ortaq §2.1 кестесіндегі режимдер. Көрсетілмеген тапсырма — sync.
EXPECTED_MODE: dict[Task, str] = {
    Task.TUTOR_REPLY: "stream",
    Task.EXAMINER_DIALOG: "stream",
    Task.GENERATION: "batch",
}

Role = Literal["system", "user", "assistant"]
Outcome = Literal["ok", "format_error", "retried"]


@dataclass(frozen=True)
class Message:
    role: Role
    content: str


@dataclass(frozen=True)
class PromptRef:
    """Промпттың идентификаторы мен нұсқасы; логқа және бағалау деректеріне жазылады."""

    id: str
    version: str


@dataclass(frozen=True)
class Usage:
    input_tokens: int = 0
    cached_tokens: int = 0
    output_tokens: int = 0

    @property
    def total(self) -> int:
        return self.input_tokens + self.output_tokens

    def __add__(self, other: Usage) -> Usage:
        return Usage(
            input_tokens=self.input_tokens + other.input_tokens,
            cached_tokens=self.cached_tokens + other.cached_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
        )


@dataclass(frozen=True)
class LLMResult:
    text: str
    parsed: BaseModel | None
    model: str  # провайдер қайтарған нақты атау (snapshot)
    provider: str
    prompt_version: str
    input_tokens: int
    cached_tokens: int
    output_tokens: int
    latency_ms: int
    cost_usd: float | None  # баға конфигурацияда жоқ болса — None
    outcome: Outcome
    attempts: int
    fallback_used: bool


@dataclass(frozen=True)
class BatchRequest:
    custom_id: str
    messages: tuple[Message, ...]


@dataclass(frozen=True)
class BatchHandle:
    """Batch-ті кейін алу үшін керек дерек: резервке ауысса, провайдер басқа болады."""

    batch_id: str
    provider: str
    model_key: str
    task: Task
    prompt: PromptRef


@dataclass(frozen=True)
class BatchItemResult:
    custom_id: str
    text: str | None
    usage: Usage
    error: str | None = None


BatchState = Literal["in_progress", "completed", "failed", "expired", "cancelled"]


@dataclass(frozen=True)
class BatchStatus:
    batch_id: str
    status: BatchState
    results: tuple[BatchItemResult, ...] | None = None
