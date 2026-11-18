"""Банкті толтыру контуры (ai_examiner.md §5.1).

  жоспар (planner) → контекст пен чанк комбинациясы (context) → Batch API (gateway)
  → Т6 құрылым (formats) → Т7 мазмұн (checks) → банкке жазу (repository)

Контур екі қадаммен жүреді, сондықтан процесс кез келген жерде тоқтаса да, ештеңе жоғалмайды:
  * `submit` — сұраныстарды Batch API-ға жібереді және оларды `generation_requests`-ке жазады;
  * `process` — дайын batch-терді алып, әр нәтижені тексереді және банкке жазады. Өңделген
    сұраныс қайта өңделмейді; уақытша қатеде сұраныс `pending` күйінде қалады.
"""

from __future__ import annotations

import logging
import random
import uuid
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Protocol

from pydantic import ValidationError

from ...llm_gateway import (
    BatchHandle,
    BatchRequest,
    LLMGateway,
    LLMRequestError,
    LLMUnavailableError,
    Priority,
    PromptRef,
    Task,
)
from ...llm_gateway.prompting import strip_json_fence
from .checks import duplicate_problem, mcq_solver_problem, quote_problem
from .context import COMBO_SIZE, Chunk, chunk_combinations, entity_map, reference_text
from .formats import CODE_FORMATS, FORMAT_LEVEL, GEN_MODELS, Package
from .planner import StockPolicy, plan
from .prompts import GenerationTask, generation_messages, generation_prompt_ref

logger = logging.getLogger("bilim.examiner.bank")

EMBEDDING_KEY = "questions"


# ---------------------------------------------------------------- деректер


@dataclass(frozen=True)
class Paragraph:
    topic_id: str
    subject_id: str
    book: str
    book_title: str
    paragraph_no: str
    paragraph_title: str | None


@dataclass(frozen=True)
class RequestRecord:
    custom_id: str
    batch_id: str
    subject_id: str
    topic_id: str
    level: int
    format: str
    x_tier: str
    chunk_ids: tuple[str, ...]


@dataclass(frozen=True)
class BatchRecord:
    batch_id: str
    provider: str
    model_key: str
    prompt_id: str
    prompt_version: str
    request_count: int
    status: str = "submitted"

    def handle(self) -> BatchHandle:
        return BatchHandle(
            batch_id=self.batch_id,
            provider=self.provider,
            model_key=self.model_key,
            task=Task.GENERATION,
            prompt=PromptRef(self.prompt_id, self.prompt_version),
        )


@dataclass(frozen=True)
class NewQuestion:
    request: RequestRecord
    package: Package
    reference_context: dict
    generator_model: str
    prompt_version: str
    embedding: list[float]
    embedding_model: str


class BankRepository(Protocol):
    async def paragraphs(self, books: Sequence[str]) -> list[Paragraph]: ...
    async def paragraph_chunks(self, topic_id: str) -> list[Chunk]: ...
    async def chunks(self, chunk_ids: Sequence[str]) -> list[Chunk]: ...
    async def entity_links(self, chunk_ids: Sequence[str]) -> list[tuple[str, str]]: ...
    async def format_applicability(self, subject_id: str) -> dict[str, bool]: ...
    async def stock(self, subject_id: str, level: int) -> dict[tuple[str, str, str], int]: ...
    async def record_batch(self, batch: BatchRecord, requests: Sequence[RequestRecord]) -> None: ...
    async def open_batches(self) -> list[BatchRecord]: ...
    async def set_batch_status(self, batch_id: str, status: str) -> None: ...
    async def pending_requests(self, batch_id: str) -> list[RequestRecord]: ...
    async def existing_embeddings(self, topic_id: str, level: int) -> list[list[float]]: ...
    async def accept(self, question: NewQuestion) -> str: ...
    async def reject(self, custom_id: str, status: str, reasons: Sequence[str]) -> None: ...


@dataclass
class ProcessReport:
    accepted: int = 0
    rejected: int = 0
    failed: int = 0
    deferred: int = 0
    reasons: dict[str, int] = field(default_factory=lambda: defaultdict(int))


