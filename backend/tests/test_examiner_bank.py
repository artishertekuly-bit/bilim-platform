"""Сұрақ банкі контурының тесттері. Іске қосу: python -m unittest discover -s backend/tests -t backend"""

from __future__ import annotations

import asyncio
import hashlib
import inspect
import json
import random
import unittest
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

import asyncpg

import app.examiner.bank.pipeline as pipeline_module

from app.examiner.bank.audit import BankQuestion, audit
from app.examiner.bank.checks import (
    DUPLICATE_THRESHOLD,
    cosine,
    duplicate_problem,
    mcq_solver_problem,
    quote_problem,
    repeat_problem,
)
from app.examiner.bank.concepts import (
    ChunkConcepts,
    Concept,
    ConceptItem,
    concept_groups,
    parse_concepts,
    resolve_type,
    topic_concepts,
)
from app.examiner.bank.context import (
    FULL_PARAGRAPH_FORMATS,
    MAX_CONTEXT_CHUNKS,
    Chunk,
    chunk_combinations,
    clean_chunk_text,
    distant_partners,
    entity_map,
    full_paragraph_window,
    reference_text,
    strip_assignments,
)
from app.examiner.bank.formats import (
    AI_FORMATS,
    ALL_FORMATS,
    CODE_FORMATS,
    CONCEPT_BOUND_FORMATS,
    GEN_MODELS,
    HYBRID_FORMATS,
    CaseDataTable,
    CaseStudyGen,
    CaseTableRow,
    ErrorStepGen,
    FeynmanGen,
    FormulaGen,
    MatchingGen,
    MCQGen,
    PriorityGen,
    RubricBand,
    SequenceGen,
    ShortAnswerGen,
    SliderGen,
    SocraticCheckpoint,
    SocraticGen,
    TeachAiGen,
    TrueFalseFixGen,
    gen_from_package,
    normalize_text,
)
from app.examiner.session import ai_grader, dialog
from app.examiner.bank.pipeline import (
    BankPipeline,
    BatchRecord,
    NewQuestion,
    Paragraph,
    RequestRecord,
)
from app.examiner.bank.planner import StockPolicy, concept_targets, effective_composition, plan, stock_targets
from app.examiner.bank.repository import PgBankRepository
from app.examiner.bank.prompts import GenerationTask, generation_messages, generation_prompt_ref, load_prompt
from app.llm_gateway import LLMGateway, Task, Usage, parse_config
from app.llm_gateway.contracts import BatchItemResult, BatchStatus
from app.llm_gateway.prompting import validate_messages
from app.llm_gateway.providers import FakeProvider, ProviderError
from app.llm_gateway.providers.base import CompletionRequest, ProviderCompletion
from app.llm_gateway.telemetry import MemorySink

SOURCE = (
    "Ұлы Жібек жолы Қытайдан Жерорта теңізіне дейін созылған сауда жолы болды. "
    "Ол арқылы жібек, қағаз және дәмдеуіштер тасылды. Отырар мен Тараз осы жолдың бойындағы ірі қалалар еді."
)
QUOTE = "Ол арқылы жібек, қағаз және дәмдеуіштер тасылды."
COMMON = {"ecd_skill": "Сауда жолын таниды", "evidence": "Жолдың атауын біледі", "support_quote": QUOTE}


def mcq(**overrides) -> MCQGen:
    data = {"stem": "Қытайдан Жерорта теңізіне дейінгі сауда жолы қалай аталды?",
            "options": ["Ұлы Жібек жолы", "Тұз жолы", "Янтарь жолы", "Шай жолы"], "correct_index": 0, **COMMON}
    data.update(overrides)
    return MCQGen.model_validate(data)


# ------------------------------------------------------------------ форматтар


class FormatTests(unittest.TestCase):
    def setUp(self) -> None:
        self.rng = random.Random(7)

    def test_mcq_key_follows_shuffled_option(self) -> None:
        gen = mcq()
        self.assertEqual(gen.problems(), [])
        for seed in range(20):
            package = gen.to_package(random.Random(seed))
            options = {option["id"]: option["text"] for option in package.content["options"]}
            self.assertEqual(options[package.key["correct_option_id"]], "Ұлы Жібек жолы")
            self.assertNotIn("correct_index", json.dumps(package.content))

    def test_mcq_correct_position_is_spread(self) -> None:
        positions = {mcq().to_package(random.Random(seed)).key["correct_option_id"] for seed in range(40)}
        self.assertEqual(positions, {"a", "b", "c", "d"})

    def test_mcq_problems(self) -> None:
        self.assertIn("Т6: нұсқа саны 4 емес", mcq(options=["А", "Б", "В"]).problems())
        self.assertIn("Т7: нұсқа қайталанады", mcq(options=["А", "а ", "В", "Г"]).problems())
        self.assertIn("Т6: correct_index нұсқалар аралығында емес", mcq(correct_index=4).problems())
        self.assertIn("Т7: support_quote тым қысқа", mcq(support_quote="жоқ").problems())

    def test_mcq_length_cue(self) -> None:
        # Бірінші сынақтағы нақты сұрақ: дұрыс нұсқа ұзын, қате нұсқалар «Тек»-тен басталады.
        options = ["Адамзаттың өткен өміріндегі маңызды оқиғалар мен тұлғаларды зерттейді.",
                   "Тек қазіргі заман оқиғаларын зерттейді.", "Тек тарихи тұлғалардың өмірбаянын зерттейді.",
                   "Тек ежелгі жазба деректерді зерттейді."]
        problems = mcq(options=options, correct_index=0).problems()
        self.assertTrue(any(p.startswith("Т6: дұрыс нұсқа қалғандарынан едәуір ұзын") for p in problems), problems)
        self.assertIn("Т6: «тек», «ешқашан» сияқты сөздер тек қате нұсқаларда", problems)
        # Сол нұсқалар, бірақ ұзын нұсқа қате болса — белгі жоқ (абсолютті сөз дұрыс нұсқада тұр).
        self.assertEqual(mcq(options=options, correct_index=1).problems(), [])

    def test_mcq_short_options_tolerate_small_differences(self) -> None:
        # Есімдерде 7 таңбалық айырма — белгі емес (LENGTH_CUE_MIN_CHARS).
        self.assertEqual(mcq(options=["Әбілқайыр хан", "Абылай", "Тәуке", "Есім"], correct_index=0).problems(), [])
        self.assertEqual(mcq().problems(), [])
        # Абсолютті сөз бір ғана қате нұсқада — рұқсат.
        self.assertEqual(mcq(options=["Ұлы Жібек жолы", "Тек тұз жолы", "Янтарь жолы", "Шай жолы"]).problems(), [])

    def test_mcq_distractor_that_is_part_of_the_answer(self) -> None:
        # §16–17 X3: дұрысы «6–10-нан 20–50-ге дейін», ал «6–10» мен «20–50» қате нұсқа болып тұрды (D80).
        part = mcq(stem="Қоныс әдетте қанша үйден құралды?",
                   options=["6–10-нан 20–50-ге дейінгі үйлерден", "6–10 үйден", "100–300 үйден", "3–5 үйден"])
        self.assertIn("Т6: қате нұсқа дұрыс жауаптың бір бөлігі (сандары)", part.problems())
        swapped = mcq(stem="Кен орындарынан қанша мыс алынды?",
                      options=["Жезқазғанда 100 мың, Имантайда 48 мың тонна", "Жезқазғанда 48 мың, Имантайда 100 мың тонна",
                               "Жезқазғанда 50 мың, Имантайда 10 мың тонна", "Жезқазғанда 10 мың, Имантайда 50 мың тонна"])
        self.assertNotIn("Т6: қате нұсқа дұрыс жауаптың бір бөлігі (сандары)", swapped.problems())

    def test_mcq_distractor_named_in_the_stem(self) -> None:
        # §20–21 X3 сынағы: «тұрандықтар» сұрақтың өзінде аталып, қате нұсқа болып тұрды (D80).
        reason = "Т6: қате нұсқа сұрақ мәтінінде аталған"
        named = mcq(stem="Парсы деректерінде тұрандықтардың үнемі қай халықпен жауласқаны көрсетіледі?",
                    options=["Отырықшы ирандықтар", "Андрондықтар", "Сақтар", "Тұрандықтар"])
        self.assertIn(reason, named.problems())
        # Дұрыс нұсқа сұрақта аталса — бұл ереже емес (ол үшін stem echo бар); қысқа нұсқа ескерілмейді.
        right = mcq(stem="Ұлы Жібек жолы Қытайдан қай теңізге дейін созылды?",
                    options=["Ұлы Жібек жолы", "Тұз жолы", "Янтарь жолы", "Шай жолы"])
        self.assertNotIn(reason, right.problems())
        short = mcq(stem="Қола дәуірінде қай металл алғаш балқытылды? Ақ мыс па?",
                    options=["Мыс", "Ақ", "Темір", "Алтын"])
        self.assertNotIn(reason, short.problems())
        # Сөздің ортасынан табылған нұсқа ілінбейді: «ауыл» ≠ «тауыл».
        inner = mcq(stem="Тауылда қандай кәсіп дамыды?", options=["Егіншілік", "Ауыл", "Аңшылық", "Балық аулау"])
        self.assertNotIn(reason, inner.problems())

    def test_mcq_stem_echo_cue(self) -> None:
        # Бірінші Fast Lane сынағындағы нақты сұрақ: «палеолит» сөзі тек дұрыс нұсқада қайталанады.
        echo = mcq(stem="Палеолит дәуірінің негізгі кезеңдерінің бірі қалай аталады?",
                   options=["Ерте палеолит", "Энеолит", "Қола дәуірі", "Неолит"], correct_index=0)
        self.assertIn("Т6: сұрақтағы сөз тек дұрыс нұсқада қайталанады", echo.problems())
        # Сөз барлық нұсқада қайталанса — белгі емес.
        self.assertEqual(mcq().problems(), [])

    def test_matching_bijection_and_limits(self) -> None:
        gen = MatchingGen.model_validate({"stem": "Сәйкестендіріңіз", "pairs": [
            {"left": "Отырар", "right": "Сырдария"}, {"left": "Тараз", "right": "Талас"},
            {"left": "Испиджаб", "right": "Сайрам"}], **COMMON})
        self.assertEqual(gen.problems(), [])
        package = gen.to_package(self.rng)
        right = {item["id"]: item["text"] for item in package.content["right"]}
        left = {item["id"]: item["text"] for item in package.content["left"]}
        got = {left[p["left_id"]]: right[p["right_id"]] for p in package.key["pairs"]}
        self.assertEqual(got, {"Отырар": "Сырдария", "Тараз": "Талас", "Испиджаб": "Сайрам"})
        self.assertNotEqual([item["text"] for item in package.content["right"]], ["Сырдария", "Талас", "Сайрам"])

        long = MatchingGen.model_validate({"stem": "x", "pairs": [
            {"left": "Өте ұзын атауы бар тарихи ескерткіш", "right": "а"}, {"left": "б", "right": "а"},
            {"left": "в", "right": "г"}], **COMMON})
        problems = long.problems()
        self.assertIn("Т6: сол элемент 1 30 таңбадан ұзын", problems)
        self.assertIn("Т7: оң элемент қайталанады", problems)

    def test_text_reference_and_deixis_rejected(self) -> None:
        for bad in (
            "Мәтінде қандай сауда жолы туралы айтылған?",
            "Мәтін бойынша Отырар қай жолдың бойында орналасты?",
            "Бұл кезең тарихта қалай аталады?",
            "Осы тайпалар қай өңірді мекендеді?",
        ):
            self.assertIn("Т6: сұрақ оқулық мәтініне сілтейді (оқушы мәтінді көрмейді)", mcq(stem=bad).problems(), bad)
        for good in (
            "Қытайдан Жерорта теңізіне дейінгі сауда жолы қалай аталған?",
            "Б.з.б. 529 жылы Кир сақтарға жорық жасады. Бұл жорық немен аяқталды?",
        ):
            self.assertEqual(mcq(stem=good).problems(), [], good)

    def test_sequence_key_restores_order(self) -> None:
        steps = ["Түрік қағанаты құрылды", "Батыс түрік қағанаты бөлінді", "Түргеш қағанаты құрылды",
                 "Қарлұқ қағанаты құрылды"]
        gen = SequenceGen.model_validate({"stem": "Ретімен орналастырыңыз", "steps": steps, **COMMON})
        self.assertEqual(gen.problems(), [])
        for seed in range(10):
            package = gen.to_package(random.Random(seed))
            shown = {item["id"]: item["text"] for item in package.content["steps"]}
            self.assertEqual([shown[step_id] for step_id in package.key["order"]], steps)
            self.assertNotEqual([item["text"] for item in package.content["steps"]], steps)
        self.assertIn("Т6: қадам 1 70 таңбадан ұзын", SequenceGen.model_validate(
            {"stem": "x", "steps": ["а" * 71, "б", "в"], **COMMON}).problems())

    def test_error_step(self) -> None:
        data = {"stem": "Қатені табыңыз", "steps": ["А болды", "Б болды", "В болды"], "error_index": 1,
                "correction": "Б болмады", **COMMON}
        package = ErrorStepGen.model_validate(data).to_package(self.rng)
        self.assertEqual(package.key, {"step_id": "e2", "correction": "Б болмады"})
        self.assertIn("Т7: түзету қате қадаммен бірдей",
                      ErrorStepGen.model_validate({**data, "correction": "Б болды"}).problems())

    def test_formula_builder(self) -> None:
        gen = FormulaGen.model_validate({"stem": "Ток күші", "result": "I", "numerator": ["U"],
                                         "denominator": ["R"], "distractors": ["P", "t"], **COMMON})
        self.assertEqual(gen.problems(), [])
        package = gen.to_package(self.rng)
        labels = {token["id"]: token["label"] for token in package.content["tokens"]}
        self.assertEqual({slot: labels[token] for slot, token in package.key["placement"].items()},
                         {"num_1": "U", "den_1": "R"})
        too_many = FormulaGen.model_validate({"stem": "x", "result": "F", "numerator": ["a", "b"],
                                              "denominator": ["c", "d"], "distractors": ["e", "f", "g"], **COMMON})
        self.assertIn("Т6: шама саны 6-дан көп", too_many.problems())
        groups = FormulaGen.model_validate({"stem": "x", "result": "F", "numerator": ["m", "a"],
                                            "denominator": [], "distractors": ["v"], **COMMON}).to_package(self.rng)
        self.assertEqual(groups.key["commutative_groups"], [["num_1", "num_2"]])

    def test_slider_interval_rules(self) -> None:
        base = {"stem": "I = 2 А болатындай R таңдаңыз", "input_name": "R", "input_unit": "Ом", "min": 1, "max": 20,
                "step": 1, "output_name": "I", "output_unit": "А", "formula": "I = 12 / R", "accept_min": 6,
                "accept_max": 6, **COMMON}
        self.assertIn("Т6: дұрыс интервалдың ені слайдер қадамынан кем", SliderGen.model_validate(base).problems())
        ok = SliderGen.model_validate({**base, "accept_min": 5.5, "accept_max": 6.5})
        self.assertEqual(ok.problems(), [])
        self.assertEqual(ok.to_package(self.rng).key, {"accept_min": 5.5, "accept_max": 6.5})
        self.assertIn("Т7: min < max емес", SliderGen.model_validate({**base, "min": 30}).problems())
        self.assertIn("Т7: дұрыс интервал слайдердің шегінен шығады",
                      SliderGen.model_validate({**base, "accept_min": 0, "accept_max": 3}).problems())

    def test_similarity_text_ignores_shuffle(self) -> None:
        texts = {mcq().to_package(random.Random(seed)).similarity_text() for seed in range(10)}
        self.assertEqual(len(texts), 1)

    def test_public_content_has_no_key_fields(self) -> None:
        """ortaq §4: клиентке баратын content-те кілт және рубрика өрістері жоқ."""
        forbidden = (
            "correct", "key", "accept", "order", "pairs", "placement", "correction", "error",
            "rubric", "misconception", "ai_persona", "socratic_checkpoints", "reference_answer",
            "is_true", "accepted_rankings",
        )
        for gen in valid_gens():
            content_keys = json.dumps(gen.to_package(self.rng).content)
            for word in forbidden:
                self.assertNotIn(f'"{word}"', content_keys, f"{gen.format_name}: {word}")

    def test_new_ai_and_hybrid_t6_limits(self) -> None:
        long_case = CaseStudyGen.model_validate({
            "stem": "Кейс", "case_text": "сөз " * 121,
            "data_table": {"title": "К", "headers": ["А", "Б"], "rows": [{"cells": ["1", "2"]} for _ in range(7)]},
            "task_prompt": "Талдаңыз.", "reference_answer": "Жауап.", "rubric": rubric_5(), **COMMON,
        })
        probs = long_case.problems()
        self.assertIn("Т6: case_text 120 сөзден ұзын", probs)
        self.assertIn("Т6: кесте жол саны 1–6 емес", probs)

        bad_socratic = SocraticGen.model_validate({
            "stem": "Тақырып", "situation": "Жағдай", "opening_question": "Неге?",
            "checkpoints": [{"id": "c1", "goal": "Мақсат", "probe_question": "Қалай?", "expected_concepts": ["а"]}],
            "rubric": rubric_5(), **COMMON,
        })
        self.assertIn("Т6: socratic бақылау нүктесі 2–3 емес", bad_socratic.problems())
        self.assertEqual(len(ALL_FORMATS), 13)
        self.assertEqual(len(GEN_MODELS), 13)
        # teach_ai пакетінде socratic_checkpoints міндетті түрде None болуы шарт (Postgres CHECK).
        teach = next(g for g in valid_gens() if g.format_name == "teach_ai").to_package(self.rng)
        self.assertIsNone(teach.socratic_checkpoints)
        self.assertIsNotNone(teach.rubric_0_4)

    def test_self_reference_is_not_a_text_reference(self) -> None:
        """D81: «Бұл диалогта…», «Бұл ұғымды…» — тапсырманың өз бөлігіне сілтеу, Т6 оны ұстамайды. Ал бөлігі
        оқушыға көрсетілмейтін форматта («Бұл жағдайда…» тестте) және басқа деиксис бұрынғыдай ұсталады."""
        text_ref = "Т6: сұрақ оқулық мәтініне сілтейді (оқушы мәтінді көрмейді)"
        gens = {g.format_name: g for g in valid_gens()}

        def problems(name: str, **fields) -> list[str]:
            return gens[name].model_copy(update=fields).problems()

        self.assertNotIn(text_ref, problems("socratic", stem="Бұл диалогта сіз қалалардың рөлін дәлелдейсіз."))
        self.assertNotIn(text_ref, problems("teach_ai", situation="Бұл жағдайда сыныптасыңыз шатасып отыр."))
        self.assertNotIn(text_ref, problems("feynman", audience_prompt="Бұл ұғымды 5-сынып оқушысына түсіндіріңіз."))
        self.assertNotIn(text_ref, problems("case_study", task_prompt="Бұл жағдайда Отырардың рөлін талдаңыз."))
        self.assertNotIn(text_ref, problems("mcq", stem="Бұл тапсырмада сауда жолының атауын табыңыз."))
        self.assertIn(text_ref, problems("mcq", stem="Бұл жағдайда сауда жолы қалай аталды?"))
        self.assertIn(text_ref, problems("feynman", audience_prompt="Бұл диалогта түсіндіріңіз."))
        self.assertIn(text_ref, problems("socratic", situation="Бұл кезеңде қалалар өсті."))
        self.assertIn(text_ref, problems("socratic", situation="Мәтіндегі қалалар туралы ойланыңыз."))

    def test_priority_rejects_order_of_mention_in_the_textbook(self) -> None:
        # D81: «оқулықтағы ретімен» — оқушы мәтінді көрмейді; рет объективті критерийге сүйенуі керек.
        mention = "Т6: басымдық реті оқулықта аталу ретіне сүйенеді (объективті критерий керек)"
        priority = next(g for g in valid_gens() if g.format_name == "priority")
        for field, text in (
            ("stem", "Қалаларды оқулықтағы ретімен орналастырыңыз."),
            ("scenario", "Сіз конспект жасап отырсыз: қалаларды мәтінде берілген ретпен жазыңыз."),
            ("reference_justification", "Қалалар дәл аталған ретпен тізіледі."),
        ):
            self.assertIn(mention, priority.model_copy(update={field: text}).problems(), field)
        objective = priority.model_copy(update={
            "stem": "Оқиғаларды оқулықтағы деректер бойынша хронологиялық ретпен орналастырыңыз."})
        self.assertNotIn(mention, objective.problems())
        self.assertEqual(priority.problems(), [])

        body = load_prompt("priority").body
        self.assertIn("аталу ретіне сүйеме", body)
        for criterion in ("хронология", "себеп-салдар", "деңгей"):
            self.assertIn(criterion, body)
        # Реттілік те (§16–17, mini): «оба үйілді, мәйітті қырынан жатқызды» — аталу реті, рәсімнің реті емес.
        self.assertIn("аталу ретіне сүйеме", load_prompt("sequence").body)


