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
from collections.abc import Awaitable, Callable, Sequence
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
from .checks import duplicate_problem, mcq_solver_problem, quote_problem, repeat_problem, rubric_grounded_problem
from .concepts import (
    DEFAULT_CONCEPT_TYPE,
    ChunkConcepts,
    Concept,
    concept_groups,
    ensure_concepts,
    topic_concepts,
)
from .context import (
    COMBO_SIZE,
    FULL_PARAGRAPH_FORMATS,
    Chunk,
    chunk_combinations,
    distant_partners,
    entity_map,
    full_paragraph_window,
    reference_text,
)
from .formats import ALL_FORMATS, CONCEPT_BOUND_FORMATS, FORMAT_LEVEL, GEN_MODELS, Package, normalize_text, word_stems
from .planner import ANCHORED_FORMATS, StockPolicy, plan
from .prompts import GenerationTask, generation_messages, generation_prompt_ref

logger = logging.getLogger("bilim.examiner.bank")

EMBEDDING_KEY = "questions"

MAX_BATCH_REQUESTS = 100                  # бір batch-тегі сұраныс: тұрып қалса, аз жоғалады
WATCHDOG_MAX_AGE = timedelta(hours=4)     # одан ұзақ in_progress тұрған batch тоқтатылады
FAST_PREFIX = "fast-"                     # Fast Lane жазбаларының batch_id-і (провайдерде мұндай batch жоқ)
FAST_CONCURRENCY = 6                      # Fast Lane-де қатар жүретін генерация шақыруы
FAST_ROUNDS = 2                           # тексерістен өтпегендердің орны қайта сұралатын айналым саны
FAST_STALE = timedelta(minutes=30)        # үзілген Fast Lane жазбасы осыдан кейін жабылады
# X3 тест (D80): бір үзінді + §-тің басқа бөліктерінің ұғымдары «жақын алдағыштар көзі» ретінде (8–12).
# Екінші толық чанк берілгенде модель оны елемей, нысананың үзіндісінен ғана сұрақ құрды (0/6).
X3_NEAR_CONCEPTS = 12
# Тізімге тек нысанамен бір типті ұғымдар кіреді. Олар кемінде осынша болмаса, ұғым X3 тестке нысана
# болмайды: ол X1/X2-ге қалады, ал X3 нормасының жетпеген бөлігі X2-ге беріледі.
X3_MIN_NEAR = 3
# X3 нысанасы — нақты атау. «Ерте металл дәуірінің тұрғындарының кәсіптері» сияқты сипаттама — санат:
# оның әр мүшесі (суармалы егіншілік, кен өндіру) дұрыс жауап бола алады.
X3_MAX_TARGET_WORDS = 3


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
    async def existing_packages(self, topic_id: str, level: int, format_name: str) -> list[tuple[dict, dict]]: ...
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
        formats: Sequence[str] = ALL_FORMATS,
        max_requests: int | None = None,
        topics: Sequence[str] | None = None,
    ) -> list[BatchRecord]:
        """Жетпейтін қорды есептеп, Batch API-ға жібереді. Әр формат ұсақ партияларға бөлінеді
        (ең көбі MAX_BATCH_REQUESTS): бір партия тұрып қалса, бүкіл кітап тоқтамайды."""
        planned = await self._plan_requests(books, level, formats, max_requests, topics)
        batches: list[BatchRecord] = []
        for name, rows in planned.items():
            prompt = generation_prompt_ref(name)
            # Бір batch — бір модель мен ойлау режимі: санатқа бөлек нұсқасы барлар (mcq_x3) бөлек жіберіледі.
            by_variant: dict[str, list[tuple[RequestRecord, list]]] = defaultdict(list)
            for request, messages in rows:
                by_variant[self._variant(Task.GENERATION, request)].append((request, messages))
            for variant, items in by_variant.items():
                for start in range(0, len(items), MAX_BATCH_REQUESTS):
                    batches.append(await self._submit_part(name, variant, prompt, items[start:start + MAX_BATCH_REQUESTS]))
        return batches

    def _variant(self, task: Task, request: RequestRecord) -> str:
        """Маршрут нұсқасы: санатқа бөлек нұсқа бапталса (`mcq_x3`, D80) — сол, әйтпесе формат атауы (D75)."""
        tiered = f"{request.format}_{request.x_tier.lower()}"
        return tiered if tiered in self._gateway.config.routes[task].variants else request.format

    async def _submit_part(
        self, name: str, variant: str, prompt: PromptRef, part: list[tuple[RequestRecord, list]]
    ) -> BatchRecord:
        handle = await self._gateway.submit_batch(
            Task.GENERATION,
            prompt,
            [BatchRequest(request.custom_id, tuple(messages)) for request, messages in part],
            schema=GEN_MODELS[name],
            variant=variant,
        )
        batch = BatchRecord(
            batch_id=handle.batch_id, provider=handle.provider, model_key=handle.model_key,
            prompt_id=prompt.id, prompt_version=prompt.version, request_count=len(part),
        )
        await self._repo.record_batch(batch, [_with_batch(request, handle.batch_id) for request, _ in part])
        logger.info("generation batch submitted", extra={"batch_id": handle.batch_id, "format": name,
                                                         "variant": variant, "requests": len(part)})
        return batch

    # ------------------------------------------------------------ Fast Lane

    async def generate_now(
        self,
        books: Sequence[str],
        level: int,
        *,
        topics: Sequence[str],
        formats: Sequence[str] = ALL_FORMATS,
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
            # Prompt cache (D79, D80): әр форматтың бірінші сұранысы алдымен жалғыз жіберіліп, жүйелік промпт пен
            # формат ережесінің ортақ префиксін кэшке жазады; сосын әр мәтін (§ пен чанктар) тобының біріншісі
            # <textbook> префиксін жазады, қалғандары оны оқиды (`_run_fast_with_warmup`).
            leaders = [(name, *rows[0]) for name, rows in planned.items() if rows]
            followers = [(name, request, messages) for name, rows in planned.items() for request, messages in rows[1:]]
            items = leaders + followers

            async def run(name: str, request: RequestRecord, messages: list) -> None:
                prompt = generation_prompt_ref(name)
                async with limit:
                    try:
                        result = await self._gateway.complete(
                            Task.GENERATION_FAST, prompt, messages, schema=GEN_MODELS[name],
                            variant=self._variant(Task.GENERATION_FAST, request),
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
                    except Exception as exc:  # noqa: BLE001 — бір сұраныстың қатесі қалғандарын тоқтатпайды (D80)
                        await self._fail_safely(report, request, exc)

            await _run_fast_with_warmup(items, run)
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
            prompt = generation_prompt_ref(name)
            by_variant: dict[str, list[RequestRecord]] = defaultdict(list)
            for request, _ in rows:
                by_variant[self._variant(Task.GENERATION_FAST, request)].append(request)
            batch_of: dict[str, str] = {}
            for variant, requests in by_variant.items():
                route_model = self._gateway.config.route(Task.GENERATION_FAST, variant).model
                provider = self._gateway.config.models[route_model].provider
                batch_id = f"{FAST_PREFIX}{uuid.uuid4().hex}"
                batch = BatchRecord(batch_id=batch_id, provider=provider, model_key=route_model, prompt_id=prompt.id,
                                    prompt_version=prompt.version, request_count=len(requests))
                await self._repo.record_batch(batch, [_with_batch(request, batch_id) for request in requests])
                batch_of.update({request.custom_id: batch_id for request in requests})
            rows[:] = [(_with_batch(request, batch_of[request.custom_id]), messages) for request, messages in rows]

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
        formats = [name for name in formats if name in ALL_FORMATS and FORMAT_LEVEL.get(name) == level]
        if not formats:
            raise ValueError(f"{level}-деңгейде генерацияланатын формат жоқ")
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
        content_chunks_by_topic: dict[str, list[Chunk]] = {}
        concepts_by_topic: dict[str, list[Concept]] = {}
        groups_by_topic: dict[str, dict[str, str]] = {}
        chunk_keys_by_topic: dict[str, dict[str, set[str]]] = {}
        counts_by_topic: dict[str, int] = {}
        for paragraph in paragraphs:
            topic_id = paragraph.topic_id
            chunks = await self._repo.paragraph_chunks(topic_id)
            if not chunks:
                content_chunks_by_topic[topic_id] = []
                continue
            title = f"§{paragraph.paragraph_no}" + (f". {paragraph.paragraph_title}" if paragraph.paragraph_title else "")
            rows = await ensure_concepts(self._gateway, self._repo, topic_id, title, chunks)
            if rows is not None:
                concepts_by_topic[topic_id] = topic_concepts(rows)
                groups_by_topic[topic_id] = concept_groups(rows)
                chunk_keys_by_topic[topic_id] = {row.chunk_id: {c.key for c in row.concepts} for row in rows}
                counts_by_topic[topic_id] = len(set(groups_by_topic[topic_id].values()))
                non_empty = {row.chunk_id for row in rows if row.concepts}
                content_chunks_by_topic[topic_id] = [chunk for chunk in chunks if chunk.chunk_id in non_empty]
            else:
                content_chunks_by_topic[topic_id] = [chunk for chunk in chunks if chunk.text.strip()]

        combos_cache: dict[tuple[str, int], list[tuple[Chunk, ...]]] = {}
        entities_cache: dict[str, dict[str, frozenset[str]]] = {}

        async def entities_for(topic_id: str) -> dict[str, frozenset[str]]:
            if topic_id not in entities_cache:
                ids = [chunk.chunk_id for chunk in content_chunks_by_topic.get(topic_id, [])]
                links = await self._repo.entity_links(ids) if ids else []
                entities_cache[topic_id] = entity_map(links, ids)
            return entities_cache[topic_id]

        async def combos_for(topic_id: str, size: int) -> list[tuple[Chunk, ...]]:
            if (topic_id, size) not in combos_cache:
                content = content_chunks_by_topic.get(topic_id, [])
                combos_cache[(topic_id, size)] = (
                    chunk_combinations(content, size, await entities_for(topic_id)) if content else []
                )
            return combos_cache[(topic_id, size)]

        # Нысана (D80): тест пен сәйкестендіру бір § пен форматта бір ұғым тобынан бір ғана сұрақ алады,
        # санатқа қарамай. Базадағы белсенді сұрақтар мен өңделмеген сұраныстардың ұғымдары бос емес.
        used_groups: dict[tuple[str, str], set[str]] = {}
        concept_cursor: dict[tuple[str, str], int] = {}
        anchor_combo_cursor: dict[tuple[str, str, str], int] = defaultdict(int)

        def next_concept(topic_id: str, name: str, eligible: dict[str, tuple[str, ...]] | None = None) -> Concept | None:
            """Келесі бос ұғым тобының ұғымы. `eligible` берілсе (X3 тест), тек жақын алдағышы жеткілікті ұғым."""
            concepts = concepts_by_topic[topic_id]
            groups = groups_by_topic[topic_id]
            key = (topic_id, name)
            if key not in used_groups:
                # Банктегі сұрақтың кілті ұғымдардың ескі шығаруынан болуы мүмкін (промпт нұсқасы өзгерді):
                # дәл кілт табылмаса, атауы сөз түбірлері бойынша бірдей ұғымның тобы алынады.
                by_stems: dict[frozenset[str], str] = {}
                for concept in concepts:
                    stems = frozenset(word_stems(concept.key))
                    if len(stems) >= 2:
                        by_stems.setdefault(stems, groups.get(concept.key, concept.key))

                def group_of(used_key: str) -> str:
                    if used_key in groups:
                        return groups[used_key]
                    stems = frozenset(word_stems(used_key))
                    return by_stems.get(stems, used_key) if len(stems) >= 2 else used_key

                keys = [concept for (topic, fmt, _), values in used.items() if (topic, fmt) == key for concept in values]
                used_groups[key] = {group_of(concept) for concept in keys}
                concept_cursor[key] = 0
            content_ids = {chunk.chunk_id for chunk in content_chunks_by_topic.get(topic_id, [])}
            for offset in range(len(concepts)):
                index = (concept_cursor[key] + offset) % len(concepts)
                candidate = concepts[index]
                group = groups.get(candidate.key, candidate.key)
                if group in used_groups[key] or candidate.chunk_id not in content_ids:
                    continue
                if eligible is not None and len(eligible.get(candidate.key, ())) < X3_MIN_NEAR:
                    continue
                used_groups[key].add(group)
                concept_cursor[key] = index + 1
                return candidate
            return None

        async def anchored_context(topic_id: str, name: str, anchor: Concept) -> tuple[Chunk, ...]:
            """Нысананың чанкы; комбинация керек форматта — сол чанкы бар комбинация; L3/L4 форматтарында —
            толық § (тым ұзын §-те нысана айналасындағы терезе, D79)."""
            content = content_chunks_by_topic[topic_id]
            anchor_chunk = next(chunk for chunk in content if chunk.chunk_id == anchor.chunk_id)
            if name in FULL_PARAGRAPH_FORMATS:
                return full_paragraph_window(content, anchor_chunk_id=anchor.chunk_id) or (anchor_chunk,)
            counter = (topic_id, name, anchor.chunk_id)
            size = COMBO_SIZE[name]
            if size <= 1:
                return (anchor_chunk,)
            options = [combo for combo in await combos_for(topic_id, size)
                       if any(chunk.chunk_id == anchor.chunk_id for chunk in combo)]
            if not options:
                return (anchor_chunk,)
            combo = options[anchor_combo_cursor[counter] % len(options)]
            anchor_combo_cursor[counter] += 1
            return combo

        async def near_concepts(topic_id: str, anchor: Concept) -> tuple[str, ...]:
            """X3 тесттің жақын алдағыштар көзі (D80): §-тің басқа чанктарындағы нысанамен бір типті ұғымдар,
            нысананың тобынсыз. Чанктар `distant_partners` ретімен (көрші емес, ортақ entity-сі көбі), олардан
            кезекпен бір-бірден.
            Нысананың өз үзіндісінде де кездесетін ұғым кірмейді: ол сол үзіндідегі шын дерек, сұраққа екінші
            дұрыс жауап болуы мүмкін («тұрғындар мал шаруашылығымен ... айналысты» мен «суармалы егіншілікпен
            айналысты» бір үзіндіде). Ол үзіндіден шығарылған ұғымның тобы да, атауы мәтінде табылатын ұғым да."""
            groups = groups_by_topic[topic_id]
            own_group = groups.get(anchor.key, anchor.key)
            anchor_groups = {groups.get(key, key) for key in chunk_keys_by_topic[topic_id].get(anchor.chunk_id, ())}
            anchor_text = next((normalize_text(chunk.text) for chunk in content_chunks_by_topic[topic_id]
                                if chunk.chunk_id == anchor.chunk_id), "")
            by_chunk: dict[str, list[Concept]] = defaultdict(list)
            for concept in concepts_by_topic[topic_id]:
                if (concept.kind == anchor.kind and groups.get(concept.key, concept.key) not in anchor_groups
                        and concept.key not in anchor_text):
                    by_chunk[concept.chunk_id].append(concept)
            partners = distant_partners(content_chunks_by_topic[topic_id], anchor.chunk_id, await entities_for(topic_id))
            queues = [list(by_chunk.get(chunk.chunk_id, [])) for chunk in partners]
            seen = {own_group}
            terms: list[str] = []
            while len(terms) < X3_NEAR_CONCEPTS and any(queues):
                for queue in queues:
                    while queue:
                        concept = queue.pop(0)
                        group = groups.get(concept.key, concept.key)
                        if group not in seen:
                            seen.add(group)
                            terms.append(concept.term)
                            break
                    if len(terms) >= X3_NEAR_CONCEPTS:
                        break
            return tuple(terms)

        near_cache: dict[str, dict[str, tuple[str, ...]]] = {}

        async def near_by_concept(topic_id: str) -> dict[str, tuple[str, ...]]:
            """Әр ұғымның жақын алдағыштары. X3 тестке нысана болмайтын ұғымның тізімі бос: «ұғым» типті
            (қалғанының бәрі, тізімі аралас) және атауы X3_MAX_TARGET_WORDS сөзден ұзын (сипаттама)."""
            if topic_id not in near_cache:
                near_cache[topic_id] = {
                    concept.key: (await near_concepts(topic_id, concept)
                                  if concept.kind != DEFAULT_CONCEPT_TYPE
                                  and len(concept.term.split()) <= X3_MAX_TARGET_WORDS else ())
                    for concept in concepts_by_topic[topic_id]
                }
            return near_cache[topic_id]

        # X3 тесттің нысанасы — жақын алдағышы жеткілікті ұғым ғана (D80). Ондай ұғым тобы X3 нормасынан аз
        # болса, норманың артығы X2-ге беріледі (planner), ал қалған ұғымдар X1/X2-ге кетеді.
        x3_limits: dict[tuple[str, str], int] = {}
        if "mcq" in formats:
            for topic_id in concepts_by_topic:
                groups = groups_by_topic[topic_id]
                x3_limits[(topic_id, "mcq")] = len({
                    groups.get(key, key) for key, terms in (await near_by_concept(topic_id)).items()
                    if len(terms) >= X3_MIN_NEAR
                })

        slots = plan(
            list(by_topic),
            level,
            applicable,
            have,
            self._policy,
            formats,
            concepts_by_topic=counts_by_topic if counts_by_topic else None,
            x3_limits=x3_limits,
        )
        used = await self._repo.used_concepts(subject_id, level)

        # X3 бір § пен форматта алдымен жоспарланады: нысанаға жарайтын ұғымдарды X1/X2 алып қоймасын.
        first_index: dict[tuple[str, str], int] = {}
        for index, slot in enumerate(slots):
            first_index.setdefault((slot.topic_id, slot.format), index)
        slots.sort(key=lambda slot: (first_index[(slot.topic_id, slot.format)], slot.tier != "X3"))

        planned: dict[str, list[tuple[RequestRecord, list]]] = defaultdict(list)
        cursor: dict[tuple[str, str], int] = {}
        count = 0
        for slot in slots:
            if max_requests is not None and count >= max_requests:
                break
            paragraph = by_topic[slot.topic_id]
            topic_concept_list = concepts_by_topic.get(slot.topic_id)
            # Ашық пен гибрид форматтарының рубрикасы ұғымға байланады (D79): ұғымдар шықпаса, олар өткізіледі.
            # Тест пен сәйкестендіру ол кезде чанк бойынша құрылады (D76).
            if topic_concept_list is None and slot.format in CONCEPT_BOUND_FORMATS and slot.format != "mcq":
                logger.warning("skipping %s for %s: concepts unavailable", slot.format, slot.topic_id)
                continue
            anchored = slot.format in ANCHORED_FORMATS and topic_concept_list is not None
            if anchored and not topic_concept_list:
                continue
            combos: list[tuple[Chunk, ...]] = []
            key = (slot.topic_id, slot.format)
            if not anchored:
                combos = await combos_for(slot.topic_id, COMBO_SIZE[slot.format])
                if not combos:
                    continue
                if key not in cursor:
                    cursor[key] = sum(n for (topic, name, _), n in have.items() if (topic, name) == key)
            distractors = (
                tuple(concept.term for concept in topic_concept_list)
                if slot.format == "mcq" and topic_concept_list else ()
            )
            eligible = (await near_by_concept(slot.topic_id)
                        if anchored and slot.format == "mcq" and slot.tier == "X3" else None)
            for _ in range(slot.missing):
                if max_requests is not None and count >= max_requests:
                    break
                concept: Concept | None = None
                near: tuple[str, ...] = ()
                if anchored:
                    concept = next_concept(slot.topic_id, slot.format, eligible)
                    if concept is None:
                        break
                    combo = await anchored_context(slot.topic_id, slot.format, concept)
                    if eligible is not None:
                        near = eligible[concept.key]
                else:
                    # Ұғымға байланбайтын формат (реттілік, қате қадам, формула, слайдер) бір чанк комбинациясынан
                    # бір ғана сұрақ алады (D81): §16–17-де 4 комбинацияға 14 сұраныс жоспарланып, әр мәтін 3–4 рет
                    # қайталанатын. Ұғымы шықпаған §-тің тест пен сәйкестендіруі (D76) бұрынғыша айналымда.
                    if slot.format not in ANCHORED_FORMATS and cursor[key] >= len(combos):
                        logger.info("%s for %s: all %d chunk combinations are used", slot.format, slot.topic_id,
                                    len(combos))
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
                    concept_key=concept.key if concept else None,
                )
                task = GenerationTask(
                    format=slot.format,
                    level=level,
                    tier=slot.tier,
                    book_title=paragraph.book_title,
                    paragraph_no=paragraph.paragraph_no,
                    paragraph_title=paragraph.paragraph_title,
                    concept=concept.term if concept else None,
                    # X3-те §-тің барлық ұғымы емес, нысанаға жақын қысқа тізім беріледі (D80).
                    topic_concepts=() if near else distractors,
                    near_concepts=near,
                    concept_type=concept.kind if near and concept else None,
                )
                planned[slot.format].append((request, generation_messages(task, reference_text(combo))))
                count += 1
        # Prompt cache (ortaq §2.2): бір мәтінді сұраныстар қатар тұрады, префиксі ортақ болсын.
        for rows in planned.values():
            rows.sort(key=lambda row: (row[0].topic_id, row[0].chunk_ids))
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
        # Рубрика мәтінге сүйенуі керек (D79): ашық пен гибрид форматтарда.
        problem = quote_problem(package, reference) or rubric_grounded_problem(package, reference)
        if problem is None:
            # Мазмұнның тікелей қайталануы (D80): шешуші мен embedding шақыруынан бұрын, ақысыз.
            existing = await self._repo.existing_packages(request.topic_id, request.level, request.format)
            problem = repeat_problem(package, existing)
        if problem is None and request.format == "mcq":
            try:
                problem = await mcq_solver_problem(self._gateway, package, reference,
                                                   variant=self._variant(Task.MCQ_SOLVER_CHECK, request))
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

    async def _fail_safely(self, report: ProcessReport, request: RequestRecord, exc: Exception) -> None:
        """Fast Lane-де бір сұраныстың күтпеген қатесі (мысалы, база байланысы үзілді). Қалған сұраныстар
        жалғасады. Күйді жазу да сәтсіз болса, сұраныс pending қалады: оны `process` FAST_STALE-ден кейін жабады."""
        logger.exception("fast lane item %s failed", request.custom_id)
        reason = f"Fast Lane: өңдеу қатесі ({type(exc).__name__})"
        try:
            await self._finish(report, request, "failed", [reason])
        except Exception:  # noqa: BLE001
            logger.exception("fast lane could not record failure for %s", request.custom_id)
            report.failed += 1
            report.reasons[reason] += 1

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


async def _run_fast_with_warmup(
    items: Sequence[tuple[str, RequestRecord, list]],
    run: Callable[[str, RequestRecord, list], Awaitable[None]],
) -> None:
    """Prompt caching префиксін (system + ереже + <textbook>) суық күйде қатар жібермей қыздырады."""

    async def run_context_group(group: Sequence[tuple[str, RequestRecord, list]], *, warm: bool) -> None:
        if not group:
            return
        if not warm:
            await run(*group[0])
            group = group[1:]
        if group:
            await asyncio.gather(*(run(*item) for item in group))

    async def run_format_group(fmt_items: Sequence[tuple[str, RequestRecord, list]]) -> None:
        by_context: dict[tuple[str, tuple[str, ...]], list[tuple[str, RequestRecord, list]]] = {}
        for item in fmt_items:
            _, req, _ = item
            by_context.setdefault((req.topic_id, req.chunk_ids), []).append(item)
        groups = list(by_context.values())
        if not groups:
            return
        first = groups[0]
        await run(*first[0])
        tasks = []
        if len(first) > 1:
            tasks.append(run_context_group(first[1:], warm=True))
        for other in groups[1:]:
            tasks.append(run_context_group(other, warm=False))
        if tasks:
            await asyncio.gather(*tasks)

    by_format: dict[str, list[tuple[str, RequestRecord, list]]] = {}
    for item in items:
        by_format.setdefault(item[0], []).append(item)
    await asyncio.gather(*(run_format_group(fmt_items) for fmt_items in by_format.values()))
