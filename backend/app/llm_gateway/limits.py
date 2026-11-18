"""Лимит пен кезек: модель бойынша token bucket және басымдығы бар қатар шақыру шегі (ortaq §2.3)."""

from __future__ import annotations

import asyncio
import heapq
import itertools
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

Clock = Callable[[], float]
Sleep = Callable[[float], Awaitable[None]]


class TokenBucket:
    """Минутына `per_minute` бірлік (сұраныс немесе токен) беретін шелек.

    Сыйымдылығы — бір минуттық лимит. Бір сұраныс сыйымдылықтан көп сұраса,
    шелек толғанда өткізіледі, әйтпесе ол ешқашан өтпес еді.
    """

    def __init__(self, per_minute: float, *, clock: Clock = time.monotonic) -> None:
        if per_minute <= 0:
            raise ValueError("per_minute оң сан болуы керек")
        self.capacity = float(per_minute)
        self._rate = self.capacity / 60.0
        self._tokens = self.capacity
        self._clock = clock
        self._updated = clock()
        self._lock = asyncio.Lock()

    @property
    def available(self) -> float:
        self._refill()
        return self._tokens

    def _refill(self) -> None:
        now = self._clock()
        elapsed = max(0.0, now - self._updated)
        self._updated = now
        self._tokens = min(self.capacity, self._tokens + elapsed * self._rate)

    async def acquire(self, amount: float, *, sleep: Sleep = asyncio.sleep) -> float:
        """Бірлік жеткенше күтеді; күткен уақытты (сек) қайтарады."""
        amount = min(max(float(amount), 0.0), self.capacity)
        waited = 0.0
        async with self._lock:
            while True:
                self._refill()
                if self._tokens >= amount:
                    self._tokens -= amount
                    return waited
                delay = (amount - self._tokens) / self._rate
                waited += delay
                await sleep(delay)

    def adjust(self, delta: float) -> None:
        """Болжам мен нақты шығынның айырмасы: delta > 0 — қосымша жұмсау, delta < 0 — қайтару."""
        self._refill()
        self._tokens = min(self.capacity, self._tokens - delta)


class PriorityGate:
    """Бір модельге қатар жүретін шақыру санын шектейді. Бос орын басымдығы жоғары күтушіге беріледі."""

    def __init__(self, max_concurrency: int) -> None:
        if max_concurrency < 1:
            raise ValueError("max_concurrency кемінде 1 болуы керек")
        self._max = max_concurrency
        self._active = 0
        self._waiters: list[tuple[int, int, asyncio.Future[None]]] = []
        self._seq = itertools.count()

    @property
    def active(self) -> int:
        return self._active

    @property
    def waiting(self) -> int:
        return sum(1 for _, _, fut in self._waiters if not fut.done())

    async def acquire(self, priority: int) -> None:
        if self._active < self._max and self.waiting == 0:
            self._active += 1
            return
        fut: asyncio.Future[None] = asyncio.get_running_loop().create_future()
        heapq.heappush(self._waiters, (int(priority), next(self._seq), fut))
        try:
            await fut
        except asyncio.CancelledError:
            if fut.done() and not fut.cancelled():
                # Орын берілген сәтте шақырушы бас тартты — орынды келесіге береміз.
                self.release()
            raise

    def release(self) -> None:
        while self._waiters:
            _, _, fut = heapq.heappop(self._waiters)
            if not fut.done():
                fut.set_result(None)  # орын күтушіге тікелей беріледі, _active өзгермейді
                return
        self._active -= 1

    @asynccontextmanager
    async def slot(self, priority: int) -> AsyncIterator[None]:
        await self.acquire(priority)
        try:
            yield
        finally:
            self.release()
