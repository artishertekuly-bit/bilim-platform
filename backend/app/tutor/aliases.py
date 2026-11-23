"""0-қадамның лексикалық бөлігі (D87): оқушы мәтінінде аты аталған түйіндер. LLM мен эмбеддинг жоқ.

Неге керек: сипаттамасы ұзын entity-нің («Қазақ хандығы», 3 696 таңба) векторы «шайылады», сондықтан оқушы оны
дәл атымен сұраса да, вектор бойынша үздік 40-қа кірмейді. Аты аталған түйін үміткерлердің басына қойылады.

Ережелер:
* Атау мен мәтін бірдей токенделеді: кіші әріп, тек әріп пен сан («Ш.Уәлиханов» → «ш», «уәлиханов»).
* 5 таңбадан қысқа атау тек дәл сәйкес келеді («ат» «атау»-ға сәйкес келмейді).
* 5+ таңбалы атаудың соңғы сөзіне ≤ 6 таңбалы жалғау жалғана алады, соңғы қ/к/п ұяңдай алады
  («хандық» → «хандығы», «Абылай хан» → «Абылай ханның»). Алдыңғы сөздер дәл сәйкес келуі керек.
* Көп сөзді, содан кейін ұзынырақ атау басым. Ұзын сәйкестіктің ішіндегі қысқасы алынбайды:
  «Қазақ хандығын» мәтінінде «Қазақ хандығы» бар, «Қазақ» жоқ.
* Атаулар тізімі процесс жадында сақталады (TTL), іске қосылғанда фонда жүктеледі, ескіргенде фонда жаңарады (D88).
  Жаңарту сәтсіз болса, ескі тізім қолданыла береді.
"""

from __future__ import annotations

import asyncio
import logging
import math
import re
import time
from collections import defaultdict
from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass

logger = logging.getLogger("bilim.tutor")

PREFIX_MIN_CHARS = 5
MAX_SUFFIX_CHARS = 6
MAX_LEXICAL = 3
ALIAS_CACHE_TTL_S = 900.0
ALIAS_RETRY_S = 30.0
ALIAS_FIRST_WAIT_S = 3.0

_TOKEN_RE = re.compile(r"[^\W_]+")
_VOICING = {"қ": "ғ", "к": "г", "п": "б"}


def tokens(text: str) -> list[str]:
    return _TOKEN_RE.findall((text or "").lower())


def _stems(word: str) -> tuple[str, ...]:
    """Жалғау жалғанатын түбір: сөздің өзі және соңғы дауыссызы ұяңдаған түрі («хандық» → «хандығ»)."""
    voiced = _VOICING.get(word[-1:])
    return (word, word[:-1] + voiced) if voiced else (word,)


def _inflected(text_word: str, alias_word: str) -> bool:
    return any(
        text_word.startswith(stem) and 0 < len(text_word) - len(stem) <= MAX_SUFFIX_CHARS
        for stem in _stems(alias_word)
    )


@dataclass(frozen=True)
class _Entry:
    node_id: int
    words: tuple[str, ...]
    chars: int
    prefix: bool  # соңғы сөзге жалғау рұқсат па (атау ≥ PREFIX_MIN_CHARS)


@dataclass(frozen=True)
class AliasMatch:
    node_id: int
    alias: str
    start: int  # мәтін токенінің индексі
    end: int    # қоса алынбайды