class _Deferred(Exception):
    """Уақытша қате: сұраныс pending күйінде қалады және кейін қайта өңделеді."""


# ---------------------------------------------------------------- контур


class BankPipeline:
    def __init__(
        self,
        gateway: LLMGateway,
        repository: BankRepository,
        *,
        policy: StockPolicy = StockPolicy(),
        rng: random.Random | None = None,
    ) -> None:
        self._gateway = gateway
        self._repo = repository
        self._policy = policy
        self._rng = rng or random.Random()

    # ------------------------------------------------------------ submit

    async def submit(
        self,
        books: Sequence[str],
        level: int,
        *,
        formats: Sequence[str] = CODE_FORMATS,
        max_requests: int | None = None,
    ) -> list[BatchRecord]:
        """Жетпейтін қорды есептеп, әр формат үшін бір batch жібереді."""
        formats = [name for name in formats if name in CODE_FORMATS and FORMAT_LEVEL[name] == level]
        if not formats:
            raise ValueError(f"{level}-деңгейде генерацияланатын код форматы жоқ")
        paragraphs = await self._repo.paragraphs(books)
        if not paragraphs:
            raise ValueError("Кітаптарда § табылмады: corpus.chunk_meta толтырылған ба?")
        subjects = {paragraph.subject_id for paragraph in paragraphs}
        if len(subjects) != 1:
            raise ValueError("Бір іске қосуда тек бір пәннің кітаптары беріледі")
        subject_id = subjects.pop()
        by_topic = {paragraph.topic_id: paragraph for paragraph in paragraphs}

        applicable = await self._repo.format_applicability(subject_id)
        formats = [name for name in formats if applicable.get(name, True)]
        have = await self._repo.stock(subject_id, level)
        slots = plan(list(by_topic), level, applicable, have, self._policy, formats)

        planned: dict[str, list[tuple[RequestRecord, list]]] = defaultdict(list)
        count = 0
        for slot in slots:
            paragraph = by_topic[slot.topic_id]
            chunks = await self._repo.paragraph_chunks(slot.topic_id)
            if not chunks:
                continue
            links = await self._repo.entity_links([chunk.chunk_id for chunk in chunks])
            combos = chunk_combinations(chunks, COMBO_SIZE[slot.format], entity_map(links, [c.chunk_id for c in chunks]))
            used = have.get((slot.topic_id, slot.format, slot.tier), 0)
            for offset in range(slot.missing):
                if max_requests is not None and count >= max_requests:
                    break
                combo = combos[(used + offset) % len(combos)]
                request = RequestRecord(
                    custom_id=uuid.uuid4().hex,
                    batch_id="",
                    subject_id=subject_id,
                    topic_id=slot.topic_id,
                    level=level,
                    format=slot.format,
                    x_tier=slot.tier,
                    chunk_ids=tuple(chunk.chunk_id for chunk in combo),
                )
                task = GenerationTask(
                    format=slot.format, level=level, tier=slot.tier, book_title=paragraph.book_title,
                    paragraph_no=paragraph.paragraph_no, paragraph_title=paragraph.paragraph_title,
                )
                planned[slot.format].append((request, generation_messages(task, reference_text(combo))))
                count += 1

        batches: list[BatchRecord] = []
        for name, items in planned.items():
            prompt = generation_prompt_ref(name)
            handle = await self._gateway.submit_batch(
                Task.GENERATION,
                prompt,
                [BatchRequest(request.custom_id, tuple(messages)) for request, messages in items],
                schema=GEN_MODELS[name],
            )
            batch = BatchRecord(
                batch_id=handle.batch_id, provider=handle.provider, model_key=handle.model_key,
                prompt_id=prompt.id, prompt_version=prompt.version, request_count=len(items),
            )
            await self._repo.record_batch(
                batch, [_with_batch(request, handle.batch_id) for request, _ in items]
            )
            logger.info("generation batch submitted", extra={"batch_id": handle.batch_id, "format": name,
                                                             "requests": len(items)})
            batches.append(batch)
        return batches

    # ------------------------------------------------------------ process

    async def process(self) -> ProcessReport:
        report = ProcessReport()
        for batch in await self._repo.open_batches():
            status = await self._gateway.fetch_batch(batch.handle())
            if status.status == "in_progress":
                continue
            pending = {request.custom_id: request for request in await self._repo.pending_requests(batch.batch_id)}
            if status.status != "completed":
                for request in pending.values():
                    await self._finish(report, request, "failed", [f"batch {status.status}"])
                await self._repo.set_batch_status(batch.batch_id, "processed")
                continue
            if batch.status == "submitted":
                await self._repo.set_batch_status(batch.batch_id, "completed")

            model_name = self._gateway.config.models[batch.model_key].model or batch.model_key
            deferred = False
            for result in status.results or ():
                request = pending.pop(result.custom_id, None)
                if request is None:
                    continue  # бұрын өңделген
                if result.error or result.text is None:
                    await self._finish(report, request, "failed", [f"провайдер қатесі: {result.error or 'мәтін жоқ'}"])
                    continue
                try:
                    await self._process_item(report, request, result.text, model_name, batch.prompt_version)
                except _Deferred:
                    report.deferred += 1
                    deferred = True
            for request in pending.values():
                await self._finish(report, request, "failed", ["batch нәтижесінде бұл сұраныс жоқ"])
            if not deferred:
                await self._repo.set_batch_status(batch.batch_id, "processed")
        return report

    async def _process_item(
        self, report: ProcessReport, request: RequestRecord, text: str, model_name: str, prompt_version: str
    ) -> None:
        try:
            generated = GEN_MODELS[request.format].model_validate_json(strip_json_fence(text))
        except ValidationError:
            await self._finish(report, request, "rejected", ["Т6: JSON құрылымы бұзылған"])
            return
        problems = generated.problems()
        if problems:
            await self._finish(report, request, "rejected", problems)
            return

        package = generated.to_package(self._rng)
        chunks = await self._repo.chunks(request.chunk_ids)
        reference = reference_text(chunks)
        problem = quote_problem(package, reference)
        if problem is None and request.format == "mcq":
            try:
                problem = await mcq_solver_problem(self._gateway, package, reference)
            except LLMUnavailableError as exc:
                logger.warning("mcq solver unavailable: %s", exc)
                raise _Deferred from exc
            except LLMRequestError as exc:
                await self._finish(report, request, "failed", [f"шешуші модель сұранысы қабылданбады: {exc.status}"])
                return
        if problem is not None:
            await self._finish(report, request, "rejected", [problem])
            return

        try:
            [embedding] = await self._gateway.embed(
                [package.similarity_text()], model_key=EMBEDDING_KEY, priority=Priority.BACKGROUND
            )
        except LLMUnavailableError as exc:
            logger.warning("question embedding unavailable: %s", exc)
            raise _Deferred from exc
        except LLMRequestError as exc:
            await self._finish(report, request, "failed", [f"embedding сұранысы қабылданбады: {exc.status}"])
            return
        existing = await self._repo.existing_embeddings(request.topic_id, request.level)
        problem = duplicate_problem(embedding, existing)
        if problem is not None:
            await self._finish(report, request, "rejected", [problem])
            return

        embedding_key = self._gateway.config.embeddings[EMBEDDING_KEY]
        await self._repo.accept(NewQuestion(
            request=request,
            package=package,
            reference_context={"text": reference, "chunk_ids": list(request.chunk_ids)},
            generator_model=model_name,
            prompt_version=prompt_version,
            embedding=list(embedding),
            embedding_model=self._gateway.config.models[embedding_key].model or embedding_key,
        ))
        report.accepted += 1

    async def _finish(self, report: ProcessReport, request: RequestRecord, status: str, reasons: list[str]) -> None:
        await self._repo.reject(request.custom_id, status, reasons)
        if status == "failed":
            report.failed += 1
        else:
            report.rejected += 1
        for reason in reasons:
            report.reasons[reason.split(" (")[0]] += 1


def _with_batch(request: RequestRecord, batch_id: str) -> RequestRecord:
    return RequestRecord(
        custom_id=request.custom_id, batch_id=batch_id, subject_id=request.subject_id, topic_id=request.topic_id,
        level=request.level, format=request.format, x_tier=request.x_tier, chunk_ids=request.chunk_ids,
    )
