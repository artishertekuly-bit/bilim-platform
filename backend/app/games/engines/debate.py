"""Дебат аренасы (geimifikatsiya §4.4, D51, D52).

Екі оқушы. Тақырып — ойын банкіндегі `debate_topic`: оқулыққа негізделген, екі жағын да дәлелдеуге болатын
тұжырым. Позициялар («жақтаймын / қарсымын») кездейсоқ. Үш раунд: кіріспе (≤ 600 таңба), қарсы дәлел (≤ 400),
қорытынды (≤ 300), әрқайсысына 5 минут. Екеуі де бір мезгілде жазады; раунд екеуі жібергенде не уақыт біткенде
ашылады. Үшінші раундтан кейін ЖИ-төреші (күшті модель) рубрика бойынша бағалайды — бұл баға ресми емес.

Мәтін модерациядан өтеді (сервис тексереді): ережені бұзған мәтін қарсыласқа көрсетілмейді.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from .base import (
    Ctx,
    GameRuleError,
    Outcome,
    PlayerInfo,
    clone,
    find_player,
    later,
    parse_time,
    player_list,
    strip_secrets,
)

GAME_TYPE = "debate"
MIN_PLAYERS = MAX_PLAYERS = 2
ROUNDS = (
    {"round": 1, "name": "Кіріспе", "limit": 600},
    {"round": 2, "name": "Қарсы дәлел", "limit": 400},
    {"round": 3, "name": "Қорытынды", "limit": 300},
)
ROUND_S = 300
JUDGE_RETRY_S = 15
JUDGE_ATTEMPTS = 3
HIDDEN_TEXT = "(мәтін ереже бұзғандықтан көрсетілмейді)"
MISSING_TEXT = "(уақыт ішінде жауап жазылмады)"


def settings(raw: dict[str, Any]) -> dict[str, Any]:
    return {}


async def start(players: Sequence[PlayerInfo], topics: Sequence[str], labels: Sequence[str],
                options: dict[str, Any], ctx: Ctx, *, topic: dict[str, Any]) -> Outcome:
    order = list(players)
    ctx.rng.shuffle(order)
    sides = ["pro", "con"]
    ctx.rng.shuffle(sides)
    state: dict[str, Any] = {
        "game": GAME_TYPE,
        "topics": list(topics),
        "labels": list(labels),
        "topic": {"qid": topic["qid"], "statement": topic["statement"], "paragraph": topic["paragraph"]},
        "players": player_list(order),
        "sides": {p.user_id: side for p, side in zip(order, sides)},
        "round": 1,
        "phase": "writing",
        "deadline": later(ctx.now, ROUND_S),
        "entries": {"1": {}, "2": {}, "3": {}},
        "revealed": 0,
        "judge_attempts": 0,
        "verdict": None,
    }
    return Outcome(state)


def _limit(round_no: int) -> int:
    return ROUNDS[round_no - 1]["limit"]


def _close_round(state: dict[str, Any], ctx: Ctx) -> Outcome:
    round_no = state["round"]
    entries = state["entries"][str(round_no)]
    for p in state["players"]:
        entries.setdefault(p["id"], {"text": "", "flagged": False, "missing": True})
    state["revealed"] = round_no
    if round_no < len(ROUNDS):
        state["round"] = round_no + 1
        state["deadline"] = later(ctx.now, ROUND_S)
        return Outcome(state)
    state["phase"] = "judging"
    state["deadline"] = later(ctx.now, 0)
    return Outcome(state, judge=True)


async def act(state: dict[str, Any], user_id: str, action: dict[str, Any], ctx: Ctx) -> Outcome:
    """`submit`: мәтінді сервис модерациядан өткізіп, `moderation` өрісін өзі қосады (клиент бере алмайды)."""
    state = clone(state)
    find_player(state, user_id)
    if action.get("type") != "submit":
        raise GameRuleError("INVALID_ACTION", "Белгісіз әрекет.", status=422)
    if state["phase"] != "writing":
        raise GameRuleError("WRONG_PHASE", "Раунд жабылған.")
    round_no = state["round"]
    text = " ".join(str(action.get("text") or "").split())
    if not text:
        raise GameRuleError("EMPTY_TEXT", "Мәтін бос болмауы керек.", status=422)
    if len(text) > _limit(round_no):
        raise GameRuleError("TOO_LONG", f"Бұл раундта ең көбі {_limit(round_no)} таңба.", status=422)
    entries = state["entries"][str(round_no)]
    if user_id in entries:
        raise GameRuleError("ALREADY_SUBMITTED", "Бұл раундқа мәтін жіберілген.")
    moderation = action.get("moderation") or "SAFE"
    flagged = moderation != "SAFE"
    entries[user_id] = {"text": text, "flagged": flagged, "missing": False}
    entry = {"user_id": user_id, "round": round_no, "text": text, "moderation": moderation}
    if all(p["id"] in entries for p in state["players"]):
        outcome = _close_round(state, ctx)
    else:
        outcome = Outcome(state)
    outcome.entries = [entry]
    return outcome


async def timeout(state: dict[str, Any], ctx: Ctx) -> Outcome:
    state = clone(state)
    if state["phase"] == "writing":
        return _close_round(state, ctx)
    if state["phase"] == "judging":
        return Outcome(state, judge=True)
    return Outcome(state)


def judge_failed(state: dict[str, Any], ctx: Ctx) -> Outcome:
    """Төреші жауап бермесе, қайта тырысады; JUDGE_ATTEMPTS-тен кейін ойын нәтижесіз аяқталады."""
    state = clone(state)
    state["judge_attempts"] += 1
    if state["judge_attempts"] >= JUDGE_ATTEMPTS:
        state["phase"] = "finished"
        state["deadline"] = None
        state["verdict"] = {"winner": None, "unavailable": True,
                            "summary": "Төреші қазір қолжетімсіз, сондықтан бұл дебат бағаланбады."}
        return Outcome(state, finished=True)
    state["deadline"] = later(ctx.now, JUDGE_RETRY_S)
    return Outcome(state)


def apply_verdict(state: dict[str, Any], verdict: dict[str, Any]) -> Outcome:
    """`verdict`: winner — "pro" | "con" | None, scores/tips — позиция бойынша."""
    state = clone(state)
    state["phase"] = "finished"
    state["deadline"] = None
    state["verdict"] = verdict
    return Outcome(state, finished=True)


def transcript(state: dict[str, Any]) -> list[dict[str, Any]]:
    """Төрешіге: әр раунд, әр позиция. Ереже бұзған мәтін төрешіге де берілмейді."""
    rows = []
    for spec in ROUNDS:
        for p in state["players"]:
            entry = state["entries"][str(spec["round"])].get(p["id"]) or {"text": "", "missing": True}
            text = MISSING_TEXT if entry.get("missing") else (HIDDEN_TEXT if entry.get("flagged") else entry["text"])
            rows.append({"round": spec["round"], "name": spec["name"], "side": state["sides"][p["id"]], "text": text})
    return rows


async def leave(state: dict[str, Any], user_id: str, ctx: Ctx) -> Outcome:
    state = clone(state)
    find_player(state, user_id)["left"] = True
    if state["phase"] == "finished":
        return Outcome(state)
    other = next(p for p in state["players"] if p["id"] != user_id)
    state["phase"] = "finished"
    state["deadline"] = None
    state["verdict"] = {"winner": state["sides"][other["id"]], "forfeit": True,
                        "summary": "Қарсылас ойыннан шықты."}
    return Outcome(state, finished=True)


def deadline(state: dict[str, Any]):
    return parse_time(state["deadline"]) if state["phase"] != "finished" else None


def results(state: dict[str, Any]) -> list[dict[str, Any]]:
    verdict = state.get("verdict") or {}
    winner = verdict.get("winner")
    rows = []
    for p in state["players"]:
        side = state["sides"][p["id"]]
        rows.append({"user_id": p["id"], "name": p["name"], "side": side,
                     "place": 1 if winner in (None, side) else 2})
    return sorted(rows, key=lambda r: r["place"])


def _visible_entries(state: dict[str, Any]) -> list[dict[str, Any]]:
    seats = {p["id"]: p["seat"] for p in state["players"]}
    rows = []
    for round_no in range(1, state["revealed"] + 1):
        for uid, entry in state["entries"][str(round_no)].items():
            text = MISSING_TEXT if entry.get("missing") else (HIDDEN_TEXT if entry["flagged"] else entry["text"])
            rows.append({"round": round_no, "seat": seats[uid], "side": state["sides"][uid], "text": text})
    return rows


def public_view(state: dict[str, Any]) -> dict[str, Any]:
    current = state["entries"].get(str(state["round"]), {}) if state["phase"] == "writing" else {}
    view = {
        "game": GAME_TYPE,
        "topic": state["topic"],
        "rounds": list(ROUNDS),
        "players": [{"id": p["id"], "seat": p["seat"], "name": p["name"], "left": p["left"],
                     "side": state["sides"][p["id"]], "submitted": p["id"] in current} for p in state["players"]],
        "round": state["round"],
        "phase": state["phase"],
        "deadline": state["deadline"],
        "entries": _visible_entries(state),
        "verdict": state["verdict"],
    }
    if state["phase"] == "finished":
        view["results"] = [{k: v for k, v in r.items() if k != "user_id"} for r in results(state)]
    return strip_secrets(view)


def private_view(state: dict[str, Any], user_id: str) -> dict[str, Any]:
    if user_id not in state["sides"]:
        return {}
    mine = []
    for round_no in ("1", "2", "3"):
        entry = state["entries"][round_no].get(user_id)
        if entry and not entry.get("missing"):
            mine.append({"round": int(round_no), "text": entry["text"], "hidden": entry["flagged"]})
    return {"side": state["sides"][user_id], "my_entries": mine}
