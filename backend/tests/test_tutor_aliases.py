"""Tutor 0-қадамының лексикалық бөлігі (D87): атау сәйкестігі мен жадтағы кэш."""

from __future__ import annotations

import unittest

from app.tutor.aliases import AliasCache, AliasIndex, is_short_reply, mentions, tokens
from app.tutor.engine import Tags
from app.tutor.tags import apply_help_guard

ROWS = [
    ("қазақ", 1),
    ("қазақ хандығы", 2),
    ("ат", 3),
    ("атау", 4),
    ("абылай хан", 5),
    ("хандық", 6),
    ("керей мен жәнібек", 7),
    ("жәнібек", 8),
    ("ш. уәлиханов", 9),
    ("ақ орда", 10),
    ("алтын орда", 11),
]


def ids(index: AliasIndex, text: str, limit: int = 3) -> list[int]:
    return [m.node_id for m in index.match(text, limit=limit)]


class AliasIndexTests(unittest.TestCase):
    def setUp(self) -> None:
        self.index = AliasIndex(ROWS)

    def test_tokens_keep_letters_and_digits_only(self) -> None:
        self.assertEqual(tokens("«Ш.Уәлиханов», 1465 ж.!"), ["ш", "уәлиханов", "1465", "ж"])

    def test_multiword_alias_wins_and_hides_contained_short_one(self) -> None:
        # «Қазақ хандығын» ішіндегі «Қазақ» жеке үміткер болмайды.
        self.assertEqual(ids(self.index, "Қазақ хандығын кім құрды?"), [2])

    def test_short_alias_matches_only_exactly(self) -> None:
        self.assertEqual(ids(self.index, "Бұл атаудың мәні не?"), [])   # «ат», «атау» — 5-тен қысқа
        self.assertEqual(ids(self.index, "ат пен атау"), [4, 3])

    def test_long_alias_takes_kazakh_suffixes(self) -> None:
        self.assertEqual(ids(self.index, "Абылай ханның саясаты"), [5])
        self.assertEqual(ids(self.index, "Қазақтар қайдан шықты?"), [1])

    def test_final_consonant_voicing(self) -> None:
        self.assertEqual(ids(self.index, "хандығы күшейді"), [6])

    def test_suffix_length_is_limited(self) -> None:
        self.assertEqual(ids(self.index, "қазақстандықтардың"), [])

    def test_inner_words_must_match_exactly(self) -> None:
        self.assertEqual(ids(self.index, "Керей мен Жәнібектің көшуі"), [7])
        self.assertEqual(ids(self.index, "Керейдің мен Жәнібек"), [8])

    def test_punctuation_inside_alias(self) -> None:
        self.assertEqual(ids(self.index, "Ш. Уәлихановтың еңбектері"), [9])

    def test_priority_then_limit(self) -> None:
        text = "Ақ Орда, Алтын Орда, Абылай хан және Қазақ хандығы"
        # Бәрі екі сөзді: ұзынырақ атау бірінші, лимит 3.
        self.assertEqual(ids(self.index, text), [2, 11, 5])
        self.assertEqual(len(ids(self.index, text, limit=10)), 4)

    def test_one_node_once(self) -> None:
        index = AliasIndex([("абылай хан", 5), ("абылай", 5)])
        self.assertEqual(ids(index, "Абылай хан және Абылай"), [5])
        self.assertEqual(index.size, 2)