# ------------------------------------------------------------------ контекст


class ContextTests(unittest.TestCase):
    def chunks(self, count: int) -> list[Chunk]:
        return [Chunk(f"c{i}", i, f"мәтін {i}") for i in range(1, count + 1)]

    def test_clean_chunk_text(self) -> None:
        content = "[Оқулық: Қ | Тақырып: §1. X | Тармақ: Y]\n### §1. X\n\nМәтін.\n\n\n\nТағы."
        self.assertEqual(clean_chunk_text(content), "§1. X\n\nМәтін.\n\nТағы.")

    def test_strip_assignments_removes_tasks_questions_and_bibliography(self) -> None:
        raw = (
            "Савроматтар Еділ мен Жайық аралығын мекендеген.\n\n"
            "Қосымша тапсырма\n"
            "1. Картадан савроматтардың аумағын көрсетіңдер.\n"
            "2. Савроматтар мен сақтардың ұқсастығы неде?\n\n"
            "Геродот савроматтар туралы жазба дерек қалдырып, олардың тұрмыс-тіршілігін сипаттаған.\n\n"
            "Пайдаланылған әдебиеттер:\n"
            "Ақышев К.А. Ежелгі Қазақстан. – Алматы, 2017."
        )
        cleaned = strip_assignments(raw)
        self.assertIn("Савроматтар Еділ мен Жайық", cleaned)
        self.assertIn("Геродот савроматтар туралы", cleaned)
        self.assertNotIn("Қосымша тапсырма", cleaned)
        self.assertNotIn("көрсетіңдер", cleaned)
        self.assertNotIn("ұқсастығы неде?", cleaned)
        self.assertNotIn("Алматы, 2017", cleaned)

    def test_pairs_are_adjacent_or_share_entity(self) -> None:
        chunks = self.chunks(4)
        pairs = chunk_combinations(chunks, 2)
        self.assertEqual([(a.chunk_id, b.chunk_id) for a, b in pairs], [("c1", "c2"), ("c2", "c3"), ("c3", "c4")])
        linked = chunk_combinations(chunks, 2, {"c1": frozenset({"Отырар"}), "c4": frozenset({"Отырар"})})
        self.assertIn(("c1", "c4"), [(a.chunk_id, b.chunk_id) for a, b in linked])

    def test_triples_are_connected(self) -> None:
        triples = chunk_combinations(self.chunks(5), 3)
        self.assertEqual([[c.chunk_id for c in t] for t in triples],
                         [["c1", "c2", "c3"], ["c2", "c3", "c4"], ["c3", "c4", "c5"]])

    def test_short_paragraph_uses_whole_paragraph(self) -> None:
        self.assertEqual(len(chunk_combinations(self.chunks(2), 3)), 1)
        self.assertEqual(chunk_combinations([], 1), [])

    def test_x3_partner_prefers_distant_linked_chunk(self) -> None:
        chunks = [Chunk(f"c{i}", i, f"мәтін {i}") for i in range(1, 6)]
        entities = {"c1": frozenset({"Отырар"}), "c4": frozenset({"Отырар"}), "c2": frozenset({"Отырар"})}
        # c2 — көрші (ортақ entity-сі болса да соңында), c4 — ортақ entity, c3 мен c5 — көрші емес, жақыны бірінші.
        self.assertEqual([c.chunk_id for c in distant_partners(chunks, "c1", entities)], ["c4", "c3", "c5", "c2"])
        self.assertEqual([c.chunk_id for c in distant_partners(chunks[:2], "c1")], ["c2"])  # тек көрші бар
        self.assertEqual(distant_partners(chunks[:1], "c1"), [])

    def test_frequent_entity_is_not_a_link(self) -> None:
        ids = [f"c{i}" for i in range(1, 7)]
        links = [("Қазақстан", chunk_id) for chunk_id in ids] + [("Отырар", "c1"), ("Отырар", "c5")]
        mapping = entity_map(links, ids)
        self.assertEqual(mapping, {"c1": frozenset({"Отырар"}), "c5": frozenset({"Отырар"})})

    def test_reference_text_deduplicates_chunk_overlap(self) -> None:
        shared = "Есіл, Тобыл, Ертіс аймақтары мен Оңтүстік Орал даласы ертеде тығыз байланыста болды."
        c1 = Chunk("c1", 1, "Бірінші бөлім мазмұны. " + shared)
        c2 = Chunk("c2", 2, shared + " Кейінгі ғасырларда Сарыарқада ірі мәдениет қалыптасты.")
        c3 = Chunk("c3", 3, "Басқа тәуелсіз бөлім.")
        stitched = reference_text([c1, c2])
        self.assertEqual(stitched.count("Есіл, Тобыл, Ертіс аймақтары"), 1)
        self.assertIn("Бірінші бөлім мазмұны.", stitched)
        self.assertIn("Сарыарқада ірі мәдениет қалыптасты.", stitched)
        self.assertIn("\n\nБасқа тәуелсіз бөлім.", reference_text([c1, c3]))

    def test_full_paragraph_window_returns_whole_or_anchored_window(self) -> None:
        small = [Chunk(f"c{i}", i, f"Бөлім {i}: мазмұн мәтіні.") for i in range(1, 5)]
        self.assertEqual(full_paragraph_window(small, anchor_chunk_id="c2"), tuple(small))
        self.assertEqual(full_paragraph_window([]), ())

        huge = [Chunk(f"c{i}", i, f"Бөлім {i}: " + ("дерек " * 80)) for i in range(1, 7)]
        win = full_paragraph_window(huge, anchor_chunk_id="c4", max_chars=1200)
        ids = [c.chunk_id for c in win]
        self.assertIn("c4", ids)
        self.assertLess(len(win), len(huge))
        self.assertLessEqual(len(reference_text(win)), 1200)

    def test_full_paragraph_window_fits_the_request_chunk_limit_of_the_schema(self) -> None:
        # D82: базадағы CHECK 1–3 чанк болатын, толық § терезесі (§16–17-де 5 чанк) жазылмай, L3/L4 генерациясы
        # құлайтын. Кодтағы шек пен соңғы миграциядағы шек бірдей, терезе одан аспайды.
        tiny = [Chunk(f"c{i}", i, f"Сөйлем {i}.") for i in range(1, 101)]
        self.assertEqual(len(full_paragraph_window(tiny, anchor_chunk_id="c50")), MAX_CONTEXT_CHUNKS)
        self.assertIn("c50", [c.chunk_id for c in full_paragraph_window(tiny, anchor_chunk_id="c50")])
        five = [Chunk(f"c{i}", i, f"Бөлім {i}: " + ("дерек " * 200)) for i in range(1, 6)]
        self.assertEqual(len(full_paragraph_window(five)), 5)

        migrations = Path(__file__).resolve().parents[2] / "supabase" / "migrations"
        defining = [path for path in sorted(migrations.glob("*.sql"))
                    if "generation_requests_chunk_ids_check" in path.read_text(encoding="utf-8")
                    or "cardinality(chunk_ids)" in path.read_text(encoding="utf-8")]
        self.assertTrue(defining)
        self.assertIn(f"between 1 and {MAX_CONTEXT_CHUNKS}", defining[-1].read_text(encoding="utf-8"))


