"""Тесттер мен жергілікті әзірлеуге арналған провайдер: алдын ала жазылған жауаптарды қайтарады."""

from __future__ import annotations

from typing import Any, AsyncIterator, Sequence

from ..contracts import BatchStatus, Usage
from .base import CompletionRequest, ProviderCompletion, ProviderError, StreamChunk


class FakeProvider:
    """Сценарий элементі: мәтін, ProviderCompletion, ProviderError немесе (ағын үшін) мәтін бөліктерінің тізімі.

    Тізімдегі ProviderError — ағынның сол жерде үзілетінін білдіреді.
    """

    def __init__(self, name: str = "fake", script: Sequence[Any] = ()) -> None:
        self.name = name
        self.calls: list[CompletionRequest] = []
        self.embed_calls: list[tuple[str, tuple[str, ...]]] = []
        self.batches: list[tuple[tuple[str, CompletionRequest], ...]] = []
        self.batch_status: dict[str, BatchStatus] = {}
        self.cancelled: list[str] = []
        self._script: list[Any] = list(script)
        self.default_text = "ok"

    def push(self, *items: Any) -> None:
        self._script.extend(items)

    def _next(self) -> Any:
        item = self._script.pop(0) if self._script else self.default_text
        if isinstance(item, ProviderError):
            raise item
        return item

    async def complete(self, request: CompletionRequest) -> ProviderCompletion:
        self.calls.append(request)
        item = self._next()
        if isinstance(item, ProviderCompletion):
            return item
        return ProviderCompletion(text=str(item), usage=Usage(input_tokens=10, output_tokens=5), model=request.model)

    async def stream(self, request: CompletionRequest) -> AsyncIterator[StreamChunk]:
        self.calls.append(request)
        item = self._next()
        parts = item if isinstance(item, list) else [str(item)]
        for part in parts:
            if isinstance(part, ProviderError):
                raise part
            yield StreamChunk(text=str(part))
        yield StreamChunk(usage=Usage(input_tokens=10, output_tokens=len(parts)), model=request.model)

    async def embed(
        self, *, model: str, texts: Sequence[str], timeout_s: float
    ) -> tuple[list[list[float]], Usage]:
        self.embed_calls.append((model, tuple(texts)))
        item = self._script.pop(0) if self._script else None
        if isinstance(item, ProviderError):
            raise item
        return [[float(len(text)), 1.0] for text in texts], Usage(input_tokens=sum(len(t) for t in texts))

    async def submit_batch(self, *, items: Sequence[tuple[str, CompletionRequest]]) -> str:
        item = self._script.pop(0) if self._script else None
        if isinstance(item, ProviderError):
            raise item
        self.batches.append(tuple(items))
        return f"{self.name}-batch-{len(self.batches)}"

    async def fetch_batch(self, batch_id: str) -> BatchStatus:
        return self.batch_status.get(batch_id, BatchStatus(batch_id=batch_id, status="in_progress"))

    async def cancel_batch(self, batch_id: str) -> None:
        self.cancelled.append(batch_id)
