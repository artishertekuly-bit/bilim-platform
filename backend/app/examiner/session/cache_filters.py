"""Қалыпқа келтіру, hash және D66 векторлық кэштің 3 детерминистік сүзгісі (bagalau §4.1; ortaq §8).

Эмбеддинг мағынаны ұстағанымен, сан/жыл («1465» vs «1456»), антоним полярлығы («артады» vs
«кемиді») және қазақ болымсыздығын («болды» vs «болмады») ажырата алмайды.
Сөздіктер ТҮБІРМЕН емес, толық СӨЗ ФОРМАЛАРЫМЕН жұмыс істейді (`өсімдік` ← `өс`, `кеме` ← `кем`
немесе `тапсырма` ← `-ма` сияқты қате ілінулер болмауы үшін).
"""

from __future__ import annotations

import hashlib
import re
import unicodedata

_WORD_TOKEN_RE = re.compile(r"[a-zа-яёәғқңөұүһі]+", re.IGNORECASE)
_RAW_TOKEN_RE = re.compile(r"\S+")
_NUMBER_RE = re.compile(r"(?<!\w)-?\d+(?:[.,]\d+)?")
_ROMAN_STRICT_RE = re.compile(r"^(?=[IVXLCDM]+$)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$")
_ERA_BCE_RE = re.compile(r"\bб\.?\s*з\.?\s*б\.?", re.IGNORECASE)
_NUMBER_UNIT_RE = re.compile(
    r"(-?\d+(?:[.,]\d+)?)\s*(см|мм|км/сағ|км|кг/м[³3]|г/см[³3]|кг|мг|мл|сек|мин|сағ|квт|кпа|ом|дж|вт|па|°c|%|м/с|м|г|т|л|с|н|в|а)(?![a-zа-яёәғқңөұүһі])",
    re.IGNORECASE,
)
_STANDALONE_UNIT_RE = re.compile(
    r"(?<![a-zа-яёәғқңөұүһі])(см|мм|км/сағ|км|кг/м[³3]|г/см[³3]|кг|мг|мл|сек|мин|сағ|квт|кпа|ом|дж|вт|па|°c|%|м/с)(?![a-zа-яёәғқңөұүһі])",
    re.IGNORECASE,
)
_CHEM_FORMULA_RE = re.compile(r"\b(?:h2o|co2|so2|no2|ch4|nh3|nacl|hcl|h2so4|o2|n2|h2|fe2o3|cao|naoh)\b", re.IGNORECASE)
_MATH_OP_RE = re.compile(r"([=≠<>≤≥÷×+]|(?<=\s)-(?=\s))")

_UNIT_CANON = {"сек": "с"}

# Полярлы антонимдер — тек нақты сөз формалары (ortaq §8, D66).
ANTONYM_PAIRS: tuple[tuple[frozenset[str], frozenset[str]], ...] = (
    (
        frozenset({"артады", "артты", "артып", "артуы", "арта"}),
        frozenset({"кемиді", "кеміді", "кеміп", "кемуі", "кемі"}),
    ),
    (
        frozenset({"өседі", "өсті", "өсіп", "өсуі", "жоғарылайды", "жоғарылады", "жоғарылауы"}),
        frozenset({"төмендейді", "төмендеді", "төмендеп", "төмендеуі", "түседі", "түсті", "құлдырайды", "құлдырады"}),
    ),
    (
        frozenset({"көбейеді", "көбейді", "көбейіп", "көбеюі"}),
        frozenset({"азаяды", "азайды", "азайып", "азаюы"}),
    ),
    (
        frozenset({"жоғары", "жоғарғы", "биік", "биігірек"}),
        frozenset({"төмен", "төменгі", "аласа", "төменірек"}),
    ),
    (
        frozenset({"үлкен", "үлкенірек", "ірі", "артық"}),
        frozenset({"кіші", "кішірек", "кішкентай", "ұсақ", "кем"}),
    ),
    (
        frozenset({"оңтүстік", "оңтүстігі", "оңтүстікте", "оңтүстігінде", "оңтүстіктен", "оңтүстікке"}),
        frozenset({"солтүстік", "солтүстігі", "солтүстікте", "солтүстігінде", "солтүстіктен", "солтүстікке"}),
    ),
    (
        frozenset({"шығыс", "шығысы", "шығыста", "шығысында", "шығыстан", "шығысқа"}),
        frozenset({"батыс", "батысы", "батыста", "батысында", "батыстан", "батысқа"}),
    ),
    (
        frozenset({"тура", "тікелей"}),
        frozenset({"кері"}),
    ),
    (
        frozenset({"оң"}),
        frozenset({"теріс"}),
    ),
    (
        frozenset({"ішкі"}),
        frozenset({"сыртқы"}),
    ),
    (
        frozenset({"ерте", "ертерек", "бұрын"}),
        frozenset({"кеш", "кешірек", "кейін"}),
    ),
    (
        frozenset({"жылы", "ыстық"}),
        frozenset({"суық", "салқын"}),
    ),
    (
        frozenset({"ауыр", "ауырлайды"}),
        frozenset({"жеңіл", "жеңілдейді"}),
    ),
    (
        frozenset({"жылдам", "тез"}),
        frozenset({"баяу", "жай"}),
    ),
    (
        frozenset({"қосылады", "қосылды", "бірігеді", "бірікті"}),
        frozenset({"ажырайды", "ажырады", "бөлінеді", "бөлінді", "ыдырайды", "ыдырады"}),
    ),
    (
        frozenset({"сіңіреді", "сіңірді", "жұтады", "жұтты"}),
        frozenset({"бөледі", "бөлді", "шығарады", "шығарды"}),
    ),
)

