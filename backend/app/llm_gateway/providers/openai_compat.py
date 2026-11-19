"""OpenAI Chat Completions API-ымен үйлесімді провайдерлер (OpenAI және `base_url` арқылы басқалары)."""

from __future__ import annotations

import json
from typing import Any, AsyncIterator, Sequence

import openai
from openai import AsyncOpenAI

from ..contracts import BatchItemResult, BatchState, BatchStatus, Usage
from .base import CompletionRequest, ProviderCompletion, ProviderError, StreamChunk

_RETRYABLE_STATUS = frozenset({408, 409, 429, 500, 502, 503, 504})

_BATCH_STATE: dict[str, BatchState] = {
    "validating": "in_progress",
    "in_progress": "in_progress",
    "finalizing": "in_progress",
    "completed": "completed",
    "failed": "failed",
    "expired": "expired",
    # Тоқтатылып жатқан batch-тің нәтиже файлы әлі толық емес: `cancelled` болғанша күтеміз.
    "cancelling": "in_progress",
    "cancelled": "cancelled",
}
# Бұл күйлерде шығыс және қате файлдарында біткен сұраныстардың нәтижесі тұрады. Мерзімі өткен
# немесе тоқтатылған batch-тің біткен сұраныстары үшін де ақы алынады, сондықтан олар лақтырылмайды.
_BATCH_WITH_RESULTS = frozenset({"completed", "expired", "cancelled"})

# Ойлау модельдері (reasoning): `temperature` қабылдамайды, оның орнына `reasoning_effort` бар.
# `max_completion_tokens` ойлау токендерін де қамтиды.
_REASONING_PREFIXES = ("gpt-5", "o1", "o3", "o4")


def is_reasoning_model(model: str) -> bool:
    return model.startswith(_REASONING_PREFIXES)


def _retry_after(exc: Exception) -> float | None:
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None)
    if not headers:
        return None
    raw = headers.get("retry-after")
    try:
        return float(raw) if raw is not None else None
    except ValueError:
        return None


def to_provider_error(exc: Exception) -> ProviderError:
    """SDK қатесін ProviderError-ға айналдырады. Қате мәтіні көшірілмейді: онда сұраныс мазмұны болуы мүмкін."""
    if isinstance(exc, ProviderError):
        return exc
    if isinstance(exc, openai.APIConnectionError):  # APITimeoutError да осы класс
        return ProviderError(type(exc).__name__, retryable=True)
    if isinstance(exc, openai.APIStatusError):
        status = exc.status_code
        return ProviderError(
            f"HTTP {status}",
            retryable=status in _RETRYABLE_STATUS,
            retry_after=_retry_after(exc),
            status=status,
        )
    return ProviderError(type(exc).__name__, retryable=False)


def _usage(raw: Any) -> Usage:
    if raw is None:
        return Usage()
    details = getattr(raw, "prompt_tokens_details", None)
    cached = (getattr(details, "cached_tokens", 0) or 0) if details is not None else 0
    return Usage(
        input_tokens=getattr(raw, "prompt_tokens", 0) or 0,
        cached_tokens=cached,
        output_tokens=getattr(raw, "completion_tokens", 0) or 0,
    )


