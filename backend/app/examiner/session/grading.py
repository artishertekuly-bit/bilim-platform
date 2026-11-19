"""Код форматтарының жауабын тексеру (bagalau §4.1, Т1; api §3.4).

Код тек сәйкестікті шешеді: жауап кілтке нақты сәйкес келсе `c = 1`, әйтпесе `c = 0`, ал `s = 4·c`.
Жауаптың пішімі тапсырманың `content`-імен салыстырылады: бөтен id немесе толық емес жауап —
`AnswerInvalid` (API-да 400 VALIDATION_ERROR), ол қате жауап деп есептелмейді.
"""

from __future__ import annotations

import math
from collections import Counter
from collections.abc import Mapping
from typing import Any


class AnswerInvalid(ValueError):
    """Жауаптың пішімі тапсырмаға сәйкес емес."""


def _ids(items: Any, key: str = "id") -> list[str]:
    return [str(item[key]) for item in items or []]


def _require(answer: Mapping[str, Any], field: str) -> Any:
    if field not in answer:
        raise AnswerInvalid(f"Жауапта «{field}» өрісі жоқ")
    return answer[field]


def _mcq(content: Mapping, key: Mapping, answer: Mapping) -> int:
    option = _require(answer, "option_id")
    if option not in _ids(content.get("options")):
        raise AnswerInvalid("Мұндай нұсқа жоқ")
    return int(option == key["correct_option_id"])


def _matching(content: Mapping, key: Mapping, answer: Mapping) -> int:
    pairs = _require(answer, "pairs")
    if not isinstance(pairs, list):
        raise AnswerInvalid("pairs тізім болуы керек")
    left, right = _ids(content.get("left")), _ids(content.get("right"))
    try:
        given = [(str(pair["left_id"]), str(pair["right_id"])) for pair in pairs]
    except (TypeError, KeyError) as exc:
        raise AnswerInvalid("Әр жұпта left_id мен right_id болуы керек") from exc
    if sorted(left_id for left_id, _ in given) != sorted(left):
        raise AnswerInvalid("Сол жақтағы әр элемент дәл бір рет жұпталуы керек")
    rights = [right_id for _, right_id in given]
    if len(set(rights)) != len(rights) or not set(rights) <= set(right):
        raise AnswerInvalid("Оң жақтағы элемент бір-ақ рет қолданылады")
    expected = {(pair["left_id"], pair["right_id"]) for pair in key["pairs"]}
    return int(set(given) == expected)


def _sequence(content: Mapping, key: Mapping, answer: Mapping) -> int:
    order = _require(answer, "order")
    if not isinstance(order, list) or sorted(map(str, order)) != sorted(_ids(content.get("steps"))):
        raise AnswerInvalid("order барлық қадамды бір-бір реттен қамтуы керек")
    return int([str(step) for step in order] == list(key["order"]))


def _error_step(content: Mapping, key: Mapping, answer: Mapping) -> int:
    step = _require(answer, "step_id")
    if step not in _ids(content.get("steps")):
        raise AnswerInvalid("Мұндай қадам жоқ")
    return int(step == key["step_id"])


def _formula(content: Mapping, key: Mapping, answer: Mapping) -> int:
    placement = _require(answer, "placement")
    if not isinstance(placement, dict):
        raise AnswerInvalid("placement объект болуы керек")
    slots, tokens = _ids(content.get("slots")), set(_ids(content.get("tokens")))
    if sorted(placement) != sorted(slots):
        raise AnswerInvalid("Барлық орын толтырылуы керек")
    used = [str(token) for token in placement.values()]
    if len(set(used)) != len(used) or not set(used) <= tokens:
        raise AnswerInvalid("Әр шама бір-ақ рет қолданылады")
    expected: Mapping[str, str] = key["placement"]
    grouped = {slot for group in key.get("commutative_groups", []) for slot in group}
    for group in key.get("commutative_groups", []):
        # Көбейтудің ретін ауыстыруға болады: топтағы шамалардың жиыны сәйкес келсе жеткілікті.
        if Counter(str(placement[slot]) for slot in group) != Counter(expected[slot] for slot in group):
            return 0
    return int(all(str(placement[slot]) == expected[slot] for slot in slots if slot not in grouped))


