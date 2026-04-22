from __future__ import annotations

import json
import logging
import math
import os
import random
import re
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")

logger = logging.getLogger("bilimcorp.ai.engine")

try:
    from openai import OpenAI
except Exception:  # pragma: no cover
    OpenAI = None


MAX_GENERATED_QUESTIONS = 50
GENERAL_AI_BATCH_SIZE = 12
MAX_TUTOR_HISTORY = 8
MAX_PASSAGE_CHARS = 5000

STOPWORDS = {
    "және", "үшін", "туралы", "болады", "болып", "қарай", "мәтін", "осы", "сол",
    "деген", "оның", "бір", "ғана", "тағы", "яғни", "сияқты", "кейін", "алдымен",
    "мен", "бен", "пен", "бар", "жоқ", "the", "with", "that", "this", "from", "into",
    "have", "were", "been", "about", "their", "there", "which", "what", "when",
}

SYNONYM_MAP = {
    "маңызды": {"қажетті", "мәнді", "елеулі", "керекті"},
    "негізгі": {"басты", "маңызды", "тірек"},
    "қорытынды": {"нәтиже", "түйін", "қорытындылау"},
    "себеп": {"неге", "салдар алдындағы фактор", "түрткі"},
    "түсіндіру": {"сипаттау", "ашу", "баяндау"},
    "дұрыс": {"нақты", "сәйкес", "орынды"},
    "қате": {"бұрыс", "дұрыс емес", "сәйкес емес"},
}

UNT_SUBJECT_PROFILES: dict[str, dict[str, Any]] = {
    "informatics": {
        "aliases": ["информатика", "informatics", "computer science"],
        "topics": [
            ("Ақпарат өлшем бірлігі", "Байт"),
            ("Екілік санау жүйесі", "2"),
            ("Алгоритм түрі", "Сызықтық"),
            ("MS Excel функциясы", "SUM"),
            ("IP адрес форматы", "IPv4"),
            ("Программалау тілі", "Python"),
            ("Логикалық операция", "AND"),
            ("Цикл операторы", "for"),
            ("Файл кеңейтімі", ".txt"),
            ("Компьютер жадысы", "RAM"),
        ],
    },
    "mathematics": {
        "aliases": ["математика", "mathematics", "math", "алгебра", "геометрия"],
        "topics": [
            ("Квадрат теңдеудің түбірі", "Дискриминант арқылы табылады"),
            ("Синус анықтамасы", "Қарсы қабырға / гипотенуза"),
            ("Туынды ұғымы", "Функция өзгеру жылдамдығы"),
            ("Логарифм қасиеті", "Көбейтіндінің логарифмі — қосынды"),
            ("Арифметикалық прогрессия", "Айырымы тұрақты"),
            ("Геометриялық прогрессия", "Еселігі тұрақты"),
            ("Пифагор теоремасы", "a²+b²=c²"),
            ("Функцияның анықталу облысы", "Аргументтің мүмкін мәндері"),
            ("Ықтималдық формуласы", "Қолайлы жағдай / барлық жағдай"),
            ("Вектор ұзындығы", "Координаталар арқылы есептеледі"),
        ],
    },
    "physics": {
        "aliases": ["физика", "physics"],
        "topics": [
            ("Күштің өлшем бірлігі", "Ньютон"),
            ("Жылдамдық формуласы", "v=s/t"),
            ("Тығыздық формуласы", "ρ=m/V"),
            ("Ом заңы", "I=U/R"),
            ("Қуат формуласы", "P=A/t"),
            ("Импульс формуласы", "p=mv"),
            ("Архимед күші", "Сұйыққа батырылған денеге әсер етеді"),
            ("Тербеліс периоды", "Бір толық тербеліс уақыты"),
            ("Жылу мөлшері", "Q=cmΔt"),
            ("Линза түрі", "Жинағыш және шашыратқыш"),
        ],
    },
    "chemistry": {
        "aliases": ["химия", "chemistry"],
        "topics": [
            ("Периодтық жүйе авторы", "Менделеев"),
            ("Қышқыл мысалы", "HCl"),
            ("Негіз мысалы", "NaOH"),
            ("Тотығу дәрежесі", "Элементтің шартты заряды"),
            ("Катализатор қызметі", "Реакция жылдамдығын өзгертеді"),
            ("Моль ұғымы", "Зат мөлшері"),
            ("pH шкаласы", "Орта қышқылдығын көрсетеді"),
            ("Тұз мысалы", "NaCl"),
            ("Электролит", "Ерітіндіде иондарға ыдырайды"),
            ("Экзотермиялық реакция", "Жылу бөледі"),
        ],
    },
    "biology": {
        "aliases": ["биология", "biology"],
        "topics": [
            ("Жасушаның негізгі бөлігі", "Ядро"),
            ("Фотосинтез жүретін органоид", "Хлоропласт"),
            ("Тұқымқуалаушылық бірлігі", "Ген"),
            ("ДНҚ қызметі", "Тұқымқуалау ақпаратын сақтайды"),
            ("Эволюция ұғымы", "Тірі ағзалардың тарихи дамуы"),
            ("Қанның сұйық бөлігі", "Плазма"),
            ("Тыныс алу мүшесі", "Өкпе"),
            ("Рибосома қызметі", "Ақуыз синтезі"),
            ("Митоз нәтижесі", "Екі бірдей жасуша"),
            ("Экожүйе ұғымы", "Тірі ағзалар мен орта бірлігі"),
        ],
    },
    "geography": {
        "aliases": ["география", "geography"],
        "topics": [
            ("Ең үлкен мұхит", "Тынық мұхиты"),
            ("Картаның масштабы", "Жер бетін кішірейтіп көрсету қатынасы"),
            ("Атмосфера қабаты", "Тропосфера"),
            ("Экватор", "Жерді екі жарты шарға бөледі"),
            ("Ендік", "Экватордан бұрыштық қашықтық"),
            ("Бойлық", "Нөлдік меридианнан бұрыштық қашықтық"),
            ("Қазақстан климаты", "Шұғыл континенттік"),
            ("Пайдалы қазба", "Мұнай"),
            ("Халық тығыздығы", "Адам саны / аумақ"),
            ("Өзен бастауы", "Өзен басталатын жер"),
        ],
    },
    "history_world": {
        "aliases": ["дүниежүзі тарихы", "әлем тарихы", "world history", "дүние жүзі тарихы"],
        "topics": [
            ("Қайта өрлеу дәуірі", "Еуропада мәдени өрлеу кезеңі"),
            ("Бірінші дүниежүзілік соғыс", "1914–1918"),
            ("Екінші дүниежүзілік соғыс", "1939–1945"),
            ("Өнеркәсіп төңкерісі", "Мануфактурадан машина өндірісіне өту"),
            ("Француз революциясы", "1789 жылы басталды"),
            ("Ұлы Жібек жолы", "Еуразиядағы сауда жолы"),
            ("Рим империясы", "Антикалық ірі мемлекет"),
            ("Қырғи қабақ соғыс", "АҚШ пен КСРО текетіресі"),
            ("Колония ұғымы", "Басқа мемлекетке тәуелді аймақ"),
            ("БҰҰ құрылуы", "1945"),
        ],
    },
    "history_kazakhstan": {
        "aliases": ["қазақстан тарихы", "history of kazakhstan", "kazakhstan history"],
        "topics": [
            ("Қазақ хандығының құрылған жылы", "1465"),
            ("Керей мен Жәнібек", "Қазақ хандығының негізін қалаушылар"),
            ("Абылай хан", "Қазақ ханы"),
            ("Алаш қозғалысы", "Ұлттық-демократиялық қозғалыс"),
            ("Тәуелсіздік жылы", "1991"),
            ("Жеті жарғы", "Тәуке хан заңдары"),
            ("Алтын Орда", "Ортағасырлық мемлекет"),
            ("Сақтар", "Ежелгі тайпалар"),
            ("Ұлы Отан соғысы", "1941–1945"),
            ("Желтоқсан оқиғасы", "1986"),
        ],
    },
    "kazakh_language": {
        "aliases": ["қазақ тілі", "kazakh language"],
        "topics": [
            ("Сөз таптары", "Зат есім"),
            ("Сөйлем мүшесі", "Бастауыш"),
            ("Фонетика нысаны", "Дыбыс"),
            ("Лексика нысаны", "Сөз мағынасы"),
            ("Синоним", "Мағыналас сөз"),
            ("Антоним", "Қарама-қарсы мағыналы сөз"),
            ("Тұрақты тіркес", "Фразеологизм"),
            ("Құрмалас сөйлем", "Екі не одан көп жай сөйлемнен тұрады"),
            ("Жұрнақ", "Жаңа сөз тудырады"),
            ("Жалғау", "Сөздерді байланыстырады"),
        ],
    },
    "kazakh_literature": {
        "aliases": ["қазақ әдебиеті", "kazakh literature", "әдебиет"],
        "topics": [
            ("Абай Құнанбайұлы", "Қазақтың ұлы ақыны"),
            ("Эпитет", "Көркемдеуіш құрал"),
            ("Теңеу", "Ұқсату арқылы жасалады"),
            ("Метафора", "Ауыспалы мағына"),
            ("Поэма", "Көлемді өлең жанры"),
            ("Проза", "Қара сөзбен жазылған шығарма"),
            ("Лирика", "Ақын көңіл күйін білдіреді"),
            ("Кейіпкер", "Шығармадағы образ"),
            ("Сюжет", "Оқиғалар желісі"),
            ("Композиция", "Шығарманың құрылысы"),
        ],
    },
    "russian_language": {
        "aliases": ["орыс тілі", "russian language"],
        "topics": [
            ("Имя существительное", "Часть речи"),
            ("Подлежащее", "Главный член предложения"),
            ("Сказуемое", "Главный член предложения"),
            ("Синоним", "Близкое по значению слово"),
            ("Антоним", "Противоположное по значению слово"),
            ("Приставка", "Часть слова"),
            ("Суффикс", "Часть слова"),
            ("Падеж", "Форма имени"),
            ("Сложное предложение", "Содержит две и более грамматические основы"),
            ("Орфография", "Правописание"),
        ],
    },
    "english": {
        "aliases": ["ағылшын", "ағылшын тілі", "english", "english language"],
        "topics": [
            ("Present Simple", "Қазіргі шақтың қарапайым түрі"),
            ("Past Simple", "Өткен шақ"),
            ("Passive Voice", "Ырықсыз етіс"),
            ("Gerund", "Етістік+ing тұлғасы"),
            ("Infinitive", "to + verb"),
            ("Conditional", "Шартты сөйлем"),
            ("Modal verb", "can"),
            ("Article", "a/an/the"),
            ("Synonym", "Similar meaning word"),
            ("Preposition", "in"),
        ],
    },
    "law": {
        "aliases": ["құқық", "дүниежүзілік құқық", "law", "право", "адам. қоғам. құқық"],
        "topics": [
            ("Конституция", "Негізгі заң"),
            ("Құқық нормасы", "Міндетті мінез-құлық ережесі"),
            ("Мемлекет белгілері", "Аумақ, халық, билік"),
            ("Азаматтық құқық", "Мүліктік қатынастарды реттейді"),
            ("Қылмыстық құқық", "Қылмыс пен жазаға қатысты"),
            ("Әкімшілік құқық", "Мемлекеттік басқару саласы"),
            ("Құқық қабілеттілігі", "Құқыққа ие болу мүмкіндігі"),
            ("Бостандық", "Таңдау еркі"),
            ("Президент", "Мемлекет басшысы"),
            ("Парламент", "Заң шығарушы орган"),
        ],
    },
}