# ------------------------------------------------------------------ жоспарлаушы


class PlannerTests(unittest.TestCase):
    def test_history_substitutes_formula_and_slider(self) -> None:
        composition = effective_composition(2, {"formula_builder": False, "slider": False})
        self.assertEqual(composition, {"sequence": 3, "true_false_fix": 2, "error_step": 3})
        self.assertEqual(sum(composition.values()), 8)

    def test_targets(self) -> None:
        targets = stock_targets(1, {}, StockPolicy(), formats=CODE_FORMATS)
        # mcq: 5 × 0.4 × 2.4 = 4.8 → 5; 5 × 0.6 × 2.4 = 7.2 → 8; X3: ceil(2.4) = 3 → mcq 2, matching 1
        self.assertEqual(targets, {("mcq", "X1"): 5, ("mcq", "X2"): 8, ("matching", "X1"): 3,
                                   ("matching", "X2"): 5, ("mcq", "X3"): 2, ("matching", "X3"): 1})
        l4_targets = stock_targets(4, {}, StockPolicy())
        self.assertIn(("case_study", "X2"), l4_targets)
        self.assertIn(("priority", "X2"), l4_targets)

    def test_plan_counts_existing_stock(self) -> None:
        have = {("t1", "mcq", "X1"): 5, ("t1", "mcq", "X2"): 3}
        slots = {(s.topic_id, s.format, s.tier): s.missing for s in plan(["t1"], 1, {}, have, formats=["mcq"])}
        self.assertEqual(slots, {("t1", "mcq", "X2"): 5, ("t1", "mcq", "X3"): 3})

    def test_plan_moves_x3_beyond_limit_to_x2(self) -> None:
        # X3-ке нысана бола алатын ұғым тобы аз болса, норманың артығы X2-ге (D80); жалпы қор сол күйі.
        def slots(limits: dict | None) -> dict:
            return {s.tier: s.missing for s in plan(["t1"], 1, {}, {}, StockPolicy(x3_per_session=3), ["mcq"],
                                                    concepts_by_topic={"t1": 10}, x3_limits=limits)}
        free, limited = slots(None), slots({("t1", "mcq"): 1})
        self.assertGreater(free["X3"], 1)
        self.assertEqual(limited["X3"], 1)
        self.assertEqual(limited["X2"], free["X2"] + free["X3"] - 1)
        self.assertEqual(sum(limited.values()), sum(free.values()))
        self.assertNotIn("X3", slots({("t1", "mcq"): 0}))

    def test_concept_targets_scale_and_cap_by_concept_count(self) -> None:
        self.assertEqual(concept_targets(0, 1, {}), {})
        def total(targets: dict, fmt: str) -> int:
            return sum(v for (name, _), v in targets.items() if name == fmt)

        # 2 ұғым: сәйкестендіру өткізіледі (< 3), ал тест барлық санатта бірге 2-ден аспайды (D80).
        two = concept_targets(2, 1, {})
        self.assertNotIn(("matching", "X1"), two)
        self.assertEqual(total(two, "mcq"), 2)
        # Бір ұғымнан бір тест: 10 ұғым — 10 тест, 40 ұғым — шегі 30. X3 соңғы кезекте қысқарады.
        ten = concept_targets(10, 1, {})
        self.assertEqual(total(ten, "mcq"), 10)
        self.assertGreater(ten[("mcq", "X3")], 0)
        self.assertEqual(total(concept_targets(40, 1, {}), "mcq"), 30)
        dense = concept_targets(22, 1, {})
        self.assertEqual(total(dense, "mcq"), 22)
        self.assertEqual(total(dense, "matching"), 11)
        # Қор саясаты үлкейсе де, ұғым санынан аспайды.
        busy = concept_targets(6, 1, {}, StockPolicy(concurrent_sessions_per_topic=5))
        self.assertEqual(total(busy, "mcq"), 6)
        self.assertLessEqual(total(busy, "matching"), 6)


class ConceptGroupTests(unittest.TestCase):
    @staticmethod
    def row(chunk_id: str, *items: tuple[str, str | None]) -> ChunkConcepts:
        return ChunkConcepts(chunk_id, "t", "h", tuple(
            Concept(key=normalize_text(term), term=term, quote=quote, chunk_id=chunk_id) for term, quote in items))

    def test_concepts_from_one_sentence_share_a_group(self) -> None:
        sentence = "Еуразияда көшпелі немесе номадизм деп аталған жайылымдық мал шаруашылығы дамыды."
        renamed = "Көшпелі мал шаруашылығы ұғымын жайылымдық мал шаруашылығы деген атаумен ауыстырдық."
        rows = [
            self.row("c1", ("номадизм", sentence), ("жайылымдық мал шаруашылығы", sentence), ("Томирис", "Томирис")),
            # Чанктар қабаттасады: сол кілт келесі чанкта басқа сөйлеммен келіп, үшінші ұғымды топқа тартады.
            self.row("c2", ("жайылымдық мал шаруашылығы", renamed), ("атауды ауыстыру", renamed),
                     ("Геродот", "Грек тарихшысы Геродот соғыстар тарихын жазды."), ("Аңыз", None)),
        ]
        groups = concept_groups(rows)
        self.assertEqual(groups["номадизм"], "номадизм")
        self.assertEqual(groups["жайылымдық мал шаруашылығы"], "номадизм")
        self.assertEqual(groups["атауды ауыстыру"], "номадизм")
        # Қысқа дәйексөз (< 20 таңба) мен дәйексөзі жоқ ұғым өз тобында қалады.
        self.assertEqual(groups["томирис"], "томирис")
        self.assertEqual(groups["аңыз"], "аңыз")
        self.assertEqual(groups["геродот"], "геродот")
        self.assertEqual(len(set(groups.values())), 4)

    def test_concepts_with_same_word_stems_share_a_group(self) -> None:
        # §16–17: «жайылымды» / «жайылымдық бақташылық» екі топ болып, бірдей X3 құрылды (D80).
        rows = [self.row("c1", ("жайылымды бақташылық", None), ("Сақтар", None)),
                self.row("c2", ("жайылымдық бақташылық", None), ("Сақташылар", None))]
        groups = concept_groups(rows)
        self.assertEqual(groups["жайылымдық бақташылық"], "жайылымды бақташылық")
        # Бір сөзді атауда түбір тым жалпы: «сақтар» мен «сақташылар» бөлек қалады.
        self.assertNotEqual(groups["сақтар"], groups["сақташылар"])

    def test_concept_type_is_normalized(self) -> None:
        chunk = Chunk("c1", 1, "Сақтар жылқы өсірді.")
        concepts = parse_concepts([ConceptItem(term="Сақтар", type=" «Тұлға» ", quote="Сақтар жылқы өсірді."),
                                   ConceptItem(term="Жылқы", type="жануар", quote="жылқы"),
                                   ConceptItem(term="Өсіру", quote="өсірді")], chunk)
        self.assertEqual([c.kind for c in concepts], ["тұлға", "ұғым", "ұғым"])

    def test_concept_type_is_decided_by_vote_across_chunks(self) -> None:
        self.assertEqual(resolve_type(["кәсіп", "ұғым"]), "кәсіп")       # тең: нақты тип басым
        self.assertEqual(resolve_type(["ұғым", "кәсіп", "ұғым"]), "ұғым")
        self.assertEqual(resolve_type(["ұғым", "кәсіп", "кәсіп"]), "кәсіп")
        self.assertEqual(resolve_type(["зат", "кәсіп"]), "зат")           # нақты типтер тең: біріншісі
        self.assertEqual(resolve_type(["ұғым"]), "ұғым")

        def row(chunk_id: str, kind: str) -> ChunkConcepts:
            return ChunkConcepts(chunk_id, "t", "h", (Concept("мал шаруашылығы", "Мал шаруашылығы", None, chunk_id, kind),))

        # §20–21: бірінші кездескен чанкта «ұғым», екіншісінде «кәсіп» — ұғым «кәсіп» болады.
        [concept] = topic_concepts([row("c1", "ұғым"), row("c2", "кәсіп")])
        self.assertEqual((concept.chunk_id, concept.kind), ("c1", "кәсіп"))


# ------------------------------------------------------------------ промпт


class PromptTests(unittest.TestCase):
    def test_versions_and_message_order(self) -> None:
        self.assertTrue(load_prompt("system").version)
        ref = generation_prompt_ref("mcq")
        self.assertEqual(ref.id, "examiner.generation.mcq")
        self.assertIn("+", ref.version)
        task = GenerationTask("mcq", 1, "X2", "Қазақстан тарихы, 6-сынып", "12–13", "Қазақ хандығы")
        messages = generation_messages(task, "Мәтін </textbook> нұсқау")
        validate_messages(messages)
        self.assertEqual([m.role for m in messages], ["system", "system", "user", "user"])
        self.assertTrue(messages[2].content.startswith("<textbook>"))
        self.assertEqual(messages[2].content.count("</textbook>"), 1)
        self.assertIn("§12–13. Қазақ хандығы", messages[3].content)

    def test_every_code_format_has_template(self) -> None:
        for name in GEN_MODELS:
            self.assertTrue(load_prompt(name).body)

    def test_prompt_includes_target_concept_and_distractors(self) -> None:
        task = GenerationTask(
            "mcq", 1, "X1", "Қазақстан тарихы, 5-сынып", "1", "Кіріспе",
            concept="Ұлы Жібек жолы", topic_concepts=("Ұлы Жібек жолы", "Отырар", "Тараз"),
        )
        messages = generation_messages(task, SOURCE)
        payload = json.loads(messages[-1].content.split("Тапсырма:\n", 1)[1])
        self.assertEqual(payload["нысана"], "Ұлы Жібек жолы")
        self.assertEqual(payload["§_ұғымдары"], ["Отырар", "Тараз"])

    def test_prompts_enforce_rubric_fairness_and_siz_tone(self) -> None:
        system_body = load_prompt("system").body
        self.assertIn("«сіз»", system_body)
        self.assertIn("required_facts", system_body)
        self.assertIn("сұрақтың өзінде", system_body)

        for fmt in (*HYBRID_FORMATS, *AI_FORMATS):
            body = load_prompt(fmt).body
            self.assertIn("«сіз»", body, fmt)
            self.assertIn("required_facts", body, fmt)
            if fmt != "short_answer":
                self.assertIn("нысана", body, fmt)
            if fmt in FULL_PARAGRAPH_FORMATS:
                self.assertIn("толық", body, fmt)
        self.assertNotIn("мысалмен түсіндір\"", load_prompt("feynman").body)

        dialog_src = inspect.getsource(dialog.build_dialog_messages)
        self.assertGreaterEqual(dialog_src.count("«сіз»"), 2)
        grader_src = inspect.getsource(ai_grader)
        self.assertIn("сұрақтың өзінде беріліп қойған", grader_src)
        self.assertIn("«сіз»", grader_src)


# ------------------------------------------------------------------ банк аудиті (D73)


def rubric_5() -> list[dict]:
    return [
        {"score": 0, "criteria": "Жауап жоқ не қате", "required_facts": []},
        {"score": 1, "criteria": "Үстірт сөз бар", "required_facts": ["жібек"]},
        {"score": 2, "criteria": "Жартылай дұрыс", "required_facts": ["жібек", "сауда"]},
        {"score": 3, "criteria": "Негізгі ой бар", "required_facts": ["жібек", "қағаз"]},
        {"score": 4, "criteria": "Толық дәл", "required_facts": ["жібек", "қағаз", "дәмдеуіштер"]},
    ]


def rubric_3() -> list[dict]:
    return [
        {"score": 0, "criteria": "Түзету қате", "required_facts": []},
        {"score": 1, "criteria": "Жартылай дұрыс", "required_facts": ["жібек"]},
        {"score": 2, "criteria": "Толық дұрыс", "required_facts": ["жібек", "қағаз"]},
    ]


