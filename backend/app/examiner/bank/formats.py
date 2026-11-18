"""Код форматтарының сұрақ пакеті (bagalau-zhuiesi.md §3, Т6; api-kelisimderi.md §3.4).

Модель әр формат үшін бір JSON қайтарады (`*Gen` модельдері). Ол:
  * Т6 және детерминистік Т7 бойынша тексеріледі (`problems`);
  * `public` бөлік (клиентке баратын `content`) пен `private` бөлікке (`key`) бөлінеді (`to_package`).

Нұсқалар мен қадамдар серверде араластырылады: модель дұрыс жауапты көбіне бірінші орынға
қояды, ал оқушы үлгіні көрмеуі керек.
"""

from __future__ import annotations

import random
import re
import unicodedata
from dataclasses import dataclass
from typing import Any, ClassVar

from pydantic import BaseModel, ConfigDict, Field

# 1–2-деңгейдің код форматтары (ai_examiner §3). Қалғандары ЖИ немесе гибрид, олар 5-қадамда.
CODE_FORMATS: tuple[str, ...] = ("mcq", "matching", "sequence", "error_step", "formula_builder", "slider")

FORMAT_LEVEL: dict[str, int] = {
    "mcq": 1,
    "matching": 1,
    "short_answer": 1,
    "sequence": 2,
    "true_false_fix": 2,
    "error_step": 2,
    "formula_builder": 2,
    "slider": 2,
    "socratic": 3,
    "feynman": 3,
    "teach_ai": 3,
    "priority": 4,
    "case_study": 4,
}


def normalize_text(text: str) -> str:
    """Салыстыру үшін: Unicode NFC, кіші әріп, тырнақша мен сызықша бірізді, бос орын біреу."""
    text = unicodedata.normalize("NFC", text).casefold()
    text = re.sub(r"[«»“”„\"']", '"', text)
    text = re.sub(r"[–—−]", "-", text)
    return re.sub(r"\s+", " ", text).strip()


@dataclass(frozen=True)
class Package:
    """Банкке жазылатын пакет. `content` — public, қалғаны — private (bagalau §3.2)."""

    format: str
    content: dict[str, Any]
    key: dict[str, Any]
    ecd_skill: str
    evidence: str
    support_quote: str

    @property
    def ecd_evidence(self) -> dict[str, Any]:
        return {"code_check_target": self.key, "evidence": self.evidence, "support_quote": self.support_quote}

    def similarity_text(self) -> str:
        """Т7 қайталау тексеруіне арналған мәтін: сұрақ пен оның элементтері.
        Тізім элементтері сұрыпталады: араластырудың реті ұқсастыққа әсер етпейді."""

        def walk(value: Any) -> list[str]:
            if isinstance(value, str):
                return [value.strip()] if value.strip() else []
            if isinstance(value, dict):
                return [part for key in sorted(value) if key not in {"id", "position", "min", "max", "step"}
                        for part in walk(value[key])]
            if isinstance(value, list):
                return sorted(" ".join(walk(item)) for item in value)
            return []

        return "\n".join(walk(self.content))


class GenBase(BaseModel):
    """Барлық форматқа ортақ өрістер: ECD жұбы (bagalau §1) және оқулықтан дәйексөз (Т7)."""

    model_config = ConfigDict(extra="ignore")

    format_name: ClassVar[str]

    ecd_skill: str = Field(description="Тапсырма тексеретін дағды, бір сөйлем.")
    evidence: str = Field(description="Дұрыс жауап оқушының қандай білімін дәлелдейді, бір сөйлем.")
    support_quote: str = Field(
        description="Дұрыс жауапты растайтын үзінді: оқулық мәтінінен өзгертпей көшірілген 1–2 сөйлем."
    )

    def common_problems(self) -> list[str]:
        problems = []
        if not self.ecd_skill.strip():
            problems.append("Т6: ecd_skill бос")
        if not self.evidence.strip():
            problems.append("Т6: evidence бос")
        if len(self.support_quote.strip()) < 15:
            problems.append("Т7: support_quote тым қысқа")
        return problems

    def problems(self) -> list[str]:
        raise NotImplementedError

    def to_package(self, rng: random.Random) -> Package:
        raise NotImplementedError

    def _package(self, content: dict[str, Any], key: dict[str, Any]) -> Package:
        return Package(
            format=self.format_name,
            content=content,
            key=key,
            ecd_skill=self.ecd_skill.strip(),
            evidence=self.evidence.strip(),
            support_quote=self.support_quote.strip(),
        )


