"""«Эскейп рум» (Games 2-кезең, D99): бес құлыпты кезекпен ашу.

Жеке не бөлмеде жарыс (әр ойыншы өз жолымен). Бес құлып: әрқайсысы — бір сұрақ (пән банкі мен §-терде — тест,
$0; «Кез келген тақырып» кэшінде — escape_step жұмбағы). Құлып ашылса, шығыс кодының бір таңбасы беріледі де келесі
құлып ашылады. Келесі құлыптың сұрағы алдыңғысы ашылмайынша алынбайды да, клиентке де бармайды. Қате жауап —
+10 с айыппұл және жаңа сұрақ (сол қиындықта). Бес таңба жиналған соң шығыс коды енгізіледі: дұрыс болса —
«қашып шықтыңыз». Орын: шыққандар уақыты бойынша (айыппұлымен), қалғандары — ашқан құлып саны бойынша.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any

from .base import (
    BOT_ID,
    AnswerLog,
    Ctx,
    GameRuleError,
    Outcome,
    PlayerInfo,
    active_ids,
    ask,
    check_option,
    clone,
    find_player,
    iso,
    later,
    parse_time,
    player_list,
    public_question,
    standings,
    strip_secrets,
)

GAME_TYPE = "escape_room"
DECK_FORMAT = "escape_step"
MIN_PLAYERS, MAX_PLAYERS = 1, 6
SOLO_PLAYERS = 1
LOCKS = 5
PENALTY_S = 10
DEFAULT_MINUTES, MIN_MINUTES, MAX_MINUTES = 10, 5, 15
STAGE_DIFFICULTY = (1, 1, 2, 2, 3)
LOCK_NAMES = ("Кіреберіс", "Кітапхана", "Зертхана", "Сервер бөлмесі", "Шығыс есік")
CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def settings(raw: dict[str, Any]) -> dict[str, Any]:
    minutes = int(raw.get("minutes") or DEFAULT_MINUTES)
    if not MIN_MINUTES <= minutes <= MAX_MINUTES:
        raise GameRuleError("INVALID_SETTINGS", "Уақыт 5–15 минут.", status=422)
    return {"minutes": minutes}


async def start(players: Sequence[PlayerInfo], topics: Sequence[str], labels: Sequence[str],
                options: dict[str, Any], ctx: Ctx) -> Outcome:
    state: dict[str, Any] = {
        "game": GAME_TYPE,
        "topics": list(topics),
        "labels": list(labels),
        "minutes": options["minutes"],
        "players": player_list(players),
        "phase": "playing",
        "started_at": iso(ctx.now),
        "deadline": later(ctx.now, options["minutes"] * 60),
        "runs": {p.user_id: {"stage": 1, "solved": 0, "penalty": 0, "attempts": 0, "used": [], "challenge": None,
                             "secret": "".join(ctx.rng.choice(CODE_ALPHABET) for _ in range(LOCKS)),
                             "escaped_at": None, "time_s": None, "feedback": None} for p in players},
    }
    log: list[AnswerLog] = []
    for p in players:
        log += await _new_challenge(state, p.user_id, ctx)
    return Outcome(state, log=log)


async def _new_challenge(state: dict[str, Any], user_id: str, ctx: Ctx) -> list[AnswerLog]:
    """Ойыншының ағымдағы құлпына сұрақ. Тек осы құлып ашылғанда келесісі алынады (алдын ала емес)."""
    run = state["runs"][user_id]
    difficulty = STAGE_DIFFICULTY[run["stage"] - 1]
    viewers = [user_id] if user_id != BOT_ID else []
    question = await ctx.questions.take(topic_ids=state["topics"], difficulty=difficulty, viewers=viewers,
                                        exclude=run["used"])
    if question is None and run["used"]:
        # Колода таусылса, ойын тоқтамайды: ағымдағысынан басқа кез келген сұрақ қайта беріледі.
        question = await ctx.questions.take(topic_ids=state["topics"], difficulty=difficulty, viewers=viewers,
                                            exclude=run["used"][-1:])
    if question is None:
        raise GameRuleError("BANK_EXHAUSTED", "Бұл тақырыптарда сұрақ таусылды.", status=409)
    run["used"].append(question.question_id)
    left = max(1.0, (parse_time(state["deadline"]) - ctx.now).total_seconds())
    run["challenge"] = ask(question, to=[user_id], now=ctx.now, seconds=left, rng=ctx.rng)
    return [AnswerLog(question.question_id, user_id, None)] if user_id != BOT_ID else []


def _elapsed(state: dict[str, Any], now: datetime) -> int:
    return int((now - parse_time(state["started_at"])).total_seconds())


def _finish(state: dict[str, Any], log: list[AnswerLog]) -> Outcome:
    state["phase"] = "finished"
    state["deadline"] = None
    for run in state["runs"].values():
        run["challenge"] = None
    return Outcome(state, log=log, finished=True)


def _everyone_out(state: dict[str, Any]) -> bool:
    return all(state["runs"][uid]["escaped_at"] for uid in active_ids(state))


async def act(state: dict[str, Any], user_id: str, action: dict[str, Any], ctx: Ctx) -> Outcome:
    state = clone(state)
    find_player(state, user_id)
    if user_id not in active_ids(state):
        raise GameRuleError("NOT_PLAYING", "Сіз бұл ойыннан шықтыңыз.")
    if state["phase"] != "playing":
        raise GameRuleError("WRONG_PHASE", "Ойын аяқталды.")
    run = state["runs"][user_id]
    if run["escaped_at"]:
        raise GameRuleError("ALREADY_ESCAPED", "Сіз бөлмеден шығып кеттіңіз.")
    kind = action.get("type")
    if kind == "answer":
        if run["solved"] >= LOCKS or run["challenge"] is None:
            raise GameRuleError("CODE_STEP", "Барлық құлып ашық: шығыс кодын енгізіңіз.")
        challenge = run["challenge"]
        option = check_option(challenge, action.get("option"))
        correct = option == challenge["correct"]
        log = [AnswerLog(challenge["qid"], user_id, correct)]
        run["attempts"] += 1
        if correct:
            run["solved"] += 1
            run["feedback"] = {"ok": True, "lock": run["solved"], "char": run["secret"][run["solved"] - 1]}
            if run["solved"] < LOCKS:
                run["stage"] += 1
                log += await _new_challenge(state, user_id, ctx)
            else:
                run["challenge"] = None
        else:
            run["penalty"] += PENALTY_S
            run["feedback"] = {"ok": False, "lock": run["stage"], "penalty": PENALTY_S}
            log += await _new_challenge(state, user_id, ctx)   # қате — жаңа сұрақ: нұсқаларды теріп ашу болмайды
        return Outcome(state, log=log)
    if kind == "code":
        if run["solved"] < LOCKS:
            raise GameRuleError("LOCKED", "Алдымен бес құлыптың бәрін ашыңыз.")
        code = "".join(str(action.get("code") or "").split()).upper()
        if code != run["secret"]:
            run["penalty"] += PENALTY_S
            run["feedback"] = {"ok": False, "code": True, "penalty": PENALTY_S}
            return Outcome(state)
        run["escaped_at"] = iso(ctx.now)
        run["time_s"] = _elapsed(state, ctx.now) + run["penalty"]
        run["feedback"] = {"ok": True, "escaped": True}
        if _everyone_out(state):
            return _finish(state, [])
        return Outcome(state)
    raise GameRuleError("WRONG_PHASE", "Бұл әрекет қазір қолжетімсіз.")


async def timeout(state: dict[str, Any], ctx: Ctx) -> Outcome:
    state = clone(state)
    if state["phase"] == "playing":
        return _finish(state, [])
    return Outcome(state)


async def leave(state: dict[str, Any], user_id: str, ctx: Ctx) -> Outcome:
    state = clone(state)
    find_player(state, user_id)["left"] = True
    if state["phase"] == "finished":
        return Outcome(state)
    if not active_ids(state) or _everyone_out(state):
        return _finish(state, [])
    return Outcome(state)


def deadline(state: dict[str, Any]):
    return parse_time(state["deadline"]) if state["phase"] != "finished" else None


def results(state: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for p in state["players"]:
        run = state["runs"][p["id"]]
        escaped = bool(run["escaped_at"])
        rows.append({"user_id": p["id"], "name": p["name"], "score": run["solved"], "escaped": escaped,
                     "time_s": run["time_s"], "penalty_s": run["penalty"],
                     "_fast": -(run["time_s"] if escaped else run["penalty"])})
    ordered = standings(rows, ("escaped", "score", "_fast"))
    for row in ordered:
        row.pop("_fast")
    return ordered


def public_view(state: dict[str, Any]) -> dict[str, Any]:
    """Ортақ көрініс: тек ілгерілеу (құлып саны, айыппұл). Сұрақтар мен код таңбалары — тек жеке көріністе."""
    view = {
        "game": GAME_TYPE,
        "labels": state["labels"],
        "locks": LOCKS,
        "lock_names": list(LOCK_NAMES),
        "penalty_s": PENALTY_S,
        "phase": state["phase"],
        "started_at": state["started_at"],
        "deadline": state["deadline"],
        "players": [{"id": p["id"], "seat": p["seat"], "name": p["name"], "left": p["left"],
                     "solved": state["runs"][p["id"]]["solved"],
                     "escaped": bool(state["runs"][p["id"]]["escaped_at"]),
                     "penalty": state["runs"][p["id"]]["penalty"],
                     "time_s": state["runs"][p["id"]]["time_s"]} for p in state["players"]],
    }
    if state["phase"] == "finished":
        seats = {p["id"]: p["seat"] for p in state["players"]}
        view["results"] = [{k: v for k, v in r.items() if k != "user_id"} | {"seat": seats[r["user_id"]]}
                           for r in results(state)]
    return strip_secrets(view)


def private_view(state: dict[str, Any], user_id: str) -> dict[str, Any]:
    run = state["runs"].get(user_id)
    if run is None:
        return {}
    playing = state["phase"] == "playing" and not run["escaped_at"]
    return strip_secrets({
        "stage": run["stage"],
        "solved": run["solved"],
        "penalty": run["penalty"],
        "code_slots": [run["secret"][i] if i < run["solved"] else None for i in range(LOCKS)],
        "challenge": public_question(run["challenge"]) if playing and run["challenge"] else None,
        "need_code": playing and run["solved"] >= LOCKS,
        "escaped": bool(run["escaped_at"]),
        "time_s": run["time_s"],
        "feedback": run["feedback"],
    })