class AliasIndex:
    """Атау → түйін. Іздеу тек мәтіндегі сөздер бойынша жүреді, бүкіл тізімді аралап шықпайды."""

    def __init__(self, rows: Iterable[tuple[str, int]]) -> None:
        self._by_first: dict[str, list[_Entry]] = defaultdict(list)  # бірінші сөз дәл
        self._by_stem: dict[str, list[_Entry]] = defaultdict(list)   # бір сөзді жалғаулы атаулар
        seen: set[tuple[tuple[str, ...], int]] = set()
        for alias, node_id in rows:
            words = tuple(tokens(alias))
            if not words or (words, int(node_id)) in seen:
                continue
            seen.add((words, int(node_id)))
            chars = sum(len(w) for w in words)
            entry = _Entry(int(node_id), words, chars, chars >= PREFIX_MIN_CHARS)
            self._by_first[words[0]].append(entry)
            if len(words) == 1 and entry.prefix:
                for stem in _stems(words[0]):
                    self._by_stem[stem].append(entry)
        self.size = len(seen)

    def match(self, text: str, limit: int = MAX_LEXICAL) -> list[AliasMatch]:
        words = tokens(text)
        found: dict[tuple[_Entry, int], int] = {}
        for i, word in enumerate(words):
            for entry in self._by_first.get(word, ()):
                n = len(entry.words)
                if i + n > len(words):
                    continue
                if n > 1 and tuple(words[i + 1:i + n - 1]) != entry.words[1:-1]:
                    continue
                last = words[i + n - 1]
                if n == 1 or last == entry.words[-1] or (entry.prefix and _inflected(last, entry.words[-1])):
                    found[(entry, i)] = i + n
            low = max(len(word) - MAX_SUFFIX_CHARS, PREFIX_MIN_CHARS)
            for size in range(len(word) - 1, low - 1, -1):
                for entry in self._by_stem.get(word[:size], ()):
                    found.setdefault((entry, i), i + 1)

        ranked = sorted(found.items(), key=lambda item: (-len(item[0][0].words), -item[0][0].chars, item[0][1]))
        chosen: list[tuple[_Entry, int, int]] = []
        for (entry, start), end in ranked:
            if any(entry.node_id == c.node_id for c, _, _ in chosen):
                continue
            # Ұзын сәйкестіктің ішіндегі басқа атау алынбайды; атауы бірдей омонимдер қалады.
            if any(s <= start and end <= e and entry.words != c.words for c, s, e in chosen):
                continue
            chosen.append((entry, start, end))
            if len(chosen) >= limit:
                break
        return [AliasMatch(e.node_id, " ".join(e.words), s, end) for e, s, end in chosen]


SHORT_REPLY_WORDS = 3


def is_short_reply(text: str, max_words: int = SHORT_REPLY_WORDS) -> bool:
    """«Иә», «Білмеймін, түсіндірші»: өз алдына мағынасы жоқ, алдыңғы тақырыпқа байланған қысқа жауап."""
    return len(tokens(text)) <= max_words


def mentions(text: str, name: str) -> bool:
    """Мәтінде атау (жалғауымен) аталды ма: сол ережелермен («Ресей» → «Ресейдің»)."""
    return bool(AliasIndex([(name, 0)]).match(text, limit=1))


class AliasCache:
    """Процесс жадындағы атаулар индексі (D88).

    * `warm()` — қосымша іске қосылғанда фонда жүктейді: бірінші хабарлама 12 мың атауды күтпейді.
    * TTL біткенде ескі индекс бірден қайтады, жаңасы фонда жүктеледі (stale-while-revalidate).
    * Индекс әлі жоқ болса, `get()` жүктеуді ең көбі `first_wait_s` күтеді, содан кейін атаусыз жалғасады.
    * Жүктеу сәтсіз болса, `retry_s`-тан кейін қайталанады; ескі индекс сақталады.
    """

    def __init__(
        self,
        loader: Callable[[], Awaitable[Iterable[tuple[str, int]]]],
        *,
        ttl_s: float = ALIAS_CACHE_TTL_S,
        retry_s: float = ALIAS_RETRY_S,
        first_wait_s: float = ALIAS_FIRST_WAIT_S,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._loader = loader
        self._ttl = ttl_s
        self._retry = retry_s
        self._first_wait = first_wait_s
        self._clock = clock
        self._index: AliasIndex | None = None
        self._next_refresh = -math.inf
        self._task: asyncio.Task[None] | None = None

    @property
    def ready(self) -> bool:
        return self._index is not None

    def _refresh(self) -> asyncio.Task[None] | None:
        if self._task is not None and not self._task.done():
            return self._task
        if self._clock() < self._next_refresh:
            return None
        self._task = asyncio.create_task(self._load())
        return self._task

    async def _load(self) -> None:
        try:
            self._index = AliasIndex(await self._loader())
            self._next_refresh = self._clock() + self._ttl
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 — атаулар міндетті емес: тьютор вектормен жалғасады
            logger.warning("tutor alias index was not refreshed: %s", type(exc).__name__)
            self._next_refresh = self._clock() + self._retry

    async def get(self) -> AliasIndex | None:
        task = self._refresh()
        if self._index is not None or task is None:
            return self._index  # ескісі бірден, жаңасы (керек болса) фонда
        try:
            await asyncio.wait_for(asyncio.shield(task), self._first_wait)
        except asyncio.TimeoutError:
            logger.warning("tutor alias index is still loading; continuing without it")
        return self._index

    async def warm(self) -> None:
        task = self._refresh()
        if task is not None:
            await asyncio.shield(task)

    async def join(self) -> None:
        """Фондағы жаңартудың бітуін күту (тесттерге)."""
        if self._task is not None:
            await asyncio.shield(self._task)

    async def close(self) -> None:
        if self._task is not None and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