def _length_problems(items: list[str], limit: int, label: str) -> list[str]:
    problems = []
    for index, item in enumerate(items, start=1):
        if not item.strip():
            problems.append(f"Т6: {label} {index} бос")
        elif len(item.strip()) > limit:
            problems.append(f"Т6: {label} {index} {limit} таңбадан ұзын")
    return problems


def _duplicates(items: list[str], label: str) -> list[str]:
    seen = [normalize_text(item) for item in items]
    return [f"Т7: {label} қайталанады"] if len(set(seen)) != len(seen) else []


def _shuffle_not_identity(items: list[Any], rng: random.Random) -> list[int]:
    """Индекстердің араласқан реті; 2 және одан көп элементте бастапқы ретпен сәйкес келмейді."""
    order = list(range(len(items)))
    if len(order) < 2:
        return order
    while True:
        rng.shuffle(order)
        if order != sorted(order):
            return order


# Телефон экранына арналған шектер. Т6 кестесінде жоқ форматтардың шегі — бастапқы мән.
STEM_LIMIT = 400


class MCQGen(GenBase):
    """8 · Кәдімгі тест: 4 нұсқа, біреуі дұрыс."""

    format_name: ClassVar[str] = "mcq"
    OPTION_LIMIT: ClassVar[int] = 150

    stem: str = Field(description="Сұрақ мәтіні.")
    options: list[str] = Field(description="Дәл 4 нұсқа.")
    correct_index: int = Field(description="Дұрыс нұсқаның индексі, 0-ден басталады.")

    def problems(self) -> list[str]:
        problems = self.common_problems()
        if not self.stem.strip():
            problems.append("Т6: stem бос")
        elif len(self.stem) > STEM_LIMIT:
            problems.append(f"Т6: stem {STEM_LIMIT} таңбадан ұзын")
        if len(self.options) != 4:
            problems.append("Т6: нұсқа саны 4 емес")
        problems += _length_problems(self.options, self.OPTION_LIMIT, "нұсқа")
        problems += _duplicates(self.options, "нұсқа")
        if not 0 <= self.correct_index < len(self.options):
            problems.append("Т6: correct_index нұсқалар аралығында емес")
        return problems

    def to_package(self, rng: random.Random) -> Package:
        order = list(range(len(self.options)))
        rng.shuffle(order)
        ids = ["a", "b", "c", "d", "e", "f"][: len(order)]
        options = [{"id": ids[pos], "text": self.options[src].strip()} for pos, src in enumerate(order)]
        correct = ids[order.index(self.correct_index)]
        return self._package({"stem": self.stem.strip(), "options": options}, {"correct_option_id": correct})


class MatchingPair(BaseModel):
    model_config = ConfigDict(extra="ignore")

    left: str = Field(description="Сол жақ элемент, 20 таңбаға дейін.")
    right: str = Field(description="Оң жақ элемент, 20 таңбаға дейін.")


class MatchingGen(GenBase):
    """I-1 · Сәйкестендіру: ≤ 5 жұп, әр элемент ≤ 20 таңба (Т6)."""

    format_name: ClassVar[str] = "matching"
    ITEM_LIMIT: ClassVar[int] = 20

    stem: str = Field(description="Тапсырманың нұсқауы.")
    pairs: list[MatchingPair] = Field(description="3–5 дұрыс жұп.")

    def problems(self) -> list[str]:
        problems = self.common_problems()
        if not self.stem.strip():
            problems.append("Т6: stem бос")
        if not 3 <= len(self.pairs) <= 5:
            problems.append("Т6: жұп саны 3–5 емес")
        lefts = [pair.left for pair in self.pairs]
        rights = [pair.right for pair in self.pairs]
        problems += _length_problems(lefts, self.ITEM_LIMIT, "сол элемент")
        problems += _length_problems(rights, self.ITEM_LIMIT, "оң элемент")
        problems += _duplicates(lefts, "сол элемент")
        problems += _duplicates(rights, "оң элемент")
        return problems

    def to_package(self, rng: random.Random) -> Package:
        left = [{"id": f"l{i + 1}", "text": pair.left.strip()} for i, pair in enumerate(self.pairs)]
        order = _shuffle_not_identity(self.pairs, rng)
        right = [{"id": f"r{pos + 1}", "text": self.pairs[src].right.strip()} for pos, src in enumerate(order)]
        pairs = [{"left_id": f"l{src + 1}", "right_id": f"r{pos + 1}"} for pos, src in enumerate(order)]
        pairs.sort(key=lambda pair: int(pair["left_id"][1:]))
        return self._package({"stem": self.stem.strip(), "left": left, "right": right}, {"pairs": pairs})


