"""Сұрақ банкінің дерекқор қабаты: Postgres, examiner_svc рөлі (ortaq-infraqurylym.md §1).

examiner_svc тек `examiner` схемасын жазады және `corpus` схемасын оқиды. Supavisor
pooler-ы транзакция режимінде дайындалған сұраныстарды (prepared statements) сақтамайды,
сондықтан пул `statement_cache_size=0` баптауымен ашылады.

Домен (`examiner.tier` т.б.) мен `vector` типіндегі параметрлер негізгі типке келтіріледі
(`$1::text`, `$2::smallint`): asyncpg белгісіз типті анықтау үшін каталогқа қосымша сұраныс
жібермейді.
"""

from __future__ import annotations

import json
import os
from collections.abc import Sequence

import asyncpg

from .context import Chunk, clean_chunk_text
from .pipeline import BatchRecord, NewQuestion, Paragraph, RequestRecord

DATABASE_URL_ENV = "EXAMINER_DATABASE_URL"


async def create_pool(dsn: str | None = None, *, min_size: int = 1, max_size: int = 5) -> asyncpg.Pool:
    dsn = dsn or os.getenv(DATABASE_URL_ENV, "").strip()
    if not dsn:
        raise RuntimeError(f"{DATABASE_URL_ENV} берілмеген (examiner_svc рөлінің қосылу жолы)")
    return await asyncpg.create_pool(dsn, min_size=min_size, max_size=max_size, statement_cache_size=0)


def _vector(values: Sequence[float]) -> str:
    return "[" + ",".join(repr(float(value)) for value in values) + "]"


def _parse_vector(text: str) -> list[float]:
    return [float(part) for part in text.strip("[]").split(",") if part]


