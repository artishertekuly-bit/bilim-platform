"""Банкті толтыру контуры (ai_examiner.md §5.1).

  ұғымдар (concepts) → жоспар (planner) → контекст пен чанк комбинациясы (context)
  → Batch API / Fast Lane (gateway) → Т6 құрылым (formats) → Т7 мазмұн (checks)
  → банкке жазу (repository)

Контур екі қадаммен жүреді, сондықтан процесс кез келген жерде тоқтаса да, ештеңе жоғалмайды:
  * `submit` — сұраныстарды ұсақ партиялармен Batch API-ға жібереді және оларды `generation_requests`-ке
    жазады;
  * `process` — дайын batch-терді алып, әр нәтижені тексереді және банкке жазады. Өңделген
    сұраныс қайта өңделмейді; уақытша қатеде сұраныс `pending` күйінде қалады.
  * `watchdog` — мерзімінен ұзақ тұрып қалған batch-ті тоқтатады; біткен бөлігін `process` өңдейді.
Fast Lane (`generate_now`) — сол тексерістер, бірақ синхрон шақырумен: бір §-тің қоры минуттарда
толады. Оны емтиханнан бұрын мұғалім немесе әкімші іске қосады, оқушы оны ешқашан күтпейді.
"""

from __future__ import annotations

import asyncio
import logging
import random
import uuid
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta, timezone
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
from .concepts import ChunkConcepts, Concept, ensure_concepts, topic_concepts
from .context import COMBO_SIZE, Chunk, chunk_combinations, entity_map, reference_text
from .formats import CODE_FORMATS, FORMAT_LEVEL, GEN_MODELS, Package
from .planner import StockPolicy, plan
from .prompts import GenerationTask, generation_messages, generation_prompt_ref

logger = logging.getLogger("bilim.examiner.bank")

EMBEDDING_KEY = "questions"

MAX_BATCH_REQUESTS = 100                  # бір batch-тегі сұраныс: тұрып қалса, аз жоғалады
WATCHDOG_MAX_AGE = timedelta(hours=4)     # одан ұзақ in_progress тұрған batch тоқтатылады
FAST_PREFIX = "fast-"                     # Fast Lane жазбаларының batch_id-і (провайдерде мұндай batch жоқ)
FAST_CONCURRENCY = 6                      # Fast Lane-де қатар жүретін генерация шақыруы
FAST_ROUNDS = 2                           # тексерістен өтпегендердің орны қайта сұралатын айналым саны
FAST_STALE = timedelta(minutes=30)        # үзілген Fast Lane жазбасы осыдан кейін жабылады


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
    concept_key: str | None = None