class SequenceGen(GenBase):
    """6 · Алгоритмдік (хронологиялық) реттілік: ≤ 6 қадам, әр қадам ≤ 70 таңба (Т6)."""

    format_name: ClassVar[str] = "sequence"
    STEP_LIMIT: ClassVar[int] = 70

    stem: str = Field(description="Тапсырманың нұсқауы.")
    steps: list[str] = Field(description="3–6 қадам, ДҰРЫС ретпен.")

    def problems(self) -> list[str]:
        problems = self.common_problems()
        if not self.stem.strip():
            problems.append("Т6: stem бос")
        if not 3 <= len(self.steps) <= 6:
            problems.append("Т6: қадам саны 3–6 емес")
        problems += _length_problems(self.steps, self.STEP_LIMIT, "қадам")
        problems += _duplicates(self.steps, "қадам")
        return problems

    def to_package(self, rng: random.Random) -> Package:
        order = _shuffle_not_identity(self.steps, rng)
        steps = [{"id": f"s{pos + 1}", "text": self.steps[src].strip()} for pos, src in enumerate(order)]
        correct = [f"s{order.index(src) + 1}" for src in range(len(self.steps))]
        return self._package({"stem": self.stem.strip(), "steps": steps}, {"order": correct})


class ErrorStepGen(GenBase):
    """I-2 (Ә) · Қате қадам: пайымдау тізбегінде дәл бір қадам қате."""

    format_name: ClassVar[str] = "error_step"
    STEP_LIMIT: ClassVar[int] = 140

    stem: str = Field(description="Тапсырманың нұсқауы.")
    steps: list[str] = Field(description="3–6 қадамнан тұратын пайымдау; біреуі қате.")
    error_index: int = Field(description="Қате қадамның индексі, 0-ден басталады.")
    correction: str = Field(description="Қате қадамның дұрыс нұсқасы.")

    def problems(self) -> list[str]:
        problems = self.common_problems()
        if not self.stem.strip():
            problems.append("Т6: stem бос")
        if not 3 <= len(self.steps) <= 6:
            problems.append("Т6: қадам саны 3–6 емес")
        problems += _length_problems(self.steps, self.STEP_LIMIT, "қадам")
        problems += _duplicates(self.steps, "қадам")
        if not 0 <= self.error_index < len(self.steps):
            problems.append("Т6: error_index қадамдар аралығында емес")
        elif normalize_text(self.correction) == normalize_text(self.steps[self.error_index]):
            problems.append("Т7: түзету қате қадаммен бірдей")
        if not self.correction.strip():
            problems.append("Т6: correction бос")
        return problems

    def to_package(self, rng: random.Random) -> Package:
        steps = [{"id": f"e{i + 1}", "text": step.strip()} for i, step in enumerate(self.steps)]
        key = {"step_id": f"e{self.error_index + 1}", "correction": self.correction.strip()}
        return self._package({"stem": self.stem.strip(), "steps": steps}, key)