class PgBankRepository:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    # ------------------------------------------------------------ корпус

    async def paragraphs(self, books: Sequence[str]) -> list[Paragraph]:
        rows = await self._pool.fetch(
            """
            select topic_id, subject_id::text, book, book_title, paragraph_no, paragraph_title
            from corpus.paragraphs
            where book = any($1::text[])
            order by book, sort_no, paragraph_no
            """,
            list(books),
        )
        return [Paragraph(**dict(row)) for row in rows]

    async def paragraph_chunks(self, topic_id: str) -> list[Chunk]:
        rows = await self._pool.fetch(
            """
            select chunk_id, order_in_paragraph, content
            from corpus.chunk_text
            where topic_id = $1
            order by order_in_paragraph
            """,
            topic_id,
        )
        return [Chunk(row["chunk_id"], row["order_in_paragraph"], clean_chunk_text(row["content"])) for row in rows]

    async def chunks(self, chunk_ids: Sequence[str]) -> list[Chunk]:
        rows = await self._pool.fetch(
            "select chunk_id, order_in_paragraph, content from corpus.chunk_text where chunk_id = any($1::text[])",
            list(chunk_ids),
        )
        found = {row["chunk_id"]: row for row in rows}
        missing = [chunk_id for chunk_id in chunk_ids if chunk_id not in found]
        if missing:
            raise LookupError(f"corpus.chunk_text-те жоқ чанктар: {', '.join(missing)}")
        return [Chunk(chunk_id, found[chunk_id]["order_in_paragraph"], clean_chunk_text(found[chunk_id]["content"]))
                for chunk_id in chunk_ids]

    async def entity_links(self, chunk_ids: Sequence[str]) -> list[tuple[str, str]]:
        rows = await self._pool.fetch(
            "select entity, chunk_id from corpus.entity_chunk_links where chunk_id = any($1::text[])",
            list(chunk_ids),
        )
        return [(row["entity"], row["chunk_id"]) for row in rows]

    # ------------------------------------------------------------ банк

    async def format_applicability(self, subject_id: str) -> dict[str, bool]:
        rows = await self._pool.fetch(
            "select format, applicable from examiner.format_applicability where subject_id = $1::uuid", subject_id
        )
        return {row["format"]: row["applicable"] for row in rows}

    async def stock(self, subject_id: str, level: int) -> dict[tuple[str, str, str], int]:
        """Белсенді сұрақтар мен әлі өңделмеген сұраныстар (ai_examiner §5.4)."""
        rows = await self._pool.fetch(
            """
            select topic_id, format, x_tier, sum(n)::int as n from (
              select q.topic_id, q.format::text as format, s.x_tier::text as x_tier, count(*) as n
              from examiner.questions q
              join examiner.question_state s on s.question_id = q.question_id
              where q.subject_id = $1::uuid and q.level = $2::smallint and s.status = 'active'
              group by 1, 2, 3
              union all
              select topic_id, format::text, x_tier::text, count(*)
              from examiner.generation_requests
              where subject_id = $1::uuid and level = $2::smallint and status = 'pending'
              group by 1, 2, 3
            ) x
            group by 1, 2, 3
            """,
            subject_id,
            level,
        )
        return {(row["topic_id"], row["format"], row["x_tier"]): row["n"] for row in rows}

    async def record_batch(self, batch: BatchRecord, requests: Sequence[RequestRecord]) -> None:
        async with self._pool.acquire() as connection, connection.transaction():
            await connection.execute(
                """
                insert into examiner.generation_batches
                  (batch_id, provider, model_key, prompt_id, prompt_version, request_count)
                values ($1, $2, $3, $4, $5, $6)
                """,
                batch.batch_id, batch.provider, batch.model_key, batch.prompt_id, batch.prompt_version,
                batch.request_count,
            )
            await connection.executemany(
                """
                insert into examiner.generation_requests
                  (custom_id, batch_id, subject_id, topic_id, level, format, x_tier, chunk_ids)
                values ($1, $2, $3::uuid, $4, $5::smallint, $6::text, $7::text, $8::text[])
                """,
                [(r.custom_id, r.batch_id, r.subject_id, r.topic_id, r.level, r.format, r.x_tier, list(r.chunk_ids))
                 for r in requests],
            )

    async def open_batches(self) -> list[BatchRecord]:
        rows = await self._pool.fetch(
            """
            select batch_id, provider, model_key, prompt_id, prompt_version, request_count, status
            from examiner.generation_batches
            where status in ('submitted', 'completed')
            order by submitted_at
            """
        )
        return [BatchRecord(**dict(row)) for row in rows]

    async def set_batch_status(self, batch_id: str, status: str) -> None:
        await self._pool.execute(
            """
            update examiner.generation_batches
            set status = $2,
                finished_at = case when $2 <> 'submitted' then coalesce(finished_at, now()) end,
                processed_at = case when $2 = 'processed' then now() end
            where batch_id = $1
            """,
            batch_id,
            status,
        )

    async def pending_requests(self, batch_id: str) -> list[RequestRecord]:
        rows = await self._pool.fetch(
            """
            select custom_id, batch_id, subject_id::text, topic_id, level::int as level, format::text as format,
                   x_tier::text as x_tier, chunk_ids
            from examiner.generation_requests
            where batch_id = $1 and status = 'pending'
            """,
            batch_id,
        )
        return [RequestRecord(**{**dict(row), "chunk_ids": tuple(row["chunk_ids"])}) for row in rows]

    async def existing_embeddings(self, topic_id: str, level: int) -> list[list[float]]:
        rows = await self._pool.fetch(
            """
            select content_embedding::text as embedding
            from examiner.questions
            where topic_id = $1 and level = $2::smallint and content_embedding is not null
            """,
            topic_id,
            level,
        )
        return [_parse_vector(row["embedding"]) for row in rows]

    async def accept(self, question: NewQuestion) -> str:
        """Пакет, оның күйі және сұраныстың нәтижесі бір транзакцияда жазылады."""
        request = question.request
        package = question.package
        async with self._pool.acquire() as connection, connection.transaction():
            question_id = await connection.fetchval(
                """
                insert into examiner.questions
                  (subject_id, topic_id, level, format, question_content, ecd_skill, ecd_evidence,
                   reference_context, generator_model, prompt_version, content_embedding, content_embedding_model)
                values ($1::uuid, $2, $3::smallint, $4::text, $5::jsonb, $6, $7::jsonb, $8::jsonb, $9, $10,
                        ($11::text)::extensions.vector, $12)
                returning question_id::text
                """,
                request.subject_id, request.topic_id, request.level, request.format,
                json.dumps(package.content, ensure_ascii=False), package.ecd_skill,
                json.dumps(package.ecd_evidence, ensure_ascii=False),
                json.dumps(question.reference_context, ensure_ascii=False),
                question.generator_model, question.prompt_version,
                _vector(question.embedding), question.embedding_model,
            )
            await connection.execute(
                "insert into examiner.question_state (question_id, x_tier, change_reason) values ($1::uuid, $2::text, 'generation')",
                question_id, request.x_tier,
            )
            updated = await connection.execute(
                """
                update examiner.generation_requests
                set status = 'accepted', question_id = $2::uuid, processed_at = now()
                where custom_id = $1 and status = 'pending'
                """,
                request.custom_id, question_id,
            )
            if updated != "UPDATE 1":
                raise RuntimeError(f"generation_requests {request.custom_id} pending күйінде емес")
        return question_id

    async def reject(self, custom_id: str, status: str, reasons: Sequence[str]) -> None:
        await self._pool.execute(
            """
            update examiner.generation_requests
            set status = $2, reject_reasons = $3::text[], processed_at = now()
            where custom_id = $1 and status = 'pending'
            """,
            custom_id,
            status,
            list(reasons),
        )
