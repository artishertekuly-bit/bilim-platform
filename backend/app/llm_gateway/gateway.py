"""LLM gateway: барлық LLM және embedding шақыруы осы класс арқылы өтеді (ortaq §2, api §7).

Шақырушы модель атауын бермейді: модельді тапсырма анықтайды. Gateway лимитті,
басымдық кезегін, қайталауды, резерв провайдерді, құрылымдық жауапты тексеруді
және әр шақырудың логын өзі басқарады.
"""

from __future__ import annotations

import asyncio
import logging
import math
import random
import time
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping, Sequence
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from .config import GatewayConfig, ModelConfig, Pricing, ProviderConfig, RouteConfig
from .contracts import (
    TASK_PRIORITY,
    BatchHandle,
    BatchRequest,
    BatchStatus,
    LLMResult,
    Message,
    Outcome,
    Priority,
    PromptRef,
    Task,
    Usage,
)
from .errors import ConfigError, LLMRequestError, LLMStreamInterrupted, LLMUnavailableError
from .limits import Clock, PriorityGate, Sleep, TokenBucket
from .prompting import estimate_tokens, strip_json_fence, validate_messages
from .providers.base import CompletionRequest, Provider, ProviderError
from .retry import RetryPolicy, backoff_delay
from .telemetry import CallLog, LoggingSink, TelemetrySink

logger = logging.getLogger("bilim.llm_gateway")

T = TypeVar("T")


class _ProviderNotConfigured(Exception):
    pass


class _AttemptsFailed(Exception):
    """Ішкі: әрекеттер сәтсіз аяқталды. Логқа жазылғаннан кейін ашық қатеге айналады."""

    def __init__(self, error: ProviderError, attempts: int) -> None:
        super().__init__(str(error))
        self.error = error
        self.attempts = attempts
        self.exhausted = error.retryable

    @property
    def outcome(self) -> str:
        return "unavailable" if self.exhausted else "request_error"

    def public(self) -> LLMRequestError | LLMUnavailableError:
        if self.exhausted:
            return LLMUnavailableError(
                f"Провайдер {self.attempts} әрекеттен кейін жауап бермеді: {self.error}",
                retry_after=self.error.retry_after,
            )
        return LLMRequestError(f"Провайдер сұранысты қабылдамады: {self.error}", status=self.error.status)


def build_provider(config: ProviderConfig) -> Provider:
    if config.type == "openai_compat":
        from .providers.openai_compat import OpenAICompatProvider

        return OpenAICompatProvider(
            config.name,
            api_key=config.api_key or "not-needed",  # жергілікті OpenAI-үйлесімді сервер кілтсіз жұмыс істейді
            base_url=config.base_url,
            structured_outputs=config.structured_outputs,
            max_tokens_param=config.max_tokens_param,
        )
    raise ConfigError(f"Белгісіз провайдер түрі: {config.type}")


