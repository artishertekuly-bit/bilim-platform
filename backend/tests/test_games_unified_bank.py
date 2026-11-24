"""D98: Games 1-кезең — біртұтас сұрақ көзі (емтихан банкінің көпірі) және еркін тақырыптың кэші.

Дерекқор да, LLM де жоқ: ойынның жадтағы FakeDB-сі көпір функцияларымен толықтырылады, генератор жалған.
Әр сценарийде LLM шақыруы саналады — банк бірінші режимдері $0 болуы керек.
"""

from __future__ import annotations

import asyncio
import json
import random
import re
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace

from app.games import provider as P
from app.games.bank.topic import MAX_GENERATE, TopicBatch, TopicItem, TopicMCQ, TopicMCQBatch, build_topic_mcq
from app.games.dto import CreateRoomRequest, PreviewRequest
from app.games.errors import GamesError
from app.games.service import GamesService
from tests.test_games_service import HOST, SUBJECT, T0, FakeDB, FakeGateway, FakePool

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "20261128090000_games_unified_bank.sql"
HISTORY, WORLD = str(uuid.uuid4()), str(uuid.uuid4())
OPTIONS = [{"id": x, "text": x.upper()} for x in "abcd"]


def run(coro):
    return asyncio.run(coro)


def exam_rows(subject: str, n: int, *, eras=("Ежелгі дәуір", "Орта ғасырлар", "Жаңа заман"), topic=None) -> list[dict]:
    return [{"question_id": str(uuid.uuid4()), "topic_id": topic, "era": eras[i % len(eras)],
             "subtopic": f"Тақырыпша {i % 5}", "tier": "X1" if i % 2 else "X2", "subject": subject}
            for i in range(n)]


class BankDB(FakeDB):
    """FakeDB + көпір функциялары (games.examiner_*) және generated_questions кэші."""

    def __init__(self, clock) -> None:
        super().__init__(clock)
        self.exam_pool = []
        self.generated: list[dict] = []
        self.runs: list[tuple] = []
        self.runs_today = 0
        self.bank = [{"subject_id": HISTORY, "title": "Қазақстан тарихы", "mcq": 1655, "has_textbook": True},
                     {"subject_id": WORLD, "title": "Дүниежүзі тарихы", "mcq": 5064, "has_textbook": False}]

    def q_bank_subjects(self):
        return self.bank

    def q_examiner_pool(self, subject, topics, patterns, limit):
        rows = [r for r in self.exam_pool if (subject is None or r["subject"] == subject)
                and (topics is None or r["topic_id"] in topics)]
        if patterns:
            stems = [p.strip("%") for p in patterns]
            rows = [r for r in rows if any(s in f"{r['era']} {r['subtopic']}".lower() for s in stems)]
        return rows[:limit]

    def q_examiner_items(self, ids):
        row = next((r for r in self.exam_pool if r["question_id"] in ids), None)
        if row is None:
            return None
        return row | {"content": {"stem": f"Емтихан сұрағы {row['question_id'][:4]}?", "options": OPTIONS},
                      "correct_option_id": "c"}

    def q_scope_check(self, subject, book, topic_ids):
        rows = super().q_scope_check(subject, book, topic_ids)
        for row in rows:  # D98: §-ке байланған емтихан тесттері де саналады
            row["mcq"] += sum(1 for r in self.exam_pool if r["topic_id"] == row["topic_id"])
        return rows

    def q_generated_pool(self, subject_key, topic_key):
        return [g for g in self.generated if (g["subject_key"], g["topic_key"]) == (subject_key, topic_key)]

    def q_generated_items(self, ids):
        return next((g for g in self.generated if g["question_id"] in ids), None)

    def q_insert_generated(self, subject_key, topic_key, subject_title, topic_title, stem_hash, difficulty, content,
                           key, checks, prompt_version, model, user):
        if any((g["subject_key"], g["topic_key"], g["stem_hash"]) == (subject_key, topic_key, stem_hash)
               for g in self.generated):
            return None
        qid = str(uuid.uuid4())
        self.generated.append({"question_id": qid, "subject_key": subject_key, "topic_key": topic_key,
                               "stem_hash": stem_hash, "difficulty": difficulty, "content": json.loads(content),
                               "answer_key": json.loads(key)})
        return qid

    def q_generation_runs_today(self, user):
        return self.runs_today

    def q_insert_generation_run(self, user, subject_key, topic_key, requested, accepted, outcome, cost):
        self.runs.append((subject_key, topic_key, requested, accepted, outcome))


