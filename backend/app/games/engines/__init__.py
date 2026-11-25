"""Ойын қозғалтқыштары (geimifikatsiya §2, D42, D99). Бәрінің интерфейсі бірдей: settings, start, act, timeout,
leave, deadline, results, public_view, private_view."""

from types import ModuleType

from . import auction, baige, battleship, checkers, conquest, debate, escape_room, fact_check

ENGINES: dict[str, ModuleType] = {
    conquest.GAME_TYPE: conquest,
    checkers.GAME_TYPE: checkers,
    battleship.GAME_TYPE: battleship,
    debate.GAME_TYPE: debate,
    baige.GAME_TYPE: baige,
    auction.GAME_TYPE: auction,
    fact_check.GAME_TYPE: fact_check,
    escape_room.GAME_TYPE: escape_room,
}

# Ойын режимдері: multi — код/QR арқылы; bot — демо-ЖИ (D48); solo — жеке жаттығу (D55, D99).
MODES: dict[str, frozenset[str]] = {
    "conquest": frozenset({"multi"}),
    "checkers": frozenset({"multi", "bot"}),
    "battleship": frozenset({"multi", "bot"}),
    "debate": frozenset({"multi"}),
    "baige": frozenset({"multi", "solo"}),
    "auction": frozenset({"multi", "solo"}),
    "fact_check": frozenset({"multi", "solo"}),
    "escape_room": frozenset({"multi", "solo"}),
}

# Бөлмені ашу үшін масштабта керек тесттің ең аз саны (ойын бір сұрақты қайталамауы үшін, D45).
MIN_BANK: dict[str, int] = {"conquest": 12, "checkers": 10, "battleship": 10, "baige": 10, "debate": 0,
                            "auction": 10, "fact_check": 10, "escape_room": 10}


def deck_format(game_type: str) -> str:
    """«Кез келген тақырып» кэшінде ойынға сай пішін (D99): mcq ойындары — mcq, басқалары — өз пішіні + mcq."""
    return getattr(ENGINES[game_type], "DECK_FORMAT", "mcq")