def valid_gens() -> list:
    return [
        mcq(),
        MatchingGen.model_validate({"stem": "Сәйкестендіріңіз", "pairs": [
            {"left": "Отырар", "right": "Сырдария"}, {"left": "Тараз", "right": "Талас"},
            {"left": "Испиджаб", "right": "Сайрам"}], **COMMON}),
        SequenceGen.model_validate({"stem": "Ретімен", "steps": ["Түрік қағанаты", "Түргеш қағанаты",
                                                                  "Қарлұқ қағанаты"], **COMMON}),
        ErrorStepGen.model_validate({"stem": "Қатені табыңыз", "steps": ["А болды", "Б болды", "В болды"],
                                     "error_index": 1, "correction": "Б болмады", **COMMON}),
        FormulaGen.model_validate({"stem": "Ток күші", "result": "I", "numerator": ["U"], "denominator": ["R"],
                                   "distractors": ["P", "t"], **COMMON}),
        SliderGen.model_validate({"stem": "I = 2 А", "input_name": "R", "input_unit": "Ом", "min": 1, "max": 20,
                                  "step": 1, "output_name": "I", "output_unit": "А", "formula": "I = 12 / R",
                                  "accept_min": 5.5, "accept_max": 6.5, **COMMON}),
        ShortAnswerGen.model_validate({
            "stem": "Ұлы Жібек жолы арқылы қандай тауарлар тасылды?",
            "reference_answer": "Жібек, қағаз және дәмдеуіштер тасылды.",
            "rubric": rubric_5(),
            **COMMON,
        }),
        TrueFalseFixGen.model_validate({
            "stem": "Тұжырымды тексеріңіз",
            "statement": "Ұлы Жібек жолы арқылы тек темір тасылды.",
            "is_true": False,
            "correction": "Ұлы Жібек жолы арқылы жібек, қағаз және дәмдеуіштер тасылды.",
            "rubric": rubric_3(),
            **COMMON,
        }),
        PriorityGen.model_validate({
            "stem": "Сауда керуенінің ретін таңдаңыз",
            "scenario": "Отырар мен Тараз арқылы керуен өтпекші.",
            "options": ["Бағытты тексеру", "Жүкті жинау", "Қорғаушы жалдау"],
            "accepted_rankings": [[0, 1, 2]],
            "reference_justification": "Алдымен қауіпсіз бағыт таңдалады.",
            "rubric": rubric_3(),
            **COMMON,
        }),
        CaseStudyGen.model_validate({
            "stem": "Жібек жолы саудасы",
            "case_text": "Қытайдан Жерорта теңізіне жібек пен қағаз жеткізілді.",
            "data_table": {
                "title": "Қалалар",
                "headers": ["Қала", "Тауар"],
                "rows": [{"cells": ["Отырар", "Жібек"]}, {"cells": ["Тараз", "Қағаз"]}],
            },
            "task_prompt": "Отырардың рөлін түсіндіріңіз.",
            "reference_answer": "Отырар ірі сауда орталығы болды.",
            "rubric": rubric_5(),
            **COMMON,
        }),
        FeynmanGen.model_validate({
            "stem": "Ұғымды түсіндіріңіз",
            "concept": "Сауда жолы",
            "audience_prompt": "5-сынып оқушысына қарапайым түсіндіріңіз.",
            "min_words": 40,
            "reference_answer": "Елдер арасындағы тауар таситын үлкен жол.",
            "rubric": rubric_5(),
            **COMMON,
        }),
        SocraticGen.model_validate({
            "stem": "Отырар мен Тараздың рөлі",
            "situation": "Қалалар үлкен жол бойында орналасты.",
            "opening_question": "Сауда жолы қалаларға қалай әсер етті?",
            "checkpoints": [
                {"id": "c1", "goal": "Сауда дамуы", "probe_question": "Неге қолөнер өсті?", "expected_concepts": ["сауда"]},
                {"id": "c2", "goal": "Мәдени байланыс", "probe_question": "Тағы не алмасты?", "expected_concepts": ["қағаз"]},
            ],
            "rubric": rubric_5(),
            **COMMON,
        }),
        TeachAiGen.model_validate({
            "stem": "Қате түсінікті түзетіңіз",
            "situation": "Сыныптасыңыз Жібек жолының бағытын шатастырып отыр.",
            "ai_persona": "Сенімді емес оқушы",
            "misconception": "Жібек жолы тек солтүстікке жүрді.",
            "opening_message": "Меніңше Жібек жолы тек солтүстік ормандармен өткен сияқты?",
            "rubric": rubric_5(),
            **COMMON,
        }),
    ]


def bank_question(gen, *, qid: str, minute: int = 0, embedding=None, reference: str = SOURCE) -> BankQuestion:
    package = gen.to_package(random.Random(minute))
    return BankQuestion(
        question_id=qid, topic_id="kazakh6.md#§1", level=1, format=package.format, x_tier="X1",
        created_at=datetime(2026, 11, 19, 8, minute, tzinfo=timezone.utc), content=package.content, key=package.key,
        ecd_skill=package.ecd_skill, evidence=package.evidence, support_quote=package.support_quote,
        reference_text=reference, embedding=embedding, rubric_0_4=package.rubric_0_4,
        socratic_checkpoints=package.socratic_checkpoints,
    )


class AuditTests(unittest.TestCase):
    def test_package_round_trip_for_every_format(self) -> None:
        for gen in valid_gens():
            with self.subTest(fmt=gen.format_name):
                package = gen.to_package(random.Random(4))
                rebuilt = gen_from_package(
                    package.format, package.content, package.key, ecd_skill=package.ecd_skill,
                    evidence=package.evidence, support_quote=package.support_quote,
                    rubric_0_4=package.rubric_0_4, socratic_checkpoints=package.socratic_checkpoints,
                )
                self.assertEqual(rebuilt.problems(), [])
                self.assertEqual(rebuilt.to_package(random.Random(4)).similarity_text(), package.similarity_text())

    def test_audit_flags_cues_quotes_and_duplicates(self) -> None:
        cue = mcq(options=["Адамзаттың өткен өміріндегі маңызды оқиғалар мен тұлғаларды зерттейді.",
                           "Тек қазіргі заман оқиғаларын зерттейді.", "Тек тарихи тұлғаларды зерттейді.",
                           "Тек ежелгі деректерді зерттейді."])
        questions = [
            bank_question(mcq(), qid="first", minute=0, embedding=[1.0, 0.0]),
            bank_question(mcq(stem="Жерорта теңізіне дейін созылған сауда жолы қалай аталды?"), qid="copy", minute=1,
                          embedding=[0.99, 0.05]),
            bank_question(cue, qid="cue", minute=2, embedding=[0.0, 1.0]),
            bank_question(mcq(), qid="no_quote", minute=3, embedding=[0.5, -0.5], reference="Басқа мәтін."),
            bank_question(valid_gens()[1], qid="matching_ok", minute=4, embedding=[-1.0, 0.2]),
        ]
        findings = {f.question.question_id: f.reasons for f in audit(questions)}
        self.assertEqual(set(findings), {"copy", "cue", "no_quote"})
        self.assertTrue(findings["copy"][0].startswith("Т7: бар сұраққа тым ұқсас"))
        self.assertTrue(any(r.startswith("Т6: дұрыс нұсқа қалғандарынан едәуір ұзын") for r in findings["cue"]))
        self.assertEqual(findings["no_quote"], ("Т7: support_quote оқулық мәтінінде жоқ",))

    def test_audit_flags_same_stem_that_embedding_misses(self) -> None:
        # Сұрағы бірдей, қате нұсқалары әртүрлі: embedding алыс, бірақ мазмұн қайталауы ұстайды (D80).
        later = mcq(options=["Ұлы Жібек жолы", "Дала жолы", "Теңіз жолы", "Алтын жолы"])
        questions = [
            bank_question(mcq(), qid="first", minute=0, embedding=[1.0, 0.0]),
            bank_question(later, qid="later", minute=1, embedding=[0.0, 1.0]),
        ]
        findings = {f.question.question_id: f.reasons for f in audit(questions)}
        self.assertEqual(findings, {"later": ("Т7: бар сұрақпен мазмұны қайталанады (сұрақ мәтіні бірдей)",)})

    def test_open_formats_are_audited_and_unknown_formats_skipped(self) -> None:
        # 5-қадамнан бері ашық пен гибрид форматтарының да генератор моделі бар: олардың бұзық пакеті белгіленеді.
        ai = replace(bank_question(mcq(), qid="ai"), format="short_answer", content={"stem": "Атаңыз."}, key={})
        self.assertEqual(audit([ai])[0].reasons, ("Т6: пакет құрылымы оқылмады (KeyError)",))
        # Генератор моделі жоқ формат «оқылмады» деп шығарылып кетпейді (D80).
        legacy = replace(bank_question(mcq(), qid="legacy"), format="legacy_format", content={"stem": "?"}, key={})
        self.assertEqual(audit([legacy]), [])

    def test_broken_package_is_flagged_not_crashing(self) -> None:
        broken = replace(bank_question(mcq(), qid="broken"), content={"stem": "?"})
        self.assertEqual(audit([broken])[0].reasons, ("Т6: пакет құрылымы оқылмады (KeyError)",))


# ------------------------------------------------------------------ gateway үлгісі


class BankFakeProvider(FakeProvider):
    """Шешуші тексеруге мәтіні `correct_texts`-те бар нұсқаны таңдайды; embedding — мәтіннің хэші."""

    def __init__(self, name: str) -> None:
        super().__init__(name)
        self.correct_texts: set[str] = set()
        self.solver_errors: list[ProviderError] = []
        self.generation_texts: list[str] = []  # Fast Lane: синхрон генерацияның жауаптары, ретімен
        self.concept_responses: list[list[dict]] = []

    async def complete(self, request: CompletionRequest) -> ProviderCompletion:
        self.calls.append(request)
        if request.schema_name == "ConceptList":
            if self.concept_responses:
                items = self.concept_responses.pop(0)
            else:
                # Дәйексөздер мәтінде жоқ (quote=None): ұғымдар топқа біріктірілмейді (D80).
                tag = len(self.calls)
                # «Ұғым 1-2» мен «Ұғым 2-1» түбірлері бірдей болып, бір топқа түсер еді: «Ұғым 2а» сияқты атау.
                # Типі нақты («зат»): екі чанкты §-те X3 тестке нысана бар.
                items = [{"term": f"Ұғым {tag}{'абвгдежзик'[i - 1]}", "type": "зат",
                          "quote": f"Ұғым {i}-{tag} түсіндірмесі"} for i in range(1, 11)]
            return ProviderCompletion(json.dumps({"concepts": items}), Usage(10, 0, 10), request.model)
        if request.schema_name in {model.__name__ for model in GEN_MODELS.values()}:
            return ProviderCompletion(self.generation_texts.pop(0), Usage(50, 0, 50), request.model)
        if self.solver_errors:
            raise self.solver_errors.pop(0)
        user = request.messages[-1].content
        question = json.loads(user[user.index("<question>") + len("<question>"): user.index("</question>")])
        chosen = [o["id"] for o in question["options"] if o["text"] in self.correct_texts]
        return ProviderCompletion(json.dumps({"correct_option_ids": chosen}), Usage(5, 0, 5), request.model)

    async def embed(self, *, model: str, texts: Sequence[str], timeout_s: float):
        self.embed_calls.append((model, tuple(texts)))
        vectors = []
        for text in texts:
            digest = hashlib.sha256(text.encode("utf-8")).digest()
            vectors.append([b / 255 - 0.5 for b in digest[:16]])
        return vectors, Usage(input_tokens=1)


def gateway_config() -> dict:
    route = {"model": "small", "mode": "sync", "temperature": 0, "max_output_tokens": 100, "timeout_s": 5,
             "retry": {"max_attempts": 2, "base_delay_s": 0, "max_delay_s": 0}}
    routes = {task.value: dict(route) for task in Task}
    routes["official_grading"] = dict(route, model="grader")
    routes["tutor_reply"] = dict(route, mode="stream")
    routes["examiner_dialog"] = dict(route, mode="stream")
    routes["generation"] = dict(route, model="strong", mode="batch")
    return {
        "providers": {"primary": {"type": "openai_compat", "api_key_env": "KEY"}},
        "models": {
            "small": {"provider": "primary", "model": "small-model"},
            "strong": {"provider": "primary", "model": "strong-model"},
            "grader": {"provider": "primary", "model": "grader-1", "pinned": True},
            "emb": {"provider": "primary", "model": "emb-model", "kind": "embedding"},
        },
        "routes": routes,
        "embeddings": {"answers": "emb", "questions": "emb"},
    }


async def no_sleep(_: float) -> None:
    return None


SUBMITTED_AT = datetime(2026, 11, 19, 8, 0, tzinfo=timezone.utc)


class MemoryRepository:
    """BankRepository-дің жадтағы нұсқасы."""

    def __init__(self) -> None:
        self.subject = "subj-history"
        self.paragraph_list = [
            Paragraph("kazakh6.md#§1", self.subject, "kazakh6.md", "Қазақстан тарихы, 6-сынып", "1", "Жібек жолы"),
        ]
        self.chunk_rows = {"kazakh6.md#§1": [Chunk("c1", 1, SOURCE), Chunk("c2", 2, "Екінші үзінді мәтіні.")]}
        self.concepts: dict[str, dict[str, ChunkConcepts]] = {}
        self.batches: dict[str, BatchRecord] = {}
        self.requests: dict[str, dict] = {}
        self.questions: list[NewQuestion] = []

    async def chunk_concepts(self, topic_id):
        return dict(self.concepts.get(topic_id, {}))

    async def save_chunk_concepts(self, rows):
        for row in rows:
            self.concepts.setdefault(row.topic_id, {})[row.chunk_id] = row

    async def used_concepts(self, subject_id, level):
        used: dict = defaultdict(set)
        for q in self.questions:
            if q.request.subject_id == subject_id and q.request.level == level and q.request.concept_key:
                used[(q.request.topic_id, q.request.format, q.request.x_tier)].add(q.request.concept_key)
        for row in self.requests.values():
            r = row["record"]
            if row["status"] == "pending" and r.subject_id == subject_id and r.level == level and r.concept_key:
                used[(r.topic_id, r.format, r.x_tier)].add(r.concept_key)
        return dict(used)

    async def paragraphs(self, books):
        return [p for p in self.paragraph_list if p.book in books]

    async def paragraph_chunks(self, topic_id):
        return self.chunk_rows.get(topic_id, [])

    async def chunks(self, chunk_ids):
        by_id = {c.chunk_id: c for rows in self.chunk_rows.values() for c in rows}
        return [by_id[i] for i in chunk_ids]

    async def entity_links(self, chunk_ids):
        return []

    async def format_applicability(self, subject_id):
        return {"formula_builder": False, "slider": False}

    async def stock(self, subject_id, level):
        counts: dict = defaultdict(int)
        for q in self.questions:
            counts[(q.request.topic_id, q.request.format, q.request.x_tier)] += 1
        for row in self.requests.values():
            if row["status"] == "pending":
                r = row["record"]
                counts[(r.topic_id, r.format, r.x_tier)] += 1
        return dict(counts)

    async def record_batch(self, batch, requests):
        self.batches[batch.batch_id] = replace(batch, submitted_at=batch.submitted_at or SUBMITTED_AT)
        for request in requests:
            self.requests[request.custom_id] = {"record": request, "status": "pending", "reasons": []}

    async def open_batches(self):
        return [b for b in self.batches.values() if b.status in ("submitted", "completed")]

    async def set_batch_status(self, batch_id, status):
        self.batches[batch_id] = replace(self.batches[batch_id], status=status)

    async def pending_requests(self, batch_id):
        return [row["record"] for row in self.requests.values()
                if row["status"] == "pending" and row["record"].batch_id == batch_id]

    async def existing_embeddings(self, topic_id, level):
        return [q.embedding for q in self.questions if q.request.topic_id == topic_id and q.request.level == level]

    async def existing_packages(self, topic_id, level, format_name):
        return [(q.package.content, q.package.key) for q in self.questions
                if (q.request.topic_id, q.request.level, q.request.format) == (topic_id, level, format_name)]

    async def accept(self, question):
        row = self.requests[question.request.custom_id]
        assert row["status"] == "pending"
        row["status"] = "accepted"
        self.questions.append(question)
        return f"q{len(self.questions)}"

    async def reject(self, custom_id, status, reasons):
        row = self.requests[custom_id]
        if row["status"] == "pending":
            row["status"] = status
            row["reasons"] = list(reasons)


class PipelineTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.provider = BankFakeProvider("primary")
        self.gateway = LLMGateway(parse_config(gateway_config(), {"KEY": "k"}), providers={"primary": self.provider},
                                  sink=MemorySink(), sleep=no_sleep, rng=lambda: 0.0)
        self.repo = MemoryRepository()
        self.pipeline = BankPipeline(self.gateway, self.repo, rng=random.Random(1))

    async def submit_mcq(self, count: int) -> list[str]:
        batches = await self.pipeline.submit(["kazakh6.md"], 1, formats=["mcq"], max_requests=count)
        self.assertEqual(len(batches), 1)
        self.assertEqual(batches[0].prompt_id, "examiner.generation.mcq")
        return [custom_id for custom_id, _ in self.provider.batches[-1]]

    def complete(self, batch_id: str, texts: dict[str, str | None]) -> None:
        self.provider.batch_status[batch_id] = BatchStatus(batch_id, "completed", tuple(
            BatchItemResult(custom_id, text, Usage(10, 0, 10), None if text else "server_error")
            for custom_id, text in texts.items()))

    async def test_submit_records_requests_with_context(self) -> None:
        ids = await self.submit_mcq(3)
        self.assertEqual(len(ids), 3)
        stored = [row["record"] for row in self.repo.requests.values()]
        self.assertEqual({r.batch_id for r in stored}, {"primary-batch-1"})
        self.assertEqual({r.format for r in stored}, {"mcq"})
        request = self.provider.batches[-1][0][1]
        self.assertEqual(request.model, "strong-model")
        self.assertEqual(request.schema_name, "MCQGen")
        self.assertIn("Ұлы Жібек жолы", request.messages[2].content)

    async def test_tiers_of_one_topic_get_different_chunks(self) -> None:
        # Бір § пен форматтың X1, X2, X3 сұраныстары чанк кезегін бөліседі: X1 мен X2 бір мәтінді алмайды.
        pipeline = BankPipeline(self.gateway, self.repo, policy=StockPolicy(concurrent_sessions_per_topic=1, safety=0.25),
                                rng=random.Random(1))
        await pipeline.submit(["kazakh6.md"], 1, formats=["mcq"])
        by_tier = {row["record"].x_tier: row["record"].chunk_ids for row in self.repo.requests.values()}
        self.assertEqual(set(by_tier), {"X1", "X2", "X3"})
        self.assertNotEqual(by_tier["X1"], by_tier["X2"])
        self.assertEqual({by_tier["X1"], by_tier["X2"]}, {("c1",), ("c2",)})

    async def test_chunk_combination_formats_never_reuse_a_context(self) -> None:
        # D81: §16–17-де sequence 4 чанк комбинациясына 14 сұраныс жоспарлап, әр мәтінді 3–4 рет қайталайтын.
        self.repo.chunk_rows["kazakh6.md#§1"] = [
            Chunk(f"c{i}", i, f"{SOURCE} {i}-үзіндінің өз дерегі.") for i in range(1, 5)
        ]
        # Қор нормасы комбинация санынан әлдеқайда көп болсын (10 қатар сессия).
        pipeline = BankPipeline(self.gateway, self.repo, policy=StockPolicy(concurrent_sessions_per_topic=10),
                                rng=random.Random(1))
        targets = concept_targets(10, 2, {}, StockPolicy(concurrent_sessions_per_topic=10), ["sequence"])
        self.assertGreater(sum(targets.values()), 6)
        await pipeline.submit(["kazakh6.md"], 2, formats=["sequence", "error_step"])
        for name in ("sequence", "error_step"):
            contexts = [row["record"].chunk_ids for row in self.repo.requests.values()
                        if row["record"].format == name]
            self.assertTrue(contexts, name)
            self.assertEqual(len(contexts), len(set(contexts)), name)
            self.assertLessEqual(len(contexts), 6, name)  # C(4, 2)
        before = len(self.repo.requests)
        await pipeline.submit(["kazakh6.md"], 2, formats=["sequence", "error_step"])
        self.assertEqual(len(self.repo.requests), before)  # жаңа мәтін комбинациясы жоқ: қайта жоспарланбайды

    async def test_planner_skips_full_stock(self) -> None:
        await self.submit_mcq(None)  # type: ignore[arg-type]
        self.assertEqual(await self.pipeline.submit(["kazakh6.md"], 1, formats=["mcq"]), [])

    async def test_process_accepts_valid_and_rejects_invalid(self) -> None:
        self.repo.chunk_rows["kazakh6.md#§1"] = [Chunk("c1", 1, SOURCE)]
        ids = await self.submit_mcq(4)
        self.provider.correct_texts = {"Ұлы Жібек жолы"}
        good = mcq().model_dump_json()
        similar = mcq().model_dump_json()  # дәл сол сұрақ — қайталау
        bad_quote = mcq(stem="Басқа сұрақ: жол қалай аталды?", support_quote="Мұндай сөйлем оқулықта жоқ, ойдан шыққан.").model_dump_json()
        self.complete("primary-batch-1", {ids[0]: good, ids[1]: similar, ids[2]: bad_quote, ids[3]: None})

        report = await self.pipeline.process()
        self.assertEqual((report.accepted, report.rejected, report.failed, report.deferred), (1, 2, 1, 0))
        self.assertEqual(len(self.repo.questions), 1)
        question = self.repo.questions[0]
        self.assertEqual(question.generator_model, "strong-model")
        self.assertEqual(question.prompt_version, generation_prompt_ref("mcq").version)
        self.assertEqual(question.reference_context["chunk_ids"], ["c1"])
        self.assertEqual(question.embedding_model, "emb-model")
        reasons = {row["record"].custom_id: row["reasons"] for row in self.repo.requests.values()}
        # Сұрақ мәтіні бірдей: оны ақысыз мазмұн тексерісі шешуші мен embedding-тен бұрын ұстайды (D80).
        self.assertEqual(reasons[ids[1]], ["Т7: бар сұрақпен мазмұны қайталанады (сұрақ мәтіні бірдей)"])
        self.assertEqual(reasons[ids[2]], ["Т7: support_quote оқулық мәтінінде жоқ"])
        self.assertEqual(self.repo.batches["primary-batch-1"].status, "processed")
        # Қайта шақыру ештеңені қайталамайды.
        again = await self.pipeline.process()
        self.assertEqual((again.accepted, again.rejected, again.failed), (0, 0, 0))

    async def test_solver_rejects_ambiguous_question(self) -> None:
        ids = await self.submit_mcq(1)
        self.provider.correct_texts = {"Ұлы Жібек жолы", "Тұз жолы"}
        self.complete("primary-batch-1", {ids[0]: mcq().model_dump_json()})
        report = await self.pipeline.process()
        self.assertEqual(report.rejected, 1)
        self.assertEqual(self.repo.requests[ids[0]]["reasons"], ["Т7: шешуші бірнеше нұсқаны дұрыс деп санады"])

    async def test_structural_errors_are_recorded(self) -> None:
        ids = await self.submit_mcq(2)
        self.complete("primary-batch-1", {ids[0]: "{not json", ids[1]: mcq(options=["а", "б"]).model_dump_json()})
        report = await self.pipeline.process()
        self.assertEqual(report.rejected, 2)
        self.assertEqual(self.repo.requests[ids[0]]["reasons"], ["Т6: JSON құрылымы бұзылған"])
        self.assertIn("Т6: нұсқа саны 4 емес", self.repo.requests[ids[1]]["reasons"])

    async def test_unavailable_solver_defers_without_losing_request(self) -> None:
        ids = await self.submit_mcq(1)
        self.provider.correct_texts = {"Ұлы Жібек жолы"}
        self.provider.solver_errors = [ProviderError("HTTP 503", retryable=True, status=503)] * 2
        self.complete("primary-batch-1", {ids[0]: mcq().model_dump_json()})
        first = await self.pipeline.process()
        self.assertEqual((first.accepted, first.deferred), (0, 1))
        self.assertEqual(self.repo.requests[ids[0]]["status"], "pending")
        self.assertEqual(self.repo.batches["primary-batch-1"].status, "completed")
        second = await self.pipeline.process()
        self.assertEqual(second.accepted, 1)
        self.assertEqual(self.repo.batches["primary-batch-1"].status, "processed")

    async def test_expired_batch_keeps_finished_results(self) -> None:
        # Мерзімі өткен batch: біткен сұраныс банкке жазылады, орындалмағаны failed болады.
        self.repo.chunk_rows["kazakh6.md#§1"] = [Chunk("c1", 1, SOURCE)]
        ids = await self.submit_mcq(2)
        self.provider.correct_texts = {"Ұлы Жібек жолы"}
        self.provider.batch_status["primary-batch-1"] = BatchStatus("primary-batch-1", "expired", (
            BatchItemResult(ids[0], mcq().model_dump_json(), Usage(10, 0, 10)),))
        report = await self.pipeline.process()
        self.assertEqual((report.accepted, report.failed), (1, 1))
        self.assertEqual(self.repo.requests[ids[1]]["reasons"], ["batch expired: сұраныс орындалмады"])
        self.assertEqual(self.repo.batches["primary-batch-1"].status, "processed")

    async def test_failed_batch_marks_requests_failed(self) -> None:
        ids = await self.submit_mcq(2)
        self.provider.batch_status["primary-batch-1"] = BatchStatus("primary-batch-1", "expired")
        report = await self.pipeline.process()
        self.assertEqual(report.failed, 2)
        self.assertEqual({self.repo.requests[i]["reasons"][0] for i in ids}, {"batch expired"})

    async def test_history_level2_excludes_formula_and_slider(self) -> None:
        batches = await self.pipeline.submit(["kazakh6.md"], 2, max_requests=200)
        self.assertEqual({b.prompt_id for b in batches},
                         {"examiner.generation.sequence", "examiner.generation.error_step",
                          "examiner.generation.true_false_fix"})

    # ---------------------------------------------------------- ұсақ партиялар, Fast Lane, watchdog

    async def test_submit_splits_format_into_small_batches(self) -> None:
        with mock.patch.object(pipeline_module, "MAX_BATCH_REQUESTS", 2):
            batches = await self.pipeline.submit(["kazakh6.md"], 1, formats=["mcq"], max_requests=5)
        self.assertEqual([b.request_count for b in batches], [2, 2, 1])
        self.assertEqual(len({b.batch_id for b in batches}), 3)
        self.assertEqual(len(self.repo.requests), 5)

    def small_policy_pipeline(self) -> BankPipeline:
        # Бір § пен форматқа X1, X2, X3 бір-бірден.
        return BankPipeline(self.gateway, self.repo, policy=StockPolicy(concurrent_sessions_per_topic=1, safety=0.25),
                            rng=random.Random(1))

    def distinct_mcqs(self, count: int) -> list[str]:
        """Бір-бірін қайталамайтын тесттер: сұрағы да, дұрыс жауабы да әртүрлі (Т7 мазмұн қайталауы, D80).
        Шешушінің үлгісі әр сұрақтың дұрыс жауабын таниды."""
        texts = []
        for index in range(count):
            correct = f"Ұлы Жібек жолы ({index})"
            self.provider.correct_texts.add(correct)
            texts.append(mcq(stem=f"{index}-сұрақ: Қытайдан Жерорта теңізіне дейінгі жол қалай аталды?",
                             options=[correct, "Тұз жолы", "Янтарь жолы", "Шай жолы"]).model_dump_json())
        return texts

    async def test_fast_lane_fills_topic_without_batch(self) -> None:
        self.repo.chunk_rows["kazakh6.md#§1"] = [Chunk("c1", 1, SOURCE)]
        self.provider.correct_texts = {"Ұлы Жібек жолы"}
        self.provider.generation_texts = self.distinct_mcqs(3)
        report = await self.small_policy_pipeline().generate_now(
            ["kazakh6.md"], 1, topics=["kazakh6.md#§1"], formats=["mcq"])
        self.assertEqual((report.accepted, report.rejected, report.failed), (3, 0, 0))
        self.assertEqual(self.provider.batches, [])  # Batch API шақырылмады
        self.assertTrue(all(b.batch_id.startswith("fast-") and b.status == "processed"
                            for b in self.repo.batches.values()))
        self.assertEqual({row["status"] for row in self.repo.requests.values()}, {"accepted"})
        # Бір чанкты §-те X3 тестке жақын алдағыш жоқ: X3-тің орны X2-ге берілді (D80).
        self.assertEqual(sorted(q.request.x_tier for q in self.repo.questions), ["X1", "X2", "X2"])

    async def test_fast_lane_second_round_replaces_rejected(self) -> None:
        self.repo.chunk_rows["kazakh6.md#§1"] = [Chunk("c1", 1, SOURCE)]
        self.provider.correct_texts = {"Ұлы Жібек жолы"}
        good = self.distinct_mcqs(3)
        # JSON дұрыс, бірақ Т6-дан өтпейді (gateway қайта сұрамайды, оны контур қабылдамайды).
        self.provider.generation_texts = [mcq(options=["а", "б"]).model_dump_json(), good[0], good[1], good[2]]
        report = await self.small_policy_pipeline().generate_now(
            ["kazakh6.md"], 1, topics=["kazakh6.md#§1"], formats=["mcq"])
        self.assertEqual((report.accepted, report.rejected), (3, 1))
        self.assertEqual(len(self.repo.batches), 2)  # екінші айналым — жаңа жазба

    async def test_fast_lane_survives_one_item_database_error(self) -> None:
        # §16–17 сынағы: pooler байланысты жауып, бір элементтің база сұранысы құлады да, бүкіл Fast Lane тоқтады.
        self.repo.chunk_rows["kazakh6.md#§1"] = [Chunk("c1", 1, SOURCE)]
        self.provider.correct_texts = {"Ұлы Жібек жолы"}
        self.provider.generation_texts = self.distinct_mcqs(3)
        original = self.repo.existing_packages
        calls = {"n": 0}

        async def flaky(*args):
            calls["n"] += 1
            if calls["n"] == 2:
                raise ConnectionError("connection was closed in the middle of operation")
            return await original(*args)

        self.repo.existing_packages = flaky  # type: ignore[method-assign]
        report = await self.small_policy_pipeline().generate_now(
            ["kazakh6.md"], 1, topics=["kazakh6.md#§1"], formats=["mcq"], rounds=1)
        self.assertEqual((report.accepted, report.failed), (2, 1))
        self.assertEqual(dict(report.reasons), {"Fast Lane: өңдеу қатесі": 1})
        statuses = sorted(row["status"] for row in self.repo.requests.values())
        self.assertEqual(statuses, ["accepted", "accepted", "failed"])

    async def test_fast_lane_rejects_unknown_topic(self) -> None:
        with self.assertRaises(ValueError):
            await self.pipeline.generate_now(["kazakh6.md"], 1, topics=["kazakh6.md#§99"], formats=["mcq"])

    async def test_watchdog_cancels_only_old_in_progress_batches(self) -> None:
        self.repo.chunk_rows["kazakh6.md#§1"] = [Chunk("c1", 1, SOURCE)]
        ids = await self.submit_mcq(2)
        self.assertEqual(await self.pipeline.watchdog(now=SUBMITTED_AT + timedelta(hours=1)), [])
        cancelled = await self.pipeline.watchdog(now=SUBMITTED_AT + timedelta(hours=5))
        self.assertEqual(cancelled, ["primary-batch-1"])
        self.assertEqual(self.provider.cancelled, ["primary-batch-1"])
        # Тоқтатылған batch-тің біткен сұранысы банкке түседі, қалғаны failed болып, кейін қайта сұралады.
        self.provider.correct_texts = {"Ұлы Жібек жолы"}
        self.provider.batch_status["primary-batch-1"] = BatchStatus("primary-batch-1", "cancelled", (
            BatchItemResult(ids[0], mcq().model_dump_json(), Usage(10, 0, 10)),))
        report = await self.pipeline.process()
        self.assertEqual((report.accepted, report.failed), (1, 1))
        self.assertEqual(self.repo.batches["primary-batch-1"].status, "processed")
        self.assertEqual(await self.pipeline.watchdog(now=SUBMITTED_AT + timedelta(hours=9)), [])

    async def test_process_closes_only_stale_fast_records(self) -> None:
        request = RequestRecord("fast-req", "fast-x", self.repo.subject, "kazakh6.md#§1", 1, "mcq", "X1", ("c1",))
        await self.repo.record_batch(BatchRecord("fast-x", "primary", "strong", "examiner.generation.mcq", "v",
                                                 1), [request])
        fresh = await self.pipeline.process(now=SUBMITTED_AT + timedelta(minutes=5))
        self.assertEqual(fresh.failed, 0)
        self.assertEqual(self.repo.requests["fast-req"]["status"], "pending")
        stale = await self.pipeline.process(now=SUBMITTED_AT + timedelta(hours=1))
        self.assertEqual(stale.failed, 1)
        self.assertEqual(self.repo.requests["fast-req"]["reasons"], ["Fast Lane үзілді"])
        self.assertEqual(self.repo.batches["fast-x"].status, "processed")

    async def test_pipeline_binds_concepts_and_skips_empty_chunks(self) -> None:
        # c1 — 2 ұғым, c2 — бос (тек тапсырма: 0 ұғым). Тест тек c1-ден және әр санатта ең көбі 2 сұрақ.
        self.provider.concept_responses = [
            [{"term": "Ұлы Жібек жолы", "quote": QUOTE},
             {"term": "Отырар қаласы", "quote": "Отырар мен Тараз осы жолдың бойындағы ірі қалалар еді."}],
            [],
        ]
        await self.pipeline.submit(["kazakh6.md"], 1, formats=["mcq", "matching"])
        records = [row["record"] for row in self.repo.requests.values()]
        # 2 ұғым < 3 болғандықтан сәйкестендіру өткізіледі, ал тестте c2 мүлде қолданылмайды.
        self.assertEqual({r.format for r in records}, {"mcq"})
        self.assertEqual({r.chunk_ids for r in records}, {("c1",)})
        # Бір ұғымнан бір тест, санатқа қарамай (D80).
        keys = [r.concept_key for r in records]
        self.assertEqual(sorted(keys), ["отырар қаласы", "ұлы жібек жолы"])
        sent = self.provider.batches[-1][0][1].messages[-1].content
        self.assertIn('"нысана":', sent)
        self.assertIn('"§_ұғымдары":', sent)

    async def three_concept_chunks(self) -> None:
        """c1, c2, c3 — әрқайсысында мәтінде бар дәйексөзі бар 2 ұғым; c1-дің екі ұғымы бір сөйлемнен."""
        self.repo.chunk_rows["kazakh6.md#§1"] = [
            Chunk("c1", 1, SOURCE),
            Chunk("c2", 2, "Сақтар жылқы өсірді. Олар темірден қару соқты және қорғандар тұрғызды."),
            Chunk("c3", 3, "Үйсіндер Жетісуда өмір сүрді. Олардың астанасы Қызыл аңғар қаласы еді."),
        ]
        self.provider.concept_responses = [
            [{"term": "Ұлы Жібек жолы", "quote": SOURCE.split(". ")[0]},
             {"term": "Сауда жолы", "quote": "Ұлы Жібек жолы Қытайдан Жерорта теңізіне дейін созылған"}],
            [{"term": "Сақтар", "quote": "Сақтар жылқы өсірді."},
             {"term": "Қорғандар", "quote": "Олар темірден қару соқты және қорғандар тұрғызды."}],
            [{"term": "Үйсіндер", "quote": "Үйсіндер Жетісуда өмір сүрді."},
             {"term": "Қызыл аңғар", "quote": "Олардың астанасы Қызыл аңғар қаласы еді."}],
        ]
        # Бәрі бір нақты типті: X3 тестке әр ұғымның жақын алдағышы жеткілікті (тип сүзгісі бөлек тексеріледі).
        for items in self.provider.concept_responses:
            for item in items:
                item["type"] = "жер"

    async def test_one_mcq_per_concept_group_across_tiers(self) -> None:
        # c1-дің «Ұлы Жібек жолы» мен «Сауда жолы» бір сөйлемнен: бір топ. 6 ұғым → 5 топ → 5 тест.
        await self.three_concept_chunks()
        await self.pipeline.submit(["kazakh6.md"], 1, formats=["mcq"])
        records = [row["record"] for row in self.repo.requests.values()]
        keys = [r.concept_key for r in records]
        self.assertEqual(len(keys), 5)
        self.assertEqual(len(set(keys)), 5)
        self.assertFalse({"ұлы жібек жолы", "сауда жолы"} <= set(keys))
        # Әр санатқа нысананың бір чанкы беріледі (X3-ке де, D80).
        home = {"ұлы жібек жолы": "c1", "сауда жолы": "c1", "сақтар": "c2", "қорғандар": "c2",
                "үйсіндер": "c3", "қызыл аңғар": "c3"}
        for record in records:
            self.assertEqual(record.chunk_ids, (home[record.concept_key],), record)
        # X3 алдымен жоспарланады да, бірінші ұғымды алады. Оған §-тің барлық ұғымы емес, басқа чанктардан
        # жақын алдағыштар тізімі беріледі: алдымен көрші емес c3, нысананың өз чанкы (c1) мен бір топтағы
        # «Сауда жолы» кірмейді.
        [x3] = [r for r in records if r.x_tier == "X3"]
        self.assertEqual(x3.concept_key, "ұлы жібек жолы")
        sent = {custom_id: request for batch in self.provider.batches for custom_id, request in batch}
        payload = json.loads(sent[x3.custom_id].messages[-1].content.split("Тапсырма:\n", 1)[1])
        self.assertEqual(payload["жақын_алдағыштар"], ["Үйсіндер", "Сақтар", "Қызыл аңғар", "Қорғандар"])
        self.assertEqual(payload["нысана_типі"], "жер")
        self.assertNotIn("§_ұғымдары", payload)
        x1 = next(r for r in records if r.x_tier == "X1")
        self.assertIn("§_ұғымдары", json.loads(sent[x1.custom_id].messages[-1].content.split("Тапсырма:\n", 1)[1]))
        # Келесі іске қосу бос ұғым тобын таппайды: қор толы, ештеңе сұралмайды.
        self.assertEqual(await self.pipeline.submit(["kazakh6.md"], 1, formats=["mcq"]), [])

    async def test_x3_targets_only_concepts_with_three_same_type_neighbours(self) -> None:
        # Тек «Сақтар»-дың басқа чанктарда бір типті 3 көршісі бар (c2-нің тұлғалары): X3 тек соған. c2-нің
        # тұлғалары бір-бірінің чанкында, олар үшін көрші — тек «Сақтар». X3 нормасының артығы X2-ге кетеді.
        self.repo.chunk_rows["kazakh6.md#§1"] = [
            Chunk("c1", 1, "Сақтар егіншілікпен айналысты."),
            Chunk("c2", 2, "Үйсіндер, ғұндар мен қаңлылар Жетісу мен Сырдарияда өмір сүрді."),
            Chunk("c3", 3, "Қызыл аңғар маңында мал шаруашылығы дамыды."),
        ]
        self.provider.concept_responses = [
            [{"term": "Сақтар", "type": "тұлға", "quote": "-"}, {"term": "Егіншілік", "type": "кәсіп", "quote": "-"}],
            [{"term": "Үйсіндер", "type": "тұлға", "quote": "-"}, {"term": "Ғұндар", "type": "Тұлға", "quote": "-"},
             {"term": "Қаңлылар", "type": "тұлға", "quote": "-"}],
            [{"term": "Қызыл аңғар", "type": "жер", "quote": "-"},
             {"term": "Мал шаруашылығы", "type": "кәсіп", "quote": "-"}],
        ]
        pipeline = BankPipeline(self.gateway, self.repo, policy=StockPolicy(x3_per_session=3), rng=random.Random(1))
        await pipeline.submit(["kazakh6.md"], 1, formats=["mcq"])
        records = [row["record"] for row in self.repo.requests.values()]
        self.assertEqual(len(records), 7)  # 7 ұғым → 7 тест: жалпы қор өзгермеді
        [x3] = [r for r in records if r.x_tier == "X3"]
        self.assertEqual(x3.concept_key, "сақтар")
        sent = {custom_id: request for batch in self.provider.batches for custom_id, request in batch}
        payload = json.loads(sent[x3.custom_id].messages[-1].content.split("Тапсырма:\n", 1)[1])
        self.assertEqual(payload["нысана_типі"], "тұлға")
        self.assertEqual(payload["жақын_алдағыштар"], ["Үйсіндер", "Ғұндар", "Қаңлылар"])
        # Кәсіп пен жер X3-ке түспейді, бірақ X1/X2-ден қалмайды.
        others = {r.concept_key for r in records if r.x_tier != "X3"}
        self.assertTrue({"егіншілік", "мал шаруашылығы", "қызыл аңғар"} <= others)

    async def test_x3_near_list_skips_facts_of_the_target_passage_and_long_names(self) -> None:
        # §16–17 X3 сынағы: «суармалы егіншілік» басқа чанктан алынды, бірақ нысананың үзіндісінде де шын дерек
        # болып, екінші дұрыс жауап болды; нысана «...тұрғындарының кәсіптері» — нақты атау емес, санат (D80).
        self.repo.chunk_rows["kazakh6.md#§1"] = [
            Chunk("c1", 1, "Сақтар мен ғұндар жылқы өсірді. Үйсін тайпасы Жетісуда болды."),
            Chunk("c2", 2, "Үйсін тайпалары, ғұндар мен қаңлылар Жетісуда өмір сүрді."),
            Chunk("c3", 3, "Массагеттер, дулаттар мен алшындар бірлесті."),
        ]
        kind = "тұлға"
        self.provider.concept_responses = [
            [{"term": "Сақтар", "type": kind, "quote": "-"}, {"term": "Үйсін тайпалары", "type": kind, "quote": "-"}],
            [{"term": "Үйсін тайпалары", "type": kind, "quote": "-"}, {"term": "Ғұндар", "type": kind, "quote": "-"},
             {"term": "Қаңлылар", "type": kind, "quote": "-"}],
            [{"term": "Массагеттер", "type": kind, "quote": "-"}, {"term": "Дулаттар", "type": kind, "quote": "-"},
             {"term": "Алшындар", "type": kind, "quote": "-"},
             {"term": "Жетісудағы көшпелі тайпалардың бірлестігі", "type": kind, "quote": "-"}],
        ]
        pipeline = BankPipeline(self.gateway, self.repo, policy=StockPolicy(x3_per_session=3), rng=random.Random(1))
        await pipeline.submit(["kazakh6.md"], 1, formats=["mcq"])
        records = [row["record"] for row in self.repo.requests.values()]
        x3 = {r.concept_key: r for r in records if r.x_tier == "X3"}
        self.assertIn("сақтар", x3)
        sent = {custom_id: request for batch in self.provider.batches for custom_id, request in batch}
        payload = json.loads(sent[x3["сақтар"].custom_id].messages[-1].content.split("Тапсырма:\n", 1)[1])
        # «Үйсін тайпалары» c1-ден де шығарылған, «ғұндар» c1-дің мәтінінде бар: екеуі де тізімге кірмейді.
        self.assertEqual(payload["жақын_алдағыштар"],
                         ["Массагеттер", "Қаңлылар", "Дулаттар", "Алшындар", "Жетісудағы көшпелі тайпалардың бірлестігі"])

    async def test_long_concept_name_is_not_an_x3_target(self) -> None:
        # 4 сөзді атаудың c2-де бір типті 3 көршісі бар, бірақ ол сипаттама: X3 жоқ, ұғым X1/X2-ге кетеді.
        # c2-нің ұғымдарына көрші — тек c1-дің ұзын атауы (1 < 3): олар да X3-ке нысана емес.
        self.repo.chunk_rows["kazakh6.md#§1"] = [Chunk("c1", 1, "Ерте металл дәуірі тұрғындары көп кәсіппен айналысты."),
                                                 Chunk("c2", 2, "Егіншілік, аңшылық пен кен ісі дамыды.")]
        self.provider.concept_responses = [
            [{"term": "Ерте металл дәуірі тұрғындарының кәсіптері", "type": "кәсіп", "quote": "-"}],
            [{"term": "Егіншілік", "type": "кәсіп", "quote": "-"}, {"term": "Аңшылық", "type": "кәсіп", "quote": "-"},
             {"term": "Кен ісі", "type": "кәсіп", "quote": "-"}],
        ]
        await BankPipeline(self.gateway, self.repo, policy=StockPolicy(x3_per_session=3),
                           rng=random.Random(1)).submit(["kazakh6.md"], 1, formats=["mcq"])
        records = [row["record"] for row in self.repo.requests.values()]
        self.assertEqual(len(records), 4)
        self.assertNotIn("X3", {r.x_tier for r in records})
        self.assertIn("ерте металл дәуірі тұрғындарының кәсіптері", {r.concept_key for r in records})

    async def test_x3_solver_runs_on_its_own_route_variant(self) -> None:
        # X3 тестте шешуші бір үзіндіде екі дұрыс нұсқа барын `low` режимде көрмеді: оған `mcq_x3` нұсқасы (D80).
        config = gateway_config()
        config["routes"]["mcq_solver_check"]["variants"] = {
            "mcq_x3": {"reasoning_effort": "medium", "max_output_tokens": 777}}
        gateway = LLMGateway(parse_config(config, {"KEY": "k"}), providers={"primary": self.provider},
                             sink=MemorySink(), sleep=no_sleep, rng=lambda: 0.0)
        await self.three_concept_chunks()
        self.provider.correct_texts = {"Ұлы Жібек жолы"}
        self.provider.generation_texts = self.distinct_mcqs(10)
        report = await BankPipeline(gateway, self.repo, rng=random.Random(1)).generate_now(
            ["kazakh6.md"], 1, topics=["kazakh6.md#§1"], formats=["mcq"], rounds=1)
        # Дәйексөз тек c1-де: шешушіге c1-дің жалғыз сұранысы — X3 жетеді.
        self.assertEqual(report.accepted, 1)
        self.assertEqual([q.request.x_tier for q in self.repo.questions], ["X3"])
        budgets = [call.max_output_tokens for call in self.provider.calls if call.schema_name == "SolverAnswer"]
        self.assertEqual(budgets, [777])
        x1 = replace(self.repo.questions[0].request, x_tier="X1")
        pipeline = BankPipeline(gateway, self.repo, rng=random.Random(1))
        self.assertEqual(pipeline._variant(Task.MCQ_SOLVER_CHECK, x1), "mcq")
        self.assertEqual(gateway.config.route(Task.MCQ_SOLVER_CHECK, "mcq").max_output_tokens, 100)

    async def test_generic_concept_type_is_never_an_x3_target(self) -> None:
        # «ұғым» — қалғанының бәрі: бір типті көршісі көп болса да, тізімі аралас, X3 тестке нысана емес.
        self.repo.chunk_rows["kazakh6.md#§1"] = [Chunk("c1", 1, "Жеке меншік пайда болды."),
                                                 Chunk("c2", 2, "Теңсіздік, билік пен еңбек бөлінісі күшейді.")]
        self.provider.concept_responses = [
            [{"term": "Жеке меншік", "type": "ұғым", "quote": "-"}],
            [{"term": "Теңсіздік", "type": "ұғым", "quote": "-"}, {"term": "Билік", "type": "ұғым", "quote": "-"},
             {"term": "Еңбек бөлінісі", "type": "ұғым", "quote": "-"}],
        ]
        await BankPipeline(self.gateway, self.repo, policy=StockPolicy(x3_per_session=3),
                           rng=random.Random(1)).submit(["kazakh6.md"], 1, formats=["mcq"])
        records = [row["record"] for row in self.repo.requests.values()]
        self.assertEqual(len(records), 4)
        self.assertNotIn("X3", {r.x_tier for r in records})

    async def test_used_key_from_older_extraction_still_blocks_its_concept(self) -> None:
        # Ұғым промпты жаңарып, атау «жайылымды» → «жайылымдық» болып өзгерді: банктегі сұрақтың ұғымы
        # сөз түбірлері бойынша танылады, оған екінші тест құрылмайды.
        self.repo.chunk_rows["kazakh6.md#§1"] = [Chunk("c1", 1, "Жайылымдық бақташылық дамыды. Сақтар өмір сүрді.")]
        self.provider.concept_responses = [[{"term": "Жайылымдық бақташылық", "quote": "-"},
                                             {"term": "Сақтар", "quote": "-"}]]
        old = RequestRecord("old", "b0", self.repo.subject, "kazakh6.md#§1", 1, "mcq", "X1", ("c1",),
                            concept_key="жайылымды бақташылық")
        self.repo.requests["old"] = {"record": old, "status": "pending", "reasons": []}
        await self.pipeline.submit(["kazakh6.md"], 1, formats=["mcq"])
        fresh = [row["record"].concept_key for custom_id, row in self.repo.requests.items() if custom_id != "old"]
        self.assertEqual(fresh, ["сақтар"])

    async def test_x3_uses_its_own_route_variant_in_a_separate_batch(self) -> None:
        # MCQ X3 ойлау режимі бөлек (mcq_x3, D80): Batch API-да ол бөлек batch болып жіберіледі.
        config = gateway_config()
        config["routes"]["generation"]["variants"] = {"mcq": {"model": "small"},
                                                      "mcq_x3": {"model": "strong", "reasoning_effort": "medium"}}
        gateway = LLMGateway(parse_config(config, {"KEY": "k"}), providers={"primary": self.provider},
                             sink=MemorySink(), sleep=no_sleep, rng=lambda: 0.0)
        await self.three_concept_chunks()
        batches = await BankPipeline(gateway, self.repo, rng=random.Random(1)).submit(["kazakh6.md"], 1, formats=["mcq"])
        self.assertEqual(len(batches), 2)
        tiers = {row["record"].custom_id: row["record"].x_tier for row in self.repo.requests.values()}
        for batch in self.provider.batches:
            models = {request.model for _, request in batch}
            batch_tiers = {tiers[custom_id] for custom_id, _ in batch}
            self.assertEqual(models, {"strong-model"} if batch_tiers == {"X3"} else {"small-model"}, batch_tiers)
        self.assertIn({"X3"}, [{tiers[c] for c, _ in batch} for batch in self.provider.batches])

    async def test_matching_is_anchored_to_concept(self) -> None:
        await self.three_concept_chunks()
        await self.pipeline.submit(["kazakh6.md"], 1, formats=["matching"])
        records = [row["record"] for row in self.repo.requests.values()]
        self.assertTrue(records)
        self.assertTrue(all(r.concept_key for r in records))
        self.assertEqual(len({r.concept_key for r in records}), len(records))
        sent = self.provider.batches[-1][0][1].messages[-1].content
        self.assertIn('"нысана":', sent)
        self.assertNotIn('"§_ұғымдары":', sent)

    async def test_fast_lane_warms_cache_with_one_request_first(self) -> None:
        # Әр форматтың бірінші сұранысы толық біткен соң ғана қалғандары басталады (D80).
        events: list[str] = []
        original = self.provider.complete

        async def tracked(request: CompletionRequest) -> ProviderCompletion:
            if request.schema_name == "MCQGen":
                events.append("start")
                await asyncio.sleep(0)
                result = await original(request)
                events.append("end")
                return result
            return await original(request)

        self.provider.complete = tracked  # type: ignore[method-assign]
        self.repo.chunk_rows["kazakh6.md#§1"] = [Chunk("c1", 1, SOURCE)]
        self.provider.correct_texts = {"Ұлы Жібек жолы"}
        self.provider.generation_texts = self.distinct_mcqs(3)
        report = await self.small_policy_pipeline().generate_now(
            ["kazakh6.md"], 1, topics=["kazakh6.md#§1"], formats=["mcq"])
        self.assertEqual(report.accepted, 3)
        self.assertEqual(events[:2], ["start", "end"])
        self.assertEqual(events.count("start"), 3)

    async def test_on_demand_fast_lane_runs_checks_in_parallel_and_still_stops_repeats(self) -> None:
        """D93: generation, the solver check and embeddings overlap (the first on-demand run processed results one
        by one, ~4 s each). Bank comparison stays serial: two identical questions arriving together, one passes."""
        live = {"generation": 0, "solver": 0}
        peak = {"generation": 0, "solver": 0}
        original = self.provider.complete

        async def tracked(request: CompletionRequest) -> ProviderCompletion:
            kind = "generation" if request.schema_name == "MCQGen" else "solver" if request.schema_name == "SolverAnswer" else None
            if kind is None:
                return await original(request)
            live[kind] += 1
            peak[kind] = max(peak[kind], live[kind])
            await asyncio.sleep(0.01)
            try:
                return await original(request)
            finally:
                live[kind] -= 1

        self.provider.complete = tracked  # type: ignore[method-assign]
        self.repo.chunk_rows["kazakh6.md#§1"] = [Chunk("c1", 1, SOURCE)]
        self.provider.correct_texts = {"Ұлы Жібек жолы"}
        texts = self.distinct_mcqs(3)
        self.provider.generation_texts = [texts[0], texts[0], texts[1], texts[2]]
        report = await self.pipeline.generate_now(
            ["kazakh6.md"], 1, topics=["kazakh6.md#§1"], formats=["mcq"], rounds=1, warmup=False,
            targets={("mcq", "X1"): 2, ("mcq", "X2"): 2})
        self.assertEqual(len(self.repo.requests), 4)            # session-sized, not the § stock
        self.assertGreater(peak["generation"], 1)               # no warm-up wave
        self.assertGreater(peak["solver"], 1)                   # checks overlap
        self.assertEqual((report.accepted, report.rejected), (3, 1))
        self.assertTrue(any("қайталан" in r or "ұқсас" in r for r in report.reasons))

    async def test_all_new_formats_require_concept_key_and_l3_l4_get_full_paragraph(self) -> None:
        self.repo.chunk_rows["kazakh6.md#§1"] = [
            Chunk("c1", 1, SOURCE),
            Chunk("c2", 2, "Екінші бөлім: Отырар саудасы дамыды."),
            Chunk("c3", 3, "Үшінші бөлім: Тараз қолөнері өркендеді."),
            Chunk("c4", 4, "Төртінші бөлім: керуен жолдары қауіпсіз болды."),
        ]
        self.provider.concept_responses = [
            [{"term": f"Ұғым {i}", "quote": "Ол арқылы жібек"} if i == 1 else {"term": f"Ұғым {i}", "quote": ""}
             for i in range(1, 3)]
            for _ in range(4)
        ]
        self.assertEqual(CONCEPT_BOUND_FORMATS, frozenset({"mcq", *HYBRID_FORMATS, *AI_FORMATS}))

        for lvl, fmts in (
            (1, ["short_answer"]),
            (2, ["true_false_fix"]),
            (3, ["socratic", "feynman", "teach_ai"]),
            (4, ["case_study", "priority"]),
        ):
            await self.pipeline.submit(["kazakh6.md"], lvl, formats=fmts)

        records = [row["record"] for row in self.repo.requests.values()]
        self.assertGreaterEqual(len(records), 7)
        for rec in records:
            self.assertTrue(rec.concept_key, f"{rec.format} request missing concept_key")
            if rec.format in FULL_PARAGRAPH_FORMATS:
                self.assertEqual(rec.chunk_ids, ("c1", "c2", "c3", "c4"), rec.format)

        sent_prompts = [req.messages[-1].content for batch in self.provider.batches for _, req in batch]
        for msg in sent_prompts:
            self.assertIn('"нысана":', msg)

        # Ұғымдар шығарылмаса (provider error → None), концепт-форматтар concept_key=None сұраныс жасамайды.
        fresh_repo = MemoryRepository()
        fail_provider = BankFakeProvider("primary")
        fail_provider.complete = mock.AsyncMock(side_effect=ProviderError("503", retryable=False, status=503))  # type: ignore[method-assign]
        fail_gw = LLMGateway(parse_config(gateway_config(), {"KEY": "k"}), providers={"primary": fail_provider},
                             sink=MemorySink(), sleep=no_sleep, rng=lambda: 0.0)
        fail_pipe = BankPipeline(fail_gw, fresh_repo, rng=random.Random(1))
        self.assertEqual(await fail_pipe.submit(["kazakh6.md"], 1, formats=["short_answer"]), [])
        self.assertEqual(fresh_repo.requests, {})

    async def test_fast_lane_warms_prompt_cache_before_parallel_wave(self) -> None:
        self.repo.chunk_rows["kazakh6.md#§1"] = [
            Chunk("c1", 1, SOURCE),
            Chunk("c2", 2, "Екінші үзінді: Отырар мен Тараз ірі сауда орталықтары болды."),
            Chunk("c3", 3, "Үшінші үзінді: керуендер жібек пен қағаз тасымалдады."),
        ]

        class WarmupProvider(BankFakeProvider):
            def __init__(self) -> None:
                super().__init__("primary")
                self.events: list[tuple[str, str, float]] = []
                self.in_flight_gens = 0
                self.max_parallel_gens = 0
                self.fail_first_gen = False
                self._gen_count = 0

            async def complete(self, request: CompletionRequest) -> ProviderCompletion:
                if request.schema_name in {"SocraticGen", "ShortAnswerGen"}:
                    self._gen_count += 1
                    idx = self._gen_count
                    loop_t = asyncio.get_running_loop().time()
                    self.events.append(("start", f"{request.schema_name}#{idx}", loop_t))
                    self.in_flight_gens += 1
                    self.max_parallel_gens = max(self.max_parallel_gens, self.in_flight_gens)
                    await asyncio.sleep(0.02)
                    self.in_flight_gens -= 1
                    end_t = asyncio.get_running_loop().time()
                    self.events.append(("end", f"{request.schema_name}#{idx}", end_t))
                    if self.fail_first_gen and idx == 1:
                        raise ProviderError("boom", retryable=False, status=500)
                    if request.schema_name == "SocraticGen":
                        payload = valid_gens()[11].model_copy(update={"stem": f"Тақырып #{idx}"}).model_dump_json()
                    else:
                        payload = valid_gens()[6].model_copy(update={"stem": f"Сұрақ #{idx}?"}).model_dump_json()
                    return ProviderCompletion(payload, Usage(50, 0, 50), request.model)
                return await super().complete(request)

        wp = WarmupProvider()
        gw = LLMGateway(parse_config(gateway_config(), {"KEY": "k"}), providers={"primary": wp},
                        sink=MemorySink(), sleep=no_sleep, rng=lambda: 0.0)
        pipe = BankPipeline(gw, self.repo, policy=StockPolicy(concurrent_sessions_per_topic=2, safety=1.2), rng=random.Random(1))
        report = await pipe.generate_now(
            ["kazakh6.md"], 3, topics=["kazakh6.md#§1"], formats=["socratic"], max_requests=3, rounds=1,
        )
        self.assertEqual(report.accepted, 3)
        end_first = next(t for kind, label, t in wp.events if kind == "end" and label == "SocraticGen#1")
        starts_rest = [t for kind, label, t in wp.events if kind == "start" and label in {"SocraticGen#2", "SocraticGen#3"}]
        self.assertEqual(len(starts_rest), 2)
        self.assertTrue(all(st >= end_first for st in starts_rest))
        self.assertGreaterEqual(wp.max_parallel_gens, 2)

        # Лидер сәтсіз аяқталса да (fail_first_gen=True), 2-толқын блокталмайды.
        wp2 = WarmupProvider()
        wp2.fail_first_gen = True
        gw2 = LLMGateway(parse_config(gateway_config(), {"KEY": "k"}), providers={"primary": wp2},
                         sink=MemorySink(), sleep=no_sleep, rng=lambda: 0.0)
        pipe2 = BankPipeline(gw2, MemoryRepository(), rng=random.Random(1))
        pipe2._repo.chunk_rows["kazakh6.md#§1"] = [  # type: ignore[attr-defined]
            Chunk("c1", 1, SOURCE),
            Chunk("c2", 2, SOURCE + " Отырар сауда орталығы."),
            Chunk("c3", 3, SOURCE + " Тараз қолөнер қаласы."),
        ]
        rep2 = await pipe2.generate_now(
            ["kazakh6.md"], 1, topics=["kazakh6.md#§1"], formats=["short_answer"], max_requests=3, rounds=1,
        )
        self.assertEqual((rep2.failed, rep2.accepted), (1, 2))


