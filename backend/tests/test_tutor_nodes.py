"""Tutor түйіндерін құру: тазалау, біріктіру, textbook_order алғышарттары (personarag §2.1)."""

from __future__ import annotations

import unittest

from app.tutor.nodes import (
    ChunkPosition,
    Entity,
    build_drafts,
    is_date_like,
    normalize_name,
    textbook_prerequisites,
)


def pos(chunk: str, rank: int, paragraph: str = "1") -> ChunkPosition:
    return ChunkPosition(chunk, "kazakn5.md", 5, paragraph, f"kazakn5.md#§{paragraph}", rank)


POSITIONS = {
    "c1": pos("c1", 1, "1"),
    "c2": pos("c2", 2, "1"),
    "c3": pos("c3", 3, "2"),
    "c4": pos("c4", 4, "3"),
}


class NormalizeTests(unittest.TestCase):
    def test_spelling_variants_merge(self) -> None:
        self.assertEqual(normalize_name("А. Құнанбайұлы"), normalize_name("А.Құнанбайұлы"))
        self.assertEqual(normalize_name("«Алаш» партиясы"), normalize_name("Алаш партиясы"))
        self.assertEqual(normalize_name("Абылай хан (1711–1781)"), "абылай хан")
        self.assertEqual(normalize_name("Ұлт-азаттық  көтеріліс."), normalize_name("Ұлт – азаттық көтеріліс"))

    def test_different_concepts_stay_apart(self) -> None:
        self.assertNotEqual(normalize_name("Жәнібек хан"), normalize_name("Керей мен Жәнібек"))

    def test_dates(self) -> None:
        for name in ("1465 ж.", "XVIII ғасыр", "XVIII ғасырдың бірінші жартысы", "б.з.б. III мыңжылдық", "1916 жылы"):
            self.assertTrue(is_date_like(name), name)
        for name in ("1986 жылғы Желтоқсан оқиғасы", "Қола дәуірі", "Орта жүз", "Абылай"):
            self.assertFalse(is_date_like(name), name)


class DraftTests(unittest.TestCase):
    def test_merge_type_and_home(self) -> None:
        entities = [
            Entity("А. Құнанбайұлы", "person", "Ақын", ("c3",)),
            Entity("А.Құнанбайұлы", "person", "", ("c1", "c4")),
            Entity("XVIII ғасыр", "period", "", ("c1",)),
            Entity("Баяндама", "task_example", "", ("c2",)),
            Entity("Жоқ орын", "location", "", ("zz",)),
        ]
        drafts = {d.norm_key: d for d in build_drafts(entities, POSITIONS)}
        abai = drafts[normalize_name("А. Құнанбайұлы")]
        self.assertTrue(abai.is_learnable)
        self.assertEqual(sorted(abai.entity_ids), ["А. Құнанбайұлы", "А.Құнанбайұлы"])
        self.assertEqual(abai.canonical_name, "А.Құнанбайұлы")  # чанкі көп entity — өкіл
        self.assertEqual(abai.order_key, 1)  # ең ерте кездесуі
        self.assertEqual(abai.description, "Ақын")
        self.assertFalse(drafts[normalize_name("XVIII ғасыр")].is_learnable)
        self.assertFalse(drafts["баяндама"].is_learnable)
        self.assertFalse(drafts["жоқ орын"].is_learnable)  # оқулықта орны жоқ


class PrerequisiteTests(unittest.TestCase):
    def test_textbook_order(self) -> None:
        entities = [
            Entity("Сақтар", "organization", "", ("c1",)),
            Entity("Тұмар патшайым", "person", "", ("c3",)),
            Entity("Ғұндар", "organization", "", ("c4",)),
            Entity("Баяндама", "task_example", "", ("c2",)),
        ]
        drafts = build_drafts(entities, POSITIONS)
        edges = [
            ("Тұмар патшайым", "Сақтар", 9.0),     # Сақтар бұрын: Тұмардың алғышарты
            ("Сақтар", "Ғұндар", 1.0),
            ("Ғұндар", "Тұмар патшайым", 2.0),
            ("Баяндама", "Ғұндар", 5.0),            # learnable емес — алынбайды
            ("Сақтар", "Сақтар", 1.0),
        ]
        pairs = set(textbook_prerequisites(drafts, edges))
        self.assertEqual(pairs, {
            ("тұмар патшайым", "сақтар"),
            ("ғұндар", "сақтар"),
            ("ғұндар", "тұмар патшайым"),
        })

    def test_cap_per_node_by_weight(self) -> None:
        entities = [Entity(f"Ұғым {i}", "concept", "", (f"c{i}",)) for i in range(1, 5)]
        positions = {f"c{i}": pos(f"c{i}", i, str(i)) for i in range(1, 5)}
        drafts = build_drafts(entities, positions)
        edges = [("Ұғым 4", "Ұғым 1", 1.0), ("Ұғым 4", "Ұғым 2", 5.0), ("Ұғым 4", "Ұғым 3", 3.0)]
        pairs = textbook_prerequisites(drafts, edges, max_per_node=2)
        self.assertEqual(pairs, [("ұғым 4", "ұғым 2"), ("ұғым 4", "ұғым 3")])


if __name__ == "__main__":
    unittest.main()
