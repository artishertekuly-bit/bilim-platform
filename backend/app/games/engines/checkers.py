"""Шашки — орыс дойбысы (geimifikatsiya §4.2, D44, D50).

8 × 8, ақтар (0-орын) бірінші жүреді. Жай тас алға жүреді, тасты кері де алады; тас алу міндетті және тізбекпен
соңына дейін жалғасады; соңғы қатарға жеткен тас бірден дамка болады да, мүмкін болса, дамка ретінде алуды
жалғастырады. Дамка диагональ бойымен бірнеше ұяшыққа жүреді.

Әр жүріс алдында сұрақ: дұрыс — жүреді, қате — кезек қарсыласқа. Тас алуға болатын кезекте сұрақ қиынырақ
(3-деңгей). Жүрісті ойыншы жауап берген соң таңдайды. Қатарынан 30 жүрісте тас алынбаса — тең.
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
    bot_answer,
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

GAME_TYPE = "checkers"
MIN_PLAYERS = MAX_PLAYERS = 2
DEFAULT_ANSWER_S, MIN_ANSWER_S, MAX_ANSWER_S = 30, 20, 60
MOVE_S = 30
DRAW_MOVES = 30          # D50: қатарынан 30 жүрісте тас алынбаса — тең
DRAW_IDLE_TURNS = 60     # екеуі де қатарынан қателессе, ойын шексіз созылмауы үшін
DIRS = ((-1, -1), (-1, 1), (1, -1), (1, 1))
COLORS = ("w", "b")


def settings(raw: dict[str, Any]) -> dict[str, Any]:
    answer_s = int(raw.get("answer_s") or DEFAULT_ANSWER_S)
    if not MIN_ANSWER_S <= answer_s <= MAX_ANSWER_S:
        raise GameRuleError("INVALID_SETTINGS", "Сұраққа уақыт 20–60 секунд.", status=422)
    return {"answer_s": answer_s}


def initial_board() -> list[str | None]:
    board: list[str | None] = [None] * 64
    for r in range(8):
        for c in range(8):
            if (r + c) % 2 == 1:
                if r < 3:
                    board[r * 8 + c] = "b"
                elif r > 4:
                    board[r * 8 + c] = "w"
    return board


def _inside(r: int, c: int) -> bool:
    return 0 <= r < 8 and 0 <= c < 8


def _last_row(color: str) -> int:
    return 0 if color == "w" else 7


def _forward(color: str) -> int:
    return -1 if color == "w" else 1


def _enemy(piece: str | None, color: str) -> bool:
    return piece is not None and piece.lower() != color


def _capture_paths(board: list[str | None], start: int, color: str) -> list[dict[str, Any]]:
    king = board[start].isupper()

    def empty(square: int) -> bool:
        return board[square] is None or square == start

    def dfs(square: int, is_king: bool, path: list[int], taken: frozenset[int]) -> list[tuple[list[int], frozenset[int]]]:
        out: list[tuple[list[int], frozenset[int]]] = []
        r, c = divmod(square, 8)
        for dr, dc in DIRS:
            if is_king:
                rr, cc = r + dr, c + dc
                while _inside(rr, cc) and empty(rr * 8 + cc):
                    rr, cc = rr + dr, cc + dc
                if not _inside(rr, cc):
                    continue
                middle = rr * 8 + cc
                if not _enemy(board[middle], color) or middle in taken:
                    continue
                rr, cc = rr + dr, cc + dc
                landings = []
                while _inside(rr, cc) and empty(rr * 8 + cc):
                    landings.append(rr * 8 + cc)
                    rr, cc = rr + dr, cc + dc
                branches = [dfs(land, True, path + [land], taken | {middle}) for land in landings]
                # Алуды жалғастыруға болатын қону ұяшығы бар болса, тек соларға қонуға болады.
                continuing = [b for b in branches if any(len(t) > len(taken) + 1 for _, t in b)]
                for branch in continuing or branches:
                    out += branch
            else:
                mr, mc, lr, lc = r + dr, c + dc, r + 2 * dr, c + 2 * dc
                if not _inside(lr, lc):
                    continue
                middle, land = mr * 8 + mc, lr * 8 + lc
                if _enemy(board[middle], color) and middle not in taken and empty(land):
                    out += dfs(land, lr == _last_row(color), path + [land], taken | {middle})
        if not out and taken:
            out = [(path, taken)]
        return out

    return [{"path": path, "captured": sorted(taken)} for path, taken in dfs(start, king, [start], frozenset())]


def legal_moves(board: list[str | None], color: str) -> list[dict[str, Any]]:
    captures: list[dict[str, Any]] = []
    simple: list[dict[str, Any]] = []
    for square, piece in enumerate(board):
        if piece is None or piece.lower() != color:
            continue
        captures += _capture_paths(board, square, color)
        if captures:
            continue
        r, c = divmod(square, 8)
        if piece.isupper():
            for dr, dc in DIRS:
                rr, cc = r + dr, c + dc
                while _inside(rr, cc) and board[rr * 8 + cc] is None:
                    simple.append({"path": [square, rr * 8 + cc], "captured": []})
                    rr, cc = rr + dr, cc + dc
        else:
            for dc in (-1, 1):
                rr, cc = r + _forward(color), c + dc
                if _inside(rr, cc) and board[rr * 8 + cc] is None:
                    simple.append({"path": [square, rr * 8 + cc], "captured": []})
    return captures or simple


def apply_move(board: list[str | None], move: dict[str, Any]) -> list[str | None]:
    board = list(board)
    path = move["path"]
    piece = board[path[0]]
    board[path[0]] = None
    for square in move["captured"]:
        board[square] = None
    color = piece.lower()
    if piece.islower() and any(square // 8 == _last_row(color) for square in path[1:]):
        piece = piece.upper()
    board[path[-1]] = piece
    return board


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
        "board": initial_board(),
        "turn": 0,
        "phase": "question",
        "question": None,
        "deadline": None,
        "quiet_moves": 0,
        "idle_turns": 0,
        "last": None,
        "winner": None,
        "stats": {p.user_id: {"correct": 0, "captured": 0} for p in order},
    }
    return await _begin_turn(state, ctx)


def _color(state: dict[str, Any], index: int | None = None) -> str:
    return COLORS[state["turn"] if index is None else index]


def _current(state: dict[str, Any]) -> dict[str, Any]:
    return state["players"][state["turn"]]


async def _begin_turn(state: dict[str, Any], ctx: Ctx, log: list[AnswerLog] | None = None) -> Outcome:
    log = list(log or [])
    moves = legal_moves(state["board"], _color(state))
    if not moves:
        return _finish(state, winner=1 - state["turn"], reason="no_moves", log=log)
    player = _current(state)
    if player["bot"]:
        state["phase"] = "bot"
        state["question"] = None
        state["deadline"] = later(ctx.now, BOT_DELAY_S)
        return Outcome(state, log=log)
    capture = bool(moves[0]["captured"])
    question = await take_question(ctx, state, topic_ids=state["topics"],
                                   difficulty=3 if capture else ctx.rng.choice((1, 2)),
                                   viewers=[p["id"] for p in state["players"]])
    state["question"] = ask(question, to=[player["id"]], now=ctx.now, seconds=state["answer_s"], rng=ctx.rng)
    state["phase"] = "question"
    state["deadline"] = state["question"]["deadline"]
    return Outcome(state, log=log + seen_log(state["question"], [p["id"] for p in state["players"]]))


def _finish(state: dict[str, Any], *, winner: int | None, reason: str, log: list[AnswerLog] | None = None) -> Outcome:
    state["phase"] = "finished"
    state["deadline"] = None
    state["question"] = None
    state["winner"] = winner
    state["finish_reason"] = reason
    return Outcome(state, log=list(log or []), finished=True)


async def _next_turn(state: dict[str, Any], ctx: Ctx, log: list[AnswerLog] | None = None) -> Outcome:
    if state["quiet_moves"] >= DRAW_MOVES or state["idle_turns"] >= DRAW_IDLE_TURNS:
        return _finish(state, winner=None, reason="draw", log=log)
    state["turn"] = 1 - state["turn"]
    return await _begin_turn(state, ctx, log)


def _play(state: dict[str, Any], move: dict[str, Any], user_id: str) -> None:
    state["board"] = apply_move(state["board"], move)
    state["last"] = {"seat": _current(state)["seat"], "path": move["path"], "captured": move["captured"]}
    if move["captured"]:
        state["quiet_moves"] = 0
        state["idle_turns"] = 0
        state["stats"][user_id]["captured"] += len(move["captured"])
    else:
        state["quiet_moves"] += 1
        state["idle_turns"] += 1


def _after_move(state: dict[str, Any]) -> int | None:
    """Қарсыластың тасы не жүрісі қалмаса — жеңімпаздың индексі."""
    opponent = 1 - state["turn"]
    if not legal_moves(state["board"], _color(state, opponent)):
        return state["turn"]
    return None


async def act(state: dict[str, Any], user_id: str, action: dict[str, Any], ctx: Ctx) -> Outcome:
    state = clone(state)
    find_player(state, user_id)
    if state["phase"] == "finished":
        raise GameRuleError("FINISHED", "Ойын аяқталды.")
    if _current(state)["id"] != user_id:
        raise GameRuleError("NOT_YOUR_TURN", "Қазір сіздің кезегіңіз емес.")
    kind = action.get("type")
    if kind == "answer" and state["phase"] == "question":
        question = state["question"]
        option = check_option(question, action.get("option"))
        correct = option == question["correct"]
        question["answers"][user_id] = option
        state["last"] = {"seat": _current(state)["seat"], "ok": correct, "chosen": option,
                         "right_option": question["correct"]}
        log = [AnswerLog(question["qid"], user_id, correct)]
        if correct:
            state["stats"][user_id]["correct"] += 1
            state["phase"] = "move"
            state["question"] = None
            state["deadline"] = later(ctx.now, MOVE_S)
            return Outcome(state, log=log)
        state["idle_turns"] += 1
        return await _next_turn(state, ctx, log)
    if kind == "move" and state["phase"] == "move":
        path = action.get("path")
        moves = legal_moves(state["board"], _color(state))
        move = next((m for m in moves if m["path"] == path), None)
        if move is None:
            raise GameRuleError("ILLEGAL_MOVE", "Бұл жүріс ереже бойынша мүмкін емес.", status=422)
        _play(state, move, user_id)
        winner = _after_move(state)
        if winner is not None:
            return _finish(state, winner=winner, reason="win")
        return await _next_turn(state, ctx)
    raise GameRuleError("WRONG_PHASE", "Бұл әрекет қазір қолжетімсіз.")


def bot_move(board: list[str | None], color: str, rng) -> dict[str, Any] | None:
    """Демо-ЖИ (D48): көп тас алатын жүріс; алу жоқ болса — қарсыласқа бірден тас бермейтін жүріс."""
    moves = legal_moves(board, color)
    if not moves:
        return None
    if moves[0]["captured"]:
        best = max(len(m["captured"]) for m in moves)
        return rng.choice([m for m in moves if len(m["captured"]) == best])
    enemy = "b" if color == "w" else "w"
    safe = [m for m in moves if not any(r["captured"] for r in legal_moves(apply_move(board, m), enemy))]
    return rng.choice(safe or moves)


async def timeout(state: dict[str, Any], ctx: Ctx) -> Outcome:
    state = clone(state)
    phase = state["phase"]
    if phase == "finished":
        return Outcome(state)
    player = _current(state)
    if phase == "bot":
        if ctx.rng.random() < 0.7:
            move = bot_move(state["board"], _color(state), ctx.rng)
            if move is not None:
                _play(state, move, BOT_ID)
                winner = _after_move(state)
                if winner is not None:
                    return _finish(state, winner=winner, reason="win")
                return await _next_turn(state, ctx)
        state["idle_turns"] += 1
        state["last"] = {"seat": player["seat"], "ok": False}
        return await _next_turn(state, ctx)
    log = []
    if phase == "question" and state["question"]:
        log = [AnswerLog(state["question"]["qid"], player["id"], None)]
        state["last"] = {"seat": player["seat"], "ok": False, "timeout": True,
                         "right_option": state["question"]["correct"]}
    else:
        state["last"] = {"seat": player["seat"], "timeout": True}
    state["idle_turns"] += 1
    return await _next_turn(state, ctx, log)


async def leave(state: dict[str, Any], user_id: str, ctx: Ctx) -> Outcome:
    state = clone(state)
    player = find_player(state, user_id)
    player["left"] = True
    if state["phase"] == "finished":
        return Outcome(state)
    index = state["players"].index(player)
    return _finish(state, winner=1 - index, reason="opponent_left")


def deadline(state: dict[str, Any]):
    return parse_time(state["deadline"]) if state["phase"] != "finished" else None


def results(state: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for index, p in enumerate(state["players"]):
        place = 1 if state["winner"] in (None, index) else 2
        rows.append({"user_id": p["id"], "name": p["name"], "place": place, "bot": p["bot"],
                     "right_answers": state["stats"][p["id"]]["correct"],
                     "captured": state["stats"][p["id"]]["captured"]})
    return sorted(rows, key=lambda r: r["place"])


def public_view(state: dict[str, Any]) -> dict[str, Any]:
    view = {
        "game": GAME_TYPE,
        "labels": state["labels"],
        "board": [p or "" for p in state["board"]],
        "players": [{"id": p["id"], "seat": p["seat"], "name": p["name"], "bot": p["bot"], "left": p["left"],
                     "color": COLORS[i]} for i, p in enumerate(state["players"])],
        "turn_seat": _current(state)["seat"],
        "phase": state["phase"],
        "deadline": state["deadline"],
        "question": public_question(state["question"]),
        "last": state["last"],
        "quiet_moves": state["quiet_moves"],
        "draw_moves": DRAW_MOVES,
        "winner_seat": state["players"][state["winner"]]["seat"] if state["winner"] is not None else None,
        "finish_reason": state.get("finish_reason"),
    }
    if state["phase"] == "finished":
        view["results"] = [{k: v for k, v in r.items() if k != "user_id"} for r in results(state)]
    return strip_secrets(view)


def private_view(state: dict[str, Any], user_id: str) -> dict[str, Any]:
    ids = [p["id"] for p in state["players"]]
    if user_id not in ids:
        return {}
    index = ids.index(user_id)
    mine = state["phase"] == "move" and state["turn"] == index
    return {"color": COLORS[index], "moves": [m["path"] for m in legal_moves(state["board"], COLORS[index])] if mine else []}
