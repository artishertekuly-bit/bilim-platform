"""Сұрақ банкі контурының тесттері. Іске қосу: python -m unittest discover -s backend/tests -t backend"""

from __future__ import annotations

import asyncio
import hashlib
import json
import random
import unittest
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import replace
from datetime import datetime, timedelta, timezone
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
from app.examiner.bank.concepts import ChunkConcepts, Concept, concept_groups
from app.examiner.bank.context import (
    Chunk,
    chunk_combinations,
    clean_chunk_text,
    distant_partners,
    entity_map,
    reference_text,
    strip_assignments,
)
from app.examiner.bank.formats import (
    GEN_MODELS,
    ErrorStepGen,
    FormulaGen,
    MatchingGen,
    MCQGen,
    SequenceGen,
    SliderGen,
    gen_from_package,
    normalize_text,
)
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
        """ortaq §4: клиентке баратын content-те кілт өрістері жоқ."""
        forbidden = ("correct", "key", "accept", "order", "pairs", "placement", "correction", "error")
        samples = [
            mcq(),
            MatchingGen.model_validate({"stem": "x", "pairs": [{"left": "а", "right": "б"}, {"left": "в", "right": "г"},
                                                               {"left": "д", "right": "е"}], **COMMON}),
            SequenceGen.model_validate({"stem": "x", "steps": ["а", "б", "в"], **COMMON}),
            ErrorStepGen.model_validate({"stem": "x", "steps": ["а", "б", "в"], "error_index": 1, "correction": "г",
                                         **COMMON}),
        ]
        for gen in samples:
            content_keys = json.dumps(gen.to_package(self.rng).content)
            for word in forbidden:
                self.assertNotIn(f'"{word}', content_keys, f"{gen.format_name}: {word}")


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


# ------------------------------------------------------------------ жоспарлаушы


class PlannerTests(unittest.TestCase):
    def test_history_substitutes_formula_and_slider(self) -> None:
        composition = effective_composition(2, {"formula_builder": False, "slider": False})
        self.assertEqual(composition, {"sequence": 3, "true_false_fix": 2, "error_step": 3})
        self.assertEqual(sum(composition.values()), 8)

    def test_targets(self) -> None:
        targets = stock_targets(1, {}, StockPolicy())
        # mcq: 5 × 0.4 × 2.4 = 4.8 → 5; 5 × 0.6 × 2.4 = 7.2 → 8; X3: ceil(2.4) = 3 → mcq 2, matching 1
        self.assertEqual(targets, {("mcq", "X1"): 5, ("mcq", "X2"): 8, ("matching", "X1"): 3,
                                   ("matching", "X2"): 5, ("mcq", "X3"): 2, ("matching", "X3"): 1})

    def test_plan_counts_existing_stock(self) -> None:
        have = {("t1", "mcq", "X1"): 5, ("t1", "mcq", "X2"): 3}
        slots = {(s.topic_id, s.format, s.tier): s.missing for s in plan(["t1"], 1, {}, have, formats=["mcq"])}
        self.assertEqual(slots, {("t1", "mcq", "X2"): 5, ("t1", "mcq", "X3"): 3})

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


# ------------------------------------------------------------------ банк аудиті (D73)


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
    ]


def bank_question(gen, *, qid: str, minute: int = 0, embedding=None, reference: str = SOURCE) -> BankQuestion:
    package = gen.to_package(random.Random(minute))
    return BankQuestion(
        question_id=qid, topic_id="kazakh6.md#§1", level=1, format=package.format, x_tier="X1",
        created_at=datetime(2026, 11, 19, 8, minute, tzinfo=timezone.utc), content=package.content, key=package.key,
        ecd_skill=package.ecd_skill, evidence=package.evidence, support_quote=package.support_quote,
        reference_text=reference, embedding=embedding,
    )


class AuditTests(unittest.TestCase):
    def test_package_round_trip_for_every_code_format(self) -> None:
        for gen in valid_gens():
            with self.subTest(fmt=gen.format_name):
                package = gen.to_package(random.Random(4))
                rebuilt = gen_from_package(package.format, package.content, package.key, ecd_skill=package.ecd_skill,
                                           evidence=package.evidence, support_quote=package.support_quote)
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

    def test_non_code_formats_are_skipped(self) -> None:
        # ЖИ форматтарының пакетін аудит құра алмайды: оларды «оқылмады» деп шығарып жібермеуі керек.
        ai = replace(bank_question(mcq(), qid="ai"), format="short_answer", content={"stem": "Атаңыз."}, key={})
        self.assertEqual(audit([ai]), [])

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
                items = [{"term": f"Ұғым {i}-{tag}", "quote": f"Ұғым {i}-{tag} түсіндірмесі"} for i in range(1, 11)]
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
                         {"examiner.generation.sequence", "examiner.generation.error_step"})

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
        self.assertEqual({q.request.x_tier for q in self.repo.questions}, {"X1", "X2", "X3"})

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
        # X3-ке §-тің барлық ұғымы емес, басқа чанктардан жақын алдағыштар тізімі: алдымен көрші емес c1,
        # нысананың өз чанкы (c3) мен бір топтағы «Сауда жолы» кірмейді.
        [x3] = [r for r in records if r.x_tier == "X3"]
        sent = {custom_id: request for batch in self.provider.batches for custom_id, request in batch}
        payload = json.loads(sent[x3.custom_id].messages[-1].content.split("Тапсырма:\n", 1)[1])
        self.assertEqual(payload["жақын_алдағыштар"], ["Ұлы Жібек жолы", "Сақтар", "Қорғандар"])
        self.assertNotIn("§_ұғымдары", payload)
        x1 = next(r for r in records if r.x_tier == "X1")
        self.assertIn("§_ұғымдары", json.loads(sent[x1.custom_id].messages[-1].content.split("Тапсырма:\n", 1)[1]))
        # Келесі іске қосу бос ұғым тобын таппайды: қор толы, ештеңе сұралмайды.
        self.assertEqual(await self.pipeline.submit(["kazakh6.md"], 1, formats=["mcq"]), [])

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

    async def test_solver_unreadable_answer_fails_closed(self) -> None:
        provider = FakeProvider("primary", ["это не json"] * 3)
        gateway = LLMGateway(parse_config(gateway_config(), {"KEY": "k"}), providers={"primary": provider},
                             sink=MemorySink(), sleep=no_sleep)
        package = mcq().to_package(random.Random(1))
        self.assertEqual(await mcq_solver_problem(gateway, package, SOURCE), "Т7: шешуші модель жауабы оқылмады")


if __name__ == "__main__":
    unittest.main()
