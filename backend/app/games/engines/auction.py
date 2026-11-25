"""Білім аукционы (Games 2-кезең, D99): ставка мен тәуекел.

1+ ойыншы (жеке жаттығу да). Әр ойыншыда 1000 ұпай. Раунд екі фазалы:
  ставка (15 с) — тек келесі сұрақтың тақырыбы (§ не дәуір) мен қиындығы көрінеді, мәтіні жоқ; әр ойыншы жасырын
                  ставка қояды (50…балансы). Балансы 50-ден аз ойыншыға раунд басында 100 ұпай көмек беріледі.
  жауап  (20 с) — сұрақ ашылады: дұрыс — +ставка, қате не уақыт бітсе — −ставка (0-ден төмен түспейді).
Ставка тек ставка фазасында қабылданады: сұрақ ашылған соң сервер оны өзгертпейді. Ставка қоймаған ойыншыға
ең аз ставка (50) қойылады. Жеңімпаз — балансы көбі; тең болса, дұрыс жауабы көбі.
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

GAME_TYPE = "auction"
MIN_PLAYERS, MAX_PLAYERS = 1, 6
SOLO_PLAYERS = 1
START_BALANCE = 1000
MIN_BET = 50
GRANT = 100
DEFAULT_ROUNDS, MIN_ROUNDS, MAX_ROUNDS = 8, 5, 12
BET_S = 15
ANSWER_S = 20
TIERS = {1: "Жеңіл", 2: "Орташа", 3: "Қиын"}


def settings(raw: dict[str, Any]) -> dict[str, Any]:
    rounds = int(raw.get("rounds") or DEFAULT_ROUNDS)
    if not MIN_ROUNDS <= rounds <= MAX_ROUNDS:
        raise GameRuleError("INVALID_SETTINGS", "Раунд саны 5–12.", status=422)
    return {"rounds": rounds}


def difficulty_for(round_no: int, rounds: int) -> int:
    """Ойын өрши түседі: алғашқы үштен бірі — жеңіл, ортасы — орташа, соңы — қиын."""
    share = round_no / max(1, rounds)
    return 1 if share <= 1 / 3 else (2 if share <= 2 / 3 else 3)


async def start(players: Sequence[PlayerInfo], topics: Sequence[str], labels: Sequence[str],
                options: dict[str, Any], ctx: Ctx) -> Outcome:
    state: dict[str, Any] = {
        "game": GAME_TYPE,
        "topics": list(topics),
        "labels": list(labels),
        "rounds": options["rounds"],
        "round": 0,
        "players": player_list(players),
        "stats": {p.user_id: {"balance": START_BALANCE, "correct": 0, "grants": 0} for p in players},
        "phase": "bet",
        "question": None,
        "bets": {},
        "auto": [],
        "granted": [],
        "deadline": None,
        "last": None,
    }
    return await _next_round(state, ctx, [])


def _finish(state: dict[str, Any], log: list[AnswerLog]) -> Outcome:
    state["phase"] = "finished"
    state["deadline"] = None
    state["question"] = None
    return Outcome(state, log=log, finished=True)


async def _next_round(state: dict[str, Any], ctx: Ctx, log: list[AnswerLog]) -> Outcome:
    alive = active_ids(state)
    if state["round"] >= state["rounds"] or not alive:
        return _finish(state, log)
    state["round"] += 1
    seats = {p["id"]: p["seat"] for p in state["players"]}
    state["granted"] = []
    for uid in alive:
        stats = state["stats"][uid]
        if stats["balance"] < MIN_BET:   # ешкім ойыннан құлыпталып қалмайды
            stats["balance"] += GRANT
            stats["grants"] += 1
            state["granted"].append(seats[uid])
    question = await take_question(ctx, state, topic_ids=state["topics"],
                                   difficulty=difficulty_for(state["round"], state["rounds"]), viewers=alive)
    # Сұрақ алдын ала алынады, бірақ ставка фазасында тек тақырыбы мен қиындығы көрінеді.
    state["question"] = ask(question, to=alive, now=ctx.now, seconds=ANSWER_S, rng=ctx.rng)
    state["bets"] = {}
    state["auto"] = []
    state["phase"] = "bet"
    state["deadline"] = later(ctx.now, BET_S)
    return Outcome(state, log=log)


def _check_bet(state: dict[str, Any], user_id: str, amount: Any) -> int:
    balance = state["stats"][user_id]["balance"]
    if isinstance(amount, bool) or not isinstance(amount, int):
        raise GameRuleError("INVALID_BET", "Ставка — бүтін сан.", status=422)
    if not MIN_BET <= amount <= balance:
        raise GameRuleError("BET_OUT_OF_RANGE", f"Ставка {MIN_BET}–{balance} аралығында болуы керек.", status=422)
    return amount


def _reveal(state: dict[str, Any], ctx: Ctx) -> Outcome:
    """Ставкалар жабылады, сұрақ ашылады. Осыдан кейін ставка өзгермейді."""
    alive = active_ids(state)
    for uid in alive:
        if uid not in state["bets"]:
            state["bets"][uid] = min(MIN_BET, state["stats"][uid]["balance"])
            state["auto"].append(uid)
    question = state["question"]
    question["to"] = alive
    question["deadline"] = later(ctx.now, ANSWER_S)
    state["phase"] = "answer"
    state["deadline"] = question["deadline"]
    return Outcome(state, log=seen_log(question, alive))


async def _close(state: dict[str, Any], ctx: Ctx) -> Outcome:
    question = state["question"]
    seats = {p["id"]: p["seat"] for p in state["players"]}
    log: list[AnswerLog] = []
    outcome_by_seat: dict[int, dict[str, Any]] = {}
    for uid in question["to"]:
        option = question["answers"].get(uid)
        stats = state["stats"][uid]
        bet = int(state["bets"].get(uid, 0))
        correct = option == question["correct"]
        before = stats["balance"]
        if correct:
            stats["balance"] += bet
            stats["correct"] += 1
        else:
            stats["balance"] = max(0, stats["balance"] - bet)
        log.append(AnswerLog(question["qid"], uid, correct if option is not None else None))
        outcome_by_seat[seats[uid]] = {"ok": correct, "bet": bet, "delta": stats["balance"] - before,
                                       "chosen": option, "auto": uid in state["auto"]}
    state["last"] = {"round": state["round"], "qid": question["qid"], "right_option": question["correct"],
                     "players": outcome_by_seat}
    return await _next_round(state, ctx, log)


def _all_answered(state: dict[str, Any]) -> bool:
    question = state["question"]
    return all(uid in question["answers"] for uid in question["to"] if uid in active_ids(state))


async def act(state: dict[str, Any], user_id: str, action: dict[str, Any], ctx: Ctx) -> Outcome:
    state = clone(state)
    find_player(state, user_id)
    if user_id not in active_ids(state):
        raise GameRuleError("NOT_PLAYING", "Сіз бұл ойыннан шықтыңыз.")
    kind = action.get("type")
    if kind == "bet":
        if state["phase"] != "bet":
            raise GameRuleError("BET_LOCKED", "Сұрақ ашылды: ставканы енді өзгертуге болмайды.")
        state["bets"][user_id] = _check_bet(state, user_id, action.get("amount"))
        if all(uid in state["bets"] for uid in active_ids(state)):
            return _reveal(state, ctx)
        return Outcome(state)
    if kind == "answer" and state["phase"] == "answer":
        question = state["question"]
        if user_id not in question["to"]:
            raise GameRuleError("NOT_ASKED", "Бұл сұрақ сізге берілмеген.")
        if user_id in question["answers"]:
            raise GameRuleError("ALREADY_ANSWERED", "Жауап берілген.")
        question["answers"][user_id] = check_option(question, action.get("option"))
        if _all_answered(state):
            return await _close(state, ctx)
        return Outcome(state)
    raise GameRuleError("WRONG_PHASE", "Бұл әрекет қазір қолжетімсіз.")


async def timeout(state: dict[str, Any], ctx: Ctx) -> Outcome:
    state = clone(state)
    if state["phase"] == "bet":
        return _reveal(state, ctx)
    if state["phase"] == "answer":
        return await _close(state, ctx)
    return Outcome(state)


async def leave(state: dict[str, Any], user_id: str, ctx: Ctx) -> Outcome:
    state = clone(state)
    find_player(state, user_id)["left"] = True
    if state["phase"] == "finished":
        return Outcome(state)
    if not active_ids(state):
        return _finish(state, [])
    if state["phase"] == "bet" and all(uid in state["bets"] for uid in active_ids(state)):
        return _reveal(state, ctx)
    if state["phase"] == "answer" and _all_answered(state):
        return await _close(state, ctx)
    return Outcome(state)


def deadline(state: dict[str, Any]):
    return parse_time(state["deadline"]) if state["phase"] != "finished" else None


def results(state: dict[str, Any]) -> list[dict[str, Any]]:
    rows = [{"user_id": p["id"], "name": p["name"], "score": state["stats"][p["id"]]["balance"],
             "right_answers": state["stats"][p["id"]]["correct"]} for p in state["players"]]
    return standings(rows, ("score", "right_answers"))


def public_view(state: dict[str, Any]) -> dict[str, Any]:
    question = state["question"]
    view = {
        "game": GAME_TYPE,
        "labels": state["labels"],
        "rounds": state["rounds"],
        "round": state["round"],
        "phase": state["phase"],
        "deadline": state["deadline"],
        "min_bet": MIN_BET,
        "players": [{"id": p["id"], "seat": p["seat"], "name": p["name"], "left": p["left"],
                     "balance": state["stats"][p["id"]]["balance"],
                     "bet_placed": p["id"] in state["bets"]} for p in state["players"]],
        # Ставка кезінде — тек лоттың тақырыбы мен қиындығы; мәтін мен нұсқалар — жауап фазасында ғана.
        "lot": {"paragraph": question["paragraph"], "difficulty": question["difficulty"],
                "tier": TIERS.get(question["difficulty"], TIERS[2])} if question else None,
        "question": public_question(question) if state["phase"] == "answer" else None,
        "granted": state["granted"],
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
    answered = question["answers"].get(user_id) if question and state["phase"] == "answer" else None
    return {"balance": stats["balance"], "my_bet": state["bets"].get(user_id), "my_answer": answered,
            "max_bet": stats["balance"]}