class FormulaGen(GenBase):
    """I-3 (Б) · Формула конструкторы: бір қарапайым бөлшек, ≤ 6 шама (Т6)."""

    format_name: ClassVar[str] = "formula_builder"
    TOKEN_LIMIT: ClassVar[int] = 12
    MAX_TOKENS: ClassVar[int] = 6

    stem: str = Field(description="Тапсырманың нұсқауы.")
    result: str = Field(description="Теңдіктің сол жағындағы шама, мысалы I.")
    numerator: list[str] = Field(description="Алымдағы 1–2 шама.")
    denominator: list[str] = Field(description="Бөлімдегі 0–2 шама; бөлшек болмаса — бос.")
    distractors: list[str] = Field(description="Артық (алдағыш) шамалар.")

    def problems(self) -> list[str]:
        problems = self.common_problems()
        if not self.stem.strip():
            problems.append("Т6: stem бос")
        if not self.result.strip():
            problems.append("Т6: result бос")
        if not 1 <= len(self.numerator) <= 2:
            problems.append("Т6: алымда 1–2 шама болуы керек")
        if len(self.denominator) > 2:
            problems.append("Т6: бөлімде 2-ден көп шама")
        tokens = self.numerator + self.denominator + self.distractors
        if len(tokens) > self.MAX_TOKENS:
            problems.append(f"Т6: шама саны {self.MAX_TOKENS}-дан көп")
        if not self.distractors:
            problems.append("Т6: алдағыш шама жоқ")
        problems += _length_problems(tokens, self.TOKEN_LIMIT, "шама")
        problems += _duplicates(tokens, "шама")
        return problems

    def to_package(self, rng: random.Random) -> Package:
        slots = [{"id": f"num_{i + 1}", "position": "numerator"} for i in range(len(self.numerator))]
        slots += [{"id": f"den_{i + 1}", "position": "denominator"} for i in range(len(self.denominator))]
        labels = self.numerator + self.denominator + self.distractors
        order = list(range(len(labels)))
        rng.shuffle(order)
        tokens = [{"id": f"t{pos + 1}", "label": labels[src].strip()} for pos, src in enumerate(order)]
        token_of = {src: f"t{pos + 1}" for pos, src in enumerate(order)}
        placement = {slot["id"]: token_of[index] for index, slot in enumerate(slots)}
        # Көбейтудің ретін ауыстыруға болады: алымдағы немесе бөлімдегі шамалардың орны ауысса да дұрыс.
        groups = [[slot["id"] for slot in slots if slot["position"] == position]
                  for position in ("numerator", "denominator")]
        key = {"placement": placement, "commutative_groups": [group for group in groups if len(group) > 1]}
        content = {"stem": self.stem.strip(), "result": self.result.strip(), "slots": slots, "tokens": tokens}
        return self._package(content, key)


class SliderGen(GenBase):
    """I-4 (Г) · Симуляциялық слайдер: кілт — рұқсат етілген интервал (Т1, Т6)."""

    format_name: ClassVar[str] = "slider"
    MAX_POSITIONS: ClassVar[int] = 200

    stem: str = Field(description="Тапсырма: қандай шартқа жету керек.")
    input_name: str
    input_unit: str
    min: float
    max: float
    step: float
    output_name: str
    output_unit: str
    formula: str = Field(description="Экранда көрсетілетін формула, мысалы I = 12 / R.")
    accept_min: float = Field(description="Дұрыс интервалдың төменгі шегі (кіріс шамасы бойынша).")
    accept_max: float = Field(description="Дұрыс интервалдың жоғарғы шегі.")

    def problems(self) -> list[str]:
        problems = self.common_problems()
        if not self.stem.strip():
            problems.append("Т6: stem бос")
        if not self.min < self.max:
            problems.append("Т7: min < max емес")
            return problems
        if self.step <= 0:
            problems.append("Т6: step оң емес")
            return problems
        span = self.max - self.min
        if span / self.step > self.MAX_POSITIONS:
            problems.append(f"Т6: слайдерде {self.MAX_POSITIONS}-ден көп орын")
        if not self.accept_min <= self.accept_max:
            problems.append("Т7: accept_min > accept_max")
        if self.accept_min < self.min or self.accept_max > self.max:
            problems.append("Т7: дұрыс интервал слайдердің шегінен шығады")
        if self.accept_max - self.accept_min < self.step:
            problems.append("Т6: дұрыс интервалдың ені слайдер қадамынан кем")
        if self.accept_max - self.accept_min > span / 2:
            problems.append("Т7: дұрыс интервал слайдердің жартысынан кең")
        return problems

    def to_package(self, rng: random.Random) -> Package:
        content = {
            "stem": self.stem.strip(),
            "input": {"name": self.input_name.strip(), "unit": self.input_unit.strip(),
                      "min": self.min, "max": self.max, "step": self.step},
            "output": {"name": self.output_name.strip(), "unit": self.output_unit.strip(),
                       "formula": self.formula.strip()},
        }
        return self._package(content, {"accept_min": self.accept_min, "accept_max": self.accept_max})


GEN_MODELS: dict[str, type[GenBase]] = {
    model.format_name: model
    for model in (MCQGen, MatchingGen, SequenceGen, ErrorStepGen, FormulaGen, SliderGen)
}
