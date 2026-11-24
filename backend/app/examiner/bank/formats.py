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

# 1–2-деңгейдің код форматтары (ai_examiner §3). Қалғандары гибрид немесе ЖИ (5-қадам).
CODE_FORMATS: tuple[str, ...] = ("mcq", "matching", "sequence", "error_step", "formula_builder", "slider")
HYBRID_FORMATS: tuple[str, ...] = ("true_false_fix", "priority")
AI_FORMATS: tuple[str, ...] = ("short_answer", "socratic", "feynman", "teach_ai", "case_study")
DIALOG_FORMATS: tuple[str, ...] = ("socratic", "teach_ai")
CACHEABLE_TEXT_FORMATS: tuple[str, ...] = ("short_answer", "true_false_fix", "priority")
ALL_FORMATS: tuple[str, ...] = CODE_FORMATS + HYBRID_FORMATS + AI_FORMATS
CONCEPT_BOUND_FORMATS: frozenset[str] = frozenset({"mcq", *HYBRID_FORMATS, *AI_FORMATS})

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

# Т6 деиксисінде мәтінге емес, тапсырманың өзіне сілтеу (D81): «Бұл тапсырмада…» — кез келген форматта.
TASK_SELF_REFERENCES: frozenset[str] = frozenset({"тапсырма"})


# OCR тасымалы (D80): «иуда-\n\nизм» → «иудаизм». Тек жол соңындағы дефис және екі жағында да әріп:
# «1946–\n1974», «Беғазы-Дәндібай» өзгермейді. Жұмсақ тасымал белгісі (U+00AD) әрқашан алынады.
_OCR_HYPHEN = re.compile(r"(?<=[^\W\d_])-[ \t]*\r?\n\s*(?=[^\W\d_])")
# Жол ішіндегі тасымал (D94): «губерния- сында», «аударыл- ған» (OCR жолды біріктіріп, бос орнын қалдырған),
# модель де «дүние-\nжүзілік»-ті «дүние- жүзілік» деп көшіреді. Дефистен кейін бос орын мен кіші әріп болса ғана:
# «Солтүстік- Батыс», «1946- 1974», «Орал - Каспий» өзгермейді.
_SPACED_HYPHEN = re.compile(r"(?<=[^\W\d_])-[ \t]+(?=[^\W\d_])")


def _join_spaced_hyphen(match: re.Match[str]) -> str:
    return "" if match.string[match.end()].islower() else match.group(0)


def normalize_text(text: str) -> str:
    """Салыстыру үшін: Unicode NFC, OCR тасымалы біріктірілген, кіші әріп, тырнақша мен сызықша бірізді,
    бос орын біреу. Тасымал сызықшаларды бірізді етпей тұрып біріктіріледі: жол соңындағы «–» (күн
    аралығы) тасымал емес (D79, D80, D94)."""
    text = unicodedata.normalize("NFC", text).replace("\u00ad", "")
    text = _OCR_HYPHEN.sub("", text)
    text = _SPACED_HYPHEN.sub(_join_spaced_hyphen, text).casefold()
    text = re.sub(r"[«»“”„\"']", '"', text)
    text = re.sub(r"[–—−]", "-", text)
    return re.sub(r"\s+", " ", text).strip()


# Сөз түбірі (D80): алғашқы STEM_CHARS әріп. Қазақ тіліндегі жалғау сөзді басқа етпейді:
# «дәуіріндегі» / «дәуірінде», «жайылымды» / «жайылымдық».
STEM_CHARS = 5


def word_stems(text: str) -> set[str]:
    return {word[:STEM_CHARS] for word in re.findall(r"\w+", normalize_text(text))}


