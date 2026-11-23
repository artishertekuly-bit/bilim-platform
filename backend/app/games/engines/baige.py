"""Бәйге (geimifikatsiya §4.5, D55): тәуекел жанрындағы өз ойынымыз.

2–6 ойыншы (жеке жаттығуда — біреу). Ойын 3–7 кезең (әдепкі 5), әр кезеңде құны 1-ден 5-ке дейін өсетін 5 сұрақ:
1–2 — жеңіл, 3–4 — орташа, 5 — қиын. Бәрі бір сұраққа бір мезгілде жауап береді (20 с). Келесі сұрақтың алдында
шауып келе жатқан ойыншы оның тақырыбы мен құнын көріп, тоқтайды (сақталмаған ұпай жалпы есепке қосылады) не
жалғастырады. Қате не уақыт бітсе — «аттан құлайды»: кезеңнің сақталмаған ұпайы күйеді. Бесінші сұрақтан кейін
шауып жүргендердің ұпайы өзі сақталады. Жеңімпаз — ұпайы көбі; тең болса, дұрыс жауабы көбі.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from .base import (
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
    later,
    parse_time,
    player_list,
    public_question,
    seen_log,
    standings,
    strip_secrets,
    take_question,
)

GAME_TYPE = "baige"
MIN_PLAYERS, MAX_PLAYERS = 2, 6
SOLO_PLAYERS = 1
DEFAULT_STAGES, MIN_STAGES, MAX_STAGES = 5, 3, 7
QUESTIONS_PER_STAGE = 5
ANSWER_S = 20
DECIDE_S = 10


def settings(raw: dict[str, Any]) -> dict[str, Any]:
    stages = int(raw.get("stages") or DEFAULT_STAGES)
    if not MIN_STAGES <= stages <= MAX_STAGES:
        raise GameRuleError("INVALID_SETTINGS", "Кезең саны 3–7.", status=422)
    return {"stages": stages}


def difficulty_for(value: int) -> int:
    return 1 if value <= 2 else (2 if value <= 4 else 3)


async def start(players: Sequence[PlayerInfo], topics: Sequence[str], labels: Sequence[str],
                options: dict[str, Any], ctx: Ctx) -> Outcome:
    state: dict[str, Any] = {
        "game": GAME_TYPE,
        "topics": list(topics),
        "labels": list(labels),
        "stages": options["stages"],
        "players": player_list(players),
        "stats": {p.user_id: {"banked": 0, "unbanked": 0, "riding": True, "correct": 0, "status": "riding"}
                  for p in players},
        "stage": 1,
        "value": 1,
        "phase": "question",
        "question": None,
        "decisions": {},
        "deadline": None,
        "last": None,
    }
    return await _prepare_question(state, ctx, open_now=True)


def _riders(state: dict[str, Any]) -> list[str]:
    alive = set(active_ids(state))
    return [uid for uid, s in state["stats"].items() if s["riding"] and uid in alive]


async def _prepare_question(state: dict[str, Any], ctx: Ctx, *, open_now: bool,
                            log: list[AnswerLog] | None = None) -> Outcome:
    """Келесі сұрақ алдын ала алынады: шешім кезінде оның тақырыбы (§) мен құны көрінеді, мәтіні — жоқ."""
    log = list(log or [])
    riders = _riders(state)
    question = await take_question(ctx, state, topic_ids=state["topics"], difficulty=difficulty_for(state["value"]),
                                   viewers=riders)
    state["question"] = ask(question, to=riders, now=ctx.now, seconds=ANSWER_S, rng=ctx.rng)
    state["decisions"] = {}
    if open_now:
        return _open_question(state, ctx, log)
    state["phase"] = "decide"
    state["deadline"] = later(ctx.now, DECIDE_S)
    return Outcome(state, log=log)


def _open_question(state: dict[str, Any], ctx: Ctx, log: list[AnswerLog]) -> Outcome:
    riders = _riders(state)
    question = state["question"]
    question["to"] = riders
    question["deadline"] = later(ctx.now, ANSWER_S)
    state["phase"] = "question"
    state["deadline"] = question["deadline"]
    return Outcome(state, log=log + seen_log(question, riders))


def _finish(state: dict[str, Any], log: list[AnswerLog]) -> Outcome:
    state["phase"] = "finished"
    state["deadline"] = None
    state["question"] = None
    outcome = Outcome(state, log=log, finished=True)
    if len(state["players"]) == SOLO_PLAYERS:
        uid = state["players"][0]["id"]
        outcome.record = {"user_id": uid, "score": state["stats"][uid]["banked"],
                          "correct": state["stats"][uid]["correct"]}
    return outcome


async def _next_step(state: dict[str, Any], ctx: Ctx, log: list[AnswerLog]) -> Outcome:
    riders = _riders(state)
    if state["value"] >= QUESTIONS_PER_STAGE or not riders:
        for uid in riders:
            stats = state["stats"][uid]
            stats["banked"] += stats["unbanked"]
            stats["unbanked"] = 0
            stats["status"] = "finished_stage"
        if state["stage"] >= state["stages"] or not active_ids(state):
            return _finish(state, log)
        state["stage"] += 1
        state["value"] = 1
        for uid in active_ids(state):
            state["stats"][uid].update(riding=True, unbanked=0, status="riding")
        return await _prepare_question(state, ctx, open_now=True, log=log)
    state["value"] += 1
    return await _prepare_question(state, ctx, open_now=False, log=log)


def _resolve(state: dict[str, Any], ctx: Ctx) -> tuple[list[AnswerLog], dict[str, Any]]:
    question = state["question"]
    log: list[AnswerLog] = []
    outcome_by_seat: dict[int, dict[str, Any]] = {}
    seats = {p["id"]: p["seat"] for p in state["players"]}
    for uid in question["to"]:
        option = question["answers"].get(uid)
        stats = state["stats"][uid]
        correct = option == question["correct"]
        log.append(AnswerLog(question["qid"], uid, correct if option is not None else None))
        if correct:
            stats["unbanked"] += state["value"]
            stats["correct"] += 1
        else:
            stats["unbanked"] = 0
            stats["riding"] = False
            stats["status"] = "fell"
        outcome_by_seat[seats[uid]] = {"ok": correct, "chosen": option}
    last = {"stage": state["stage"], "value": state["value"], "qid": question["qid"],
            "right_option": question["correct"], "players": outcome_by_seat}
    return log, last


def _stop(state: dict[str, Any], uid: str) -> None:
    stats = state["stats"][uid]
    stats["banked"] += stats["unbanked"]
    stats["unbanked"] = 0
    stats["riding"] = False
    stats["status"] = "stopped"


async def act(state: dict[str, Any], user_id: str, action: dict[str, Any], ctx: Ctx) -> Outcome:
    state = clone(state)
    find_player(state, user_id)
    kind = action.get("type")
    if user_id not in _riders(state):
        raise GameRuleError("NOT_RIDING", "Бұл кезеңде сіз шаппайсыз.")
    if kind == "decide" and state["phase"] == "decide":
        choice = action.get("choice")
        if choice not in ("stop", "continue"):
            raise GameRuleError("INVALID_ACTION", "Шешім: stop не continue.", status=422)
        if user_id in state["decisions"]:
            raise GameRuleError("ALREADY_DECIDED", "Шешім қабылданған.")
        state["decisions"][user_id] = choice
        if all(uid in state["decisions"] for uid in _riders(state)):
            return await _close_decisions(state, ctx)
        return Outcome(state)
    if kind == "answer" and state["phase"] == "question":
        question = state["question"]
        if user_id not in question["to"]:
            raise GameRuleError("NOT_RIDING", "Бұл сұрақ сізге берілмеген.")
        if user_id in question["answers"]:
            raise GameRuleError("ALREADY_ANSWERED", "Жауап берілген.")
        question["answers"][user_id] = check_option(question, action.get("option"))
        if all(uid in question["answers"] for uid in question["to"] if uid in active_ids(state)):
            return await _close_question(state, ctx)
        return Outcome(state)
    raise GameRuleError("WRONG_PHASE", "Бұл әрекет қазір қолжетімсіз.")


async def _close_decisions(state: dict[str, Any], ctx: Ctx) -> Outcome:
    for uid in _riders(state):
        if state["decisions"].get(uid, "stop") == "stop":   # шешім қабылдамаған ойыншы тоқтайды (жинағы сақталады)
            _stop(state, uid)
    if not _riders(state):
        state["last"] = {"stage": state["stage"], "value": state["value"], "all_stopped": True}
        state["value"] = QUESTIONS_PER_STAGE
        return await _next_step(state, ctx, [])
    return _open_question(state, ctx, [])


async def _close_question(state: dict[str, Any], ctx: Ctx) -> Outcome:
    log, last = _resolve(state, ctx)
    state["last"] = last
    return await _next_step(state, ctx, log)


async def timeout(state: dict[str, Any], ctx: Ctx) -> Outcome:
    state = clone(state)
    if state["phase"] == "decide":
        return await _close_decisions(state, ctx)
    if state["phase"] == "question":
        return await _close_question(state, ctx)
    return Outcome(state)


async def leave(state: dict[str, Any], user_id: str, ctx: Ctx) -> Outcome:
    state = clone(state)
    find_player(state, user_id)["left"] = True
    if state["phase"] == "finished":
        return Outcome(state)
    if not active_ids(state):
        return _finish(state, [])
    if state["phase"] == "question" and all(
        uid in state["question"]["answers"] for uid in state["question"]["to"] if uid in active_ids(state)
    ):
        return await _close_question(state, ctx)
    if state["phase"] == "decide" and all(uid in state["decisions"] for uid in _riders(state)):
        return await _close_decisions(state, ctx)
    return Outcome(state)


def deadline(state: dict[str, Any]):
    return parse_time(state["deadline"]) if state["phase"] != "finished" else None


def results(state: dict[str, Any]) -> list[dict[str, Any]]:
    rows = [{"user_id": p["id"], "name": p["name"], "score": state["stats"][p["id"]]["banked"],
             "right_answers": state["stats"][p["id"]]["correct"]} for p in state["players"]]
    return standings(rows, ("score", "right_answers"))


def public_view(state: dict[str, Any]) -> dict[str, Any]:
    question = state["question"]
    view = {
        "game": GAME_TYPE,
        "labels": state["labels"],
        "stages": state["stages"],
        "stage": state["stage"],
        "value": state["value"],
        "phase": state["phase"],
        "deadline": state["deadline"],
        "players": [{"id": p["id"], "seat": p["seat"], "name": p["name"], "left": p["left"],
                     "banked": state["stats"][p["id"]]["banked"], "unbanked": state["stats"][p["id"]]["unbanked"],
                     "status": state["stats"][p["id"]]["status"],
                     "decided": p["id"] in state["decisions"]} for p in state["players"]],
        # Шешім кезінде — тек келесі сұрақтың тақырыбы мен құны (D55), мәтіні — сұрақ ашылғанда.
        "next": {"paragraph": question["paragraph"], "value": state["value"]} if question else None,
        "question": public_question(question) if state["phase"] == "question" else None,
        "last": state["last"],
    }
    if state["phase"] == "finished":
        seats = {p["id"]: p["seat"] for p in state["players"]}
        view["results"] = [{k: v for k, v in r.items() if k != "user_id"} | {"seat": seats[r["user_id"]]}
                           for r in results(state)]
    return strip_secrets(view)


def private_view(state: dict[str, Any], user_id: str) -> dict[str, Any]:
    stats = state["stats"].get(user_id)
    if stats is None:
        return {}
    question = state["question"]
    answered = question["answers"].get(user_id) if question and state["phase"] == "question" else None
    return {"riding": stats["riding"], "my_answer": answered, "my_decision": state["decisions"].get(user_id)}
