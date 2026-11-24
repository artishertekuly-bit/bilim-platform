from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from pathlib import Path

from app.examiner.bank.import_json import (
    CORPUS_KEY,
    Options,
    SubjectState,
    VectorIndex,
    build_parser,
    parse_item,
    run,
    t6_problems,
)

KZ = {  # correct_answer / period_label variant
    "fact_key": "kz-abylai-born", "question": "Абылай хан қай жылы туған?",
    "options": {"A": "1711", "B": "1693", "C": "1680", "D": "1725"}, "correct_answer": "A",
    "era": "XVIII ғасыр", "subtopic": "Абылай хан", "period_label": "Жаңа заман", "year_sort": 1711,
    "explanation": "Абылай 1711 жылы туған.", "verified_source": "x", "exam_level": 3, "id": 7, "subtopic_order": 1,
}
WORLD = {  # answer / period variant
    "fact_key": "w-rome-capital", "question": "Рим империясының астанасы қай қала болды?",
    "options": {"A": "Афины", "B": "Рим", "C": "Карфаген", "D": "Спарта"}, "answer": "B",
    "era": "Ежелгі дүние", "subtopic": "Рим", "period": "Антика", "year_sort": -27,
    "explanation": "Империяның астанасы — Рим.",
}
T6_CUE = {  # the correct option is far longer than the rest
    "fact_key": "kz-otrar", "question": "Отырар деген не?",
    "options": {"A": "Иә", "B": "Жоқ", "C": "Бәлкім", "D": "Ұлы Жібек жолы бойындағы ірі сауда қаласы"},
    "correct_answer": "D", "era": "Орта ғасыр", "subtopic": "Қалалар", "period_label": "Орта ғасыр",
    "year_sort": 900, "explanation": "Отырар — сауда қаласы.",
}
EXISTING = {**WORLD, "fact_key": "already-in-db", "question": "Ежелгі империяның орталығы қай қала?"}
FIXTURE = [KZ, WORLD, T6_CUE, EXISTING]


class FakeRepo:
    """Counts DB round trips: every method is one query in PgImportRepo."""

    def __init__(self) -> None:
        self.calls: list[str] = []
        self.rows: list[dict] = []

    async def load_subject(self, slug: str) -> SubjectState:
        self.calls.append("load_subject")
        return SubjectState("00000000-0000-0000-0000-000000000001", {"already-in-db"}, VectorIndex())

    async def topic_centroids(self, subject_id: str) -> VectorIndex:
        self.calls.append("topic_centroids")
        return VectorIndex([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]], ["kz5-p1", "kz5-p2"])

    async def insert_batch(self, state, slug, rows, *, x_tier, embedding_model) -> int:
        self.calls.append("insert_batch")
        self.rows += rows
        return len(rows)


class FakeEmbedder:
    def __init__(self, same_vector: bool = False) -> None:
        self.calls: list[tuple[str, int]] = []
        self._n = 0
        self._same = same_vector

    async def embed(self, texts, model_key):
        self.calls.append((model_key, len(texts)))
        if model_key == CORPUS_KEY:
            return [[1.0, 0.0, 0.0] if "Абылай" in t else [0.0, 0.0, 1.0] for t in texts]
        out = []
        for _ in texts:
            self._n += 1
            out.append([1.0] + [0.0] * 15 if self._same else [1.0 if i == self._n else 0.0 for i in range(16)])
        return out

    def model_name(self, model_key):
        return "fake-small"

    def cost(self, chars, model_key):
        return chars * 1e-6


def _run(path: Path, options: Options, repo=None, embedder=None, no_link=frozenset()):
    repo = repo or FakeRepo()
    embedder = embedder or FakeEmbedder()
    lines = asyncio.run(run([("history", path)], repo=repo, embedder=embedder, options=options, no_link=no_link))
    return lines, repo, embedder


class ImportJsonTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.path = Path(self._tmp.name) / "bank.json"
        self.path.write_text(json.dumps(FIXTURE, ensure_ascii=False), encoding="utf-8")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_parse_both_field_variants(self) -> None:
        kz, world = parse_item(KZ), parse_item(WORLD)
        self.assertEqual((kz.correct_index, kz.period_label), (0, "Жаңа заман"))
        self.assertEqual((world.correct_index, world.period_label, world.year_sort), (1, "Антика", -27))
        self.assertIsNone(parse_item({**KZ, "options": {"A": "1", "B": "2", "C": "3"}}))
        self.assertIsNone(parse_item({**KZ, "year_sort": "1711"}))
        self.assertEqual(t6_problems(kz), [])
        self.assertEqual(t6_problems(world), [])
        self.assertTrue(t6_problems(parse_item(T6_CUE)))

    def test_t6_modes(self) -> None:
        expected = {"strict": (1, 1, 2), "report": (1, 0, 3), "off": (0, 0, 3)}
        for mode, (flagged, skipped, ready) in expected.items():
            with self.subTest(mode=mode):
                lines, repo, embedder = _run(self.path, Options(t6_mode=mode))
                text = "\n".join(lines)
                self.assertIn(f"t6_flagged {flagged} (skipped {skipped})", text)
                self.assertIn(f"would_insert {ready}", text)
                self.assertIn("skipped_dup fact_key 1", text)
                # dry-run: one query, no embeddings, no inserts
                self.assertEqual(repo.calls, ["load_subject"])
                self.assertEqual(embedder.calls, [])
                self.assertLessEqual(len(lines), 10)

    def test_write_is_batched(self) -> None:
        lines, repo, embedder = _run(self.path, Options(write=True, batch_size=2))
        # 1 subject load + 1 centroid load + 1 insert per batch of 2 (4 items → 2 batches); nothing per item
        self.assertEqual(repo.calls, ["load_subject", "topic_centroids", "insert_batch", "insert_batch"])
        self.assertEqual(embedder.calls, [("questions", 2), (CORPUS_KEY, 2), ("questions", 1), (CORPUS_KEY, 1)])
        self.assertEqual([r["fact_key"] for r in repo.rows], ["kz-abylai-born", "w-rome-capital", "kz-otrar"])
        linked = {r["fact_key"]: (r["topic_id"], r["status"]) for r in repo.rows}
        self.assertEqual(linked["kz-abylai-born"], ("kz5-p1", "active"))
        self.assertEqual(linked["w-rome-capital"], (None, "review"))
        first = repo.rows[0]
        self.assertEqual(first["question_content"]["options"][0], {"id": "a", "text": "1711"})
        self.assertEqual(first["ecd_evidence"]["code_check_target"], {"correct_option_id": "a"})
        self.assertNotIn("chunk_ids", first["reference_context"])
        self.assertIn("inserted 3 · on_conflict 0", "\n".join(lines))
        self.assertIn("linked_topic 1", "\n".join(lines))

    def test_similar_vectors_are_skipped(self) -> None:
        lines, repo, _ = _run(self.path, Options(write=True), embedder=FakeEmbedder(same_vector=True))
        self.assertEqual([r["fact_key"] for r in repo.rows], ["kz-abylai-born"])
        self.assertIn("similar>0.92 2", "\n".join(lines))

    def test_no_embed_and_no_topic_link(self) -> None:
        _, repo, embedder = _run(self.path, Options(write=True, embed=False))
        self.assertEqual(repo.calls, ["load_subject", "insert_batch"])
        self.assertEqual(embedder.calls, [])
        self.assertTrue(all(r["embedding"] is None and r["status"] == "review" for r in repo.rows))

        _, repo, embedder = _run(self.path, Options(write=True), no_link=frozenset({self.path.resolve()}))
        self.assertNotIn("topic_centroids", repo.calls)
        self.assertNotIn(CORPUS_KEY, [key for key, _ in embedder.calls])

    def test_cli_defaults(self) -> None:
        args = build_parser().parse_args(["--input", "history=a.json", "--input", "history=b.json"])
        self.assertFalse(args.write)
        self.assertEqual((args.batch_size, args.t6_mode, args.no_embed), (200, "report", False))
        self.assertEqual([slug for slug, _ in args.input], ["history", "history"])
        self.assertTrue(build_parser().parse_args(["--input", "history=a.json", "--write"]).write)


if __name__ == "__main__":
    unittest.main()