@dataclass(frozen=True)
class BatchRecord:
    batch_id: str
    provider: str
    model_key: str
    prompt_id: str
    prompt_version: str
    request_count: int
    status: str = "submitted"
    submitted_at: datetime | None = None

    @property
    def is_fast(self) -> bool:
        return self.batch_id.startswith(FAST_PREFIX)

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
    async def chunk_concepts(self, topic_id: str) -> dict[str, ChunkConcepts]: ...
    async def save_chunk_concepts(self, rows: Sequence[ChunkConcepts]) -> None: ...
    async def used_concepts(self, subject_id: str, level: int) -> dict[tuple[str, str, str], set[str]]: ...
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
        topics: Sequence[str] | None = None,
    ) -> list[BatchRecord]:
        """Жетпейтін қорды есептеп, Batch API-ға жібереді. Әр формат ұсақ партияларға бөлінеді
        (ең көбі MAX_BATCH_REQUESTS): бір партия тұрып қалса, бүкіл кітап тоқтамайды."""
        planned = await self._plan_requests(books, level, formats, max_requests, topics)
        batches: list[BatchRecord] = []
        for name, items in planned.items():
            prompt = generation_prompt_ref(name)
            for start in range(0, len(items), MAX_BATCH_REQUESTS):
                part = items[start:start + MAX_BATCH_REQUESTS]
                handle = await self._gateway.submit_batch(
                    Task.GENERATION,
                    prompt,
                    [BatchRequest(request.custom_id, tuple(messages)) for request, messages in part],
                    schema=GEN_MODELS[name],
                    variant=name,
                )
                batch = BatchRecord(
                    batch_id=handle.batch_id, provider=handle.provider, model_key=handle.model_key,
                    prompt_id=prompt.id, prompt_version=prompt.version, request_count=len(part),
                )
                await self._repo.record_batch(
                    batch, [_with_batch(request, handle.batch_id) for request, _ in part]
                )
                logger.info("generation batch submitted", extra={"batch_id": handle.batch_id, "format": name,
                                                                 "requests": len(part)})
                batches.append(batch)
        return batches

    # ------------------------------------------------------------ Fast Lane

    async def generate_now(
        self,
        books: Sequence[str],
        level: int,
        *,
        topics: Sequence[str],
        formats: Sequence[str] = CODE_FORMATS,
        max_requests: int | None = None,
        concurrency: int = FAST_CONCURRENCY,
        rounds: int = FAST_ROUNDS,
    ) -> ProcessReport:
        """Fast Lane (ai_examiner §5.4): берілген §-тердің жетпейтін қорын синхрон шақырумен толтырады.

        Batch кезегін күтпейді: сұраныстар қатар жіберіледі, әр нәтиже келген бойда Т6/Т7-ден өтіп
        банкке жазылады. Тексерістен өтпегендердің орны келесі айналымда (ең көбі `rounds`) қайта
        сұралады. Оқушының емтиханы бұл жолды ешқашан күтпейді (D64, D65): оны мұғалім немесе әкімші
        емтиханнан бұрын іске қосады.
        """
        if not topics:
            raise ValueError("Fast Lane-ге кемінде бір § беріледі")
        report = ProcessReport()
        limit = asyncio.Semaphore(max(1, concurrency))
        # Т7-дің қайталау тексерісі бұрын жазылған сұрақтарға қарайды: нәтижелер бір-бірден өңделеді,
        # әйтпесе қатар келген екі ұқсас сұрақтың екеуі де өтіп кетер еді.
        processing = asyncio.Lock()
        remaining = max_requests
        for _ in range(max(1, rounds)):
            planned = await self._plan_requests(books, level, formats, remaining, topics)
            if not planned:
                break
            await self._record_fast_batches(planned)
            items = [(name, request, messages) for name, rows in planned.items() for request, messages in rows]

            async def run(name: str, request: RequestRecord, messages: list) -> None:
                prompt = generation_prompt_ref(name)
                async with limit:
                    try:
                        result = await self._gateway.complete(
                            Task.GENERATION_FAST, prompt, messages, schema=GEN_MODELS[name], variant=name
                        )
                    except (LLMUnavailableError, LLMRequestError) as exc:
                        async with processing:
                            await self._finish(report, request, "failed", [f"Fast Lane: генерация орындалмады ({exc})"])
                        return
                async with processing:
                    try:
                        await self._process_item(report, request, result.text, result.model, prompt.version)
                    except _Deferred:
                        await self._finish(report, request, "failed", ["Fast Lane: Т7 тексерісі қолжетімсіз"])

            await asyncio.gather(*(run(name, request, messages) for name, request, messages in items))
            for batch_id in {request.batch_id for _, request, _ in items}:
                await self._repo.set_batch_status(batch_id, "processed")
            if remaining is not None:
                remaining -= len(items)
                if remaining <= 0:
                    break
        return report

    async def _record_fast_batches(self, planned: dict[str, list[tuple[RequestRecord, list]]]) -> None:
        """Fast Lane сұраныстары да `generation_requests`-ке жазылады (бақылау мен статистика үшін)."""
        for name, rows in planned.items():
            route_model = self._gateway.config.route(Task.GENERATION_FAST, name).model
            provider = self._gateway.config.models[route_model].provider
            prompt = generation_prompt_ref(name)
            batch_id = f"{FAST_PREFIX}{uuid.uuid4().hex}"
            batch = BatchRecord(batch_id=batch_id, provider=provider, model_key=route_model, prompt_id=prompt.id,
                                prompt_version=prompt.version, request_count=len(rows))
            stamped = [_with_batch(request, batch_id) for request, _ in rows]
            await self._repo.record_batch(batch, stamped)
            rows[:] = [(request, messages) for request, (_, messages) in zip(stamped, rows, strict=True)]

    # ------------------------------------------------------------ watchdog

    async def watchdog(self, max_age: timedelta = WATCHDOG_MAX_AGE, *, now: datetime | None = None) -> list[str]:
        """Мерзімінен ұзақ тұрып қалған batch-терді тоқтатады. Біткен сұраныстарды `process` кейін өңдейді
        (тоқтатылған batch-тің нәтижесі сақталады), ал орындалмағандарын келесі `submit` қайта сұрайды."""
        now = now or datetime.now(timezone.utc)
        cancelled: list[str] = []
        for batch in await self._repo.open_batches():
            if batch.status != "submitted" or batch.is_fast or batch.submitted_at is None:
                continue
            if now - batch.submitted_at < max_age:
                continue
            try:
                status = await self._gateway.fetch_batch(batch.handle())
                if status.status != "in_progress":
                    continue  # нәтижесі дайын: оны process өңдейді
                await self._gateway.cancel_batch(batch.handle())
            except (LLMUnavailableError, LLMRequestError) as exc:
                logger.warning("watchdog could not cancel %s: %s", batch.batch_id, exc)
                continue
            logger.info("generation batch cancelled by watchdog", extra={"batch_id": batch.batch_id})
            cancelled.append(batch.batch_id)
        return cancelled

    # ------------------------------------------------------------ жоспар

    async def _plan_requests(
        self,
        books: Sequence[str],
        level: int,
        formats: Sequence[str],
        max_requests: int | None,
        topics: Sequence[str] | None,
    ) -> dict[str, list[tuple[RequestRecord, list]]]:
        formats = [name for name in formats if name in CODE_FORMATS and FORMAT_LEVEL[name] == level]
        if not formats:
            raise ValueError(f"{level}-деңгейде генерацияланатын код форматы жоқ")
        paragraphs = await self._repo.paragraphs(books)
        if not paragraphs:
            raise ValueError("Кітаптарда § табылмады: corpus.chunk_meta толтырылған ба?")
        if topics is not None:
            unknown = set(topics) - {paragraph.topic_id for paragraph in paragraphs}
            if unknown:
                raise ValueError(f"Бұл §-тер кітаптарда жоқ: {sorted(unknown)}")
            paragraphs = [paragraph for paragraph in paragraphs if paragraph.topic_id in set(topics)]
        subjects = {paragraph.subject_id for paragraph in paragraphs}
        if len(subjects) != 1:
            raise ValueError("Бір іске қосуда тек бір пәннің кітаптары беріледі")
        subject_id = subjects.pop()
        by_topic = {paragraph.topic_id: paragraph for paragraph in paragraphs}

        applicable = await self._repo.format_applicability(subject_id)
        formats = [name for name in formats if applicable.get(name, True)]
        have = await self._repo.stock(subject_id, level)

        # Әр §-тің ұғымдарын шығарып (сақталғаны болса, базадан алып), мазмұны жоқ чанктарды сүземіз (D76).
        chunks_by_topic: dict[str, list[Chunk]] = {}
        content_chunks_by_topic: dict[str, list[Chunk]] = {}
        concepts_by_topic: dict[str, list[Concept]] = {}
        counts_by_topic: dict[str, int] = {}
        for paragraph in paragraphs:
            topic_id = paragraph.topic_id
            chunks = await self._repo.paragraph_chunks(topic_id)
            chunks_by_topic[topic_id] = chunks
            if not chunks:
                content_chunks_by_topic[topic_id] = []
                continue
            title = f"§{paragraph.paragraph_no}" + (f". {paragraph.paragraph_title}" if paragraph.paragraph_title else "")
            rows = await ensure_concepts(self._gateway, self._repo, topic_id, title, chunks)
            if rows is not None:
                concepts = topic_concepts(rows)
                concepts_by_topic[topic_id] = concepts
                counts_by_topic[topic_id] = len(concepts)
                non_empty = {row.chunk_id for row in rows if row.concepts}
                content_chunks_by_topic[topic_id] = [chunk for chunk in chunks if chunk.chunk_id in non_empty]
            else:
                content_chunks_by_topic[topic_id] = [chunk for chunk in chunks if chunk.text.strip()]

        slots = plan(
            list(by_topic),
            level,
            applicable,
            have,
            self._policy,
            formats,
            concepts_by_topic=counts_by_topic if counts_by_topic else None,
        )
        used = await self._repo.used_concepts(subject_id, level)

        planned: dict[str, list[tuple[RequestRecord, list]]] = defaultdict(list)
        combos_by_key: dict[tuple[str, str], list] = {}
        cursor: dict[tuple[str, str], int] = {}
        concept_cursor: dict[str, int] = {}
        count = 0
        for slot in slots:
            if max_requests is not None and count >= max_requests:
                break
            paragraph = by_topic[slot.topic_id]
            topic_concept_list = concepts_by_topic.get(slot.topic_id)
            all_terms = tuple(c.term for c in topic_concept_list) if topic_concept_list else ()

            if slot.format == "mcq" and topic_concept_list is not None:
                if not topic_concept_list:
                    continue
                chunk_by_id = {c.chunk_id: c for c in chunks_by_topic[slot.topic_id]}
                used_in_tier = used.setdefault((slot.topic_id, "mcq", slot.tier), set())
                if slot.topic_id not in concept_cursor:
                    concept_cursor[slot.topic_id] = sum(
                        n for (t, name, _), n in have.items() if (t, name) == (slot.topic_id, "mcq")
                    )
                for _ in range(slot.missing):
                    if max_requests is not None and count >= max_requests:
                        break
                    chosen: Concept | None = None
                    start_pos = concept_cursor[slot.topic_id]
                    for offset in range(len(topic_concept_list)):
                        candidate = topic_concept_list[(start_pos + offset) % len(topic_concept_list)]
                        if candidate.key not in used_in_tier and candidate.chunk_id in chunk_by_id:
                            chosen = candidate
                            concept_cursor[slot.topic_id] = start_pos + offset + 1
                            break
                    if chosen is None:
                        break
                    used_in_tier.add(chosen.key)
                    combo = (chunk_by_id[chosen.chunk_id],)
                    request = RequestRecord(
                        custom_id=uuid.uuid4().hex,
                        batch_id="",
                        subject_id=subject_id,
                        topic_id=slot.topic_id,
                        level=level,
                        format=slot.format,
                        x_tier=slot.tier,
                        chunk_ids=(chosen.chunk_id,),
                        concept_key=chosen.key,
                    )
                    task = GenerationTask(
                        format=slot.format,
                        level=level,
                        tier=slot.tier,
                        book_title=paragraph.book_title,
                        paragraph_no=paragraph.paragraph_no,
                        paragraph_title=paragraph.paragraph_title,
                        concept=chosen.term,
                        topic_concepts=all_terms,
                    )
                    planned[slot.format].append((request, generation_messages(task, reference_text(combo))))
                    count += 1
                continue

            key = (slot.topic_id, slot.format)
            if key not in combos_by_key:
                content_chunks = content_chunks_by_topic.get(slot.topic_id, [])
                links = await self._repo.entity_links([chunk.chunk_id for chunk in content_chunks]) if content_chunks else []
                combos_by_key[key] = (
                    chunk_combinations(
                        content_chunks,
                        COMBO_SIZE[slot.format],
                        entity_map(links, [c.chunk_id for c in content_chunks]),
                    )
                    if content_chunks else []
                )
                cursor[key] = sum(n for (topic, name, _), n in have.items() if (topic, name) == key)
            combos = combos_by_key[key]
            if not combos:
                continue
            for _ in range(slot.missing):
                if max_requests is not None and count >= max_requests:
                    break
                combo = combos[cursor[key] % len(combos)]
                cursor[key] += 1
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
                    format=slot.format,
                    level=level,
                    tier=slot.tier,
                    book_title=paragraph.book_title,
                    paragraph_no=paragraph.paragraph_no,
                    paragraph_title=paragraph.paragraph_title,
                    topic_concepts=all_terms if slot.format == "mcq" else (),
                )
                planned[slot.format].append((request, generation_messages(task, reference_text(combo))))
                count += 1
        return dict(planned)

    # ------------------------------------------------------------ process

    async def process(self, *, now: datetime | None = None) -> ProcessReport:
        report = ProcessReport()
        now = now or datetime.now(timezone.utc)
        for batch in await self._repo.open_batches():
            if batch.is_fast:
                # Fast Lane өз жазбасын өзі жабады. Ашық қалса, процесс үзілген: сұраныстары failed болады,
                # ал жетпеген қорды келесі submit қайта сұрайды. Жүріп жатқанына тиіспеу үшін тек ескісі.
                if batch.submitted_at is not None and now - batch.submitted_at >= FAST_STALE:
                    for request in await self._repo.pending_requests(batch.batch_id):
                        await self._finish(report, request, "failed", ["Fast Lane үзілді"])
                    await self._repo.set_batch_status(batch.batch_id, "processed")
                continue
            status = await self._gateway.fetch_batch(batch.handle())
            if status.status == "in_progress":
                continue
            pending = {request.custom_id: request for request in await self._repo.pending_requests(batch.batch_id)}
            if status.results is None:  # batch мүлде орындалмады (failed): нәтиже жоқ
                for request in pending.values():
                    await self._finish(report, request, "failed", [f"batch {status.status}"])
                await self._repo.set_batch_status(batch.batch_id, "processed")
                continue
            # Мерзімі өткен немесе тоқтатылған batch-тің біткен сұраныстары толық batch-тікі сияқты өңделеді.
            # Базадағы `completed` — «нәтиже алынды, өңделіп жатыр» (open_batches оны қайта береді).
            if batch.status == "submitted":
                await self._repo.set_batch_status(batch.batch_id, "completed")
            missing_reason = (
                "batch нәтижесінде бұл сұраныс жоқ" if status.status == "completed"
                else f"batch {status.status}: сұраныс орындалмады"
            )

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
                await self._finish(report, request, "failed", [missing_reason])
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
    return replace(request, batch_id=batch_id)