@dataclass(frozen=True)
class Package:
    """Банкке жазылатын пакет. `content` — public, қалғаны — private (bagalau §3.2)."""

    format: str
    content: dict[str, Any]
    key: dict[str, Any]
    ecd_skill: str
    evidence: str
    support_quote: str
    rubric_0_4: list[dict[str, Any]] | None = None
    socratic_checkpoints: list[dict[str, Any]] | None = None

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
    # Т6 деиксисінде мәтінге емес, тапсырманың өз бөлігіне сілтеу (D81): «бұл тапсырма», «бұл диалог» т.б.
    SELF_REFERENCES: ClassVar[frozenset[str]] = TASK_SELF_REFERENCES

    ecd_skill: str = Field(description="Тапсырма тексеретін дағды, бір сөйлем.")
    evidence: str = Field(description="Дұрыс жауап оқушының қандай білімін дәлелдейді, бір сөйлем.")
    support_quote: str = Field(
        description="Дұрыс жауапты растайтын үзінді: оқулық мәтінінен өзгертпей көшірілген 1–2 сөйлем."
    )

    def common_problems(self) -> list[str]:
        problems = []
        context = _text_reference_problem(getattr(self, "stem", ""), self.SELF_REFERENCES)
        if context:
            problems.append(context)
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

    def _package(
        self,
        content: dict[str, Any],
        key: dict[str, Any],
        *,
        rubric_0_4: list[dict[str, Any]] | None = None,
        socratic_checkpoints: list[dict[str, Any]] | None = None,
    ) -> Package:
        return Package(
            format=self.format_name,
            content=content,
            key=key,
            ecd_skill=self.ecd_skill.strip(),
            evidence=self.evidence.strip(),
            support_quote=self.support_quote.strip(),
            rubric_0_4=rubric_0_4,
            socratic_checkpoints=socratic_checkpoints,
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

# Тесттің сыртқы белгілері (Т6, D72): оқушы сұрақты білмей-ақ дұрыс нұсқаны таппауы керек.
# Дұрыс нұсқа ең ұзын нұсқадан осыдан көп ұзын болса — белгі. Қысқа нұсқаларда (есім, жыл) айырма
# салыстырмалы түрде үлкен болып көрінеді, сондықтан ең аз шек таңбамен де беріледі.
LENGTH_CUE_RATIO = 0.15
LENGTH_CUE_MIN_CHARS = 8
# Абсолютті сөздер: олар тек қате нұсқаларда тұрса, «тек»-тен басталмаған нұсқа дұрыс екені білініп қалады.
ABSOLUTE_WORDS = frozenset({
    "тек", "ғана", "ешқашан", "әрқашан", "үнемі", "барлық", "барлығы", "бәрі", "мүлдем", "ешқандай", "ешбір",
})


# Сұрақтағы сөз тек дұрыс нұсқада қайталанса («палеолиттің кезеңі?» → «Ерте палеолит»), жауап білініп қалады.
# Сұрақ сөздері мен жиі қызметші сөздер салыстырылмайды.
ECHO_MIN_WORD = 4
ECHO_STOPWORDS = frozenset({
    "қандай", "қалай", "қайсы", "қайсысы", "қашан", "неліктен", "неге", "туралы", "бойынша", "және", "немесе",
    "деген", "дегеніміз", "болды", "болған", "болып", "арқылы", "кезде", "кезінде", "үшін", "мына", "осы",
})


def _words(text: str) -> set[str]:
    return set(re.findall(r"\w+", normalize_text(text)))


# Оқушы мәтінді көрмейді (D77): сұрақ мәтінге сілтемесіз түсінікті болуы керек.
#   * «мәтінде», «мәтін бойынша», «үзіндіде», «жоғарыдағы», «бұған дейін» — кез келген жерде;
#   * «бұл кезең», «осы тайпалар» — тек бірінші сөйлемде: екінші сөйлемдегі «бұл» сұрақтың өз
#     сөйлеміне сілтейді («Б.з.б. 529 жылы Кир жорық жасады. Бұл жорық немен аяқталды?»).
# «Аталған» тізімде жоқ: «қалай аталған?» — қалыпты сұрақ.
# Тапсырманың өз бөлігіне сілтеу мәтінге сілтеу емес (D81): «Бұл тапсырмада…» — кез келген форматта, «Бұл
# диалогта…», «Бұл ұғымды…», «Бұл жағдайда…» — сол бөлігі оқушыға көрсетілетін форматта (`SELF_REFERENCES`).
TEXT_REFERENCE = re.compile(
    r"(?<![\w-])(мәтін|мәтінде|мәтіндегі|мәтіннен|мәтінге|үзінді|үзіндіде|үзіндідегі|үзіндіден"
    r"|жоғарыда|жоғарыдағы|бұған дейін|бұдан бұрын)(?![\w-])",
    re.IGNORECASE,
)
DEIXIS = re.compile(r"(?<![\w-])(бұл|осы|мұндағы)\s+(\w+)", re.IGNORECASE)
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


def _text_reference_problem(stem: str, self_references: frozenset[str] = TASK_SELF_REFERENCES) -> str | None:
    text = unicodedata.normalize("NFC", stem or "").strip()
    if not text:
        return None
    first_sentence = _SENTENCE_END.split(text, maxsplit=1)[0]
    deixis = [
        match for match in DEIXIS.finditer(first_sentence)
        if not any(match.group(2).casefold().startswith(word) for word in self_references)
    ]
    if TEXT_REFERENCE.search(text) or deixis:
        return "Т6: сұрақ оқулық мәтініне сілтейді (оқушы мәтінді көрмейді)"
    return None


# Басымдық реті нұсқалардың оқулықта аталу ретіне сүйенбеуі керек (D81): оқушы мәтінді көрмейді, ал «аталу
# реті» — пән білімі емес. «Оқулықтағы ретімен», «мәтінде берілген ретпен», «аталған ретпен»; ал «оқулықтағы
# деректер бойынша хронологиялық ретпен» — объективті критерий, ол ұсталмайды.
MENTION_ORDER = re.compile(
    r"(?<![\w-])(?:(?:оқулық|мәтін|үзінді)\w*\s+(?:(?:берілген|аталған|көрсетілген|жазылған|келтірілген|тізілген)\s+)?"
    r"|(?:аталу|аталған|аталуы|берілу)\s+)рет(?:і|імен|пен|ке|ін)?(?![\w-])",
    re.IGNORECASE,
)


def _stem_echo_problem(stem: str, options: list[str], correct_index: int) -> str | None:
    if len(options) < 2 or not 0 <= correct_index < len(options):
        return None
    stem_words = {word for word in _words(stem) if len(word) >= ECHO_MIN_WORD and word not in ECHO_STOPWORDS}
    echoes = [bool(_words(option) & stem_words) for option in options]
    if echoes[correct_index] and not any(echo for index, echo in enumerate(echoes) if index != correct_index):
        return "Т6: сұрақтағы сөз тек дұрыс нұсқада қайталанады"
    return None


def _option_cue_problems(options: list[str], correct_index: int) -> list[str]:
    if len(options) < 2 or not 0 <= correct_index < len(options):
        return []
    problems = []
    lengths = [len(normalize_text(option)) for option in options]
    right = lengths[correct_index]
    longest_other = max(length for index, length in enumerate(lengths) if index != correct_index)
    if right - longest_other > max(LENGTH_CUE_MIN_CHARS, LENGTH_CUE_RATIO * longest_other):
        problems.append(f"Т6: дұрыс нұсқа қалғандарынан едәуір ұзын ({right} / {longest_other} таңба)")
    marked = [index for index, option in enumerate(options) if _words(option) & ABSOLUTE_WORDS]
    if correct_index not in marked and len(marked) >= 2:
        problems.append("Т6: «тек», «ешқашан» сияқты сөздер тек қате нұсқаларда")
    return problems


_NUMBER = re.compile(r"\d+")


def _partial_answer_problem(options: list[str], correct_index: int) -> str | None:
    """Қате нұсқаның сандары дұрыс нұсқа сандарының қатаң ішкі жиыны болса, ол дұрыс жауаптың бір бөлігі:
    дұрысы «6–10-нан 20–50-ге дейінгі үйлер», қатесі «6–10 үйден» — оқушы оны да шын деп таңдайды (D80).
    Сандары бірдей, орны ауысқан нұсқа («Жезқазғанда 48, Имантайда 100») — әділ алдағыш, ол ілінбейді."""
    if not 0 <= correct_index < len(options):
        return None
    right = set(_NUMBER.findall(options[correct_index]))
    for index, option in enumerate(options):
        numbers = set(_NUMBER.findall(option))
        if index != correct_index and numbers and numbers < right:
            return "Т6: қате нұсқа дұрыс жауаптың бір бөлігі (сандары)"
    return None


NAMED_OPTION_MIN_CHARS = 4  # «Ақ», «Иә» сияқты қысқа нұсқа сұрақтың кез келген сөзінің басынан табыла береді


def _named_in_stem_problem(stem: str, options: list[str], correct_index: int) -> str | None:
    """Қате нұсқа сұрақ мәтінінің өзінде аталса, оқушы оны бірден сызып тастайды: «Тұрандықтар қай халықпен
    жауласты?» деген сұрақта «тұрандықтар» — алдағыш емес (D80). Нұсқа сөз басынан, жалғауымен бірге ізделеді
    («тұрандықтардың»)."""
    text = normalize_text(stem)
    for index, option in enumerate(options):
        name = normalize_text(option).strip(" .,;:!?\"«»()")
        if (index != correct_index and len(name) >= NAMED_OPTION_MIN_CHARS
                and re.search(r"(?<!\w)" + re.escape(name), text)):
            return "Т6: қате нұсқа сұрақ мәтінінде аталған"
    return None


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
        problems += _option_cue_problems(self.options, self.correct_index)
        echo = _stem_echo_problem(self.stem, self.options, self.correct_index)
        if echo:
            problems.append(echo)
        partial = _partial_answer_problem(self.options, self.correct_index)
        if partial:
            problems.append(partial)
        named = _named_in_stem_problem(self.stem, self.options, self.correct_index)
        if named:
            problems.append(named)
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

    left: str = Field(description="Сол жақ элемент: 1–4 сөз, ең көбі 30 таңба (есім, күн, жер, ұғым). "
                                  "Толық атау, сөйлем емес.")
    right: str = Field(description="Оң жақ элемент: 1–4 сөз, ең көбі 30 таңба (есім, күн, жер, ұғым). "
                                   "Толық атау, сөйлем емес.")


class MatchingGen(GenBase):
    """I-1 · Сәйкестендіру: ≤ 5 жұп, әр элемент ≤ 30 таңба (Т6, D77: ұяшықта 2–3 жолға тасымалданады)."""

    format_name: ClassVar[str] = "matching"
    ITEM_LIMIT: ClassVar[int] = 30

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


class RubricBand(BaseModel):
    model_config = ConfigDict(extra="ignore")

    score: int = Field(description="Балл деңгейі.")
    criteria: str = Field(description="Осы балл қойылатын нақты критерий.")
    required_facts: list[str] = Field(description="Осы деңгейде болуы тиіс негізгі фактілер мен терминдер.")


class SocraticCheckpoint(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(description="Тексеріс нүктесінің қысқа идентификаторы, мысалы c1.")
    goal: str = Field(description="Оқушы диалогта дәлелдеуі тиіс негізгі ой.")
    probe_question: str = Field(description="Қосымша жетелеуші сұрақ.")
    expected_concepts: list[str] = Field(description="Осы нүктеде күтілетін ұғымдар мен терминдер.")


class CaseTableRow(BaseModel):
    model_config = ConfigDict(extra="ignore")

    cells: list[str] = Field(description="Кесте жолының ұяшықтары, баған санына тең.")


class CaseDataTable(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(description="Кесте атауы.")
    headers: list[str] = Field(description="2–5 баған атауы.")
    rows: list[CaseTableRow] = Field(description="1–6 жол дерек.")


def _rubric_problems(rubric: list[RubricBand], expected_scores: set[int]) -> list[str]:
    problems: list[str] = []
    scores = [band.score for band in rubric]
    if len(scores) != len(set(scores)) or set(scores) != expected_scores:
        ordered = ", ".join(str(s) for s in sorted(expected_scores))
        problems.append(f"Т6: рубрика деңгейлері {{{ordered}}} болуы керек")
        return problems
    top_min = 3 if max(expected_scores) == 4 else 2
    for band in rubric:
        if not band.criteria.strip():
            problems.append(f"Т6: рубрика {band.score} балл сипаттамасы бос")
        if band.score >= top_min and not [f for f in band.required_facts if f.strip()]:
            problems.append(f"Т6: рубрика {band.score} балда required_facts бос")
    return problems


def _rubric_dicts(rubric: list[RubricBand]) -> list[dict[str, Any]]:
    return [
        {
            "score": band.score,
            "criteria": band.criteria.strip(),
            "required_facts": [fact.strip() for fact in band.required_facts if fact.strip()],
        }
        for band in sorted(rubric, key=lambda b: b.score)
    ]


class ShortAnswerGen(GenBase):
    """1 · Қысқа ашық жауап: 1–3 сөйлем, 0–4 рубрика (ЖИ)."""

    format_name: ClassVar[str] = "short_answer"

    stem: str = Field(description="Нақты сұрақ, 400 таңбаға дейін.")
    reference_answer: str = Field(description="Оқулыққа негізделген 1–3 сөйлемдік эталон жауап.")
    rubric: list[RubricBand] = Field(description="0, 1, 2, 3, 4 балдық дескриптор.")

    def problems(self) -> list[str]:
        problems = self.common_problems()
        if not self.stem.strip():
            problems.append("Т6: stem бос")
        elif len(self.stem) > STEM_LIMIT:
            problems.append(f"Т6: stem {STEM_LIMIT} таңбадан ұзын")
        if not self.reference_answer.strip():
            problems.append("Т6: reference_answer бос")
        problems += _rubric_problems(self.rubric, {0, 1, 2, 3, 4})
        return problems

    def to_package(self, rng: random.Random) -> Package:
        return self._package(
            {"stem": self.stem.strip()},
            {"reference_answer": self.reference_answer.strip()},
            rubric_0_4=_rubric_dicts(self.rubric),
        )


class TrueFalseFixGen(GenBase):
    """2 · Шын/Жалған + түзету: код (вердикт) + ЖИ (түзету a ∈ 0..2)."""

    format_name: ClassVar[str] = "true_false_fix"

    stem: str = Field(description="Қысқа нұсқау, 400 таңбаға дейін.")
    statement: str = Field(description="Тексерілетін оқулық тұжырымы, 400 таңбаға дейін.")
    is_true: bool = Field(description="Тұжырым оқулық бойынша дұрыс болса true, қате болса false.")
    correction: str = Field(description="is_true = false болса дұрыс нұсқасы, әйтпесе бос жол.")
    rubric: list[RubricBand] = Field(description="Түзету бөлігіне арналған 0, 1, 2 балдық дескриптор.")

    def problems(self) -> list[str]:
        problems = self.common_problems()
        statement_ref = _text_reference_problem(self.statement, self.SELF_REFERENCES)
        if statement_ref:
            problems.append(statement_ref)
        if not self.stem.strip():
            problems.append("Т6: stem бос")
        elif len(self.stem) > STEM_LIMIT:
            problems.append(f"Т6: stem {STEM_LIMIT} таңбадан ұзын")
        if not self.statement.strip():
            problems.append("Т6: statement бос")
        elif len(self.statement) > STEM_LIMIT:
            problems.append(f"Т6: statement {STEM_LIMIT} таңбадан ұзын")
        if not self.is_true:
            if not self.correction.strip():
                problems.append("Т6: қате тұжырымда correction бос")
            elif normalize_text(self.correction) == normalize_text(self.statement):
                problems.append("Т7: түзету тұжырыммен бірдей")
        problems += _rubric_problems(self.rubric, {0, 1, 2})
        return problems

    def to_package(self, rng: random.Random) -> Package:
        return self._package(
            {"stem": self.stem.strip(), "statement": self.statement.strip()},
            {"is_true": bool(self.is_true), "correction": self.correction.strip()},
            rubric_0_4=_rubric_dicts(self.rubric),
        )


class PriorityGen(GenBase):
    """4 · Басымдық қою + негіздеу: код (рет) + ЖИ (негіздеме a ∈ 0..2)."""

    format_name: ClassVar[str] = "priority"
    SELF_REFERENCES: ClassVar[frozenset[str]] = TASK_SELF_REFERENCES | {"жағдай"}
    OPTION_LIMIT: ClassVar[int] = 80
    SCENARIO_WORDS_LIMIT: ClassVar[int] = 80

    stem: str = Field(description="Тапсырма нұсқауы.")
    scenario: str = Field(description="80 сөзге дейінгі жағдай сипаттамасы.")
    options: list[str] = Field(description="3–4 нұсқа, әрқайсысы 80 таңбаға дейін.")
    accepted_rankings: list[list[int]] = Field(description="1–3 дұрыс рет (0-ден басталатын индекстер).")
    reference_justification: str = Field(description="Реттің оқулыққа негізделген үлгі дәлелі.")
    rubric: list[RubricBand] = Field(description="Негіздеме бөлігіне арналған 0, 1, 2 балдық дескриптор.")

    def problems(self) -> list[str]:
        problems = self.common_problems()
        scenario_ref = _text_reference_problem(self.scenario, self.SELF_REFERENCES)
        if scenario_ref:
            problems.append(scenario_ref)
        if any(MENTION_ORDER.search(text) for text in (self.stem, self.scenario, self.reference_justification)):
            problems.append("Т6: басымдық реті оқулықта аталу ретіне сүйенеді (объективті критерий керек)")
        if not self.stem.strip():
            problems.append("Т6: stem бос")
        if not self.scenario.strip():
            problems.append("Т6: scenario бос")
        elif len(self.scenario.split()) > self.SCENARIO_WORDS_LIMIT:
            problems.append(f"Т6: scenario {self.SCENARIO_WORDS_LIMIT} сөзден ұзын")
        if not 3 <= len(self.options) <= 4:
            problems.append("Т6: басымдық нұсқа саны 3–4 емес")
        problems += _length_problems(self.options, self.OPTION_LIMIT, "нұсқа")
        problems += _duplicates(self.options, "нұсқа")
        expected_indices = list(range(len(self.options)))
        if not 1 <= len(self.accepted_rankings) <= 3:
            problems.append("Т6: accepted_rankings саны 1–3 емес")
        else:
            seen_rankings: set[tuple[int, ...]] = set()
            for ranking in self.accepted_rankings:
                if sorted(ranking) != expected_indices:
                    problems.append("Т6: accepted_rankings барлық нұсқаны қамтымайды")
                    break
                seen_rankings.add(tuple(ranking))
            if len(seen_rankings) != len(self.accepted_rankings):
                problems.append("Т7: accepted_rankings қайталанады")
        if not self.reference_justification.strip():
            problems.append("Т6: reference_justification бос")
        problems += _rubric_problems(self.rubric, {0, 1, 2})
        return problems

    def to_package(self, rng: random.Random) -> Package:
        order = list(range(len(self.options)))
        accepted0 = list(self.accepted_rankings[0]) if self.accepted_rankings else order
        if len(order) >= 2:
            for _ in range(20):
                rng.shuffle(order)
                if order != accepted0:
                    break
        options = [{"id": f"p{pos + 1}", "text": self.options[src].strip()} for pos, src in enumerate(order)]
        id_of = {src: f"p{pos + 1}" for pos, src in enumerate(order)}
        accepted = [[id_of[src] for src in ranking] for ranking in self.accepted_rankings]
        return self._package(
            {"stem": self.stem.strip(), "scenario": self.scenario.strip(), "options": options},
            {"accepted_rankings": accepted, "reference_justification": self.reference_justification.strip()},
            rubric_0_4=_rubric_dicts(self.rubric),
        )


class CaseStudyGen(GenBase):
    """5 · Кейс талдау: ≤ 120 сөз + 1–6 жол кесте, 0–4 рубрика (Т6)."""

    format_name: ClassVar[str] = "case_study"
    SELF_REFERENCES: ClassVar[frozenset[str]] = TASK_SELF_REFERENCES | {"жағдай"}
    CASE_WORDS_LIMIT: ClassVar[int] = 120
    MAX_ROWS: ClassVar[int] = 6

    stem: str = Field(description="Кейс тақырыбы / кіріспе.")
    case_text: str = Field(description="120 сөзге дейінгі ықшам кейс мәтіні.")
    data_table: CaseDataTable = Field(description="2–5 баған, 1–6 жолдан тұратын деректер кестесі.")
    task_prompt: str = Field(description="Оқушыға қойылатын талдау сұрағы.")
    reference_answer: str = Field(description="Кейс пен кестеге сүйенген эталон талдау.")
    rubric: list[RubricBand] = Field(description="0, 1, 2, 3, 4 балдық дескриптор.")

    def problems(self) -> list[str]:
        problems = self.common_problems()
        prompt_ref = _text_reference_problem(self.task_prompt, self.SELF_REFERENCES)
        if prompt_ref:
            problems.append(prompt_ref)
        if not self.stem.strip():
            problems.append("Т6: stem бос")
        if not self.case_text.strip():
            problems.append("Т6: case_text бос")
        elif len(self.case_text.split()) > self.CASE_WORDS_LIMIT:
            problems.append(f"Т6: case_text {self.CASE_WORDS_LIMIT} сөзден ұзын")
        if not self.task_prompt.strip():
            problems.append("Т6: task_prompt бос")
        if not self.reference_answer.strip():
            problems.append("Т6: reference_answer бос")
        if not self.data_table.title.strip():
            problems.append("Т6: data_table атауы бос")
        if not 2 <= len(self.data_table.headers) <= 5:
            problems.append("Т6: кесте баған саны 2–5 емес")
        if not 1 <= len(self.data_table.rows) <= self.MAX_ROWS:
            problems.append(f"Т6: кесте жол саны 1–{self.MAX_ROWS} емес")
        cols = len(self.data_table.headers)
        for index, row in enumerate(self.data_table.rows, start=1):
            if len(row.cells) != cols:
                problems.append(f"Т6: кестенің {index}-жолында баған саны сай емес")
                break
            if any(not cell.strip() for cell in row.cells):
                problems.append(f"Т6: кестенің {index}-жолында бос ұяшық бар")
                break
        problems += _rubric_problems(self.rubric, {0, 1, 2, 3, 4})
        return problems

    def to_package(self, rng: random.Random) -> Package:
        table = {
            "title": self.data_table.title.strip(),
            "headers": [h.strip() for h in self.data_table.headers],
            "rows": [[cell.strip() for cell in row.cells] for row in self.data_table.rows],
        }
        return self._package(
            {
                "stem": self.stem.strip(),
                "case_text": self.case_text.strip(),
                "data_table": table,
                "task_prompt": self.task_prompt.strip(),
            },
            {"reference_answer": self.reference_answer.strip()},
            rubric_0_4=_rubric_dicts(self.rubric),
        )


class FeynmanGen(GenBase):
    """3 · Фейнман әдісі: өз сөзімен түсіндіру (≥ 40 сөз), 0–4 рубрика."""

    format_name: ClassVar[str] = "feynman"
    SELF_REFERENCES: ClassVar[frozenset[str]] = TASK_SELF_REFERENCES | {"ұғым"}

    stem: str = Field(description="Тапсырма шарты.")
    concept: str = Field(description="Түсіндірілетін басты ұғым.")
    audience_prompt: str = Field(description="Кімге және қалай түсіндіру керегі.")
    min_words: int = Field(description="Ұсынылған ең аз сөз саны (40).")
    reference_answer: str = Field(description="Қарапайым тілдегі эталон түсіндірме.")
    rubric: list[RubricBand] = Field(description="0, 1, 2, 3, 4 балдық дескриптор.")

    def problems(self) -> list[str]:
        problems = self.common_problems()
        aud_ref = _text_reference_problem(self.audience_prompt, self.SELF_REFERENCES)
        if aud_ref:
            problems.append(aud_ref)
        if not self.stem.strip():
            problems.append("Т6: stem бос")
        if not self.concept.strip():
            problems.append("Т6: concept бос")
        if not self.audience_prompt.strip():
            problems.append("Т6: audience_prompt бос")
        if not 20 <= self.min_words <= 80:
            problems.append("Т6: min_words 20–80 аралығында емес")
        if not self.reference_answer.strip():
            problems.append("Т6: reference_answer бос")
        problems += _rubric_problems(self.rubric, {0, 1, 2, 3, 4})
        return problems

    def to_package(self, rng: random.Random) -> Package:
        return self._package(
            {
                "stem": self.stem.strip(),
                "concept": self.concept.strip(),
                "audience_prompt": self.audience_prompt.strip(),
                "min_words": int(self.min_words),
            },
            {"reference_answer": self.reference_answer.strip()},
            rubric_0_4=_rubric_dicts(self.rubric),
        )


class SocraticGen(GenBase):
    """I-1 · Сократтық диалог: 2–3 бақылау нүктесі, 0–4 рубрика (Т6)."""

    format_name: ClassVar[str] = "socratic"
    SELF_REFERENCES: ClassVar[frozenset[str]] = TASK_SELF_REFERENCES | {"диалог", "жағдай"}

    stem: str = Field(description="Диалог тақырыбы, 1 сөйлем.")
    situation: str = Field(description="Қысқа жағдай немесе сұрау, 1–2 сөйлем.")
    opening_question: str = Field(description="Емтихан алушының алғашқы жетелеуші сұрағы.")
    checkpoints: list[SocraticCheckpoint] = Field(description="Дәл 2 немесе 3 бақылау нүктесі.")
    rubric: list[RubricBand] = Field(description="0, 1, 2, 3, 4 балдық дескриптор.")

    def problems(self) -> list[str]:
        problems = self.common_problems()
        for text in (self.situation, self.opening_question):
            ref = _text_reference_problem(text, self.SELF_REFERENCES)
            if ref:
                problems.append(ref)
        if not self.stem.strip():
            problems.append("Т6: stem бос")
        if not self.situation.strip():
            problems.append("Т6: situation бос")
        if not self.opening_question.strip():
            problems.append("Т6: opening_question бос")
        if not 2 <= len(self.checkpoints) <= 3:
            problems.append("Т6: socratic бақылау нүктесі 2–3 емес")
        ids = [cp.id.strip() for cp in self.checkpoints]
        if any(not i for i in ids) or len(set(ids)) != len(ids):
            problems.append("Т6: socratic нүкте id-лері бос немесе қайталанады")
        if any(not cp.goal.strip() or not cp.probe_question.strip() for cp in self.checkpoints):
            problems.append("Т6: socratic нүкте мақсаты не сұрағы бос")
        problems += _rubric_problems(self.rubric, {0, 1, 2, 3, 4})
        return problems

    def to_package(self, rng: random.Random) -> Package:
        checkpoints = [
            {
                "id": cp.id.strip(),
                "goal": cp.goal.strip(),
                "probe_question": cp.probe_question.strip(),
                "expected_concepts": [c.strip() for c in cp.expected_concepts if c.strip()],
            }
            for cp in self.checkpoints
        ]
        return self._package(
            {
                "stem": self.stem.strip(),
                "situation": self.situation.strip(),
                "opening_question": self.opening_question.strip(),
            },
            {"opening_question": self.opening_question.strip()},
            rubric_0_4=_rubric_dicts(self.rubric),
            socratic_checkpoints=checkpoints,
        )


class TeachAiGen(GenBase):
    """2 · «ЖИ-ді оқыт»: қате түсінікті түзету диалогы, 0–4 рубрика."""

    format_name: ClassVar[str] = "teach_ai"
    SELF_REFERENCES: ClassVar[frozenset[str]] = TASK_SELF_REFERENCES | {"диалог", "жағдай"}

    stem: str = Field(description="Тапсырма шарты.")
    situation: str = Field(description="Оқушыға көрінетін қысқа жағдай.")
    ai_persona: str = Field(description="ЖИ рөлінің сипаттамасы (оқушыға көрінбейді).")
    misconception: str = Field(description="ЖИ ұстанатын қате түсінік (оқушыға көрінбейді).")
    opening_message: str = Field(description="ЖИ-оқушының алғашқы қате пікірі мен сұрағы.")
    rubric: list[RubricBand] = Field(description="0, 1, 2, 3, 4 балдық дескриптор.")

    def problems(self) -> list[str]:
        problems = self.common_problems()
        sit_ref = _text_reference_problem(self.situation, self.SELF_REFERENCES)
        if sit_ref:
            problems.append(sit_ref)
        for field_name in ("stem", "situation", "ai_persona", "misconception", "opening_message"):
            if not getattr(self, field_name).strip():
                problems.append(f"Т6: {field_name} бос")
        problems += _rubric_problems(self.rubric, {0, 1, 2, 3, 4})
        return problems

    def to_package(self, rng: random.Random) -> Package:
        return self._package(
            {
                "stem": self.stem.strip(),
                "situation": self.situation.strip(),
                "opening_message": self.opening_message.strip(),
            },
            {"ai_persona": self.ai_persona.strip(), "misconception": self.misconception.strip()},
            rubric_0_4=_rubric_dicts(self.rubric),
            socratic_checkpoints=None,
        )


GEN_MODELS: dict[str, type[GenBase]] = {
    model.format_name: model
    for model in (
        MCQGen,
        MatchingGen,
        SequenceGen,
        ErrorStepGen,
        FormulaGen,
        SliderGen,
        ShortAnswerGen,
        TrueFalseFixGen,
        PriorityGen,
        CaseStudyGen,
        FeynmanGen,
        SocraticGen,
        TeachAiGen,
    )
}


def _reconstruct_rubric(rubric_0_4: list[dict[str, Any]] | None) -> list[RubricBand]:
    if not isinstance(rubric_0_4, list):
        return []
    return [
        RubricBand(
            score=int(band["score"]),
            criteria=str(band.get("criteria", "")),
            required_facts=[str(f) for f in (band.get("required_facts") or [])],
        )
        for band in rubric_0_4
        if isinstance(band, dict) and "score" in band
    ]


def gen_from_package(
    fmt: str,
    content: dict[str, Any],
    key: dict[str, Any],
    *,
    ecd_skill: str,
    evidence: str,
    support_quote: str,
    rubric_0_4: list[dict[str, Any]] | None = None,
    socratic_checkpoints: list[dict[str, Any]] | None = None,
) -> GenBase:
    """Банктегі пакеттен генератордың моделін қайта құрады: аудит Т6/Т7-ні генерациядағы кодпен тексереді.
    Нұсқалардың реті маңызды емес: тексерістер ретке тәуелсіз."""
    common = {"ecd_skill": ecd_skill, "evidence": evidence, "support_quote": support_quote}
    if fmt == "mcq":
        ids = [option["id"] for option in content["options"]]
        return MCQGen(stem=content["stem"], options=[option["text"] for option in content["options"]],
                      correct_index=ids.index(key["correct_option_id"]) if key.get("correct_option_id") in ids else -1,
                      **common)
    if fmt == "matching":
        left = {item["id"]: item["text"] for item in content["left"]}
        right = {item["id"]: item["text"] for item in content["right"]}
        pairs = [MatchingPair(left=left.get(pair["left_id"], ""), right=right.get(pair["right_id"], ""))
                 for pair in key["pairs"]]
        return MatchingGen(stem=content["stem"], pairs=pairs, **common)
    if fmt == "sequence":
        steps = {step["id"]: step["text"] for step in content["steps"]}
        return SequenceGen(stem=content["stem"], steps=[steps.get(step_id, "") for step_id in key["order"]], **common)
    if fmt == "error_step":
        ids = [step["id"] for step in content["steps"]]
        return ErrorStepGen(stem=content["stem"], steps=[step["text"] for step in content["steps"]],
                            error_index=ids.index(key["step_id"]) if key.get("step_id") in ids else -1,
                            correction=key.get("correction", ""), **common)
    if fmt == "formula_builder":
        labels = {token["id"]: token["label"] for token in content["tokens"]}
        placement = key["placement"]
        numerator = [labels[placement[s["id"]]] for s in content["slots"] if s["position"] == "numerator"]
        denominator = [labels[placement[s["id"]]] for s in content["slots"] if s["position"] == "denominator"]
        used = set(placement.values())
        return FormulaGen(stem=content["stem"], result=content.get("result", ""), numerator=numerator,
                          denominator=denominator,
                          distractors=[label for token_id, label in labels.items() if token_id not in used], **common)
    if fmt == "slider":
        spec, out = content["input"], content["output"]
        return SliderGen(stem=content["stem"], input_name=spec["name"], input_unit=spec.get("unit", ""),
                         min=spec["min"], max=spec["max"], step=spec["step"], output_name=out["name"],
                         output_unit=out.get("unit", ""), formula=out.get("formula", ""),
                         accept_min=key["accept_min"], accept_max=key["accept_max"], **common)
    rubric = _reconstruct_rubric(rubric_0_4)
    if fmt == "short_answer":
        return ShortAnswerGen(stem=content["stem"], reference_answer=key["reference_answer"], rubric=rubric, **common)
    if fmt == "true_false_fix":
        return TrueFalseFixGen(
            stem=content["stem"],
            statement=content["statement"],
            is_true=bool(key["is_true"]),
            correction=key.get("correction", ""),
            rubric=rubric,
            **common,
        )
    if fmt == "priority":
        options = [item["text"] for item in content["options"]]
        idx_of = {item["id"]: i for i, item in enumerate(content["options"])}
        rankings = [[idx_of[oid] for oid in r] for r in key["accepted_rankings"]]
        return PriorityGen(
            stem=content["stem"],
            scenario=content["scenario"],
            options=options,
            accepted_rankings=rankings,
            reference_justification=key["reference_justification"],
            rubric=rubric,
            **common,
        )
    if fmt == "case_study":
        dt = content["data_table"]
        table = CaseDataTable(
            title=dt["title"],
            headers=list(dt["headers"]),
            rows=[CaseTableRow(cells=list(r)) for r in dt["rows"]],
        )
        return CaseStudyGen(
            stem=content["stem"],
            case_text=content["case_text"],
            data_table=table,
            task_prompt=content["task_prompt"],
            reference_answer=key["reference_answer"],
            rubric=rubric,
            **common,
        )
    if fmt == "feynman":
        return FeynmanGen(
            stem=content["stem"],
            concept=content["concept"],
            audience_prompt=content["audience_prompt"],
            min_words=int(content.get("min_words", 40)),
            reference_answer=key["reference_answer"],
            rubric=rubric,
            **common,
        )
    if fmt == "socratic":
        cps = [SocraticCheckpoint(**cp) for cp in (socratic_checkpoints or [])]
        return SocraticGen(
            stem=content["stem"],
            situation=content["situation"],
            opening_question=content["opening_question"],
            checkpoints=cps,
            rubric=rubric,
            **common,
        )
    if fmt == "teach_ai":
        return TeachAiGen(
            stem=content["stem"],
            situation=content["situation"],
            ai_persona=key["ai_persona"],
            misconception=key["misconception"],
            opening_message=content["opening_message"],
            rubric=rubric,
            **common,
        )
    raise ValueError(f"Белгісіз формат: «{fmt}»")
