"""Ойын қозғалтқыштарының ортақ бөлігі (geimifikatsiya §1, §7).

Қозғалтқыш таза Python: ойын күйі — JSON сөздігі, әрекет пен таймер оны жаңа күйге ауыстырады. Сұрақ
`QuestionSource` арқылы беріледі (сервисте — база, тестте — жалған көз). Дұрыс жауап, кемелер мен жеке
карталар күйде тұрады, клиентке тек `public_view` / `private_view` проекциясы барады.
"""

from __future__ import annotations

import copy
import random
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol

# Ойыншыға ешқашан жіберілмейтін өрістер (api §8, D67): CI тесті проекцияда осылардың жоғын тексереді.
SECRET_KEYS = frozenset({"correct", "answer_key", "reference_context", "ships", "cards", "secret"})


class GameRuleError(Exception):
    """Ереже бұзылды: клиентке 409 (кезек емес, фаза басқа) не 422 (әрекет қате)."""

    def __init__(self, code: str, message: str, *, status: int = 409) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


@dataclass(frozen=True)
class Question:
    question_id: str
    topic_id: str
    paragraph: str
    difficulty: int
    stem: str
    options: tuple[dict[str, str], ...]
    correct: str


class QuestionSource(Protocol):
    async def take(
        self, *, topic_ids: Sequence[str], difficulty: int, viewers: Sequence[str], exclude: Sequence[str]
    ) -> Question | None: ...


@dataclass(frozen=True)
class PlayerInfo:
    user_id: str
    seat: int
    name: str
    bot: bool = False


@dataclass
class Ctx:
    now: datetime
    rng: random.Random
    questions: QuestionSource


@dataclass
class AnswerLog:
    question_id: str
    user_id: str
    correct: bool | None


@dataclass
class Outcome:
    state: dict[str, Any]
    log: list[AnswerLog] = field(default_factory=list)
    finished: bool = False
    judge: bool = False                      # дебат: төрешіні шақыру керек (дерекқор транзакциясынан тыс)
    entries: list[dict[str, Any]] = field(default_factory=list)  # дебат мәтіндері (debate_entries)
    record: dict[str, Any] | None = None     # Бәйгенің жеке рекорды