class LLMGateway:
    def __init__(
        self,
        config: GatewayConfig,
        *,
        providers: Mapping[str, Provider] | None = None,
        sink: TelemetrySink | None = None,
        clock: Clock = time.monotonic,
        sleep: Sleep = asyncio.sleep,
        rng: Callable[[], float] = random.random,
    ) -> None:
        self._config = config
        self._providers: dict[str, Provider] = dict(providers or {})
        self._sink = sink or LoggingSink()
        self._clock = clock
        self._sleep = sleep
        self._rng = rng
        self._gates = {key: PriorityGate(model.max_concurrency) for key, model in config.models.items()}
        self._rpm = {key: TokenBucket(m.rpm, clock=clock) for key, m in config.models.items() if m.rpm}
        self._tpm = {key: TokenBucket(m.tpm, clock=clock) for key, m in config.models.items() if m.tpm}
        self._completed_batches: set[str] = set()

    @property
    def config(self) -> GatewayConfig:
        return self._config

    # ------------------------------------------------------------------ public

    async def complete(
        self,
        task: Task,
        prompt: PromptRef,
        messages: Sequence[Message],
        *,
        schema: type[BaseModel] | None = None,
    ) -> LLMResult:
        """Синхрон шақыру. `schema` берілсе, жауап сол Pydantic модельге тексеріледі (bagalau Т5)."""
        route = self._route(task, "sync")
        messages = tuple(messages)
        validate_messages(messages)
        json_schema = schema.model_json_schema() if schema is not None else None
        last: LLMUnavailableError | None = None
        for index, (key, model, provider) in enumerate(self._candidates(route)):
            try:
                return await self._complete_on(
                    route, prompt, messages, schema, json_schema, key, model, provider, fallback_used=index > 0
                )
            except LLMUnavailableError as exc:
                last = exc
        raise last or LLMUnavailableError("Қолжетімді модель жоқ")

    async def stream(self, task: Task, prompt: PromptRef, messages: Sequence[Message]) -> AsyncIterator[str]:
        """Ағынмен шақыру. Қайталау мен резерв тек бірінші токенге дейін жүреді."""
        route = self._route(task, "stream")
        messages = tuple(messages)
        validate_messages(messages)
        priority = TASK_PRIORITY[route.task]
        estimate = self._estimate(messages, route)
        policy = route.retry
        last: LLMUnavailableError | None = None

        for index, (key, model, provider) in enumerate(self._candidates(route)):
            request = CompletionRequest(
                model=model.model or "",
                messages=messages,
                temperature=route.temperature,
                max_output_tokens=route.max_output_tokens,
                timeout_s=route.timeout_s,
            )
            started = self._clock()
            fallback_used = index > 0

            def record(outcome: str, attempts: int, usage: Usage, reported: str, first: float | None,
                       error: str | None = None) -> None:
                self._record(
                    task=route.task.value, provider=provider.name, model_name=reported, prompt=prompt,
                    usage=usage, started=started, pricing=model.pricing, outcome=outcome, attempts=attempts,
                    fallback_used=fallback_used, error=error, first_token_at=first,
                )

            for attempt in range(1, policy.max_attempts + 1):
                usage = Usage()
                reported = model.model or ""
                first_token_at: float | None = None
                failure: ProviderError | None = None
                async with self._gates[key].slot(priority):
                    await self._throttle(key, estimate)
                    try:
                        async for chunk in provider.stream(request):
                            if chunk.usage is not None:
                                usage = chunk.usage
                            if chunk.model:
                                reported = chunk.model
                            if chunk.text:
                                if first_token_at is None:
                                    first_token_at = self._clock()
                                yield chunk.text
                    except ProviderError as exc:
                        self._settle(key, estimate, usage.total)
                        if first_token_at is not None:
                            record("interrupted", attempt, usage, reported, first_token_at, str(exc))
                            raise LLMStreamInterrupted(
                                f"Ағын бірінші токеннен кейін үзілді: {exc}", retry_after=exc.retry_after
                            ) from exc
                        failure = exc
                    except (GeneratorExit, asyncio.CancelledError):
                        self._settle(key, estimate, usage.total)
                        record("cancelled", attempt, usage, reported, first_token_at)
                        raise
                    else:
                        self._settle(key, estimate, usage.total)
                        record("ok", attempt, usage, reported, first_token_at)
                        return

                assert failure is not None
                if not failure.retryable:
                    record("request_error", attempt, usage, reported, None, str(failure))
                    raise LLMRequestError(
                        f"Провайдер сұранысты қабылдамады: {failure}", status=failure.status
                    ) from failure
                if attempt == policy.max_attempts:
                    record("unavailable", attempt, usage, reported, None, str(failure))
                    last = LLMUnavailableError(
                        f"Провайдер {attempt} әрекеттен кейін жауап бермеді: {failure}",
                        retry_after=failure.retry_after,
                    )
                    break
                await self._sleep(backoff_delay(attempt, policy, retry_after=failure.retry_after, rng=self._rng))

        raise last or LLMUnavailableError("Қолжетімді модель жоқ")

    async def embed(
        self, texts: Sequence[str], *, model_key: str, priority: Priority = Priority.INTERACTIVE
    ) -> list[list[float]]:
        """`model_key` — config.embeddings ішіндегі атау (мысалы, `answers`).
        Оқулық пен жауап векторлары бөлек модельмен және бөлек индекспен жүреді (bagalau §6)."""
        key = self._config.embeddings.get(model_key)
        if key is None:
            raise ConfigError(f"'{model_key}' embedding маршруты жоқ")
        texts = list(texts)
        if not texts:
            return []
        if any(not text.strip() for text in texts):
            raise ValueError("Бос мәтінге embedding жасалмайды")
        model = self._config.models[key]
        if model.model is None:
            raise ConfigError(f"'{key}' моделінің атауы берілмеген: {model.model_spec}")
        try:
            provider = self._provider(model.provider)
        except _ProviderNotConfigured:
            raise ConfigError(f"'{model.provider}' провайдерінің кілті немесе base_url берілмеген") from None

        model_name = model.model
        estimate = math.ceil(sum(len(text) for text in texts) / self._config.chars_per_token)
        started = self._clock()
        task_name = f"embedding:{model_key}"

        async def call() -> tuple[tuple[list[list[float]], Usage], int]:
            vectors, usage = await provider.embed(
                model=model_name, texts=texts, timeout_s=self._config.embedding_timeout_s
            )
            return (vectors, usage), usage.total

        try:
            (vectors, usage), attempts = await self._with_retries(
                key=key, priority=priority, policy=RetryPolicy(), estimate=estimate, operation=call
            )
        except _AttemptsFailed as failure:
            self._record(
                task=task_name, provider=provider.name, model_name=model_name, prompt=None, usage=Usage(),
                started=started, pricing=model.pricing, outcome=failure.outcome, attempts=failure.attempts,
                fallback_used=False, error=str(failure.error),
            )
            raise failure.public() from failure.error
        if len(vectors) != len(texts):
            raise LLMRequestError("Embedding саны мәтін санымен сәйкес емес")
        self._record(
            task=task_name, provider=provider.name, model_name=model_name, prompt=None, usage=usage,
            started=started, pricing=model.pricing, outcome="ok", attempts=attempts, fallback_used=False,
        )
        return vectors

    async def submit_batch(
        self,
        task: Task,
        prompt: PromptRef,
        requests: Sequence[BatchRequest],
        *,
        schema: type[BaseModel] | None = None,
    ) -> BatchHandle:
        """Пакет генерациясы (Batch API). Нәтижесі `fetch_batch` арқылы алынады."""
        route = self._route(task, "batch")
        requests = tuple(requests)
        if not requests:
            raise ValueError("Batch бос")
        ids = [request.custom_id for request in requests]
        if len(set(ids)) != len(ids):
            raise ValueError("custom_id қайталанбауы керек")
        for request in requests:
            validate_messages(request.messages)
        json_schema = schema.model_json_schema() if schema is not None else None
        last: LLMUnavailableError | None = None

        for index, (key, model, provider) in enumerate(self._candidates(route)):
            items = tuple(
                (
                    request.custom_id,
                    CompletionRequest(
                        model=model.model or "",
                        messages=tuple(request.messages),
                        temperature=route.temperature,
                        max_output_tokens=route.max_output_tokens,
                        timeout_s=route.timeout_s,
                        json_schema=json_schema,
                        schema_name=schema.__name__ if schema is not None else None,
                        strict_schema=route.strict_schema,
                    ),
                )
                for request in requests
            )
            started = self._clock()

            async def call(provider: Provider = provider, items: tuple = items) -> tuple[str, int]:
                return await provider.submit_batch(items=items), 0

            try:
                batch_id, attempts = await self._with_retries(
                    key=key, priority=Priority.BACKGROUND, policy=route.retry, estimate=0, operation=call
                )
            except _AttemptsFailed as failure:
                self._record(
                    task=route.task.value, provider=provider.name, model_name=model.model or "", prompt=prompt,
                    usage=Usage(), started=started, pricing=model.pricing, outcome=failure.outcome,
                    attempts=failure.attempts, fallback_used=index > 0, error=str(failure.error),
                )
                public = failure.public()
                if not failure.exhausted:
                    raise public from failure.error
                last = public
                continue
            self._record(
                task=route.task.value, provider=provider.name, model_name=model.model or "", prompt=prompt,
                usage=Usage(), started=started, pricing=model.pricing, outcome="batch_submitted",
                attempts=attempts, fallback_used=index > 0,
            )
            return BatchHandle(batch_id=batch_id, provider=model.provider, model_key=key, task=task, prompt=prompt)

        raise last or LLMUnavailableError("Қолжетімді модель жоқ")

    async def fetch_batch(self, handle: BatchHandle) -> BatchStatus:
        model = self._config.models[handle.model_key]
        try:
            provider = self._provider(handle.provider)
        except _ProviderNotConfigured:
            raise ConfigError(f"'{handle.provider}' провайдерінің кілті немесе base_url берілмеген") from None
        try:
            status = await provider.fetch_batch(handle.batch_id)
        except ProviderError as exc:
            if exc.retryable:
                raise LLMUnavailableError(str(exc), retry_after=exc.retry_after) from exc
            raise LLMRequestError(str(exc), status=exc.status) from exc

        # Нәтижесі бар кез келген соңғы күй (мерзімі өткен, тоқтатылған batch те) шығынға бір рет жазылады.
        if status.results is not None and handle.batch_id not in self._completed_batches:
            self._completed_batches.add(handle.batch_id)
            usage = sum((result.usage for result in status.results), Usage())
            route = self._config.route(handle.task)
            self._record(
                task=handle.task.value, provider=provider.name, model_name=model.model or model.model_spec,
                prompt=handle.prompt, usage=usage, started=self._clock(), pricing=model.pricing,
                outcome=f"batch_{status.status}", attempts=1, fallback_used=handle.model_key != route.model,
                batch=True,
            )
        return status

    async def cancel_batch(self, handle: BatchHandle) -> None:
        """Тұрып қалған batch-ті тоқтатады. Біткен сұраныстардың нәтижесі `fetch_batch` арқылы алынады."""
        try:
            provider = self._provider(handle.provider)
        except _ProviderNotConfigured:
            raise ConfigError(f"'{handle.provider}' провайдерінің кілті немесе base_url берілмеген") from None
        try:
            await provider.cancel_batch(handle.batch_id)
        except ProviderError as exc:
            if exc.retryable:
                raise LLMUnavailableError(str(exc), retry_after=exc.retry_after) from exc
            raise LLMRequestError(str(exc), status=exc.status) from exc

    # ----------------------------------------------------------------- internal

    async def _complete_on(
        self,
        route: RouteConfig,
        prompt: PromptRef,
        messages: tuple[Message, ...],
        schema: type[BaseModel] | None,
        json_schema: dict | None,
        key: str,
        model: ModelConfig,
        provider: Provider,
        *,
        fallback_used: bool,
    ) -> LLMResult:
        request = CompletionRequest(
            model=model.model or "",
            messages=messages,
            temperature=route.temperature,
            max_output_tokens=route.max_output_tokens,
            timeout_s=route.timeout_s,
            json_schema=json_schema,
            schema_name=schema.__name__ if schema is not None else None,
            strict_schema=route.strict_schema,
        )
        estimate = self._estimate(messages, route)
        priority = TASK_PRIORITY[route.task]
        started = self._clock()
        usage = Usage()
        attempts = 0
        text = ""
        parsed: BaseModel | None = None
        outcome: Outcome = "ok"
        reported = request.model

        async def call():
            completion = await provider.complete(request)
            return completion, completion.usage.total

        rounds = route.format_retries + 1 if schema is not None else 1
        try:
            for round_index in range(rounds):
                completion, used = await self._with_retries(
                    key=key, priority=priority, policy=route.retry, estimate=estimate, operation=call
                )
                attempts += used
                usage = usage + completion.usage
                text = completion.text
                reported = completion.model or reported
                if schema is None:
                    break
                try:
                    parsed = schema.model_validate_json(strip_json_fence(text))
                except ValidationError:
                    parsed = None
                    outcome = "format_error"
                    continue
                outcome = "ok" if round_index == 0 else "retried"
                break
        except _AttemptsFailed as failure:
            attempts += failure.attempts
            self._record(
                task=route.task.value, provider=provider.name, model_name=reported, prompt=prompt, usage=usage,
                started=started, pricing=model.pricing, outcome=failure.outcome, attempts=attempts,
                fallback_used=fallback_used, error=str(failure.error),
            )
            raise failure.public() from failure.error

        log = self._record(
            task=route.task.value, provider=provider.name, model_name=reported, prompt=prompt, usage=usage,
            started=started, pricing=model.pricing, outcome=outcome, attempts=attempts,
            fallback_used=fallback_used,
        )
        return LLMResult(
            text=text,
            parsed=parsed,
            model=reported,
            provider=provider.name,
            prompt_version=prompt.version,
            input_tokens=usage.input_tokens,
            cached_tokens=usage.cached_tokens,
            output_tokens=usage.output_tokens,
            latency_ms=log.latency_ms,
            cost_usd=log.cost_usd,
            outcome=outcome,
            attempts=attempts,
            fallback_used=fallback_used,
        )

    async def _with_retries(
        self,
        *,
        key: str,
        priority: Priority,
        policy: RetryPolicy,
        estimate: int,
        operation: Callable[[], Awaitable[tuple[T, int]]],
    ) -> tuple[T, int]:
        """Бір модельге қайталаумен шақыру. Кідіріс кезінде кезектегі орын босатылады."""
        for attempt in range(1, policy.max_attempts + 1):
            failure: ProviderError | None = None
            async with self._gates[key].slot(priority):
                await self._throttle(key, estimate)
                try:
                    result, used = await operation()
                except ProviderError as exc:
                    self._settle(key, estimate, 0)
                    failure = exc
                else:
                    self._settle(key, estimate, used)
                    return result, attempt
            if not failure.retryable or attempt == policy.max_attempts:
                raise _AttemptsFailed(failure, attempt)
            await self._sleep(backoff_delay(attempt, policy, retry_after=failure.retry_after, rng=self._rng))
        raise AssertionError("unreachable")

    def _route(self, task: Task, mode: str) -> RouteConfig:
        route = self._config.route(task)
        if route.mode != mode:
            raise ValueError(
                f"'{task.value}' тапсырмасы '{route.mode}' режимінде; оны '{mode}' әдісімен шақыруға болмайды"
            )
        return route

    def _provider(self, name: str) -> Provider:
        provider = self._providers.get(name)
        if provider is not None:
            return provider
        config = self._config.providers[name]
        if not config.configured:
            raise _ProviderNotConfigured(name)
        provider = build_provider(config)
        self._providers[name] = provider
        return provider

    def _candidates(self, route: RouteConfig) -> list[tuple[str, ModelConfig, Provider]]:
        """Негізгі модель және (рұқсат етілсе) резервтер. Бапталмаған резерв өткізіледі."""
        candidates: list[tuple[str, ModelConfig, Provider]] = []
        for index, key in enumerate((route.model, *route.fallback)):
            model = self._config.models[key]
            primary = index == 0
            if model.model is None:
                if primary:
                    raise ConfigError(f"'{key}' моделінің атауы берілмеген: {model.model_spec}")
                logger.warning("Резерв '%s' өткізілді: модель атауы берілмеген", key)
                continue
            try:
                provider = self._provider(model.provider)
            except _ProviderNotConfigured:
                if primary:
                    raise ConfigError(
                        f"'{model.provider}' провайдерінің кілті немесе base_url берілмеген"
                    ) from None
                logger.warning("Резерв '%s' өткізілді: '%s' провайдері бапталмаған", key, model.provider)
                continue
            candidates.append((key, model, provider))
        return candidates

    def _estimate(self, messages: Sequence[Message], route: RouteConfig) -> int:
        return estimate_tokens(messages, self._config.chars_per_token) + (route.max_output_tokens or 0)

    async def _throttle(self, key: str, estimate: int) -> None:
        rpm = self._rpm.get(key)
        if rpm is not None:
            await rpm.acquire(1, sleep=self._sleep)
        tpm = self._tpm.get(key)
        if tpm is not None and estimate > 0:
            await tpm.acquire(estimate, sleep=self._sleep)

    def _settle(self, key: str, estimate: int, actual: int) -> None:
        tpm = self._tpm.get(key)
        if tpm is not None and estimate > 0:
            tpm.adjust(actual - estimate)

    def _ms(self, start: float, end: float | None = None) -> int:
        finish = self._clock() if end is None else end
        return max(0, int(round((finish - start) * 1000)))

    def _record(
        self,
        *,
        task: str,
        provider: str,
        model_name: str,
        prompt: PromptRef | None,
        usage: Usage,
        started: float,
        pricing: Pricing | None,
        outcome: str,
        attempts: int,
        fallback_used: bool,
        error: str | None = None,
        first_token_at: float | None = None,
        batch: bool = False,
    ) -> CallLog:
        log = CallLog(
            task=task,
            provider=provider,
            model=model_name,
            prompt_id=prompt.id if prompt else None,
            prompt_version=prompt.version if prompt else None,
            input_tokens=usage.input_tokens,
            cached_tokens=usage.cached_tokens,
            output_tokens=usage.output_tokens,
            latency_ms=self._ms(started),
            first_token_ms=self._ms(started, first_token_at) if first_token_at is not None else None,
            cost_usd=pricing.cost(usage, batch=batch) if pricing is not None else None,
            outcome=outcome,
            attempts=attempts,
            fallback_used=fallback_used,
            error=error,
        )
        try:
            self._sink.record(log)
        except Exception:  # noqa: BLE001 — телеметрия шақыруды бұзбауы керек
            logger.exception("LLM шақыруының логы жазылмады")
        return log