STANDALONE_NEGATIONS = frozenset({
    "емес", "емеспін", "емессің", "емессіз", "емеспіз", "емессіңдер",
    "жоқ", "жоқпын", "жоқсың", "болмайды", "болмады", "болмаған", "болмас",
})
ESH_PREFIXES = ("ешкім", "ештең", "ештем", "ешқан", "ешқаш", "ешқай", "ешбір", "ешнәрс")

VERB_NEG_SUFFIXES = (
    "майды", "мейді", "байды", "бейді", "пайды", "пейді",
    "маймын", "меймін", "баймын", "беймін", "паймын", "пеймін",
    "майсың", "мейсің", "байсың", "бейсің", "пайсың", "пейсің",
    "мады", "меді", "бады", "беді", "пады", "педі",
    "мадым", "медім", "бадым", "бедім", "падым", "педім",
    "мадың", "медің", "мадық", "медік",
    "маған", "меген", "баған", "беген", "паған", "пеген",
    "майтын", "мейтін", "байтын", "бейтін", "пайтын", "пейтін",
    "мас", "мес", "бас", "бес", "пас", "пес",
    "мау", "меу", "бау", "беу", "пау", "пеу",
)

# Түбір не жұрнаққа ұқсас зат есімдер болымсыздық болып танылмауы тиіс (ortaq §8, D66).
NEGATION_NOUN_WHITELIST = frozenset({
    "тапсырма", "бағдарлама", "тұжырымдама", "мемлекет", "шама", "кеме",
    "алмас", "кеңес", "күрес", "елес", "үдеріс", "тұмау", "қойма", "көрме",
    "бөлме", "түйме", "жазба", "сыныптас", "замандас", "жерлес", "одақтас",
    "құрама", "анықтама", "сілтеме", "жүйе",
})


def normalize_answer(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "").casefold()
    text = re.sub(r"[«»“”„\"']", '"', text)
    text = re.sub(r"[–—−]", "-", text)
    return re.sub(r"\s+", " ", text).strip()


def answer_hash(text: str) -> str:
    return hashlib.sha256(normalize_answer(text).encode("utf-8")).hexdigest()


def extract_symbols_and_numbers(text: str) -> frozenset[str]:
    """D66 1-сүзгісі: сандар, жылдар, рим цифрлары, өлшем бірліктері, химиялық/мат. таңбалар жиыны."""
    nfc = unicodedata.normalize("NFKC", text or "")
    items: set[str] = set()
    if _ERA_BCE_RE.search(nfc):
        items.add("era:bce")

    for match in _NUMBER_UNIT_RE.finditer(nfc):
        num = match.group(1).replace(",", ".")
        unit = _UNIT_CANON.get(match.group(2).casefold(), match.group(2).casefold())
        items.add(f"num:{num}")
        items.add(f"unit:{unit}")

    for match in _NUMBER_RE.finditer(nfc):
        items.add(f"num:{match.group(0).replace(',', '.')}")

    for match in _STANDALONE_UNIT_RE.finditer(nfc):
        unit = _UNIT_CANON.get(match.group(1).casefold(), match.group(1).casefold())
        items.add(f"unit:{unit}")

    for raw in _RAW_TOKEN_RE.findall(nfc):
        stripped = raw.strip(".,;:!?()[]\"'«»")
        if stripped and _ROMAN_STRICT_RE.match(stripped):
            items.add(f"roman:{stripped}")

    for match in _CHEM_FORMULA_RE.finditer(nfc):
        items.add(f"chem:{match.group(0).casefold()}")

    for match in _MATH_OP_RE.finditer(nfc):
        items.add(f"op:{match.group(1)}")

    return frozenset(items)


def _word_tokens(text: str) -> set[str]:
    return set(_WORD_TOKEN_RE.findall(unicodedata.normalize("NFKC", text or "").casefold()))


def antonym_polarity_conflict(a: str, b: str) -> bool:
    """D66 2-сүзгісі: бір жұптың қарама-қарсы сөз формалары екі жауапта кездессе True."""
    wa = _word_tokens(a)
    wb = _word_tokens(b)
    for pos, neg in ANTONYM_PAIRS:
        if (wa & pos and wb & neg) or (wa & neg and wb & pos):
            return True
    return False


def has_kazakh_negation(text: str) -> bool:
    """D66 3-сүзгісі: жеке болымсыз сөздер, `еш*` және етістік жұрнақтары (whitelist-ті сақтай отырып)."""
    tokens = _WORD_TOKEN_RE.findall(unicodedata.normalize("NFKC", text or "").casefold())
    for token in tokens:
        if token in NEGATION_NOUN_WHITELIST:
            continue
        if token in STANDALONE_NEGATIONS or token.startswith(ESH_PREFIXES):
            return True
        if len(token) >= 6 and token.endswith(VERB_NEG_SUFFIXES):
            return True
    return False


def negation_mismatch(a: str, b: str) -> bool:
    return has_kazakh_negation(a) != has_kazakh_negation(b)


def cache_filters_pass(student_text: str, cached_text: str) -> bool:
    """D66: 3 сүзгінің бәрі өтсе ғана векторлық кэш қолданылады."""
    if extract_symbols_and_numbers(student_text) != extract_symbols_and_numbers(cached_text):
        return False
    if antonym_polarity_conflict(student_text, cached_text):
        return False
    if negation_mismatch(student_text, cached_text):
        return False
    return True