class FakeTopicGenerator:
    """build_topic_mcq-тің орнына: әр шақыруды санайды, сұралғанынша жарамды тест береді."""

    def __init__(self) -> None:
        self.calls: list[int] = []

    async def __call__(self, gateway, subject, topic, count, existing, rng):
        self.calls.append(count)
        offset = len(existing)
        items = [TopicItem(1 + i % 3, {"stem": f"{topic}: {offset + i}-сұрақ?", "options": OPTIONS},
                           {"correct_option_id": "b"}, "Түсіндірме сөйлемі.") for i in range(count)]
        return TopicBatch(items=items, requested=count, cost_usd=0.002, model="small")


class UnifiedCase(unittest.TestCase):
    def setUp(self) -> None:
        self.now = T0
        self.db = BankDB(lambda: self.now)
        self.gateway = FakeGateway()
        self.generator = FakeTopicGenerator()
        self.service = GamesService(FakePool(self.db), gateway=self.gateway, clock=lambda: self.now,
                                    rng=random.Random(3), topic_generator=self.generator)

    def create(self, game="baige", mode="solo", **source):
        return run(self.service.create_room(HOST, "student", CreateRoomRequest(game_type=game, mode=mode, **source)))

    def scope(self, view) -> dict:
        return json.loads(self.db.rooms[view["room"]["room_id"]]["scope"])


class BankModeTests(UnifiedCase):
    def test_history_and_world_history_start_from_bank_at_zero_cost(self) -> None:
        self.db.exam_pool = exam_rows(HISTORY, 80) + exam_rows(WORLD, 200, eras=("Ежелгі", "Орта", "Жаңа", "Қазіргі"))
        for subject in (HISTORY, WORLD):
            view = self.create(source="bank", subject_id=subject)
            scope = self.scope(view)
            self.assertEqual(scope["source"], "bank")
            self.assertTrue(all(d["src"] == "examiner" for d in scope["deck"]))
            self.assertGreaterEqual(len(scope["deck"]), P.DECK_MIN)
            self.assertLessEqual(len(scope["topic_ids"]), P.MAX_TOPICS)
            self.assertEqual(view["public"]["game"], "baige")
            self.assertTrue(view["public"]["question"]["stem"].startswith("Емтихан сұрағы"))
        self.assertEqual(self.gateway.calls, [])      # $0: LLM жоқ
        self.assertEqual(self.generator.calls, [])
        public = json.dumps([b["public"] for b in self.db.broadcasts], ensure_ascii=False)
        self.assertNotIn('"correct"', public)        # кілт клиентке бармайды

    def test_regions_are_eras_and_seen_is_logged_with_source(self) -> None:
        self.db.exam_pool = exam_rows(WORLD, 120, eras=("Ежелгі", "Орта", "Жаңа", "Қазіргі"))
        view = self.create(source="bank", subject_id=WORLD, topic_query="")
        self.assertEqual(sorted(view["room"]["scope"]["labels"]), sorted(["Ежелгі", "Орта", "Жаңа", "Қазіргі"]))
        self.assertIn("examiner", getattr(self.db, "sources", []))  # сұрақты көрді — журналда көзі бар

    def test_topic_filter_and_short_bank_is_a_clear_409(self) -> None:
        self.db.exam_pool = exam_rows(HISTORY, 6, eras=("Түрік қағанаты",))
        with self.assertRaises(GamesError) as ctx:
            self.create(source="bank", subject_id=HISTORY, topic_query="Түрік қағанаты")
        self.assertEqual(ctx.exception.code, "BANK_EMPTY")
        self.assertIn("6 / 10", ctx.exception.message)

    def test_debate_needs_textbook_paragraphs(self) -> None:
        with self.assertRaises(GamesError) as ctx:
            self.create(game="debate", mode="multi", source="bank", subject_id=HISTORY)
        self.assertEqual(ctx.exception.code, "DEBATE_NEEDS_TEXTBOOK")


class ParagraphUnlockTests(UnifiedCase):
    def test_examiner_questions_linked_to_paragraph_unlock_it(self) -> None:
        # t3-те ойын банкінде сұрақ жоқ (бұрын 0 — ойын ашылмайтын), емтихан банкінде 12 байланған тест бар.
        self.db.exam_pool = exam_rows(SUBJECT, 12, topic="t3")
        view = self.create(game="baige", mode="solo", subject_id=SUBJECT, book="hist8", topic_ids=["t3"])
        scope = self.scope(view)
        self.assertEqual(scope["source"], "paragraphs")
        self.assertEqual({d["src"] for d in scope["deck"]}, {"examiner"})
        self.assertEqual(view["room"]["scope"]["labels"], ["§3 Тақырып 3"])
        self.assertEqual(self.gateway.calls, [])

    def test_game_and_examiner_items_share_one_deck(self) -> None:
        self.db.add_questions(n=6, topics=("t1",), debate=0)
        self.db.exam_pool = exam_rows(SUBJECT, 6, topic="t1")
        view = self.create(game="baige", mode="solo", subject_id=SUBJECT, book="hist8", topic_ids=["t1"])
        self.assertEqual({d["src"] for d in self.scope(view)["deck"]}, {"game", "examiner"})


