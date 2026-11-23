"""Әдіс жорығы (geimifikatsiya §4.1, D43, D49).

3–6 оқушы жеке ойнайды. Карта N × N (5, 6, 7), әр аймақ — масштабтың бір §-і. Кезегі келген ойыншы ұяшық
таңдайды (20 с), сұрақ шығады (әдепкі 30 с), дұрыс жауап — ұяшық оныкі. Ойын бос ұяшық біткенде не 40 минуттан
кейін аяқталады. Ұпай — иеленген ұяшықтардың құны және ×2 картасының бонусы; тең болса, ұяшығы көбі жоғары.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import timedelta
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
    iso,
    later,
    parse_time,
    player_list,
    public_question,
    seen_log,
    standings,
    strip_secrets,
    take_question,
)

GAME_TYPE = "conquest"
MIN_PLAYERS, MAX_PLAYERS = 3, 6
SIZES = (5, 6, 7)
PICK_S = 20
DEFAULT_ANSWER_S, MIN_ANSWER_S, MAX_ANSWER_S = 30, 20, 60
GAME_LIMIT_MIN = 40
DIAMOND_SHARE = 0.10
STREAK_FOR_CARD = 3
CARDS = ("fifty", "double", "second", "shield")
VALUE_WEIGHTS = ((1, 0.5), (2, 0.35), (3, 0.15))
MIN_SECOND_CHANCE_S = 10


def settings(raw: dict[str, Any]) -> dict[str, Any]:
    size = int(raw.get("size") or 6)
    answer_s = int(raw.get("answer_s") or DEFAULT_ANSWER_S)
    if size not in SIZES:
        raise GameRuleError("INVALID_SETTINGS", "Картаның өлшемі 5, 6 не 7 болуы керек.", status=422)
    if not MIN_ANSWER_S <= answer_s <= MAX_ANSWER_S:
        raise GameRuleError("INVALID_SETTINGS", "Сұраққа уақыт 20–60 секунд.", status=422)
    return {"size": size, "answer_s": answer_s}


def _value(rng) -> int:
    roll, total = rng.random(), 0.0
    for value, weight in VALUE_WEIGHTS:
        total += weight
        if roll < total:
            return value
    return VALUE_WEIGHTS[-1][0]


def _regions(size: int, count: int) -> list[int]:
    """Аймақтар — көршілес жолақтар: ұяшықтар «жылан» ретімен тең бөлікке бөлінеді."""
    order = [(r, c if r % 2 == 0 else size - 1 - c) for r in range(size) for c in range(size)]
    regions = [0] * (size * size)
    for index, (r, c) in enumerate(order):
        regions[r * size + c] = index * count // len(order)
    return regions


def neighbors(index: int, size: int) -> list[int]:
    r, c = divmod(index, size)
    out = []
    for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        nr, nc = r + dr, c + dc
        if 0 <= nr < size and 0 <= nc < size:
            out.append(nr * size + nc)
    return out


def allowed_cells(state: dict[str, Any], user_id: str) -> list[int]:
    """Алғашқы ұяшық — кез келген бос; одан кейін өз аумағының көршісі (бос не қорғалмаған бөтен ұяшық).
    Ондай көрші болмаса — кез келген бос ұяшық."""
    cells, size = state["cells"], state["size"]
    own = [i for i, cell in enumerate(cells) if cell["owner"] == user_id]
    empty = [i for i, cell in enumerate(cells) if cell["owner"] is None]
    if not own:
        return empty
    near = sorted({
        n for i in own for n in neighbors(i, size)
        if cells[n]["owner"] != user_id and (cells[n]["owner"] is None or not cells[n]["shield"])
    })
    return near or empty


async def start(players: Sequence[PlayerInfo], topics: Sequence[str], labels: Sequence[str],
                options: dict[str, Any], ctx: Ctx) -> Outcome:
    size = options["size"]
    rng = ctx.rng
    regions = _regions(size, len(topics))
    cells = [{"owner": None, "value": _value(rng), "diamond": False, "region": regions[i], "shield": False}
             for i in range(size * size)]
    for index in rng.sample(range(len(cells)), max(1, round(len(cells) * DIAMOND_SHARE))):
        cells[index]["diamond"] = True
    order = list(players)
    rng.shuffle(order)
    state: dict[str, Any] = {
        "game": GAME_TYPE,
        "size": size,
        "answer_s": options["answer_s"],
        "topics": list(topics),
        "labels": list(labels),
        "cells": cells,
        "players": player_list(order),
        "stats": {p.user_id: {"bonus": 0, "streak": 0, "correct": 0, "cards": ["fifty"], "double": False,
                              "second": False} for p in order},
        "turn": 0,
        "phase": "pick",
        "deadline": later(ctx.now, PICK_S),
        "ends_at": iso(ctx.now + timedelta(minutes=GAME_LIMIT_MIN)),
        "question": None,
        "cell": None,
        "last": None,
        "round": 1,
    }
    return Outcome(state)


def _current(state: dict[str, Any]) -> str:
    return state["players"][state["turn"]]["id"]


def _require_turn(state: dict[str, Any], user_id: str, phase: str) -> None:
    find_player(state, user_id)
    if state["phase"] != phase:
        raise GameRuleError("WRONG_PHASE", "Бұл әрекет қазір қолжетімсіз.")
    if _current(state) != user_id:
        raise GameRuleError("NOT_YOUR_TURN", "Қазір сіздің кезегіңіз емес.")


def score(state: dict[str, Any], user_id: str) -> int:
    territory = sum(cell["value"] for cell in state["cells"] if cell["owner"] == user_id)
    return territory + state["stats"][user_id]["bonus"]


def _finish(state: dict[str, Any], reason: str) -> Outcome:
    state["phase"] = "finished"
    state["deadline"] = None
    state["question"] = None
    state["finish_reason"] = reason
    return Outcome(state, finished=True)


def _advance(state: dict[str, Any], ctx: Ctx) -> Outcome:
    if all(cell["owner"] is not None for cell in state["cells"]):
        return _finish(state, "board_full")
    if parse_time(state["ends_at"]) <= ctx.now:
        return _finish(state, "time_limit")
    alive = active_ids(state)
    if len(alive) < 2:
        return _finish(state, "players_left")
    count = len(state["players"])
    for step in range(1, count + 1):
        index = (state["turn"] + step) % count
        if not state["players"][index]["left"]:
            if index <= state["turn"]:
                state["round"] += 1
            state["turn"] = index
            break
    state["phase"] = "pick"
    state["question"] = None
    state["cell"] = None
    state["deadline"] = later(ctx.now, PICK_S)
    for stats in state["stats"].values():
        stats["double"] = stats["second"] = False
    return Outcome(state)


async def act(state: dict[str, Any], user_id: str, action: dict[str, Any], ctx: Ctx) -> Outcome:
    state = clone(state)
    kind = action.get("type")
    if kind == "pick":
        _require_turn(state, user_id, "pick")
        cell = action.get("cell")
        if not isinstance(cell, int) or cell not in allowed_cells(state, user_id):
            raise GameRuleError("CELL_NOT_ALLOWED", "Бұл ұяшықты таңдауға болмайды.", status=422)
        target = state["cells"][cell]
        question = await take_question(ctx, state, topic_ids=[state["topics"][target["region"]]],
                                       difficulty=target["value"], viewers=active_ids(state))
        state["question"] = ask(question, to=[user_id], now=ctx.now, seconds=state["answer_s"], rng=ctx.rng)
        state["cell"] = cell
        state["phase"] = "question"
        state["deadline"] = state["question"]["deadline"]
        return Outcome(state, log=seen_log(state["question"], active_ids(state)))
    if kind == "card":
        return _use_card(state, user_id, action, ctx)
    if kind == "answer":
        _require_turn(state, user_id, "question")
        return _answer(state, user_id, check_option(state["question"], action.get("option")), ctx)
    raise GameRuleError("INVALID_ACTION", "Белгісіз әрекет.", status=422)


def _use_card(state: dict[str, Any], user_id: str, action: dict[str, Any], ctx: Ctx) -> Outcome:
    card = action.get("card")
    stats = state["stats"][user_id]
    if card not in CARDS or card not in stats["cards"]:
        raise GameRuleError("NO_CARD", "Сізде бұл карта жоқ.", status=422)
    if card == "shield":
        _require_turn(state, user_id, "pick")
        cell = action.get("cell")
        if not isinstance(cell, int) or not 0 <= cell < len(state["cells"]) or state["cells"][cell]["owner"] != user_id:
            raise GameRuleError("CELL_NOT_ALLOWED", "Қалқанды тек өз ұяшығыңызға қоюға болады.", status=422)
        state["cells"][cell]["shield"] = True
    else:
        _require_turn(state, user_id, "question")
        question = state["question"]
        if card == "fifty":
            if question["removed"]:
                raise GameRuleError("CARD_USED", "50/50 бұл сұрақта қолданылды.", status=422)
            wrong = [o["id"] for o in question["options"] if o["id"] != question["correct"]]
            question["removed"] = sorted(ctx.rng.sample(wrong, min(2, len(wrong))))
        elif card == "double":
            stats["double"] = True
        else:
            stats["second"] = True
    stats["cards"].remove(card)
    return Outcome(state)


def _grant_card(stats: dict[str, Any], ctx: Ctx) -> str:
    card = ctx.rng.choice(CARDS)
    stats["cards"].append(card)
    return card


def _answer(state: dict[str, Any], user_id: str, option: str | None, ctx: Ctx) -> Outcome:
    question = state["question"]
    stats = state["stats"][user_id]
    correct = option == question["correct"]
    if option is not None and not correct and stats["second"]:
        # Екінші мүмкіндік: таңдалған нұсқа алынып, сол сұраққа тағы бір рет жауап беріледі.
        stats["second"] = False
        question["removed"] = sorted(set(question["removed"]) | {option})
        remaining = (parse_time(question["deadline"]) - ctx.now).total_seconds()
        if remaining < MIN_SECOND_CHANCE_S:
            question["deadline"] = later(ctx.now, MIN_SECOND_CHANCE_S)
            state["deadline"] = question["deadline"]
        state["last"] = {"player": user_id, "cell": state["cell"], "ok": False, "second_chance": True}
        return Outcome(state)

    question["answers"][user_id] = option
    cell = state["cells"][state["cell"]]
    award = None
    if correct:
        cell["owner"] = user_id
        cell["shield"] = False
        if stats["double"]:
            stats["bonus"] += cell["value"]
        stats["streak"] += 1
        stats["correct"] += 1
        if cell["diamond"]:
            cell["diamond"] = False
            award = _grant_card(stats, ctx)
        elif stats["streak"] % STREAK_FOR_CARD == 0:
            award = _grant_card(stats, ctx)
    else:
        stats["streak"] = 0
    state["last"] = {
        "player": user_id, "cell": state["cell"], "ok": correct, "chosen": option,
        "correct_option": question["correct"], "qid": question["qid"], "card_awarded": bool(award),
    }
    log = [AnswerLog(question["qid"], user_id, correct if option is not None else None)]
    outcome = _advance(state, ctx)
    outcome.log = log
    return outcome


async def timeout(state: dict[str, Any], ctx: Ctx) -> Outcome:
    state = clone(state)
    if state["phase"] == "finished":
        return Outcome(state)
    if parse_time(state["ends_at"]) <= ctx.now:
        return _finish(state, "time_limit")
    if state["phase"] == "question":
        return _answer(state, _current(state), None, ctx)
    state["last"] = {"player": _current(state), "skipped": True}
    return _advance(state, ctx)


async def leave(state: dict[str, Any], user_id: str, ctx: Ctx) -> Outcome:
    state = clone(state)
    find_player(state, user_id)["left"] = True
    if state["phase"] == "finished":
        return Outcome(state)
    if len(active_ids(state)) < 2:
        return _finish(state, "players_left")
    if _current(state) == user_id:
        return _advance(state, ctx)
    return Outcome(state)


def deadline(state: dict[str, Any]):
    if state["phase"] == "finished":
        return None
    return min(parse_time(state["deadline"]), parse_time(state["ends_at"]))


def results(state: dict[str, Any]) -> list[dict[str, Any]]:
    rows = [{"user_id": p["id"], "name": p["name"], "score": score(state, p["id"]),
             "cells": sum(1 for c in state["cells"] if c["owner"] == p["id"]),
             "right_answers": state["stats"][p["id"]]["correct"]} for p in state["players"]]
    return standings(rows, ("score", "cells"))


def public_view(state: dict[str, Any]) -> dict[str, Any]:
    seats = {p["id"]: p["seat"] for p in state["players"]}
    view = {
        "game": GAME_TYPE,
        "size": state["size"],
        "labels": state["labels"],
        "cells": [{"owner": seats.get(c["owner"]) if c["owner"] else None, "value": c["value"],
                   "diamond": c["diamond"], "region": c["region"], "shield": c["shield"]} for c in state["cells"]],
        "players": [{"id": p["id"], "seat": p["seat"], "name": p["name"], "left": p["left"], "score": score(state, p["id"]),
                     "cells": sum(1 for c in state["cells"] if c["owner"] == p["id"]),
                     "card_count": len(state["stats"][p["id"]]["cards"])} for p in state["players"]],
        "turn_seat": state["players"][state["turn"]]["seat"],
        "phase": state["phase"],
        "deadline": state["deadline"],
        "ends_at": state["ends_at"],
        "round": state["round"],
        "cell": state["cell"],
        "question": public_question(state["question"]),
        "last": _public_last(state, seats),
    }
    if state["phase"] == "finished":
        view["results"] = [{k: v for k, v in r.items() if k != "user_id"} | {"seat": seats[r["user_id"]]}
                           for r in results(state)]
    return strip_secrets(view)


def _public_last(state: dict[str, Any], seats: dict[str, int]) -> dict[str, Any] | None:
    last = state.get("last")
    if not last:
        return None
    out = {k: v for k, v in last.items() if k not in {"player", "correct_option"}}
    out["seat"] = seats.get(last.get("player"))
    if "correct_option" in last:
        out["right_option"] = last["correct_option"]  # жауап берілген соң дұрыс нұсқа ашылады (D45)
    return out


def private_view(state: dict[str, Any], user_id: str) -> dict[str, Any]:
    stats = state["stats"].get(user_id)
    if stats is None:
        return {}
    mine = state["phase"] != "finished" and state["players"][state["turn"]]["id"] == user_id
    return {
        "my_cards": list(stats["cards"]),
        "double": stats["double"],
        "second": stats["second"],
        "allowed": allowed_cells(state, user_id) if mine and state["phase"] == "pick" else [],
    }
