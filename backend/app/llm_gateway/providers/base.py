"""Провайдер интерфейсі. Gateway провайдердің SDK-сын тікелей білмейді."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, AsyncIterator, Protocol, Sequence

from ..contracts import BatchStatus, Message, Usage


@dataclass(frozen=True)
class CompletionRequest:
    model: str
    messages: tuple[Message, ...]
    temperature: float | None
    max_output_tokens: int | None
    timeout_s: float
    json_schema: dict[str, Any] | None = None
    schema_name: str | None = None
    strict_schema: bool = False


@dataclass(frozen=True)
class ProviderCompletion:
    text: str
    usage: Usage
    model: str


@dataclass(frozen=True)
class StreamChunk:
    text: str = ""
    usage: Usage | None = None
    model: str | None = None


class ProviderError(Exception):
    """Провайдер қатесі. Хабарламада сұраныс мазмұны болмауы керек (ortaq §9)."""

    def __init__(
        self,
        message: str,
        *,
        retryable: bool,
        retry_after: float | None = None,
        status: int | None = None,
    ) -> None:
        super().__init__(message)
        self.retryable = retryable
        self.retry_after = retry_after
        self.status = status


class Provider(Protocol):
    name: str

    async def complete(self, request: CompletionRequest) -> ProviderCompletion: ...

    def stream(self, request: CompletionRequest) -> AsyncIterator[StreamChunk]: ...

    async def embed(
        self, *, model: str, texts: Sequence[str], timeout_s: float
    ) -> tuple[list[list[float]], Usage]: ...

    async def submit_batch(self, *, items: Sequence[tuple[str, CompletionRequest]]) -> str: ...

    async def fetch_batch(self, batch_id: str) -> BatchStatus: ...

    async def cancel_batch(self, batch_id: str) -> None: ...