class TopicModeTests(UnifiedCase):
    def test_deficit_only_generation_then_cache_hit_at_zero_cost(self) -> None:
        first = self.create(source="topic", subject_text="Информатика", topic_query="Excel формулалары")
        self.assertEqual(self.generator.calls, [P.TOPIC_TARGET])       # кэш бос: тек тапшылық (20)
        self.assertEqual(len(self.db.generated), P.TOPIC_TARGET)
        self.assertEqual(self.db.runs[0][2:4], (P.TOPIC_TARGET, P.TOPIC_TARGET))
        self.assertEqual(self.scope(first)["generated"], P.TOPIC_TARGET)

        # Сол тақырып басқаша жазылды: кілт бірдей, кэштен $0.
        second = self.create(source="topic", subject_text="  информатика ", topic_query="EXCEL  формулалары!")
        self.assertEqual(self.generator.calls, [P.TOPIC_TARGET])       # екінші шақыру жоқ
        self.assertEqual(self.scope(second)["from_cache"], P.TOPIC_TARGET)
        self.assertEqual({d["src"] for d in self.scope(second)["deck"]}, {"generated"})

    def test_partial_cache_generates_only_the_gap(self) -> None:
        self.create(source="topic", subject_text="Информатика", topic_query="Excel")
        self.db.generated = self.db.generated[:15]
        self.create(source="topic", subject_text="Информатика", topic_query="Excel")
        self.assertEqual(self.generator.calls, [20, 5])

    def test_bank_subject_topic_is_served_from_examiner_bank_first(self) -> None:
        self.db.exam_pool = exam_rows(HISTORY, 30, eras=("Түрік қағанаты",))
        view = self.create(source="topic", subject_text="Қазақстан тарихы", topic_query="Түрік қағанаты")
        self.assertEqual(self.generator.calls, [])                     # 20 табылды — генерация жоқ
        self.assertEqual(self.scope(view)["from_bank"], P.TOPIC_TARGET)

    def test_daily_limit_blocks_only_when_the_bank_cannot_start_the_game(self) -> None:
        self.db.runs_today = P.DEFAULT_DAILY_LIMIT
        with self.assertRaises(GamesError) as ctx:
            self.create(source="topic", subject_text="Информатика", topic_query="Word")
        self.assertEqual((ctx.exception.status, ctx.exception.code), (429, "GENERATION_LIMIT"))
        self.assertEqual(self.generator.calls, [])

    def test_generated_items_never_touch_the_examiner_bank(self) -> None:
        self.assertIn("insert into games.generated_questions", P.INSERT_GENERATED)
        source = (ROOT / "backend" / "app" / "games").rglob("*.py")
        for path in source:
            text = path.read_text(encoding="utf-8")
            self.assertNotRegex(text, r"(insert into|update|delete from)\s+examiner\.", path.name)
            self.assertNotRegex(text, r"from\s+examiner\.(questions|question_state)", path.name)

    def test_preview_reports_the_gap_without_calling_the_llm(self) -> None:
        data = run(self.service.preview(PreviewRequest(game_type="conquest", source="topic",
                                                       subject_text="Информатика", topic_query="Excel")))
        self.assertEqual((data["available"], data["deficit"], data["generate"], data["needed"]), (0, 20, True, 12))
        self.assertEqual((self.generator.calls, self.gateway.calls), ([], []))


