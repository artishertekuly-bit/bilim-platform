"""Tutor-дың өз connection pool-ы: `tutor_svc` рөлі (D15, D68). Examiner пулымен ортақ емес."""

from __future__ import annotations

import os
from urllib.parse import urlsplit

import asyncpg

DATABASE_URL_ENV = "TUTOR_DATABASE_URL"
STATEMENT_CACHE_ENV = "TUTOR_DB_STATEMENT_CACHE"
MAX_INACTIVE_CONNECTION_S = 60.0
TRANSACTION_POOLER_PORT = 6543
DEFAULT_STATEMENT_CACHE = 100


def statement_cache_size(dsn: str) -> int:
    """Session pooler (5432) мен тікелей қосылу prepared statement-ті көтереді: кэш әр сұрауды бір барып-қайтуға
    түсіреді (prepare + execute → execute, D88). Transaction pooler (6543) — кэшсіз. Env мәні бәрінен басым."""
    raw = os.getenv(STATEMENT_CACHE_ENV, "").strip()
    if raw:
        try:
            return max(0, int(raw))
        except ValueError:
            pass
    try:
        port = urlsplit(dsn).port
    except ValueError:
        port = None
    return 0 if port == TRANSACTION_POOLER_PORT else DEFAULT_STATEMENT_CACHE


async def create_pool(dsn: str | None = None, *, min_size: int = 1, max_size: int = 5) -> asyncpg.Pool:
    dsn = dsn or os.getenv(DATABASE_URL_ENV, "").strip()
    if not dsn:
        raise RuntimeError(f"{DATABASE_URL_ENV} берілмеген (tutor_svc рөлінің қосылу жолы)")
    return await asyncpg.create_pool(
        dsn, min_size=min_size, max_size=max_size, statement_cache_size=statement_cache_size(dsn),
        max_inactive_connection_lifetime=MAX_INACTIVE_CONNECTION_S,
    )


def vector_literal(values: list[float]) -> str:
    """halfvec мәтіні. halfvec 16 битте ~3.3 мәнді цифр сақтайды, сондықтан 4 мәнді цифрдан артығы базада
    бәрібір жоғалады: `repr` орнына `.4g` векторды ~2.5 есе ықшамдайды (баяу желіде маңызды)."""
    return "[" + ",".join(format(float(v), ".4g") for v in values) + "]"