class CheckTests(unittest.IsolatedAsyncioTestCase):
    def test_quote_tolerates_spacing_and_quotes(self) -> None:
        package = mcq(support_quote="Ол арқылы  жібек, қағаз және дәмдеуіштер тасылды").to_package(random.Random(1))
        self.assertIsNone(quote_problem(package, SOURCE))
        self.assertIsNotNone(quote_problem(package, "Басқа мәтін"))

    def test_quote_fragments_split_by_ellipsis(self) -> None:
        def check(quote: str) -> str | None:
            return quote_problem(mcq(support_quote=quote).to_package(random.Random(1)), SOURCE)

        both = "Ұлы Жібек жолы Қытайдан Жерорта теңізіне дейін созылған… Отырар мен Тараз осы жолдың бойындағы"
        self.assertIsNone(check(both))
        self.assertIsNone(check(both.replace("…", "...")))
        self.assertEqual(check("Ұлы Жібек жолы Қытайдан басталды… Отырар мен Тараз осы жолдың бойындағы"),
                         "Т7: support_quote оқулық мәтінінде жоқ")
        self.assertEqual(check("Ұлы Жібек… жолы… Отырар мен"), "Т7: support_quote тым қысқа")

    def test_quote_sentences_from_different_places_are_checked_one_by_one(self) -> None:
        # D81: толық параграфты көретін форматтар мәтінде қатар тұрмаған сөйлемдерді «…»-сыз біріктіреді.
        def check(quote: str) -> str | None:
            return quote_problem(mcq(support_quote=quote).to_package(random.Random(1)), SOURCE)

        first = "Ұлы Жібек жолы Қытайдан Жерорта теңізіне дейін созылған сауда жолы болды."
        third = "Отырар мен Тараз осы жолдың бойындағы ірі қалалар еді."
        self.assertIsNone(check(f"{first} {third}"))
        self.assertIsNone(check(f"{third} {first}"))
        self.assertEqual(check(f"{first} Отырар Қытайдың астанасы болды."), "Т7: support_quote оқулық мәтінінде жоқ")

    def test_duplicate_threshold(self) -> None:
        self.assertAlmostEqual(cosine([1, 0], [1, 0]), 1.0)
        self.assertIsNone(duplicate_problem([1, 0], [[0, 1]]))
        self.assertIsNotNone(duplicate_problem([1, 0.1], [[1, 0]]))
        # Мағынасы бірдей сұрақтар (≈ 0.87) ұсталады, әртүрлі сұрақтар (≈ 0.80 және төмен) өтеді.
        self.assertIsNotNone(duplicate_problem([1, 0.55], [[1, 0]]))  # cos ≈ 0.876
        self.assertIsNone(duplicate_problem([1, 0.75], [[1, 0]]))  # cos = 0.80
        self.assertLess(DUPLICATE_THRESHOLD, 0.876)

    def test_quote_survives_ocr_hyphenation(self) -> None:
        # «иуда-\n\nизм» — OCR тасымалы: модель сөзді дұрыс жазса да, дәйексөз табылады (D80).
        reference = "Бұл аймақтардың діні зороастризм мен иуда-\n\nизм болды. Беғазы-Дәндібай 1946–\n1974 жылдары зерттелді."
        def check(quote: str) -> str | None:
            return quote_problem(mcq(support_quote=quote).to_package(random.Random(1)), reference)

        self.assertIsNone(check("Бұл аймақтардың діні зороастризм мен иудаизм болды."))
        self.assertIsNone(check("Беғазы-Дәндібай 1946– 1974 жылдары зерттелді."))
        self.assertIsNotNone(check("Беғазы Дәндібай 19461974 жылдары зерттелді."))
        self.assertEqual(normalize_text("қазақ­стан"), "қазақстан")

    def test_repeat_problem_catches_same_stem_and_reused_matching_items(self) -> None:
        stem = "Геродот Томирис пен Кир туралы оқиғаға қандай баға береді?"
        first = mcq(stem=stem).to_package(random.Random(1))
        second = mcq(stem=stem, options=["Аңыз деп айтады", "Нақты дерек деп айтады", "Жалған деп айтады",
                                         "Ештеңе айтпайды"]).to_package(random.Random(2))
        existing = [(first.content, first.key)]
        self.assertEqual(repeat_problem(second, existing), "Т7: бар сұрақпен мазмұны қайталанады (сұрақ мәтіні бірдей)")
        other = mcq(stem="Томирис қай тайпаның көсемі болды?", options=["Массагеттердің", "Сақтардың", "Үйсіндердің",
                                                                        "Қаңлылардың"]).to_package(random.Random(3))
        self.assertIsNone(repeat_problem(other, existing))
        # Жалғауы ғана басқа сұрақ (§16–17): сөз бойынша 0.78, түбір бойынша бірдей.
        place = mcq(stem="Ерте металл дәуіріндегі қоныстар көбіне қай жерлерде орналасты?",
                    options=["Өзен жағалауларында", "Тау асуларында", "Шөл ортасында", "Орман ішінде"])
        again = mcq(stem="Ерте металл дәуірінде қоныстар көбіне қай жерлерде орналасты?",
                    options=["Өзен жағалауларында", "Құм төбелерінде", "Жартас үстінде", "Көл түбінде"])
        placed = place.to_package(random.Random(1))
        self.assertEqual(repeat_problem(again.to_package(random.Random(2)), [(placed.content, placed.key)]),
                         "Т7: бар сұрақпен мазмұны қайталанады (сұрақ мәтіні бірдей)")
        # Сұрағы басқа, дұрыс жауабы бірдей (≥ 3 сөз): сол факт қайта тексеріледі. Қысқа жауап ережеге ілінбейді.
        mines = mcq(stem="Қазақстандағы кен орындары дұрыс көрсетілген нұсқаны таңдаңыз.",
                    options=["Жезқазған – мыс, Атасу – қалайы, Степняк – алтын",
                             "Жезқазған – алтын, Атасу – мыс, Степняк – қалайы",
                             "Жезқазған – қалайы, Атасу – алтын, Степняк – мыс",
                             "Жезқазған – мыс, Атасу – алтын, Степняк – қалайы"]).to_package(random.Random(1))
        centre = mcq(stem="Қазақстанның ежелден кен ісінің орталығы болғанын қандай дерек дәлелдейді?",
                     options=["Жезқазғаннан мыс, Атасудан қалайы, Степняктан алтын алынған.",
                              "Жезқазғаннан алтын, Атасудан мыс, Степняктан қалайы алынған.",
                              "Жезқазғаннан қалайы, Атасудан алтын, Степняктан мыс алынған.",
                              "Жезқазғаннан мыс, Атасудан алтын, Степняктан қалайы алынған."]).to_package(random.Random(2))
        self.assertEqual(repeat_problem(centre, [(mines.content, mines.key)]),
                         "Т7: бар сұрақпен мазмұны қайталанады (дұрыс жауабы бірдей)")
        tin = mcq(stem="Қола алу үшін мысқа қандай металл қосылды?",
                  options=["қалайы", "күміс", "темір", "алтын"]).to_package(random.Random(1))
        tin_place = mcq(stem="Атасу жоталарынан қандай кен алынды?",
                        options=["қалайы", "мыс", "алтын", "күміс"]).to_package(random.Random(2))
        self.assertIsNone(repeat_problem(tin_place, [(tin.content, tin.key)]))

        def matching(*pairs: tuple[str, str]):
            return MatchingGen.model_validate({"stem": "Сәйкестендіріңіз", "pairs": [
                {"left": left, "right": right} for left, right in pairs], **COMMON}).to_package(random.Random(1))

        names = matching(("номадизм", "көшпелі"), ("көшпелі бақташылық", "жайылымдық мал бағу"),
                         ("Ерте темір дәуірі", "Ежелгі Қазақстан"))
        # Сол жұптар бағаны ауысып қайта келді — қайталау.
        swapped = matching(("көшпелі", "номадизм"), ("жайылымдық мал бағу", "көшпелі бақташылық"),
                           ("Қой", "басты түлік"))
        self.assertEqual(repeat_problem(swapped, [(names.content, names.key)]),
                         "Т7: бар сұрақпен мазмұны қайталанады (сәйкестендіру элементтері)")
        # Бір тұлғалар, бірақ басқа байланыс (атағы → еңбегі): өтеді.
        titles = matching(("Геродот", "грек тарихшысы"), ("Полиэн", "антикалық автор"), ("I Дарий", "парсы патшасы"),
                          ("Аршақ", "Парфия негізін қалаушы"))
        deeds = matching(("Геродот", "грек-парсы соғыстары"), ("Полиэн", "сақ жеріне ену"),
                         ("О. Ысмағұлов", "сақтардың арғы тегі"), ("I Дарий", "сақ көсемін тұтқындау"))
        self.assertIsNone(repeat_problem(deeds, [(titles.content, titles.key)]))

    async def test_repository_retries_reads_once_on_lost_connection(self) -> None:
        class FlakyPool:
            def __init__(self, failures: int) -> None:
                self.failures, self.calls = failures, 0

            async def fetch(self, query, *args):
                self.calls += 1
                if self.calls <= self.failures:
                    raise asyncpg.exceptions.ConnectionDoesNotExistError("connection was closed")
                return [{"ok": True}]

        once = FlakyPool(1)
        self.assertEqual(await PgBankRepository(once)._fetch("select 1"), [{"ok": True}])  # type: ignore[arg-type]
        self.assertEqual(once.calls, 2)
        twice = FlakyPool(2)
        with self.assertRaises(asyncpg.exceptions.ConnectionDoesNotExistError):
            await PgBankRepository(twice)._fetch("select 1")  # type: ignore[arg-type]
    def test_normalize_text_cleans_ocr_hyphen_breaks_without_breaking_compounds(self) -> None:
        ocr_ref = (
            "Иуда-\n\nизм, христиан және ислам діндері.\n"
            "Бұл қазақ-\nстан мен Орал -\nКаспий өңірінде 1946-\n1974 жылдары Беғазы-Дәндібай жазу\u00adсы."
        )
        normed = normalize_text(ocr_ref)
        self.assertIn("иудаизм", normed)
        self.assertIn("қазақстан", normed)
        self.assertIn("беғазы-дәндібай", normed)
        self.assertIn("1946- 1974", normed)
        self.assertIn("орал - каспий", normed)
        self.assertIn("жазусы", normed)

        pkg = mcq(support_quote="Иудаизм, христиан және ислам діндері.").to_package(random.Random(1))
        self.assertIsNone(quote_problem(pkg, ocr_ref))

    async def test_solver_unreadable_answer_fails_closed(self) -> None:
        provider = FakeProvider("primary", ["это не json"] * 3)
        gateway = LLMGateway(parse_config(gateway_config(), {"KEY": "k"}), providers={"primary": provider},
                             sink=MemorySink(), sleep=no_sleep)
        package = mcq().to_package(random.Random(1))
        self.assertEqual(await mcq_solver_problem(gateway, package, SOURCE), "Т7: шешуші модель жауабы оқылмады")


if __name__ == "__main__":
    unittest.main()