class ShortReplyAndHelpTests(unittest.TestCase):
    def test_short_reply(self) -> None:
        self.assertTrue(is_short_reply("Білмеймін, түсіндірші."))
        self.assertTrue(is_short_reply("Иә"))
        self.assertFalse(is_short_reply("Қазақ хандығы қай жылы құрылды?"))

    def test_mentions_with_suffix(self) -> None:
        self.assertTrue(mentions("Ресейдің саясаты", "Ресей"))
        self.assertFalse(mentions("Абылай хан XVIII ғасырда өмір сүрді", "Ресей"))

    def test_help_request_is_not_frustration(self) -> None:
        # D87: «Білмеймін, түсіндірші» — шаршау емес, көмек сұрау; тьютордың сұрағынан кейін — GAP жауап.
        frustrated = Tags(intent="FRUSTRATION")
        guarded = apply_help_guard(frustrated, "Білмеймін, түсіндірші.", tutor_asked=True)
        self.assertEqual((guarded.intent, guarded.error_type), ("ANSWER", "GAP"))
        self.assertEqual(apply_help_guard(frustrated, "Айтып берші", tutor_asked=False).intent, "TOPIC_EXPLORE")

    def test_real_fatigue_stays_frustration(self) -> None:
        frustrated = Tags(intent="FRUSTRATION")
        for text in ("Шаршадым, бәрі қиын, ештеңе түсінбеймін.", "Жалықтым, түсіндірмей-ақ қой"):
            self.assertEqual(apply_help_guard(frustrated, text, tutor_asked=True).intent, "FRUSTRATION")
        # Басқа интенттерге тимейді.
        self.assertEqual(apply_help_guard(Tags(intent="FACT_LOOKUP"), "түсіндірші", tutor_asked=True).intent,
                         "FACT_LOOKUP")


class AliasCacheTests(unittest.IsolatedAsyncioTestCase):
    async def test_ttl_refresh_and_stale_on_error(self) -> None:
        now = [0.0]
        calls: list[int] = []
        state = {"fail": False, "rows": [("қазақ хандығы", 2)]}

        async def loader():
            calls.append(1)
            if state["fail"]:
                raise ConnectionError("db down")
            return state["rows"]

        cache = AliasCache(loader, ttl_s=100, retry_s=10, clock=lambda: now[0])
        await cache.warm()  # іске қосылғанда
        first = await cache.get()
        self.assertEqual(ids(first, "Қазақ хандығы"), [2])
        await cache.get()
        self.assertEqual(len(calls), 1)  # TTL ішінде база қайта сұралмайды

        # TTL бітті: ескі индекс бірден қайтады, жаңасы фонда жүктеледі (stale-while-revalidate).
        now[0] = 150.0
        state["rows"] = [("алтын орда", 11)]
        stale = await cache.get()
        self.assertIs(stale, first)
        await cache.join()
        refreshed = await cache.get()
        self.assertEqual((len(calls), ids(refreshed, "Алтын Орда")), (2, [11]))

        now[0] = 300.0
        state["fail"] = True
        self.assertIs(await cache.get(), refreshed)
        await cache.join()
        self.assertIs(await cache.get(), refreshed)  # жаңарту сәтсіз — ескі индекс қалады
        self.assertEqual(len(calls), 3)
        now[0] = 305.0
        await cache.get()
        await cache.join()
        self.assertEqual(len(calls), 3)  # retry_s біткенше қайта сұралмайды
        now[0] = 311.0
        await cache.get()
        await cache.join()
        self.assertEqual(len(calls), 4)

    async def test_first_load_failure_returns_none(self) -> None:
        async def loader():
            raise ConnectionError("db down")

        cache = AliasCache(loader, clock=lambda: 0.0)
        self.assertIsNone(await cache.get())

    async def test_first_message_waits_only_briefly(self) -> None:
        import asyncio

        release = asyncio.Event()

        async def slow_loader():
            await release.wait()
            return [("қазақ хандығы", 2)]

        cache = AliasCache(slow_loader, first_wait_s=0.01)
        self.assertIsNone(await cache.get())  # жүктеу әлі бітпеді — атаусыз жалғасады
        release.set()
        await cache.join()
        self.assertTrue(cache.ready)
        self.assertEqual(ids(await cache.get(), "Қазақ хандығы"), [2])
        await cache.close()


if __name__ == "__main__":
    unittest.main()