def _slider(content: Mapping, key: Mapping, answer: Mapping) -> int:
    value = _require(answer, "value")
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise AnswerInvalid("value сан болуы керек")
    spec = content.get("input") or {}
    eps = abs(float(spec.get("step", 0) or 0)) * 1e-6 + 1e-9
    if not float(spec["min"]) - eps <= value <= float(spec["max"]) + eps:
        raise AnswerInvalid("Мән слайдердің шегінен шығады")
    return int(float(key["accept_min"]) - eps <= value <= float(key["accept_max"]) + eps)


CHECKERS = {
    "mcq": _mcq,
    "matching": _matching,
    "sequence": _sequence,
    "error_step": _error_step,
    "formula_builder": _formula,
    "slider": _slider,
}


def check_answer(fmt: str, content: Mapping[str, Any], key: Mapping[str, Any], answer: Any) -> int:
    """`c ∈ {0, 1}`. Пішімі сәйкес келмесе — AnswerInvalid."""
    checker = CHECKERS.get(fmt)
    if checker is None:
        raise AnswerInvalid(f"«{fmt}» форматын код тексермейді")
    if not isinstance(answer, Mapping):
        raise AnswerInvalid("answer объект болуы керек")
    return checker(content, key, answer)


def check_hybrid_answer(
    fmt: str, content: Mapping[str, Any], key: Mapping[str, Any], answer: Any
) -> tuple[int, str | None]:
    """Гибрид форматтар (true_false_fix, priority): код `c ∈ {0, 1}` және ЖИ тексеретін мәтінді қайтарады."""
    if not isinstance(answer, Mapping):
        raise AnswerInvalid("answer объект болуы керек")
    if fmt == "true_false_fix":
        verdict = _require(answer, "verdict")
        if not isinstance(verdict, bool):
            raise AnswerInvalid("verdict boolean (true/false) болуы керек")
        expected = bool(key["is_true"])
        c = int(verdict is expected)
        if c == 1 and not expected:
            correction = answer.get("correction")
            if not isinstance(correction, str) or len(correction) > 2000:
                raise AnswerInvalid("correction жол болуы керек")
            return 1, correction
        return c, None
    if fmt == "priority":
        ranking = _require(answer, "ranking")
        option_ids = _ids(content.get("options"))
        if not isinstance(ranking, list) or sorted(map(str, ranking)) != sorted(option_ids):
            raise AnswerInvalid("ranking барлық нұсқаны бір-бір реттен қамтуы керек")
        justification = _require(answer, "justification")
        if not isinstance(justification, str) or len(justification) > 3000:
            raise AnswerInvalid("justification жол болуы керек")
        accepted = [[str(x) for x in item] for item in key.get("accepted_rankings") or []]
        c = int([str(x) for x in ranking] in accepted)
        return c, justification if c == 1 else None
    raise AnswerInvalid(f"«{fmt}» гибрид форматы емес")


def extract_text_answer(fmt: str, answer: Any) -> str:
    """Ашық ЖИ форматтарынан (`short_answer`, `feynman`, `case_study`) мәтінді алады."""
    if not isinstance(answer, Mapping):
        raise AnswerInvalid("answer объект болуы керек")
    if fmt not in {"short_answer", "feynman", "case_study"}:
        raise AnswerInvalid(f"«{fmt}» мәтіндік жауап күтпейді")
    text = _require(answer, "text")
    if not isinstance(text, str) or len(text) > 8000:
        raise AnswerInvalid("text жол (8000 таңбаға дейін) болуы керек")
    return text
