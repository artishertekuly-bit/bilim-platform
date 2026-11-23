"""Tutor-дың өз connection pool-ы: `tutor_svc` рөлі (D15, D68). Examiner пулымен ортақ емес."""

from __future__ import annotations

import os

import asyncpg

DATABASE_URL_ENV = "TUTOR_DATABASE_URL"
MAX_INACTIVE_CONNECTION_S = 60.0


async def create_pool(dsn: str | None = None, *, min_size: int = 1, max_size: int = 5) -> asyncpg.Pool:
    dsn = dsn or os.getenv(DATABASE_URL_ENV, "").strip()
    if not dsn:
        raise RuntimeError(f"{DATABASE_URL_ENV} берілмеген (tutor_svc рөлінің қосылу жолы)")
    return await asyncpg.create_pool(
        dsn, min_size=min_size, max_size=max_size, statement_cache_size=0,
        max_inactive_connection_lifetime=MAX_INACTIVE_CONNECTION_S,
    )


def vector_literal(values: list[float]) -> str:
    return "[" + ",".join(repr(float(v)) for v in values) + "]"