def _clean_text(text: Any) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _truncate(text: Any, limit: int) -> str:
    return _clean_text(text)[:limit]


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-zА-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі0-9\-]+", _clean_text(text).lower())


def _sentence_split(text: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?…])\s+|\n+", str(text or "")) if _clean_text(s)]


def _extract_keywords(text: str, limit: int = 12) -> list[str]:
    words = re.findall(r"[A-Za-zА-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі0-9\-]{3,}", str(text or ""))
    out: list[str] = []
    seen: set[str] = set()
    for word in words:
        low = word.lower()
        if low in STOPWORDS or low.isdigit():
            continue
        if low not in seen:
            seen.add(low)
            out.append(word)
        if len(out) >= limit:
            break
    return out


def _difficulty(index: int) -> str:
    return ["жеңіл", "орташа", "күрделі"][min(index // 3, 2)]


def _openai_client():
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key or OpenAI is None:
        return None
    try:
        return OpenAI(api_key=api_key)
    except Exception:
        logger.exception("OpenAI client init failed")
        return None


def _openai_model() -> str:
    return os.getenv("OPENAI_MODEL", "gpt-4.1-mini")


def _clamp_requested_count(value: Any, default: int = 10) -> int:
    try:
        parsed = int(value)
    except Exception:
        parsed = default
    return max(1, min(MAX_GENERATED_QUESTIONS, parsed))


def _extract_json(text: str) -> Any:
    raw = str(text or "").strip()
    if not raw:
        raise ValueError("Empty response")

    decoder = json.JSONDecoder()
    candidates: list[str] = [raw]

    fenced_blocks = re.findall(r"```(?:json)?\s*(.*?)\s*```", raw, re.DOTALL | re.IGNORECASE)
    candidates.extend(block for block in fenced_blocks if _clean_text(block))

    for start_char in ("[", "{"):
        start = raw.find(start_char)
        while start != -1:
            try:
                obj, end = decoder.raw_decode(raw[start:])
                if end > 0:
                    return obj
            except Exception:
                pass
            start = raw.find(start_char, start + 1)

    for candidate in candidates:
        clean_candidate = candidate.strip()
        if not clean_candidate:
            continue
        try:
            return json.loads(clean_candidate)
        except Exception:
            continue

    raise ValueError("JSON parse error")


def _normalize_text_for_compare(value: str) -> str:
    return re.sub(
        r"\s+",
        " ",
        re.sub(r"[^\w\s\-]", "", str(value or "").casefold(), flags=re.UNICODE),
    ).strip()


def _safe_unique(seq: list[str], limit: int | None = None) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in seq:
        clean = _clean_text(item)
        if not clean:
            continue
        key = clean.casefold()
        if key not in seen:
            seen.add(key)
            out.append(clean)
        if limit and len(out) >= limit:
            break
    return out


def _topic_anchor(topic: str) -> str:
    keywords = _extract_keywords(topic, limit=3)
    if keywords:
        return keywords[0]
    return _clean_text(topic) or "тақырып"


def _topic_distractors(topic: str) -> list[str]:
    anchor = _topic_anchor(topic)
    generic = [
        "Тек анықтаманы жаттау",
        "Практикамен байланыспайтын теория",
        "Қатысы жоқ мысал",
        "Жалпы сипаттама",
        "Бейтарап дерек",
        "Екінші деңгейлі белгі",
    ]
    if anchor.casefold() == _clean_text(topic).casefold():
        return generic[:4]
    return _safe_unique([_clean_text(topic), anchor, *generic], limit=6)


def _build_text_question(idx: int, q_type: str, question: str, reference_answer: str) -> dict[str, Any]:
    return {
        "id": f"Q{idx}",
        "type": q_type,
        "difficulty": _difficulty(idx - 1),
        "question": _clean_text(question),
        "answer_format": "text",
        "options": [],
        "correct_answer": "",
        "reference_answer": _clean_text(reference_answer),
    }


def _build_mcq_question(
    idx: int,
    q_type: str,
    question: str,
    correct_answer: str,
    distractors: list[str],
    reference_answer: str = "",
) -> dict[str, Any]:
    rng = random.Random(idx)
    options = _safe_unique([correct_answer, *distractors], limit=4)
    if _normalize_text_for_compare(correct_answer) not in {
        _normalize_text_for_compare(x) for x in options
    }:
        options = _safe_unique([correct_answer, *options], limit=4)
    while len(options) < 4:
        options.append(f"Нұсқа {len(options) + 1}")
    rng.shuffle(options)
    return {
        "id": f"Q{idx}",
        "type": q_type,
        "difficulty": _difficulty(idx - 1),
        "question": _clean_text(question),
        "answer_format": "mcq",
        "options": options,
        "correct_answer": _clean_text(correct_answer),
        "reference_answer": _clean_text(reference_answer or correct_answer),
    }


def _normalize_generated_questions(
    items: Any,
    source_text: str,
    limit: int | None = None,
    *,
    force_mcq: bool = False,
) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        raise ValueError("Questions response list емес")

    normalized: list[dict[str, Any]] = []
    for idx, row in enumerate(items, start=1):
        if not isinstance(row, dict):
            continue

        question = _clean_text(row.get("question"))
        if len(question) < 8:
            continue

        answer_format = str(row.get("answer_format") or "text").strip().lower()
        if answer_format not in {"text", "mcq"}:
            answer_format = "text"

        if force_mcq:
            answer_format = "mcq"

        options = (
            _safe_unique([str(x) for x in (row.get("options") or [])], limit=4)
            if answer_format == "mcq"
            else []
        )
        correct_answer = _clean_text(row.get("correct_answer"))
        reference_answer = _clean_text(
            row.get("reference_answer") or row.get("ideal_answer") or correct_answer
        )

        if answer_format == "mcq":
            if not correct_answer and options:
                correct_answer = options[0]

            if not correct_answer:
                continue

            if not options:
                options = [correct_answer]

            if _normalize_text_for_compare(correct_answer) not in {
                _normalize_text_for_compare(x) for x in options
            }:
                options = _safe_unique([correct_answer, *options], limit=4)

            while len(options) < 4:
                fillers = _extract_keywords(source_text, limit=20) or [
                    "Дұрыс жауап",
                    "Қосымша",
                    "Нұсқа",
                    "Жауап",
                ]
                candidate = fillers[(len(options) - 1) % len(fillers)]
                if _normalize_text_for_compare(candidate) != _normalize_text_for_compare(correct_answer):
                    options = _safe_unique([*options, candidate], limit=4)
                else:
                    candidate = f"Нұсқа {len(options) + 1}"
                    options = _safe_unique([*options, candidate], limit=4)
                if len(options) >= 4:
                    break

            if len(options) < 4:
                continue

        normalized.append(
            {
                "id": str(row.get("id") or f"Q{idx}"),
                "type": _clean_text(row.get("type") or "сұрақ"),
                "difficulty": _clean_text(row.get("difficulty") or _difficulty(idx - 1)),
                "question": question,
                "answer_format": answer_format,
                "options": options,
                "correct_answer": correct_answer,
                "reference_answer": reference_answer,
            }
        )

    return normalized[:limit] if limit else normalized


def _dedupe_questions(questions: list[dict[str, Any]], limit: int | None = None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    for question in questions:
        key = _normalize_text_for_compare(question.get("question", ""))
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(question)
        if limit and len(out) >= limit:
            break

    for idx, question in enumerate(out, start=1):
        question["id"] = f"Q{idx}"
        question["difficulty"] = question.get("difficulty") or _difficulty(idx - 1)

    return out[:limit] if limit else out


def _topic_questions(topic: str, requested_count: int = 10) -> list[dict[str, Any]]:
    topic = _clean_text(topic) or "тақырып"
    requested_count = _clamp_requested_count(requested_count, 10)
    anchor = _topic_anchor(topic)
    distractors = _topic_distractors(topic)

    templates: list[dict[str, Any]] = [
        _build_text_question(1, "анықтама", f"{topic} ұғымын қысқаша түсіндір.", f"{topic} туралы негізгі анықтаманы өз сөзіңмен жазады."),
        _build_mcq_question(2, "таңдау", f"Қай нұсқа '{topic}' тақырыбына тікелей қатысты?", topic, distractors, f"Дұрыс жауап — {topic}, себебі сұрақ тікелей осы тақырыпты сұрап тұр."),
        _build_text_question(3, "себеп", f"{topic} неліктен маңызды екенін түсіндір.", f"{topic} маңызын 1-2 негізгі дәлелмен түсіндіреді."),
        _build_mcq_question(4, "негізгі ұғым", f"'{topic}' аясындағы негізгі тірек ұғым қайсысына жақын?", anchor, [d for d in distractors if _normalize_text_for_compare(d) != _normalize_text_for_compare(anchor)], f"Бұл тақырыпқа ең тікелей қатысты тірек сөз — {anchor}."),
        _build_text_question(5, "құрылым", f"{topic} бойынша негізгі бөліктерді немесе кезеңдерді ата.", f"{topic} бойынша басты бөліктерді не кезеңдерді атайды."),
        _build_mcq_question(6, "қолдану", f"'{topic}' білімін қай жағдайда қолдануға болады?", f"{topic} бойынша практикалық тапсырмада", ["Қатысы жоқ әдеби сипаттамада", "Кездейсоқ жалпы әңгімеде", "Мағынасыз қайталауда"], f"{topic} көбіне нақты оқу не практикалық тапсырмада қолданылады."),
        _build_text_question(7, "мысал", f"{topic} бойынша бір нақты мысал келтір.", f"{topic} бойынша нақты әрі орынды мысал келтіреді."),
        _build_mcq_question(8, "мақсат", f"'{topic}' тақырыбын оқудағы негізгі мақсат қайсы?", f"{topic} бойынша ұғымды түсіну және қолдану", ["Тақырып атын жаттау ғана", "Кездейсоқ дерек жинау", "Қатыссыз мәліметті көбейту"], f"Негізгі мақсат — тақырыпты түсініп, оны қолдана білу."),
        _build_text_question(9, "талдау", f"{topic} тақырыбының ерекшелігін қысқаша талда.", f"{topic} ерекшелігін қысқа талдаумен көрсетеді."),
        _build_mcq_question(10, "қорытынды", f"'{topic}' бойынша орынды қорытындыны таңда.", f"{topic} жүйелі түрде түсінуді қажет етеді", ["Бұл тақырып мүлде маңызсыз", "Тек бір сөзбен шектеледі", "Қолданусыз жатталады"], f"{topic} тақырыбы әдетте түсіну, байланыс және қолдану арқылы меңгеріледі."),
        _build_text_question(11, "түйін", f"{topic} бойынша ең маңызды үш ойды ата.", f"{topic} бойынша үш тірек ойды жинақтайды."),
        _build_text_question(12, "термин", f"{topic} бойынша бір негізгі терминді түсіндір.", f"{topic} бойынша негізгі терминді қысқа анықтайды."),
    ]

    questions: list[dict[str, Any]] = []
    next_id = 1

    while len(questions) < requested_count:
        for template in templates:
            if len(questions) >= requested_count:
                break
            item = dict(template)
            item["id"] = f"Q{next_id}"
            item["difficulty"] = _difficulty(next_id - 1)
            questions.append(item)
            next_id += 1

    return questions[:requested_count]


def _candidate_distractors(correct: str, pool: list[str]) -> list[str]:
    correct_norm = _normalize_text_for_compare(correct)
    out = [item for item in _safe_unique(pool) if _normalize_text_for_compare(item) != correct_norm]
    return out[:6]


def _fallback_generate(text: str, requested_count: int = 10) -> list[dict[str, Any]]:
    clean = _clean_text(text)
    requested_count = _clamp_requested_count(requested_count, 10)

    if not clean:
        return _topic_questions("тақырып", requested_count)

    sentences = _sentence_split(clean)
    if len(sentences) <= 1 and len(clean.split()) <= 18:
        return _topic_questions(clean, requested_count)

    years = _safe_unique(re.findall(r"\b(?:1\d{3}|20\d{2}|21\d{2})\b", clean), limit=30)
    entities = _safe_unique(
        re.findall(r"\b[А-ЯӘҒҚҢӨҰҮҺІA-Z][\w\-]+(?:\s+[А-ЯӘҒҚҢӨҰҮҺІA-Z][\w\-]+){0,2}", clean),
        limit=40,
    )
    keywords = _extract_keywords(clean, limit=40)

    questions: list[dict[str, Any]] = []
    idx = 1

    for sent in sentences[: min(len(sentences), requested_count * 2)]:
        if len(questions) >= requested_count:
            break

        sent_keywords = _extract_keywords(sent, limit=6)
        sent_years = re.findall(r"\b(?:1\d{3}|20\d{2}|21\d{2})\b", sent)
        sent_entities = re.findall(
            r"\b[А-ЯӘҒҚҢӨҰҮҺІA-Z][\w\-]+(?:\s+[А-ЯӘҒҚҢӨҰҮҺІA-Z][\w\-]+){0,2}",
            sent,
        )

        if sent_years and len(questions) < requested_count:
            correct = sent_years[0]
            distractors = _candidate_distractors(correct, years + keywords)
            questions.append(
                _build_mcq_question(
                    idx,
                    "дерек",
                    "Берілген мәтінге сай оқиға қай жылы болды?",
                    correct,
                    distractors,
                    sent,
                )
            )
            idx += 1

        if sent_entities and len(questions) < requested_count:
            correct = sent_entities[0]
            distractors = _candidate_distractors(correct, entities + keywords)
            questions.append(
                _build_mcq_question(
                    idx,
                    "таңдау",
                    "Мәтіндегі осы ойға тікелей қатысты негізгі тұлға не атау қайсы?",
                    correct,
                    distractors,
                    sent,
                )
            )
            idx += 1

        if sent_keywords and len(questions) < requested_count:
            head = sent_keywords[0]
            questions.append(
                _build_text_question(
                    idx,
                    "түсіндіру",
                    f"Мәтінге сүйеніп, '{head}' туралы не айтылғанын қысқаша жаз.",
                    sent,
                )
            )
            idx += 1

    summary_ref = " ".join(sentences[:2]) if sentences else clean
    extra_templates = [
        ("қорытынды", "Мәтіннің негізгі ойын 2-3 сөйлеммен түйінде.", summary_ref),
        ("себеп", "Мәтіндегі құбылыстың немесе оқиғаның негізгі себебін ата.", summary_ref),
        ("салдар", "Мәтін бойынша негізгі салдарды немесе нәтижені көрсет.", summary_ref),
        ("салыстыру", "Мәтіндегі екі ұғымның немесе кезеңнің айырмасын қысқаша түсіндір.", summary_ref),
        ("деталь", "Мәтіндегі бір нақты детальді ата және оның маңызын түсіндір.", summary_ref),
        ("байланыс", "Мәтіндегі екі ойдың өзара байланысын қысқаша сипатта.", summary_ref),
    ]

    extra_index = 0
    while len(questions) < requested_count:
        if extra_index < len(extra_templates):
            kind, question, ref = extra_templates[extra_index]
            questions.append(_build_text_question(idx, kind, question, ref))
            idx += 1
            extra_index += 1
        else:
            topic_seed = keywords[(len(questions) - len(extra_templates)) % len(keywords)] if keywords else "тақырып"
            filler = _topic_questions(topic_seed, 1)[0]
            filler["id"] = f"Q{idx}"
            filler["difficulty"] = _difficulty(idx - 1)
            questions.append(filler)
            idx += 1

    return _dedupe_questions(questions, requested_count)


def _detect_special_subject(text: str) -> str:
    low = _clean_text(text).lower()
    if any(x in low for x in ["оқу сауаттылығы", "оқу сауаты", "reading literacy"]):
        return "reading_literacy"
    if any(x in low for x in ["математикалық сауаттылық", "мат сауат", "math literacy"]):
        return "math_literacy"
    return ""


def _detect_exam_mode(text: str, subject: str = "", topic: str = "", exam_mode: str = "") -> str:
    explicit = _clean_text(exam_mode).lower()
    if explicit in {"unt", "ubt", "ent"}:
        return "unt"

    haystack = " ".join([_clean_text(text), _clean_text(subject), _clean_text(topic)]).lower()
    if any(token in haystack for token in ["ұбт", "ент", "unt", "ubt", "ent"]):
        return "unt"

    return ""


def _detect_unt_subject(subject: str = "", topic: str = "", text: str = "") -> str:
    haystack = " ".join([_clean_text(subject), _clean_text(topic), _clean_text(text)]).lower()

    for key, profile in UNT_SUBJECT_PROFILES.items():
        aliases = [str(alias).lower() for alias in profile.get("aliases", [])]
        if any(alias in haystack for alias in aliases):
            return key

    return ""


def _unt_distractors(subject_key: str, correct_answer: str) -> list[str]:
    profile = UNT_SUBJECT_PROFILES.get(subject_key) or {}
    pool = [answer for _, answer in profile.get("topics", [])]
    generic = [
        "Тек анықтамамен шектеледі",
        "Қатысы жоқ ұғым",
        "Жалпы сипаттама",
        "Қате тұжырым",
        "Бейтарап дерек",
    ]
    return _candidate_distractors(correct_answer, [*pool, *generic])


def _unt_fallback_pack(subject_key: str, requested_count: int = 10, topic: str = "") -> dict[str, Any]:
    requested_count = _clamp_requested_count(requested_count, 10)
    profile = UNT_SUBJECT_PROFILES.get(subject_key) or {}
    bank = list(profile.get("topics", []))
    if not bank:
        bank = [
            ("Негізгі ұғым", "Дұрыс жауап"),
            ("Тірек термин", "Негізгі термин"),
            ("Қолдану аймағы", "Практикада қолданылады"),
            ("Мәні", "Негізгі мағынасы"),
        ]

    questions: list[dict[str, Any]] = []
    idx = 1
    loop = 0

    while len(questions) < requested_count:
        for item_topic, correct in bank:
            if len(questions) >= requested_count:
                break

            loop += 1
            active_topic = _clean_text(topic) or item_topic
            distractors = _unt_distractors(subject_key, correct)

            template_index = loop % 5
            if template_index == 1:
                question_text = f"{active_topic} бойынша дұрыс тұжырымды таңда."
            elif template_index == 2:
                question_text = f"{active_topic} тақырыбына тікелей қатысты нұсқаны белгіле."
            elif template_index == 3:
                question_text = f"{active_topic} бойынша негізгі ұғым қайсы?"
            elif template_index == 4:
                question_text = f"{active_topic} аясында дұрыс жауапты таңда."
            else:
                question_text = f"{active_topic} туралы қай нұсқа дұрыс?"

            questions.append(
                _build_mcq_question(
                    idx,
                    "ұбт",
                    question_text,
                    correct,
                    distractors,
                    f"Дұрыс жауап: {correct}.",
                )
            )
            idx += 1

    return {
        "mode": "fallback",
        "subject": subject_key,
        "passage": "",
        "questions": _dedupe_questions(questions, requested_count),
    }


def _generate_unt_questions_with_ai(
    client,
    *,
    subject_key: str,
    subject: str,
    topic: str,
    source_text: str,
    requested_count: int,
) -> dict[str, Any]:
    requested_count = _clamp_requested_count(requested_count, 10)
    profile = UNT_SUBJECT_PROFILES.get(subject_key) or {}
    profile_topics = ", ".join(t for t, _ in profile.get("topics", [])[:10])

    prompt = f"""
Сен ҰБТ форматына жақын сапалы тест сұрақтарын құрастыратын ассистентсің.

Міндет:
- пән: {subject or subject_key}
- тақырып: {topic or 'Жалпы ҰБТ пән тақырыбы'}
- сұрақ саны: {requested_count}

Қатаң талаптар:
- тек multiple choice сұрақтар қайтар
- әр сұрақта дәл 4 нұсқа болсын
- тек 1 дұрыс жауап болсын
- answer_format міндетті түрде "mcq" болсын
- correct_answer options ішінде міндетті түрде болсын
- short_answer не text формат мүлде қайтарма
- сұрақтар ҰБТ стиліне жақын, нақты, тексерілетін, бірмәнді болсын
- тым жалпы "түсіндір", "пікіріңді айт" деген сұрақтар жасама
- нұсқалар бір-біріне ұқсас деңгейде болсын, бірақ тек біреуі дұрыс болсын
- reference_answer қысқа түсіндірме болсын
- тек JSON массив қайтар

Пәндік бағдар:
{profile_topics or 'Жалпы пән тақырыптары'}

Контекст:
{source_text or 'Контекст берілмеген'}

JSON форматы:
[
  {{
    "id": "Q1",
    "type": "ұбт",
    "difficulty": "орташа",
    "question": "....",
    "answer_format": "mcq",
    "options": ["A", "B", "C", "D"],
    "correct_answer": "....",
    "reference_answer": "...."
  }}
]
""".strip()

    response = client.responses.create(model=_openai_model(), input=prompt)
    payload = _extract_json(getattr(response, "output_text", "") or "")

    questions = _normalize_generated_questions(
        payload,
        source_text or topic or subject,
        limit=requested_count,
        force_mcq=True,
    )
    questions = [q for q in questions if q.get("answer_format") == "mcq" and len(q.get("options") or []) == 4]
    questions = _dedupe_questions(questions, requested_count)

    if len(questions) < min(5, requested_count):
        raise ValueError("UNT question generation insufficient")

    return {
        "mode": "openai",
        "subject": subject_key,
        "passage": "",
        "questions": questions[:requested_count],
    }


def _generate_reading_literacy_with_ai(client, requested_count: int) -> dict[str, Any]:
    requested_count = _clamp_requested_count(requested_count, 10)

    prompt = f"""
Қазақ тілінде оқу сауаттылығына арналған қысқа мәтін және сол мәтін бойынша {requested_count} сұрақ құрастыр.

Талаптар:
- 140-220 сөз аралығындағы біртұтас мәтін жаз
- мәтін нақты, табиғи және логикалық болсын
- мәтінде кемі бір себеп-салдар, бір қорытынды жасауға болатын ой, және бір нақты деталь болсын
- сұрақтар тек осы мәтінге сүйеніп жасалсын
- сұрақтар әртүрлі болсын: негізгі ой, автор мақсаты, деталь, қорытынды, сөз/тіркес мағынасы, қысқа талдау
- бірнеше сұрақ multiple choice болсын
- нұсқаларда бір ғана дұрыс жауап болсын
- әр mcq-де correct_answer болсын
- әр text сұрақта reference_answer болсын
- тек JSON қайтар

Формат:
{{
  "passage": "...",
  "questions": [
    {{
      "id": "Q1",
      "type": "мәтіннің негізгі ойы",
      "difficulty": "орташа",
      "question": "...",
      "answer_format": "mcq",
      "options": ["...", "...", "...", "..."],
      "correct_answer": "...",
      "reference_answer": "..."
    }}
  ]
}}
""".strip()

    response = client.responses.create(model=_openai_model(), input=prompt)
    payload = _extract_json(getattr(response, "output_text", "") or "")
    if not isinstance(payload, dict):
        raise ValueError("Оқу сауаттылығы генерациясы жарамсыз")

    passage = _clean_text(payload.get("passage") or payload.get("text"))
    questions = _normalize_generated_questions(payload.get("questions") or [], passage, limit=requested_count)

    if len(passage.split()) < 80 or len(questions) < min(5, requested_count):
        raise ValueError("Оқу сауаттылығы генерациясы жеткіліксіз")

    return {
        "mode": "openai",
        "subject": "reading_literacy",
        "passage": passage,
        "questions": questions[:requested_count],
    }


def _generate_math_literacy_with_ai(client, requested_count: int) -> dict[str, Any]:
    requested_count = _clamp_requested_count(requested_count, 10)

    prompt = f"""
Қазақ тілінде математикалық сауаттылыққа арналған {requested_count} есеп құрастыр.

Талаптар:
- контекст күнделікті өмірге жақын болсын: ақша, уақыт, қашықтық, пайыз, кесте, сандық логика
- сұрақтар негізінен есеп түрінде болсын
- "салыстыр", "айырмашылығы", "кемшілігі" сияқты теориялық немесе контексттік талдау сұрақтары болмасын
- бірнеше сұрақ multiple choice, бірнешеуі қысқа жауап болсын
- әр есепте нақты сандық мәлімет болсын
- әр mcq-де correct_answer болсын
- әр text сұрақта reference_answer болсын
- passage өрісіне бір қысқа кіріспе бер
- тек JSON қайтар

Формат:
{{
  "passage": "...",
  "questions": [
    {{
      "id": "Q1",
      "type": "есеп",
      "difficulty": "орташа",
      "question": "...",
      "answer_format": "mcq",
      "options": ["...", "...", "...", "..."],
      "correct_answer": "...",
      "reference_answer": "..."
    }}
  ]
}}
""".strip()

    response = client.responses.create(model=_openai_model(), input=prompt)
    payload = _extract_json(getattr(response, "output_text", "") or "")
    if not isinstance(payload, dict):
        raise ValueError("Математикалық сауаттылық генерациясы жарамсыз")

    passage = _clean_text(payload.get("passage") or "Математикалық сауаттылық бойынша есептер")
    questions = _normalize_generated_questions(payload.get("questions") or [], passage, limit=requested_count)

    banned = ["салыстыр", "айырмаш", "кемшілік", "артықшылық", "пікір"]
    filtered = [
        q for q in questions
        if not any(word in q.get("question", "").lower() for word in banned)
    ]

    if len(filtered) < min(5, requested_count):
        raise ValueError("Математикалық сауаттылық генерациясы жеткіліксіз")

    return {
        "mode": "openai",
        "subject": "math_literacy",
        "passage": passage,
        "questions": filtered[:requested_count],
    }


def _reading_literacy_pack(requested_count: int = 10) -> dict[str, Any]:
    requested_count = _clamp_requested_count(requested_count, 10)

    passage = (
        "Қазіргі қоғамда оқу сауаттылығы тек мәтінді оқи алу емес. Ол ақпаратты түсіну, негізгі ойды ажырату, "
        "деректі салыстыру және алынған мәліметті өмірде қолдану қабілетін қамтиды. Мысалы, адам күнделікті өмірде "
        "нұсқаулықты, келісімшартты немесе ресми хабарламаны дұрыс түсінуі керек. Егер оқырман мәтіндегі басты ойды "
        "немесе нақты детальді байқай алмаса, ол ақпаратты бұрыс қабылдап, қате шешім шығаруы мүмкін. Сондықтан оқу "
        "сауаттылығы оқу үлгеріміне ғана емес, адамның қоғамдағы белсенділігіне және өз бетінше шешім қабылдауына да әсер етеді."
    )

    questions = [
        _build_mcq_question(
            1,
            "мәтіннің негізгі ойы",
            "Мәтіннің негізгі идеясы қай нұсқада берілген?",
            "Оқу сауаттылығы ақпаратты түсініп, қолдануға көмектеседі.",
            [
                "Оқу сауаттылығы тек көркем шығарма оқуға қажет.",
                "Оқу сауаттылығы тек мектеп бағасы үшін маңызды.",
                "Оқу сауаттылығы тек жылдам оқуды білдіреді.",
            ],
            "Мәтін оқу сауаттылығының ақпаратты түсіну мен қолданудағы маңызын көрсетеді.",
        ),
        _build_mcq_question(
            2,
            "автор мақсаты",
            "Автордың мәтінді жазудағы негізгі мақсаты қандай?",
            "Оқу сауаттылығының маңызын түсіндіру",
            [
                "Көркем әдебиетті насихаттау",
                "Тек мектеп бағдарламасын таныстыру",
                "Оқу жылдамдығын сынау",
            ],
            "Автор оқу сауаттылығының неге маңызды екенін түсіндіреді.",
        ),
        _build_mcq_question(
            3,
            "деталь",
            "Мәтін бойынша қай жағдайда адам қате шешім қабылдауы мүмкін?",
            "Негізгі ойды немесе нақты детальді байқай алмаған кезде",
            [
                "Мәтінді баяу оқыған кезде",
                "Тек әдеби мәтін оқығанда",
                "Ұзақ мәтін көрген кезде",
            ],
            "Басты ой мен детальды түсінбеу қате шешімге әкелуі мүмкін.",
        ),
        _build_mcq_question(
            4,
            "қорытынды",
            "Мәтін мазмұнына сай қорытындыны таңда.",
            "Оқу сауаттылығы күнделікті өмірде де маңызды.",
            [
                "Оқу сауаттылығы тек емтихан үшін керек.",
                "Оқу сауаттылығы тек балаларға қажет.",
                "Оқу сауаттылығы қоғамға әсер етпейді.",
            ],
            "Мәтін оқу сауаттылығының күнделікті шешімдерге әсер ететінін көрсетеді.",
        ),
        _build_text_question(
            5,
            "түсіндіру",
            "Мәтінге сүйеніп, оқу сауаттылығы неліктен қазіргі қоғамда маңызды екенін 1-2 сөйлеммен түсіндір.",
            "Оқу сауаттылығы адамның ақпаратты дұрыс түсінуіне, салыстыруына және өмірлік жағдайда орынды шешім қабылдауына көмектеседі.",
        ),
        _build_text_question(
            6,
            "талдау",
            "Мәтіндегі 'ақпаратты қате түсіну қате шешімге әкеледі' деген ойды өмірлік мысалмен қысқаша байланыстыр.",
            "Мысалы, адам нұсқаулықты дұрыс түсінбесе, дәріні қате қабылдауы немесе келісімшарт шартын қате бағалауы мүмкін.",
        ),
    ]

    if requested_count > len(questions):
        extra = _topic_questions("оқу сауаттылығы", requested_count - len(questions))
        for idx, item in enumerate(extra, start=len(questions) + 1):
            item["id"] = f"Q{idx}"
            item["difficulty"] = _difficulty(idx - 1)
            questions.append(item)

    return {
        "mode": "fallback",
        "subject": "reading_literacy",
        "passage": passage,
        "questions": questions[:requested_count],
    }


def _math_literacy_pack(requested_count: int = 10) -> dict[str, Any]:
    requested_count = _clamp_requested_count(requested_count, 10)

    passage = "Математикалық сауаттылық бойынша күнделікті өмірге жақын есептер жинағы"
    questions = [
        _build_mcq_question(
            1,
            "ақша есебі",
            "Дүкенде 3 дәптер 900 теңге тұрады. Осындай 5 дәптер қанша тұрады?",
            "1500 теңге",
            ["1200 теңге", "1800 теңге", "1300 теңге"],
            "Алдымен бір дәптердің бағасы 300 теңге екенін табамыз, кейін 5-ке көбейтеміз.",
        ),
        _build_mcq_question(
            2,
            "пайыз",
            "Бағасы 2000 теңге затқа 10% жеңілдік жасалды. Жаңа баға қанша болады?",
            "1800 теңге",
            ["1900 теңге", "1700 теңге", "1600 теңге"],
            "2000 теңгенің 10%-ы 200 теңге, сондықтан жаңа баға 1800 теңге болады.",
        ),
        _build_text_question(
            3,
            "қашықтық",
            "Автобус 1 сағатта 60 км жүреді. 2,5 сағатта қанша км жүреді? Жауабыңды қысқаша түсіндір.",
            "60 км/сағ жылдамдықты 2,5 сағатқа көбейтеміз: 60 × 2,5 = 150 км.",
        ),
        _build_mcq_question(
            4,
            "үлес",
            "Сыныпта 12 қыз, 8 ұл бар. Қыздардың үлесі неше пайыз?",
            "60%",
            ["40%", "50%", "70%"],
            "Барлығы 20 оқушы. 12/20 = 0,6, демек 60%.",
        ),
        _build_text_question(
            5,
            "ойлау қадамы",
            "Бір санды 4-ке арттырып, нәтижені 3-ке көбейтсе 27 шықты. Бастапқы санды тап және қысқаша жолын жаз.",
            "(x + 4) × 3 = 27 болса, x + 4 = 9, сондықтан x = 5.",
        ),
        _build_mcq_question(
            6,
            "бөлшек",
            "4000 теңгенің 1/4 бөлігіне тең сома қайсы?",
            "1000",
            ["800", "1200", "1600"],
            "4000-ды 4-ке бөлеміз, нәтиже 1000.",
        ),
    ]

    if requested_count > len(questions):
        extra = _topic_questions("математикалық сауаттылық", requested_count - len(questions))
        for idx, item in enumerate(extra, start=len(questions) + 1):
            item["id"] = f"Q{idx}"
            item["difficulty"] = _difficulty(idx - 1)
            questions.append(item)

    return {
        "mode": "fallback",
        "subject": "math_literacy",
        "passage": passage,
        "questions": questions[:requested_count],
    }


def _generate_general_questions_with_ai(client, text: str, requested_count: int) -> list[dict[str, Any]]:
    requested_count = _clamp_requested_count(requested_count, 10)
    collected: list[dict[str, Any]] = []

    total_batches = max(1, math.ceil(requested_count / GENERAL_AI_BATCH_SIZE))
    max_attempts = min(total_batches + 2, 8)

    for attempt in range(max_attempts):
        remaining = requested_count - len(collected)
        if remaining <= 0:
            break

        batch_count = min(GENERAL_AI_BATCH_SIZE, remaining)
        variation_note = f"Batch {attempt + 1}/{max_attempts}. Avoid repeating earlier questions."

        prompt = f"""
Пайдаланушы мәтіні немесе тақырыбы бойынша {batch_count} сапалы сұрақ құр.
{variation_note}
Тек JSON массив қайтар.

Әр объект өрістері:
- id
- type
- difficulty
- question
- answer_format   ("text" немесе "mcq")
- options         (mcq болса 4 нұсқа, әйтпесе [])
- correct_answer  (mcq үшін міндетті, text үшін бос жол)
- reference_answer (text үшін 1-3 сөйлемдік үлгі жауап, mcq үшін дұрыс нұсқамен мазмұндас қысқа түсіндірме)

Ережелер:
- сұрақтар қазақ тілінде болсын
- қайталанатын, бұлыңғыр, тым жалпы сұрақ жасама
- кемінде осы batch ішіндегі сұрақтардың 40%-ы mcq болсын
- mcq сұрақтарында тек бір дұрыс жауап болсын
- options ішінде correct_answer міндетті түрде болсын
- reference_answer тым ұзақ болмасын, бірақ нақты болсын
- мәтіннен тыс жалған факт ойлап қоспа
- тек JSON қайтар

Мәтін:
{text}
""".strip()

        response = client.responses.create(model=_openai_model(), input=prompt)
        out = getattr(response, "output_text", "") or ""
        batch_questions = _normalize_generated_questions(_extract_json(out), text, limit=batch_count)
        collected.extend(batch_questions)
        collected = _dedupe_questions(collected, requested_count)

    if len(collected) < min(5, requested_count):
        raise ValueError("insufficient questions")

    if len(collected) < requested_count:
        filler = _fallback_generate(text, requested_count - len(collected))
        collected.extend(filler)
        collected = _dedupe_questions(collected, requested_count)

    return collected[:requested_count]


def generate_questions(
    text: str,
    requested_count: int = 10,
    *,
    subject: str = "",
    topic: str = "",
    requested_kind: str = "",
    exam_mode: str = "",
) -> dict[str, Any]:
    clean = _clean_text(text)
    clean_subject = _clean_text(subject)
    clean_topic = _clean_text(topic)
    requested_count = _clamp_requested_count(requested_count, 10)
    kind = _clean_text(requested_kind).lower()

    exam_mode_detected = _detect_exam_mode(clean, clean_subject, clean_topic, exam_mode)
    unt_subject = _detect_unt_subject(clean_subject, clean_topic, clean)

    if exam_mode_detected == "unt" and unt_subject:
        client = _openai_client()
        try:
            if client is not None:
                return _generate_unt_questions_with_ai(
                    client,
                    subject_key=unt_subject,
                    subject=clean_subject,
                    topic=clean_topic,
                    source_text=clean,
                    requested_count=requested_count,
                )
        except Exception:
            logger.exception("UNT generation failed for subject=%s", unt_subject)

        return _unt_fallback_pack(unt_subject, requested_count, clean_topic or clean_subject)

    if not clean:
        fallback_topic = clean_topic or clean_subject or "тақырып"
        questions = _topic_questions(fallback_topic, requested_count)
        if kind == "multiple_choice":
            questions = [q for q in questions if q.get("answer_format") == "mcq"]
            if len(questions) < requested_count:
                extra = _unt_fallback_pack("informatics", requested_count, fallback_topic)["questions"]
                questions.extend(extra)
                questions = _dedupe_questions(
                    [q for q in questions if q.get("answer_format") == "mcq"],
                    requested_count,
                )
        elif kind == "short_answer":
            questions = [q for q in questions if q.get("answer_format") == "text"][:requested_count]

        return {
            "mode": "fallback",
            "subject": "general",
            "questions": questions[:requested_count],
            "passage": "",
        }

    special_subject = _detect_special_subject(" ".join([clean, clean_subject, clean_topic]))
    client = _openai_client()

    if special_subject == "reading_literacy":
        if client is not None:
            try:
                return _generate_reading_literacy_with_ai(client, requested_count)
            except Exception:
                logger.exception("reading_literacy generation failed")
        return _reading_literacy_pack(requested_count)

    if special_subject == "math_literacy":
        if client is not None:
            try:
                return _generate_math_literacy_with_ai(client, requested_count)
            except Exception:
                logger.exception("math_literacy generation failed")
        return _math_literacy_pack(requested_count)

    if client is None:
        questions = _fallback_generate(clean, requested_count)
        if kind == "multiple_choice":
            questions = [q for q in questions if q.get("answer_format") == "mcq"]
            if len(questions) < requested_count:
                subject_key = unt_subject or "informatics"
                extra = _unt_fallback_pack(subject_key, requested_count, clean_topic or clean_subject)["questions"]
                questions.extend(extra)
                questions = _dedupe_questions(
                    [q for q in questions if q.get("answer_format") == "mcq"],
                    requested_count,
                )
        elif kind == "short_answer":
            questions = [q for q in questions if q.get("answer_format") == "text"][:requested_count]

        return {
            "mode": "fallback",
            "subject": "general",
            "questions": questions[:requested_count],
            "passage": "",
        }

    try:
        questions = _generate_general_questions_with_ai(client, clean, requested_count)

        if kind == "multiple_choice":
            questions = [q for q in questions if q.get("answer_format") == "mcq"]
            if len(questions) < requested_count:
                subject_key = unt_subject or "informatics"
                extra = _unt_fallback_pack(subject_key, requested_count, clean_topic or clean_subject)["questions"]
                questions.extend(extra)
                questions = _dedupe_questions(
                    [q for q in questions if q.get("answer_format") == "mcq"],
                    requested_count,
                )
        elif kind == "short_answer":
            questions = [q for q in questions if q.get("answer_format") == "text"][:requested_count]

        return {
            "mode": "openai",
            "subject": "general",
            "questions": questions[:requested_count],
            "passage": "",
        }
    except Exception:
        logger.exception("general question generation failed")
        questions = _fallback_generate(clean, requested_count)

        if kind == "multiple_choice":
            questions = [q for q in questions if q.get("answer_format") == "mcq"]
            if len(questions) < requested_count:
                subject_key = unt_subject or "informatics"
                extra = _unt_fallback_pack(subject_key, requested_count, clean_topic or clean_subject)["questions"]
                questions.extend(extra)
                questions = _dedupe_questions(
                    [q for q in questions if q.get("answer_format") == "mcq"],
                    requested_count,
                )
        elif kind == "short_answer":
            questions = [q for q in questions if q.get("answer_format") == "text"][:requested_count]

        return {
            "mode": "fallback",
            "subject": "general",
            "questions": questions[:requested_count],
            "passage": "",
        }


def _jaccard_score(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / max(len(a | b), 1)


def _expand_tokens(tokens: set[str]) -> set[str]:
    expanded = set(tokens)
    for token in list(tokens):
        for root, variants in SYNONYM_MAP.items():
            if token == root or token in variants:
                expanded.add(root)
                expanded.update(variants)
    return expanded


def _build_ideal_answer(reference_answer: str, correct_answer: str, question: str, source_text: str) -> str:
    if _clean_text(reference_answer):
        return _clean_text(reference_answer)
    if _clean_text(correct_answer):
        return _clean_text(correct_answer)
    if _clean_text(source_text):
        return _sentence_split(source_text)[0]
    return f"Бұл сұраққа тікелей, нақты және қысқа жауап беру керек: {question}"


def _resolve_mcq_answer(user_answer: str, options: list[str] | None = None) -> str:
    answer = _clean_text(user_answer)
    if not answer:
        return ""

    options = [_clean_text(option) for option in (options or []) if _clean_text(option)]
    if not options:
        return answer

    normalized = _normalize_text_for_compare(answer)
    label_map = {
        "a": 0, "b": 1, "c": 2, "d": 3,
        "1": 0, "2": 1, "3": 2, "4": 3,
    }
    if normalized in label_map:
        idx = label_map[normalized]
        if 0 <= idx < len(options):
            return options[idx]

    match = re.match(r"^(?:option|нұсқа)\s*([1-4])$", normalized)
    if match:
        idx = int(match.group(1)) - 1
        if 0 <= idx < len(options):
            return options[idx]

    return answer


def _fallback_evaluate_direct(
    question: str,
    user_answer: str,
    source_text: str = "",
    *,
    answer_format: str = "text",
    options: list[str] | None = None,
    correct_answer: str = "",
    reference_answer: str = "",
) -> dict[str, Any]:
    answer = _clean_text(user_answer)
    ideal_answer = _build_ideal_answer(reference_answer, correct_answer, question, source_text)
    if not answer:
        return {
            "is_correct": False,
            "score": 0.0,
            "max_score": 10.0,
            "feedback": "Жауап берілмеген.",
            "suggestion": f"Сұраққа тікелей жауап бер. Үлгі жауап: {ideal_answer}",
            "ideal_answer": ideal_answer,
        }

    fmt = (answer_format or "text").strip().lower()
    if fmt == "mcq" and _clean_text(correct_answer):
        resolved_answer = _resolve_mcq_answer(answer, options)
        is_correct = _normalize_text_for_compare(resolved_answer) == _normalize_text_for_compare(correct_answer)
        score = 10.0 if is_correct else 0.0
        feedback = "Таңдалған нұсқа дұрыс." if is_correct else "Таңдалған нұсқа қате."
        suggestion = (
            "Жауап дұрыс. Қажет болса неге осы нұсқа дұрыс екенін қысқаша түсіндіріп жазуға болады."
            if is_correct
            else f"Дұрыс нұсқа: {correct_answer}. Үлгі түсіндіру: {ideal_answer}"
        )
        return {
            "is_correct": is_correct,
            "score": score,
            "max_score": 10.0,
            "feedback": feedback,
            "suggestion": suggestion,
            "ideal_answer": ideal_answer,
        }

    answer_norm = _normalize_text_for_compare(answer)
    correct_norm = _normalize_text_for_compare(correct_answer)
    reference_norm = _normalize_text_for_compare(reference_answer)
    ideal_norm = _normalize_text_for_compare(ideal_answer)

    if correct_norm and answer_norm == correct_norm:
        return {
            "is_correct": True,
            "score": 10.0,
            "max_score": 10.0,
            "feedback": "Жауап дәл сәйкес келеді.",
            "suggestion": "Жауап дұрыс.",
            "ideal_answer": ideal_answer,
        }

    if reference_norm and answer_norm == reference_norm:
        return {
            "is_correct": True,
            "score": 10.0,
            "max_score": 10.0,
            "feedback": "Жауап үлгі жауаппен толық сәйкес.",
            "suggestion": "Жауап дұрыс.",
            "ideal_answer": ideal_answer,
        }

    answer_tokens = _expand_tokens({t for t in _tokenize(answer) if t not in STOPWORDS})
    ideal_tokens = _expand_tokens({t for t in _tokenize(ideal_answer) if t not in STOPWORDS})

    ref_text_parts = [reference_answer, correct_answer, _truncate(source_text, 800)]
    if not any(_clean_text(part) for part in ref_text_parts):
        ref_text_parts.append(question)
    ref_tokens = _expand_tokens({
        t for t in _tokenize(" ".join(part for part in ref_text_parts if _clean_text(part)))
        if t not in STOPWORDS
    })

    overlap = _jaccard_score(answer_tokens, ref_tokens)
    ideal_overlap = _jaccard_score(answer_tokens, ideal_tokens)
    keyword_hits = len(answer_tokens & ref_tokens)
    ideal_hits = len(answer_tokens & ideal_tokens)

    subset_match = bool(answer_tokens) and bool(ideal_tokens) and answer_tokens.issubset(ideal_tokens)
    contains_core = bool(answer_norm and ideal_norm) and (
        answer_norm in ideal_norm or ideal_norm in answer_norm
    )

    score = 1.5

    if subset_match and len(answer_tokens) <= 4 and ideal_hits >= max(1, len(answer_tokens)):
        score = 9.5
    elif contains_core and len(answer_tokens) <= 6:
        score = 9.2
    elif ideal_overlap >= 0.55 or ideal_hits >= 6:
        score = 8.8
    elif ideal_overlap >= 0.35 or ideal_hits >= 4:
        score = 7.6
    elif overlap >= 0.22 or keyword_hits >= 3:
        score = 6.3
    elif overlap >= 0.12 or keyword_hits >= 2:
        score = 4.8
    elif overlap > 0:
        score = 3.2

    if len(answer.split()) >= 6 and score >= 6.3:
        score += 0.3
    score = round(min(score, 10.0), 1)
    is_correct = score >= 6.5

    if is_correct:
        feedback = "Жауап негізгі ойды дұрыс қамтиды."
        suggestion = "Жауап дұрыс. Қажет болса оны нақты мысалмен немесе қысқа дәлелмен күшейтуге болады."
    elif score >= 4.5:
        feedback = "Жауаптың бағыты дұрыс, бірақ нақтылық жеткіліксіз."
        suggestion = f"Негізгі ойды дәлірек жаз. Үлгі жауап: {ideal_answer}"
    else:
        feedback = "Жауап сұраққа дәл келмейді немесе мазмұны әлсіз."
        suggestion = f"Сұраққа тікелей жауап беріп, негізгі ұғымдарды қолдан. Үлгі жауап: {ideal_answer}"

    return {
        "is_correct": is_correct,
        "score": score,
        "max_score": 10.0,
        "feedback": feedback,
        "suggestion": suggestion,
        "ideal_answer": ideal_answer,
    }


def evaluate_answer_direct(
    question: str,
    user_answer: str,
    source_text: str = "",
    *,
    answer_format: str = "text",
    options: list[str] | None = None,
    correct_answer: str = "",
    reference_answer: str = "",
) -> dict[str, Any]:
    fallback = _fallback_evaluate_direct(
        question,
        user_answer,
        source_text,
        answer_format=answer_format,
        options=options,
        correct_answer=correct_answer,
        reference_answer=reference_answer,
    )

    client = _openai_client()
    if client is None or ((answer_format or "text").strip().lower() == "mcq" and _clean_text(correct_answer)):
        fallback["mode"] = "fallback"
        return fallback

    ideal_answer = _build_ideal_answer(reference_answer, correct_answer, question, source_text)
    prompt = f"""
Сен қазақ тілінде әділ бағалайтын тексерушісің.
Төмендегі пайдаланушы жауабын бағала.

СҰРАҚ:
{_clean_text(question)}

КОНТЕКСТ:
{_clean_text(source_text) or 'Контекст берілмеген'}

ҮЛГІ ЖАУАП:
{ideal_answer}

ПАЙДАЛАНУШЫ ЖАУАБЫ:
{_clean_text(user_answer)}

Тек JSON қайтар:
{{
  "is_correct": true,
  "score": 8.5,
  "feedback": "қысқа түсіндірме",
  "suggestion": "егер қате не әлсіз болса, жауаптың қалай болуы керегін көрсет",
  "ideal_answer": "1-3 сөйлемдік дұрыс/үлгі жауап"
}}

Ережелер:
- score 0..10 аралығында болсын
- егер жауап мағыналық тұрғыдан дұрыс болса, әдетте 7-10 бер
- suggestion ішінде қажет болса нақты үлгі жауапты көрсет
- ideal_answer қазақ тілінде, қысқа әрі нақты болсын
- тек JSON қайтар
""".strip()

    try:
        response = client.responses.create(model=_openai_model(), input=prompt)
        raw = getattr(response, "output_text", "") or ""
        result = _extract_json(raw)
        score = float(result.get("score", fallback["score"]))
        score = max(0.0, min(10.0, round(score, 1)))
        is_correct = bool(result.get("is_correct", score >= 6.5))
        ai_ideal = _clean_text(result.get("ideal_answer")) or ideal_answer
        suggestion = _clean_text(result.get("suggestion"))
        if not suggestion:
            suggestion = fallback["suggestion"]
        elif not is_correct and _normalize_text_for_compare(ai_ideal) not in _normalize_text_for_compare(suggestion):
            suggestion = f"{suggestion} Үлгі жауап: {ai_ideal}"
        return {
            "is_correct": is_correct,
            "score": score,
            "max_score": 10.0,
            "feedback": _clean_text(result.get("feedback")) or fallback["feedback"],
            "suggestion": suggestion,
            "ideal_answer": ai_ideal,
            "mode": "openai",
        }
    except Exception:
        logger.exception("openai evaluation failed")
        fallback["mode"] = "fallback"
        return fallback


class AITutorService:
    def __init__(self, openai_client=None):
        self.openai_client = openai_client or _openai_client()

    def build_tutor_system_prompt(self) -> str:
        return """
Сен оқу платформасындағы AI репетиторсың.
Міндетің:
1. Пайдаланушы сұрағын нақты түсіндіру.
2. Тек соңғы жауапты айтып қоймай, логикасын үйрету.
3. Егер жауап қате болса, неге қате екенін қысқа және нақты көрсету.
4. Міндетті түрде қысқа үлгі дұрыс жауап беру.
5. Егер математика болса, қадамдап шешу.
6. Егер оқу сауаттылығы болса, мәтінге сүйеніп дәлелдеу.
7. Жауап жинақы, нақты, тек сұраққа қатысты болсын.
8. Білмейтін факті ойлап қоспа.

Жауап құрылымы:
Түсіндіру:
...
Қадамдар:
...
Неге қате:
...
Үлгі дұрыс жауап:
...
Келесіде қалай ойлау керек:
...
""".strip()

    def _format_context(self, context: dict[str, Any] | None) -> str:
        if not context:
            return "Контекст берілмеген."

        safe_context = {
            "subject": context.get("subject"),
            "topic": context.get("topic"),
            "question_text": context.get("question_text"),
            "question_type": context.get("question_type"),
            "passage": _truncate(context.get("passage"), MAX_PASSAGE_CHARS),
            "options": context.get("options"),
            "correct_answer": context.get("correct_answer"),
            "reference_answer": context.get("reference_answer"),
            "student_answer": context.get("student_answer"),
            "difficulty": context.get("difficulty"),
        }
        return json.dumps(safe_context, ensure_ascii=False, indent=2)

    def _build_user_prompt(
        self,
        user_message: str,
        context: dict[str, Any] | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> str:
        history_text = ""
        if history:
            trimmed = history[-MAX_TUTOR_HISTORY:]
            history_text = "\n".join(
                [f"{m.get('role', 'user')}: {_truncate(m.get('content', ''), 1200)}" for m in trimmed]
            )
        return f"""
Пайдаланушының соңғы сұрағы:
{_clean_text(user_message)}

Контекст:
{self._format_context(context)}

Алдыңғы диалог:
{history_text if history_text else "Жоқ"}

Енді осы сұрақты репетитор ретінде түсіндір.
Егер пайдаланушы қате жауап берген болса:
- неге қате екенін айт
- дұрыс бағытты көрсет
- үлгі дұрыс жауап бер

Егер бұл математика болса:
- қадамдап шығар
- формуланы немесе әдісті көрсет

Егер бұл оқу сауаттылығы болса:
- мәтіннен дәлел келтір
- жауапты мәтінге сүйеніп түсіндір

Егер пайдаланушы тікелей "жауапты бер" деп сұраса, қысқа жауапты бер де, артынан қысқа түсіндіру қос.
""".strip()

    def tutor_reply(
        self,
        user_message: str,
        context: dict[str, Any] | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        client = self.openai_client
        if client is not None:
            try:
                model_name = _openai_model()
                try:
                    response = client.responses.create(
                        model=model_name,
                        input=[
                            {"role": "system", "content": self.build_tutor_system_prompt()},
                            {"role": "user", "content": self._build_user_prompt(user_message, context, history)},
                        ],
                    )
                    text = _clean_text(getattr(response, "output_text", ""))
                except Exception:
                    response = client.chat.completions.create(
                        model=model_name,
                        temperature=0.4,
                        messages=[
                            {"role": "system", "content": self.build_tutor_system_prompt()},
                            {"role": "user", "content": self._build_user_prompt(user_message, context, history)},
                        ],
                    )
                    text = _clean_text(response.choices[0].message.content)
                if text:
                    return {"answer": text, "used_model": model_name, "fallback": False}
            except Exception:
                logger.exception("tutor reply generation failed")

        return {
            "answer": self._fallback_tutor_reply(user_message, context),
            "used_model": "fallback",
            "fallback": True,
        }

    def _fallback_tutor_reply(self, user_message: str, context: dict[str, Any] | None = None) -> str:
        ctx = context or {}
        question_text = _clean_text(ctx.get("question_text"))
        correct_answer = _clean_text(ctx.get("correct_answer"))
        reference_answer = _clean_text(ctx.get("reference_answer"))
        student_answer = _clean_text(ctx.get("student_answer"))
        question_type = _clean_text(ctx.get("question_type")).lower()
        passage = _clean_text(ctx.get("passage"))
        subject = _clean_text(ctx.get("subject")).lower()

        parts: list[str] = ["Түсіндіру:"]
        if question_text:
            parts.append(f"Сұрақ: {question_text}")
        elif _clean_text(user_message):
            parts.append(f"Сұрақ: {_truncate(user_message, 300)}")

        if "math" in subject or "мат" in subject:
            parts.append("Бұл математикалық тапсырма, сондықтан берілгенді, ізделіндіні және есептеу қадамын бөлек қарау керек.")
        elif "reading" in subject or "оқу" in subject:
            parts.append("Бұл оқу сауаттылығы сұрағы, сондықтан жауап мәтіндегі негізгі ой мен тірек детальдарға сүйенуі керек.")
        else:
            parts.append("Алдымен сұрақтың не сұрап тұрғанын дәл анықтап алу керек.")

        parts.append("Негізгі ой:")
        if passage:
            first_sent = _sentence_split(passage)[:2]
            parts.append(" ".join(first_sent) if first_sent else "Мәтіндегі негізгі ойға сүйену қажет.")
        elif reference_answer:
            parts.append(reference_answer)
        elif correct_answer:
            parts.append(correct_answer)
        else:
            parts.append("Сұрақтың кілт сөзіне сүйеніп қысқа әрі нақты жауап құрастыру керек.")

        parts.append("Қадамдар:")
        if "math" in subject or "мат" in subject:
            parts.append("1) Берілген шамаларды анықта. 2) Қажетті формуланы таңда. 3) Есептеуді орында. 4) Соңғы жауапты тексер.")
        elif question_type == "mcq":
            parts.append("1) Сұрақтың негізгі шартын тап. 2) Әр нұсқаны шартпен салыстыр. 3) Тек толық сәйкес нұсқаны таңда.")
        else:
            parts.append("1) Сұрақтың кілт сөзін тап. 2) Негізгі дәлелді немесе деректі белгіле. 3) Жауапты қысқа және нақты құрастыр.")

        if student_answer:
            parts.append("Неге қате:")
            if correct_answer and _normalize_text_for_compare(student_answer) != _normalize_text_for_compare(correct_answer):
                parts.append("Сенің жауабың дұрыс жауаппен сәйкес келмейді немесе негізгі ойды толық ашпайды.")
            else:
                parts.append("Жауапта негізгі дәлел не толық негіздеме жетіспейді.")

        parts.append("Үлгі дұрыс жауап:")
        parts.append(reference_answer or correct_answer or "Қысқа, нақты және сұрақ талабына толық жауап жазу керек.")

        parts.append("Келесіде қалай ойлау керек:")
        parts.append("Алдымен сұрақтың талабын анықта, содан кейін негізгі дәлелді немесе формуланы тап, соңында қысқа әрі нақты жауап бер.")

        return "\n".join(parts)


def create_tutor_service() -> AITutorService:
    return AITutorService()