BOT_ID = "bot"
BOT_ACCURACY = 0.7
BOT_DELAY_S = 1.5


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def parse_time(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def later(now: datetime, seconds: float) -> str:
    return iso(now + timedelta(seconds=seconds))


def clone(state: dict[str, Any]) -> dict[str, Any]:
    return copy.deepcopy(state)


def player_list(players: Sequence[PlayerInfo]) -> list[dict[str, Any]]:
    return [{"id": p.user_id, "seat": p.seat, "name": p.name, "bot": p.bot, "left": False} for p in players]


def find_player(state: dict[str, Any], user_id: str) -> dict[str, Any]:
    for player in state["players"]:
        if player["id"] == user_id:
            return player
    raise GameRuleError("NOT_A_PLAYER", "Сіз бұл ойынның ойыншысы емессіз.", status=403)


def active_ids(state: dict[str, Any]) -> list[str]:
    return [p["id"] for p in state["players"] if not p["left"]]


def human_ids(state: dict[str, Any]) -> list[str]:
    return [p["id"] for p in state["players"] if not p["bot"]]


# ------------------------------------------------------------------ сұрақ


def ask(question: Question, *, to: Sequence[str], now: datetime, seconds: float, rng: random.Random) -> dict[str, Any]:
    """Сұрақты күйге қою. Нұсқалардың реті әр сұрағанда араластырылады (id сақталады)."""
    options = [dict(option) for option in question.options]
    rng.shuffle(options)
    return {
        "qid": question.question_id,
        "topic_id": question.topic_id,
        "paragraph": question.paragraph,
        "difficulty": question.difficulty,
        "stem": question.stem,
        "options": options,
        "correct": question.correct,
        "to": list(to),
        "deadline": later(now, seconds),
        "removed": [],
        "answers": {},
    }


def public_question(question: dict[str, Any] | None) -> dict[str, Any] | None:
    """Сұрақтың ашық бөлігі: дұрыс жауапсыз, таңдалған нұсқасыз — тек кім жауап бергені."""
    if not question:
        return None
    removed = set(question.get("removed") or ())
    return {
        "qid": question["qid"],
        "paragraph": question["paragraph"],
        "difficulty": question["difficulty"],
        "stem": question["stem"],
        "options": [o for o in question["options"] if o["id"] not in removed],
        "to": list(question["to"]),
        "deadline": question["deadline"],
        "answered": sorted(question.get("answers") or {}),
    }


def check_option(question: dict[str, Any], option: Any) -> str:
    if not isinstance(option, str) or option not in {o["id"] for o in question["options"]}:
        raise GameRuleError("INVALID_OPTION", "Мұндай нұсқа жоқ.", status=422)
    if option in (question.get("removed") or ()):
        raise GameRuleError("INVALID_OPTION", "Бұл нұсқа алынып тасталған.", status=422)
    return option


async def take_question(
    ctx: Ctx, state: dict[str, Any], *, topic_ids: Sequence[str], difficulty: int, viewers: Sequence[str]
) -> Question:
    """Сұрақ: алдымен берілген §-тен, болмаса масштабтың кез келген §-інен. Бір ойын ішінде қайталанбайды (D45)."""
    used = state.setdefault("used", [])
    viewers = [v for v in viewers if v != BOT_ID]
    question = await ctx.questions.take(topic_ids=topic_ids, difficulty=difficulty, viewers=viewers, exclude=used)
    if question is None and list(topic_ids) != list(state["topics"]):
        question = await ctx.questions.take(
            topic_ids=state["topics"], difficulty=difficulty, viewers=viewers, exclude=used
        )
    if question is None and used:
        # Банк тым аз болса, ойын тоқтап қалмауы үшін осы ойындағы сұрақ қайта беріледі (бұрын көрілгені алдымен).
        state["repeats"] = True
        question = await ctx.questions.take(topic_ids=state["topics"], difficulty=difficulty, viewers=viewers,
                                            exclude=[])
    if question is None:
        raise GameRuleError("BANK_EXHAUSTED", "Бұл тақырыптарда сұрақ таусылды.", status=409)
    used.append(question.question_id)
    return question


def seen_log(question: dict[str, Any], viewers: Sequence[str]) -> list[AnswerLog]:
    return [AnswerLog(question["qid"], uid, None) for uid in viewers if uid != BOT_ID]


def bot_answer(question: dict[str, Any], rng: random.Random) -> str:
    """Демо-ЖИ сұраққа шамамен 70% дұрыс жауап береді (D48: LLM жоқ)."""
    if rng.random() < BOT_ACCURACY:
        return question["correct"]
    wrong = [o["id"] for o in question["options"] if o["id"] != question["correct"]]
    return rng.choice(wrong) if wrong else question["correct"]


def remember_request(state: dict[str, Any], user_id: str, request_id: str | None) -> bool:
    """Идемпотенттік (api §2.3): сол client_request_id қайта келсе — True, күй өзгермейді."""
    if not request_id:
        return False
    seen = state.setdefault("requests", {}).setdefault(user_id, [])
    if request_id in seen:
        return True
    seen.append(request_id)
    del seen[:-20]
    return False


def strip_secrets(value: Any) -> Any:
    """Соңғы қорғаныс қабаты: проекцияда жасырын кілт қалып кетсе, ол алынады."""
    if isinstance(value, dict):
        return {k: strip_secrets(v) for k, v in value.items() if k not in SECRET_KEYS}
    if isinstance(value, list):
        return [strip_secrets(v) for v in value]
    return value


def standings(rows: list[dict[str, Any]], keys: Sequence[str]) -> list[dict[str, Any]]:
    """Орындар: `keys` бойынша кему ретімен; толық тең болса, орын ортақ (1, 1, 3)."""
    ordered = sorted(rows, key=lambda r: tuple(-r[k] for k in keys))
    place = 0
    previous: tuple | None = None
    for index, row in enumerate(ordered, start=1):
        current = tuple(row[k] for k in keys)
        if current != previous:
            place = index
            previous = current
        row["place"] = place
    return ordered