class HardCapTests(unittest.TestCase):
    @staticmethod
    def item(i: int) -> TopicMCQ:
        return TopicMCQ(stem=f"{['Алма', 'Бидай', 'Жүзім', 'Қарбыз'][i % 4]} {i} неше рет кездеседі?",
                        options=[f"{i + k} рет" for k in range(4)], correct_index=1, difficulty=1,
                        ecd_skill="Есте сақтау.", evidence="Фактіні біледі.", support_quote="Бұл қысқа түсіндірме сөйлем.")

    def gateway(self, parsed, outcome="ok"):
        calls = []

        async def complete(task, prompt, messages, *, schema=None, variant=None):
            calls.append((variant, messages[-1].content))
            return SimpleNamespace(parsed=parsed, outcome=outcome, cost_usd=0.01, model="gpt-5.4-mini")

        return SimpleNamespace(complete=complete), calls

    def test_never_more_than_twenty_per_call(self) -> None:
        gateway, calls = self.gateway(TopicMCQBatch(items=[self.item(i) for i in range(30)]))
        batch = run(build_topic_mcq(gateway, "Информатика", "Excel", 25, [], random.Random(0)))
        self.assertEqual(batch.requested, MAX_GENERATE)
        self.assertEqual(len(batch.items) + batch.rejected, MAX_GENERATE)   # модель артық берсе — алынбайды
        self.assertIn(f"{MAX_GENERATE} тест", calls[0][1])
        self.assertEqual(calls[0][0], "game_topic_mcq")
        self.assertEqual(len(calls), 1)                                      # бір пакет, бір шақыру

    def test_truncated_answer_caches_nothing(self) -> None:
        gateway, _ = self.gateway(None, outcome="truncated")
        batch = run(build_topic_mcq(gateway, "Информатика", "Excel", 10, [], random.Random(0)))
        self.assertEqual((batch.items, batch.outcome), ([], "truncated"))

    def test_zero_deficit_makes_no_call(self) -> None:
        gateway, calls = self.gateway(None)
        run(build_topic_mcq(gateway, "Информатика", "Excel", 0, [], random.Random(0)))
        self.assertEqual(calls, [])


class PureTests(unittest.TestCase):
    def test_keys_and_patterns(self) -> None:
        self.assertEqual(P.normalize_key("  EXCEL  формулалары! "), "excel формулалары")
        self.assertEqual(P.like_patterns("Түрік қағанаты туралы"), ["%түрік%", "%қаған%"])
        self.assertIsNone(P.like_patterns("  "))
        self.assertEqual(P.stem_hash("Сұрақ  1?"), P.stem_hash("сұрақ 1"))

    def test_regions_cap_at_eight_with_mixed_rest(self) -> None:
        rows = [{"era": f"Дәуір {i % 11}", "subtopic": None} for i in range(110)]
        topic_ids, labels, keys = P.regions(rows)
        self.assertEqual(len(topic_ids), P.MAX_TOPICS)
        self.assertEqual(labels[-1], "Аралас")
        self.assertEqual(set(keys), set(topic_ids))

    def test_single_era_splits_by_subtopic(self) -> None:
        rows = [{"era": "Қазақ хандығы", "subtopic": f"Хан {i % 3}"} for i in range(9)]
        self.assertEqual(sorted(P.regions(rows)[1]), ["Хан 0", "Хан 1", "Хан 2"])

    def test_formats_are_open_for_later_games(self) -> None:
        for name in ("mcq", "true_false_fix", "term_card", "role_card", "escape_step"):
            self.assertIn(name, P.FORMATS)
        self.assertEqual(P.DeckItem.from_json(P.DeckItem("generated", "x", "topic", 3, "term_card").to_json()).format,
                         "term_card")


class GrantTests(unittest.TestCase):
    """D68: games_svc емтихан кестелеріне рұқсат алмайды; көпір — тек оқитын security definer функциялар."""

    def setUp(self) -> None:
        self.sql = MIGRATION.read_text(encoding="utf-8")
        self.all_sql = "\n".join(p.read_text(encoding="utf-8")
                                 for p in sorted((ROOT / "supabase" / "migrations").glob("*.sql")))

    def test_bridge_functions_are_definer_with_empty_search_path_and_only_games_svc(self) -> None:
        names = re.findall(r"create function (games\.examiner_\w+)", self.sql)
        self.assertEqual(len(names), 4)
        for body in re.split(r"(?=create function )", self.sql)[1:]:
            if not body.startswith("create function games.examiner_"):
                continue
            head = body.split("$$", 1)[0]
            self.assertIn("security definer", head)
            self.assertIn("set search_path = ''", head)
            self.assertRegex(body.split("$$")[1], r"^\s*(with|select)")       # тек оқу
            self.assertNotRegex(body.split("$$")[1], r"\b(insert|update|delete)\b")
        for name in names:
            self.assertRegex(self.sql, rf"revoke all on function {re.escape(name)}\([^)]*\) from public, anon, authenticated")
            grants = re.findall(rf"grant execute on function {re.escape(name)}\([^)]*\) to (\w+);", self.sql)
            self.assertEqual(grants, ["games_svc"])

    def test_games_svc_has_no_examiner_table_grant(self) -> None:
        self.assertNotRegex(self.all_sql, r"grant [^;]*on [^;]*examiner\.[^;]* to [^;]*games_svc")
        self.assertNotRegex(self.all_sql, r"grant usage on schema examiner to [^;]*games_svc")

    def test_cache_table_is_games_only(self) -> None:
        self.assertIn("grant select, insert, update on games.generated_questions to games_svc", self.sql)
        self.assertIn("revoke all on games.generated_questions, games.generation_runs from public, anon, authenticated",
                      self.sql)


if __name__ == "__main__":
    unittest.main()
