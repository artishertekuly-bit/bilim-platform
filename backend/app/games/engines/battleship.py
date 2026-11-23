"""Теңіз шайқасы (geimifikatsiya §4.3, D50).

6 × 6 алаң, флот: 3 + 2 + 2 + 1 + 1. Кемелер бір-біріне тимейді (бұрышпен де). Ойыншы кемелерін өзі қояды не
«Автоматты» батырмасын басады; уақыт бітсе, автоматты қойылады. Әр оқ алдында сұрақ: дұрыс — бір рет атады,
қате — кезек қарсыласқа. Оқ кемеге тисе, келесі сұраққа жауап беріп, тағы атады. Жеңіс — барлық кемені батыру.

Кемелердің орны тек серверде және иесінің жеке арнасында (D67): ортақ күйде тек оқтың нәтижесі тұрады.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from .base import (
    BOT_DELAY_S,
    BOT_ID,
    AnswerLog,
    Ctx,
    GameRuleError,
    Outcome,
    PlayerInfo,
    ask,
    check_option,
    clone,
    find_player,
    later,
    parse_time,
    player_list,
    public_question,
    seen_log,
    strip_secrets,
    take_question,
)

GAME_TYPE = "battleship"
MIN_PLAYERS = MAX_PLAYERS = 2
SIZE = 6
FLEET = (3, 2, 2, 1, 1)
PLACEMENT_S = 90
SHOT_S = 20
DEFAULT_ANSWER_S, MIN_ANSWER_S, MAX_ANSWER_S = 30, 20, 60
BOT_ACCURACY = 0.7


def settings(raw: dict[str, Any]) -> dict[str, Any]:
    answer_s = int(raw.get("answer_s") or DEFAULT_ANSWER_S)
    if not MIN_ANSWER_S <= answer_s <= MAX_ANSWER_S:
        raise GameRuleError("INVALID_SETTINGS", "Сұраққа уақыт 20–60 секунд.", status=422)
    return {"answer_s": answer_s}


def _around(square: int) -> set[int]:
    r, c = divmod(square, SIZE)
    return {rr * SIZE + cc for rr in range(r - 1, r + 2) for cc in range(c - 1, c + 2)
            if 0 <= rr < SIZE and 0 <= cc < SIZE}


def validate_fleet(ships: Any) -> list[list[int]]:
    """Кемелер: түзу әрі үздіксіз, алаң ішінде, бір-бірін баспайды және бір-біріне тимейді."""
    if not isinstance(ships, list) or sorted(len(s) for s in ships if isinstance(s, list)) != sorted(FLEET):
        raise GameRuleError("INVALID_FLEET", "Флот: бір 3 ұяшықты, екі 2 ұяшықты, екі 1 ұяшықты кеме.", status=422)
    fleet: list[list[int]] = []
    occupied: set[int] = set()
    for ship in ships:
        if not all(isinstance(x, int) and 0 <= x < SIZE * SIZE for x in ship):
            raise GameRuleError("INVALID_FLEET", "Кеме алаңнан шығып кетті.", status=422)
        cells = sorted(set(ship))
        if len(cells) != len(ship):
            raise GameRuleError("INVALID_FLEET", "Кеменің ұяшықтары қайталанады.", status=422)
        rows = {x // SIZE for x in cells}
        cols = {x % SIZE for x in cells}
        straight = (len(rows) == 1 and max(cols) - min(cols) == len(cells) - 1) or (
            len(cols) == 1 and max(rows) - min(rows) == len(cells) - 1)
        if not straight:
            raise GameRuleError("INVALID_FLEET", "Кеме түзу әрі үздіксіз болуы керек.", status=422)
        halo = set().union(*(_around(x) for x in cells))
        if halo & occupied:
            raise GameRuleError("INVALID_FLEET", "Кемелер бір-біріне тимеуі керек.", status=422)
        occupied |= set(cells)
        fleet.append(cells)
    return fleet


def random_fleet(rng) -> list[list[int]]:
    while True:
        fleet: list[list[int]] = []
        blocked: set[int] = set()
        for length in FLEET:
            options = []
            for r in range(SIZE):
                for c in range(SIZE):
                    for dr, dc in ((0, 1), (1, 0)):
                        cells = [(r + dr * k) * SIZE + (c + dc * k) for k in range(length)]
                        if r + dr * (length - 1) < SIZE and c + dc * (length - 1) < SIZE and not set(cells) & blocked:
                            options.append(cells)
            if not options:
                break
            ship = rng.choice(options)
            fleet.append(ship)
            blocked |= set().union(*(_around(x) for x in ship))
        if len(fleet) == len(FLEET):
            return fleet


async def start(players: Sequence[PlayerInfo], topics: Sequence[str], labels: Sequence[str],
                options: dict[str, Any], ctx: Ctx) -> Outcome:
    order = list(players)
    ctx.rng.shuffle(order)
    state: dict[str, Any] = {
        "game": GAME_TYPE,
        "answer_s": options["answer_s"],
        "topics": list(topics),
        "labels": list(labels),
        "players": player_list(order),
        "secret": {p.user_id: {"ships": random_fleet(ctx.rng) if p.bot else None} for p in order},
        "shots": {p.user_id: {} for p in order},   # кімнің алаңына қандай оқ түсті: {ұяшық: "hit"|"miss"}
        "sunk": {p.user_id: [] for p in order},
        "stats": {p.user_id: {"correct": 0, "hits": 0} for p in order},
        "turn": 0,
        "phase": "placement",
        "deadline": later(ctx.now, PLACEMENT_S),
        "question": None,
        "last": None,
        "winner": None,
    }
    return Outcome(state)


def _current(state: dict[str, Any]) -> dict[str, Any]:
    return state["players"][state["turn"]]


def _opponent(state: dict[str, Any]) -> dict[str, Any]:
    return state["players"][1 - state["turn"]]


async def _ask_current(state: dict[str, Any], ctx: Ctx, log: list[AnswerLog] | None = None) -> Outcome:
    log = list(log or [])
    player = _current(state)
    if player["bot"]:
        state["phase"] = "bot"
        state["question"] = None
        state["deadline"] = later(ctx.now, BOT_DELAY_S)
        return Outcome(state, log=log)
    question = await take_question(ctx, state, topic_ids=state["topics"], difficulty=ctx.rng.choice((1, 2, 3)),
                                   viewers=[p["id"] for p in state["players"]])
    state["question"] = ask(question, to=[player["id"]], now=ctx.now, seconds=state["answer_s"], rng=ctx.rng)
    state["phase"] = "question"
    state["deadline"] = state["question"]["deadline"]
    return Outcome(state, log=log + seen_log(state["question"], [p["id"] for p in state["players"]]))


async def _pass_turn(state: dict[str, Any], ctx: Ctx, log: list[AnswerLog] | None = None) -> Outcome:
    state["turn"] = 1 - state["turn"]
    return await _ask_current(state, ctx, log)


def _finish(state: dict[str, Any], winner: int | None, reason: str) -> Outcome:
    state["phase"] = "finished"
    state["deadline"] = None
    state["question"] = None
    state["winner"] = winner
    state["finish_reason"] = reason
    return Outcome(state, finished=True)


async def _maybe_start_battle(state: dict[str, Any], ctx: Ctx) -> Outcome:
    if all(state["secret"][p["id"]]["ships"] for p in state["players"]):
        state["turn"] = ctx.rng.randrange(2)
        return await _ask_current(state, ctx)
    return Outcome(state)


def _fire(state: dict[str, Any], shooter: dict[str, Any], square: int) -> str:
    target = _opponent(state)
    shots = state["shots"][target["id"]]
    key = str(square)
    if key in shots:
        raise GameRuleError("ALREADY_SHOT", "Бұл ұяшыққа оқ атылған.", status=422)
    ships = state["secret"][target["id"]]["ships"]
    hit_ship = next((ship for ship in ships if square in ship), None)
    shots[key] = "hit" if hit_ship else "miss"
    result = "miss"
    if hit_ship:
        result = "hit"
        state["stats"][shooter["id"]]["hits"] += 1
        if all(str(x) in shots for x in hit_ship):
            result = "sunk"
            state["sunk"][target["id"]].append(sorted(hit_ship))
            # Батқан кеменің айналасында кеме жоқ (ереже бойынша): ол ұяшықтар «бос» деп белгіленеді.
            for x in set().union(*(_around(y) for y in hit_ship)) - set(hit_ship):
                shots.setdefault(str(x), "miss")
    state["last"] = {"seat": shooter["seat"], "cell": square, "result": result}
    return result


async def act(state: dict[str, Any], user_id: str, action: dict[str, Any], ctx: Ctx) -> Outcome:
    state = clone(state)
    player = find_player(state, user_id)
    kind = action.get("type")
    if state["phase"] == "finished":
        raise GameRuleError("FINISHED", "Ойын аяқталды.")
    if state["phase"] == "placement" and kind in ("place", "auto_place"):
        if state["secret"][user_id]["ships"]:
            raise GameRuleError("ALREADY_PLACED", "Кемелер орналастырылып қойған.")
        ships = random_fleet(ctx.rng) if kind == "auto_place" else validate_fleet(action.get("ships"))
        state["secret"][user_id]["ships"] = ships
        return await _maybe_start_battle(state, ctx)
    if _current(state)["id"] != user_id:
        raise GameRuleError("NOT_YOUR_TURN", "Қазір сіздің кезегіңіз емес.")
    if kind == "answer" and state["phase"] == "question":
        question = state["question"]
        option = check_option(question, action.get("option"))
        correct = option == question["correct"]
        question["answers"][user_id] = option
        log = [AnswerLog(question["qid"], user_id, correct)]
        state["last"] = {"seat": player["seat"], "ok": correct, "chosen": option, "right_option": question["correct"]}
        if correct:
            state["stats"][user_id]["correct"] += 1
            state["phase"] = "shoot"
            state["question"] = None
            state["deadline"] = later(ctx.now, SHOT_S)
            return Outcome(state, log=log)
        return await _pass_turn(state, ctx, log)
    if kind == "shoot" and state["phase"] == "shoot":
        square = action.get("cell")
        if not isinstance(square, int) or not 0 <= square < SIZE * SIZE:
            raise GameRuleError("INVALID_CELL", "Ұяшық қате.", status=422)
        result = _fire(state, player, square)
        if _all_sunk(state, _opponent(state)["id"]):
            return _finish(state, state["turn"], "win")
        if result in ("hit", "sunk"):
            return await _ask_current(state, ctx)
        return await _pass_turn(state, ctx)
    raise GameRuleError("WRONG_PHASE", "Бұл әрекет қазір қолжетімсіз.")


def _all_sunk(state: dict[str, Any], user_id: str) -> bool:
    return len(state["sunk"][user_id]) == len(FLEET)


def bot_target(shots: dict[str, str], sunk: Sequence[Sequence[int]], rng) -> int:
    """Демо-ЖИ: батпаған кемеге тиген оқ болса — оның жалғасын іздейді, болмаса шахмат ретімен кездейсоқ атады."""
    sunk_cells = {x for ship in sunk for x in ship}
    hits = [int(k) for k, v in shots.items() if v == "hit" and int(k) not in sunk_cells]
    free = [x for x in range(SIZE * SIZE) if str(x) not in shots]
    if hits:
        candidates = []
        if len(hits) >= 2:
            rows = {h // SIZE for h in hits}
            cols = {h % SIZE for h in hits}
            if len(rows) == 1:
                r = rows.pop()
                candidates = [r * SIZE + c for c in (min(cols) - 1, max(cols) + 1) if 0 <= c < SIZE]
            elif len(cols) == 1:
                c = cols.pop()
                candidates = [r * SIZE + c for r in (min(rows) - 1, max(rows) + 1) if 0 <= r < SIZE]
        else:
            r, c = divmod(hits[0], SIZE)
            candidates = [rr * SIZE + cc for rr, cc in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1))
                          if 0 <= rr < SIZE and 0 <= cc < SIZE]
        candidates = [x for x in candidates if str(x) not in shots]
        if candidates:
            return rng.choice(candidates)
    parity = [x for x in free if (x // SIZE + x % SIZE) % 2 == 0]
    return rng.choice(parity or free)


async def timeout(state: dict[str, Any], ctx: Ctx) -> Outcome:
    state = clone(state)
    phase = state["phase"]
    if phase == "finished":
        return Outcome(state)
    if phase == "placement":
        for p in state["players"]:
            if not state["secret"][p["id"]]["ships"]:
                state["secret"][p["id"]]["ships"] = random_fleet(ctx.rng)
        return await _maybe_start_battle(state, ctx)
    player = _current(state)
    if phase == "bot":
        if ctx.rng.random() >= BOT_ACCURACY:
            state["last"] = {"seat": player["seat"], "ok": False}
            return await _pass_turn(state, ctx)
        target = _opponent(state)["id"]
        square = bot_target(state["shots"][target], state["sunk"][target], ctx.rng)
        result = _fire(state, player, square)
        if _all_sunk(state, target):
            return _finish(state, state["turn"], "win")
        if result in ("hit", "sunk"):
            state["deadline"] = later(ctx.now, BOT_DELAY_S)
            return Outcome(state)
        return await _pass_turn(state, ctx)
    log = []
    if phase == "question" and state["question"]:
        log = [AnswerLog(state["question"]["qid"], player["id"], None)]
        state["last"] = {"seat": player["seat"], "ok": False, "timeout": True,
                         "right_option": state["question"]["correct"]}
    else:
        state["last"] = {"seat": player["seat"], "timeout": True}
    return await _pass_turn(state, ctx, log)


async def leave(state: dict[str, Any], user_id: str, ctx: Ctx) -> Outcome:
    state = clone(state)
    player = find_player(state, user_id)
    player["left"] = True
    if state["phase"] == "finished":
        return Outcome(state)
    return _finish(state, 1 - state["players"].index(player), "opponent_left")


def deadline(state: dict[str, Any]):
    return parse_time(state["deadline"]) if state["phase"] != "finished" else None


def results(state: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for index, p in enumerate(state["players"]):
        rows.append({"user_id": p["id"], "name": p["name"], "bot": p["bot"],
                     "place": 1 if state["winner"] in (None, index) else 2,
                     "right_answers": state["stats"][p["id"]]["correct"], "hits": state["stats"][p["id"]]["hits"]})
    return sorted(rows, key=lambda r: r["place"])


def public_view(state: dict[str, Any]) -> dict[str, Any]:
    view = {
        "game": GAME_TYPE,
        "size": SIZE,
        "fleet": list(FLEET),
        "labels": state["labels"],
        "players": [{"id": p["id"], "seat": p["seat"], "name": p["name"], "bot": p["bot"], "left": p["left"],
                     "placed": bool(state["secret"][p["id"]]["ships"]),
                     "board": dict(state["shots"][p["id"]]),
                     "sunk": [list(s) for s in state["sunk"][p["id"]]],
                     "ships_left": len(FLEET) - len(state["sunk"][p["id"]])} for p in state["players"]],
        "turn_seat": _current(state)["seat"] if state["phase"] not in ("placement",) else None,
        "phase": state["phase"],
        "deadline": state["deadline"],
        "question": public_question(state["question"]),
        "last": state["last"],
        "winner_seat": state["players"][state["winner"]]["seat"] if state["winner"] is not None else None,
        "finish_reason": state.get("finish_reason"),
    }
    if state["phase"] == "finished":
        view["results"] = [{k: v for k, v in r.items() if k != "user_id"} for r in results(state)]
    return strip_secrets(view)


def private_view(state: dict[str, Any], user_id: str) -> dict[str, Any]:
    secret = state["secret"].get(user_id)
    if secret is None:
        return {}
    return {"my_ships": [list(s) for s in secret["ships"] or []]}
