"""429 және уақытша қателерде экспоненциалды backoff, jitter-мен (ortaq §2.3)."""

from __future__ import annotations

import random
from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class RetryPolicy:
    max_attempts: int = 4
    base_delay_s: float = 0.5
    max_delay_s: float = 8.0
    max_retry_after_s: float = 30.0

    def __post_init__(self) -> None:
        if self.max_attempts < 1:
            raise ValueError("max_attempts кемінде 1 болуы керек")
        if self.base_delay_s < 0 or self.max_delay_s < 0:
            raise ValueError("Кідіріс теріс бола алмайды")


def backoff_delay(
    attempt: int,
    policy: RetryPolicy,
    *,
    retry_after: float | None = None,
    rng: Callable[[], float] = random.random,
) -> float:
    """`attempt` — сәтсіз аяқталған әрекеттің нөмірі (1-ден басталады).

    Провайдер `Retry-After` берсе, сол уақыт күтіледі; әйтпесе full jitter.
    """
    if retry_after is not None and retry_after >= 0:
        return min(retry_after, policy.max_retry_after_s)
    cap = min(policy.max_delay_s, policy.base_delay_s * (2 ** (attempt - 1)))
    return rng() * cap
