"""«Сенемін — Сенбеймін» (Games 2-кезең, D99): тұжырымды тексеру.

1+ ойыншы. Әр раундта бір тұжырым: «Сенемін» (дұрыс) не «Сенбеймін» (қате). «Сенбеймін» таңдалса, түзетуді
3–4 қысқа нұсқадан таңдау керек. Ұпай: дұрыс тұжырымға «Сенемін» — 100; қате тұжырымды аңғару — 50,
дұрыс түзету — тағы +50. Тексеру тек кодпен ($0, LLM жоқ). Раундтан кейін түсіндірме ашылады.

Тұжырымның көзі:
  true_false_fix — «Кез келген тақырып» кэшіндегі дайын тұжырым (games.generated_questions);
  mcq            — кез келген колоданың тесті, $0: шамамен 50% раундта сұрақ дұрыс жауабымен (шын тұжырым),
                   қалғанында сенімді алдағышпен (жалған) беріледі. Шындық пен түзету тек серверде.
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
    Question,
    active_ids,
    clone,
    find_player,
    human_ids,
    later,
    parse_time,
    player_list,
    standings,
    strip_secrets,
    take_question,
)

GAME_TYPE = "fact_check"
DECK_FORMAT = "true_false_fix"
MIN_PLAYERS, MAX_PLAYERS = 1, 6
SOLO_PLAYERS = 1
DEFAULT_ROUNDS, MIN_ROUNDS, MAX_ROUNDS = 8, 5, 12
ANSWER_S = 25
REVEAL_S = 6
TRUE_POINTS = 100
SPOT_POINTS = 50
FIX_BONUS = 50
TRUE_SHARE = 0.5
MAX_FIXES = 4


def settings(raw: dict[str, Any]) -> dict[str, Any]:
    rounds = int(raw.get("rounds") or DEFAULT_ROUNDS)
    if not MIN_ROUNDS <= rounds <= MAX_ROUNDS:
        raise GameRuleError("INVALID_SETTINGS", "Раунд саны 5–12.", status=422)
    return {"rounds": rounds}


def difficulty_for(round_no: int, rounds: int) -> int:
    share = round_no / max(1, rounds)
    return 1 if share <= 1 / 3 else (2 if share <= 2 / 3 else 3)


def make_statement(question: Question, ctx: Ctx, to: Sequence[str]) -> dict[str, Any]:
    """Сұрақтан раундтың тұжырымы. Шындық, түзету мен түсіндірме `answer_key` ішінде — клиентке бармайды."""
    options = [dict(o) for o in question.options]
    claim: str | None = None
    if question.format == "true_false_fix":
        truth = bool(question.truth)
        fix = None if truth else question.correct
        right = next((o["text"] for o in options if o["id"] == fix), "")
        explanation = question.explanation or ("Тұжырым дұрыс." if truth else f"Дұрысы: {right}")
    else:
        right_option = next(o for o in options if o["id"] == question.correct)
        wrong = [o for o in options if o["id"] != question.correct]
        truth = not wrong or ctx.rng.random() < TRUE_SHARE
        shown = right_option if truth else ctx.rng.choice(wrong)
        claim = shown["text"]
        options = [o for o in options if o["id"] != shown["id"]]
        fix = None if truth else question.correct
        explanation = question.explanation or f"Дұрыс жауап: {right_option['text']}"
    ctx.rng.shuffle(options)
    return {
        "qid": question.question_id,
        "paragraph": question.paragraph,
        "difficulty": question.difficulty,
        "stem": question.stem,
        "claim": claim,
        "options": options[:MAX_FIXES],
        "answer_key": {"truth": truth, "fix": fix, "explanation": explanation},
        "to": list(to),
        "deadline": later(ctx.now, ANSWER_S),
        "answers": {},
    }


def score(key: dict[str, Any], answer: dict[str, Any] | None) -> tuple[int, bool | None, bool]:
    """(ұпай, шешім дұрыс па, түзетілді ме). Жауап жоқ — (0, None, False)."""
    if answer is None:
        return 0, None, False
    if key["truth"]:
        ok = answer["choice"] == "true"
        return (TRUE_POINTS if ok else 0), ok, False
    if answer["choice"] != "false":
        return 0, False, False
    fixed = answer.get("option") == key["fix"]
    return SPOT_POINTS + (FIX_BONUS if fixed else 0), True, fixed


async def start(players: Sequence[PlayerInfo], topics: Sequence[str], labels: Sequence[str],
                options: dict[str, Any], ctx: Ctx) -> Outcome:
    state: dict[str, Any] = {
        "game": GAME_TYPE,
        "topics": list(topics),
        "labels": list(labels),
        "rounds": options["rounds"],
        "round": 0,
        "players": player_list(players),
        "stats": {p.user_id: {"score": 0, "correct": 0, "spotted": 0, "fixed": 0} for p in players},
        "phase": "question",
        "statement": None,
        "ready": [],
        "deadline": None,
        "last": None,
    }
    return await _next_round(state, ctx, [])


def _finish(state: dict[str, Any], log: list[AnswerLog]) -> Outcome:
    state["phase"] = "finished"
    state["deadline"] = None
    state["statement"] = None
    return Outcome(state, log=log, finished=True)


async def _next_round(state: dict[str, Any], ctx: Ctx, log: list[AnswerLog]) -> Outcome:
    alive = active_ids(state)
    if state["round"] >= state["rounds"] or not alive:
        return _finish(state, log)
    state["round"] += 1
    question = await take_question(ctx, state, topic_ids=state["topics"],
                                   difficulty=difficulty_for(state["round"], state["rounds"]), viewers=alive)
    state["statement"] = make_statement(question, ctx, alive)
    state["ready"] = []
    state["phase"] = "question"
    state["deadline"] = state["statement"]["deadline"]
    return Outcome(state, log=log + [AnswerLog(question.question_id, uid, None) for uid in alive])


def _close(state: dict[str, Any], ctx: Ctx) -> Outcome:
    statement = state["statement"]
    key = statement["answer_key"]
    seats = {p["id"]: p["seat"] for p in state["players"]}
    log: list[AnswerLog] = []
    by_seat: dict[int, dict[str, Any]] = {}
    for uid in statement["to"]:
        answer = statement["answers"].get(uid)
        points, ok, fixed = score(key, answer)
        stats = state["stats"][uid]
        stats["score"] += points
        full = bool(ok) and (key["truth"] or fixed)
        stats["correct"] += int(full)
        if ok and not key["truth"]:
            stats["spotted"] += 1
            stats["fixed"] += int(fixed)
        log.append(AnswerLog(statement["qid"], uid, full if answer is not None else None))
        by_seat[seats[uid]] = {"points": points, "ok": ok, "fixed": fixed,
                               "choice": answer["choice"] if answer else None,
                               "option": answer.get("option") if answer else None}
    state["last"] = {"round": state["round"], "qid": statement["qid"], "stem": statement["stem"],
                     "claim": statement["claim"], "truth": key["truth"], "fix": key["fix"],
                     "fix_text": next((o["text"] for o in statement["options"] if o["id"] == key["fix"]), None),
                     "explanation": key["explanation"], "players": by_seat}
    state["phase"] = "reveal"
    state["ready"] = []
    state["deadline"] = later(ctx.now, REVEAL_S)
    return Outcome(state, log=log)


def _all_answered(state: dict[str, Any]) -> bool:
    statement = state["statement"]
    return all(uid in statement["answers"] for uid in statement["to"] if uid in active_ids(state))


async def act(state: dict[str, Any], user_id: str, action: dict[str, Any], ctx: Ctx) -> Outcome:
    state = clone(state)
    find_player(state, user_id)
    if user_id not in active_ids(state):
        raise GameRuleError("NOT_PLAYING", "Сіз бұл ойыннан шықтыңыз.")
    kind = action.get("type")
    if kind == "verdict" and state["phase"] == "question":
        statement = state["statement"]
        if user_id not in statement["to"]:
            raise GameRuleError("NOT_ASKED", "Бұл тұжырым сізге берілмеген.")
        if user_id in statement["answers"]:
            raise GameRuleError("ALREADY_ANSWERED", "Жауап берілген.")
        choice = action.get("choice")
        if choice not in ("true", "false"):
            raise GameRuleError("INVALID_ACTION", "Таңдау: «Сенемін» не «Сенбеймін».", status=422)
        answer: dict[str, Any] = {"choice": choice}
        if choice == "false":
            option = action.get("option")
            if option not in {o["id"] for o in statement["options"]}:
                raise GameRuleError("FIX_REQUIRED", "«Сенбеймін» үшін дұрыс түзетуді таңдаңыз.", status=422)
            answer["option"] = option
        statement["answers"][user_id] = answer
        return _close(state, ctx) if _all_answered(state) else Outcome(state)
    if kind == "next" and state["phase"] == "reveal":
        if user_id not in state["ready"]:
            state["ready"].append(user_id)
        if all(uid in state["ready"] for uid in active_ids(state) if uid in human_ids(state)):
            return await _next_round(state, ctx, [])
        return Outcome(state)
    raise GameRuleError("WRONG_PHASE", "Бұл әрекет қазір қолжетімсіз.")


async def timeout(state: dict[str, Any], ctx: Ctx) -> Outcome:
    state = clone(state)
    if state["phase"] == "question":
        return _close(state, ctx)
    if state["phase"] == "reveal":
        return await _next_round(state, ctx, [])
    return Outcome(state)


async def leave(state: dict[str, Any], user_id: str, ctx: Ctx) -> Outcome:
    state = clone(state)
    find_player(state, user_id)["left"] = True
    if state["phase"] == "finished":
        return Outcome(state)
    if not active_ids(state):
        return _finish(state, [])
    if state["phase"] == "question" and _all_answered(state):
        return _close(state, ctx)
    if state["phase"] == "reveal" and all(uid in state["ready"] for uid in active_ids(state)):
        return await _next_round(state, ctx, [])
    return Outcome(state)


def deadline(state: dict[str, Any]):
    return parse_time(state["deadline"]) if state["phase"] != "finished" else None


def results(state: dict[str, Any]) -> list[dict[str, Any]]:
    rows = [{"user_id": p["id"], "name": p["name"], "score": state["stats"][p["id"]]["score"],
             "right_answers": state["stats"][p["id"]]["correct"]} for p in state["players"]]
    return standings(rows, ("score", "right_answers"))


def public_view(state: dict[str, Any]) -> dict[str, Any]:
    statement = state["statement"]
    view = {
        "game": GAME_TYPE,
        "labels": state["labels"],
        "rounds": state["rounds"],
        "round": state["round"],
        "phase": state["phase"],
        "deadline": state["deadline"],
        "points": {"true": TRUE_POINTS, "spot": SPOT_POINTS, "bonus": FIX_BONUS},
        "players": [{"id": p["id"], "seat": p["seat"], "name": p["name"], "left": p["left"],
                     "score": state["stats"][p["id"]]["score"],
                     "answered": bool(statement and p["id"] in statement["answers"])}
                    for p in state["players"]],
        "statement": {"qid": statement["qid"], "paragraph": statement["paragraph"],
                      "difficulty": statement["difficulty"], "stem": statement["stem"], "claim": statement["claim"],
                      "options": statement["options"], "to": statement["to"], "deadline": statement["deadline"],
                      "answered": sorted(statement["answers"])}
        if statement and state["phase"] == "question" else None,
        "last": state["last"] if state["phase"] in ("reveal", "finished") else None,
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
    statement = state["statement"]
    mine = statement["answers"].get(user_id) if statement and state["phase"] == "question" else None
    return {"score": stats["score"], "my_answer": mine, "ready": user_id in state["ready"]}
