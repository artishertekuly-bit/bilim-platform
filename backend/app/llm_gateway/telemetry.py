"""Әр LLM шақыруының логы (ortaq §7). Хабарлама мазмұны логқа жазылмайды (ortaq §9)."""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Protocol

logger = logging.getLogger("bilim.llm_gateway")


@dataclass
class CallLog:
    task: str
    provider: str
    model: str
    prompt_id: str | None
    prompt_version: str | None
    input_tokens: int = 0
    cached_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0
    latency_ms: int = 0
    first_token_ms: int | None = None
    cost_usd: float | None = None
    # ok | retried | format_error | truncated | unavailable | request_error | interrupted | cancelled
    # | batch_submitted | batch_completed
    outcome: str = "ok"
    attempts: int = 1
    fallback_used: bool = False
    error: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class TelemetrySink(Protocol):
    def record(self, log: CallLog) -> None: ...


class LoggingSink:
    """Әзірге логты JSON жол ретінде жазады; кейін дерекқор кестесіне ауыстырылады."""

    def record(self, log: CallLog) -> None:
        logger.info(json.dumps(asdict(log), ensure_ascii=False))


class MemorySink:
    """Тесттерге арналған."""

    def __init__(self) -> None:
        self.records: list[CallLog] = []

    def record(self, log: CallLog) -> None:
        self.records.append(log)