class OpenAICompatProvider:
    def __init__(
        self,
        name: str,
        *,
        api_key: str,
        base_url: str | None = None,
        structured_outputs: str = "json_schema",
        max_tokens_param: str = "max_completion_tokens",
        client: AsyncOpenAI | None = None,
    ) -> None:
        self.name = name
        self._structured_outputs = structured_outputs
        self._max_tokens_param = max_tokens_param
        # Қайталауды gateway басқарады, сондықтан SDK-ның өз қайталауы өшіріледі.
        self._client = client or AsyncOpenAI(api_key=api_key, base_url=base_url or None, max_retries=0)

    def body(self, request: CompletionRequest, *, stream: bool = False) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": request.model,
            "messages": [{"role": m.role, "content": m.content} for m in request.messages],
        }
        if is_reasoning_model(request.model):
            if request.reasoning_effort:
                body["reasoning_effort"] = request.reasoning_effort
        elif request.temperature is not None:
            body["temperature"] = request.temperature
        if request.max_output_tokens is not None:
            body[self._max_tokens_param] = request.max_output_tokens
        if request.json_schema is not None:
            if self._structured_outputs == "json_schema":
                body["response_format"] = {
                    "type": "json_schema",
                    "json_schema": {
                        "name": request.schema_name or "response",
                        "schema": request.json_schema,
                        "strict": request.strict_schema,
                    },
                }
            else:
                # json_object режимінде схеманы промпттың өзі сипаттауы керек.
                body["response_format"] = {"type": "json_object"}
        if stream:
            body["stream"] = True
            body["stream_options"] = {"include_usage": True}
        return body

    async def complete(self, request: CompletionRequest) -> ProviderCompletion:
        try:
            response = await self._client.chat.completions.create(
                **self.body(request), timeout=request.timeout_s
            )
        except Exception as exc:  # noqa: BLE001 — кез келген SDK қатесі ProviderError болады
            raise to_provider_error(exc) from exc
        choice = response.choices[0] if response.choices else None
        text = (choice.message.content or "") if choice is not None else ""
        return ProviderCompletion(text=text, usage=_usage(response.usage), model=response.model or request.model)

    async def stream(self, request: CompletionRequest) -> AsyncIterator[StreamChunk]:
        try:
            response = await self._client.chat.completions.create(
                **self.body(request, stream=True), timeout=request.timeout_s
            )
            async for chunk in response:
                text = ""
                if chunk.choices:
                    delta = chunk.choices[0].delta
                    text = (delta.content or "") if delta is not None else ""
                raw_usage = getattr(chunk, "usage", None)
                usage = _usage(raw_usage) if raw_usage is not None else None
                if text or usage is not None:
                    yield StreamChunk(text=text, usage=usage, model=chunk.model)
        except Exception as exc:  # noqa: BLE001
            raise to_provider_error(exc) from exc

    async def embed(
        self, *, model: str, texts: Sequence[str], timeout_s: float
    ) -> tuple[list[list[float]], Usage]:
        try:
            response = await self._client.embeddings.create(model=model, input=list(texts), timeout=timeout_s)
        except Exception as exc:  # noqa: BLE001
            raise to_provider_error(exc) from exc
        vectors = [item.embedding for item in sorted(response.data, key=lambda item: item.index)]
        tokens = getattr(response.usage, "prompt_tokens", 0) or 0
        return vectors, Usage(input_tokens=tokens)

    async def submit_batch(self, *, items: Sequence[tuple[str, CompletionRequest]]) -> str:
        lines = [
            json.dumps(
                {
                    "custom_id": custom_id,
                    "method": "POST",
                    "url": "/v1/chat/completions",
                    "body": self.body(request),
                },
                ensure_ascii=False,
            )
            for custom_id, request in items
        ]
        payload = ("\n".join(lines) + "\n").encode("utf-8")
        try:
            uploaded = await self._client.files.create(
                file=("batch.jsonl", payload, "application/jsonl"), purpose="batch"
            )
            batch = await self._client.batches.create(
                input_file_id=uploaded.id, endpoint="/v1/chat/completions", completion_window="24h"
            )
        except Exception as exc:  # noqa: BLE001
            raise to_provider_error(exc) from exc
        return batch.id

    async def fetch_batch(self, batch_id: str) -> BatchStatus:
        try:
            batch = await self._client.batches.retrieve(batch_id)
            state = _BATCH_STATE.get(batch.status, "in_progress")
            if state not in _BATCH_WITH_RESULTS:
                return BatchStatus(batch_id=batch_id, status=state)
            results: list[BatchItemResult] = []
            for file_id in (batch.output_file_id, batch.error_file_id):
                if not file_id:
                    continue
                content = await self._client.files.content(file_id)
                for line in content.text.splitlines():
                    if line.strip():
                        results.append(_batch_row(json.loads(line)))
        except Exception as exc:  # noqa: BLE001
            raise to_provider_error(exc) from exc
        return BatchStatus(batch_id=batch_id, status=state, results=tuple(results))

    async def cancel_batch(self, batch_id: str) -> None:
        """Тоқтату сұралады; провайдер біткен сұраныстардың нәтижесін сақтайды (`cancelled` күйінде)."""
        try:
            await self._client.batches.cancel(batch_id)
        except Exception as exc:  # noqa: BLE001
            raise to_provider_error(exc) from exc


def _batch_row(row: dict[str, Any]) -> BatchItemResult:
    custom_id = str(row.get("custom_id", ""))
    error = row.get("error")
    response = row.get("response") or {}
    body = response.get("body") or {}
    if error or response.get("status_code", 200) >= 400:
        code = (error or {}).get("code") if isinstance(error, dict) else None
        return BatchItemResult(
            custom_id=custom_id,
            text=None,
            usage=Usage(),
            error=str(code or f"HTTP {response.get('status_code')}"),
        )
    choices = body.get("choices") or []
    text = ((choices[0].get("message") or {}).get("content") or "") if choices else ""
    usage = body.get("usage") or {}
    details = usage.get("prompt_tokens_details") or {}
    return BatchItemResult(
        custom_id=custom_id,
        text=text,
        usage=Usage(
            input_tokens=usage.get("prompt_tokens", 0) or 0,
            cached_tokens=details.get("cached_tokens", 0) or 0,
            output_tokens=usage.get("completion_tokens", 0) or 0,
        ),
    )
