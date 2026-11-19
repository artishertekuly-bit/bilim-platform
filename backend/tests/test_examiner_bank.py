"""Сұрақ банкі контурының тесттері. Іске қосу: python -m unittest discover -s backend/tests -t backend"""

from __future__ import annotations

import hashlib
import json
import random
import unittest
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from unittest import mock

import app.examiner.bank.pipeline as pipeline_module

from app.examiner.bank.audit import BankQuestion, audit
from app.examiner.bank.checks import (
    DUPLICATE_THRESHOLD,
    cosine,
    duplicate_problem,
    mcq_solver_problem,
    quote_problem,
)
from app.examiner.bank.context import Chunk, chunk_combinations, clean_chunk_text, entity_map, reference_text
from app.examiner.bank.formats import (
    GEN_MODELS,
    ErrorStepGen,
    FormulaGen,
    MatchingGen,
    MCQGen,
    SequenceGen,
    SliderGen,
    gen_from_package,
)
from app.examiner.bank.pipeline import (
    BankPipeline,
    BatchRecord,
    NewQuestion,
    Paragraph,
    RequestRecord,
)
from app.examiner.bank.planner import StockPolicy, effective_composition, plan, stock_targets
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
            {"left": "Өте ұзын атауы бар қала", "right": "а"}, {"left": "б", "right": "а"},
            {"left": "в", "right": "г"}], **COMMON})
        problems = long.problems()
        self.assertIn("Т6: сол элемент 1 20 таңбадан ұзын", problems)
        self.assertIn("Т7: оң элемент қайталанады", problems)

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

    async def complete(self, request: CompletionRequest) -> ProviderCompletion:
        self.calls.append(request)
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
        self.batches: dict[str, BatchRecord] = {}
        self.requests: dict[str, dict] = {}
        self.questions: list[NewQuestion] = []

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
        self.assertTrue(reasons[ids[1]][0].startswith("Т7: бар сұраққа тым ұқсас"))
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
        return [mcq(stem=f"{index}-сұрақ: Қытайдан Жерорта теңізіне дейінгі жол қалай аталды?").model_dump_json()
                for index in range(count)]

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

    async def test_solver_unreadable_answer_fails_closed(self) -> None:
        provider = FakeProvider("primary", ["это не json"] * 3)
        gateway = LLMGateway(parse_config(gateway_config(), {"KEY": "k"}), providers={"primary": provider},
                             sink=MemorySink(), sleep=no_sleep)
        package = mcq().to_package(random.Random(1))
        self.assertEqual(await mcq_solver_problem(gateway, package, SOURCE), "Т7: шешуші модель жауабы оқылмады")


if __name__ == "__main__":
    unittest.main()
