"""Бес ойынның қозғалтқышы (geimifikatsiya §2, D42). Бәрінің интерфейсі бірдей: settings, start, act, timeout,
leave, deadline, results, public_view, private_view."""

from types import ModuleType

from . import baige, battleship, checkers, conquest, debate

ENGINES: dict[str, ModuleType] = {
    conquest.GAME_TYPE: conquest,
    checkers.GAME_TYPE: checkers,
    battleship.GAME_TYPE: battleship,
    debate.GAME_TYPE: debate,
    baige.GAME_TYPE: baige,
}

# Ойын режимдері: multi — код/QR арқылы; bot — демо-ЖИ (D48); solo — Бәйгенің жеке жаттығуы (D55).
MODES: dict[str, frozenset[str]] = {
    "conquest": frozenset({"multi"}),
    "checkers": frozenset({"multi", "bot"}),
    "battleship": frozenset({"multi", "bot"}),
    "debate": frozenset({"multi"}),
    "baige": frozenset({"multi", "solo"}),
}

# Бөлмені ашу үшін масштабта керек тесттің ең аз саны (ойын бір сұрақты қайталамауы үшін, D45).
MIN_BANK: dict[str, int] = {"conquest": 12, "checkers": 10, "battleship": 10, "baige": 10, "debate": 0}
