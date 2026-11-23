"""Ойын банкінің CLI-ы (geimifikatsiya §3, D45).

  python -m app.games.bank.cli topics --book <book>                  # §-тер мен банктегі сұрақ саны (тегін)
  python -m app.games.bank.cli generate --topic <topic_id> [--topic …] [--mcq 6] [--debate 2] [--write]

`generate` ақылы (LLM): әдепкіде ештеңе жазбайды, нәтиже мен Т6/Т7 себептерін ғана көрсетеді; `--write` берілсе,
`games.game_questions`-ке жазады (өтпегені `rejected`). Қосылу жолы — GAMES_DATABASE_URL (games_svc);
жазбай тексеру үшін корпусты оқи алатын басқа рөлдің айнымалысын `--dsn-env` арқылы беруге болады.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import sys
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

from ...llm_gateway import LLMGateway, load_config
from ...llm_gateway.telemetry import MemorySink
from ..db import statement_cache_size
from . import generate as G

TOPICS = """/* games:bank_topics */
select p.topic_id, p.paragraph_no, p.paragraph_title, p.chunk_count
from corpus.paragraphs p where p.book = $1 order by p.sort_no, p.paragraph_no
"""
COUNTS = """/* games:bank_counts */
select topic_id, kind, status, count(*)::int as n from games.game_questions where topic_id = any($1::text[])
group by topic_id, kind, status
"""


async def _connect(env: str) -> asyncpg.Connection:
    dsn = os.getenv(env, "").strip()
    if not dsn:
        raise SystemExit(f"{env} берілмеген")
    return await asyncpg.connect(dsn, statement_cache_size=statement_cache_size(dsn))


async def topics(args: argparse.Namespace) -> None:
    conn = await _connect(args.dsn_env)
    try:
        rows = await conn.fetch(TOPICS, args.book)
        counts: dict[str, dict[str, int]] = {}
        try:
            for r in await conn.fetch(COUNTS, [r["topic_id"] for r in rows]):
                counts.setdefault(r["topic_id"], {})[f"{r['kind']}:{r['status']}"] = r["n"]
        except asyncpg.InsufficientPrivilegeError:
            pass
        for r in rows:
            c = counts.get(r["topic_id"], {})
            print(f"{r['topic_id']}  §{r['paragraph_no']} {r['paragraph_title'] or ''}  чанк={r['chunk_count']}  "
                  f"тест={c.get('mcq:active', 0)}  дебат={c.get('debate_topic:active', 0)}")
    finally:
        await conn.close()


async def generate(args: argparse.Namespace) -> None:
    sink = MemorySink()
    gateway = LLMGateway(load_config(), sink=sink)
    conn = await _connect(args.dsn_env)
    rng = random.Random(args.seed)
    try:
        for topic_id in args.topic:
            report = await _generate_one(conn, gateway, topic_id, args, rng)
            print(f"\n== {report.paragraph} ({topic_id}): қабылданды {report.accepted}/{len(report.items)}")
            for item in report.items:
                mark = "✓" if item.status == "active" else "✗"
                text = item.content.get("stem") or item.content.get("statement")
                print(f"  {mark} [{item.kind} d{item.difficulty}] {text}")
                if item.kind == "mcq":
                    for option in item.content.get("options") or []:
                        flag = "*" if isinstance(option, dict) and option.get("id") == item.answer_key.get(
                            "correct_option_id") else " "
                        print(f"      {flag} {option.get('text') if isinstance(option, dict) else option}")
                else:
                    print(f"      + {' | '.join(item.content.get('pro') or [])}")
                    print(f"      - {' | '.join(item.content.get('con') or [])}")
                for problem in item.problems:
                    print(f"      ! {problem}")
        cost = sum(r.cost_usd or 0 for r in sink.records)
        print(f"\nLLM шақырулары: {len(sink.records)}, құны ${cost:.4f}" + ("" if args.write else " (банкке жазылмады)"))
        if args.json:
            Path(args.json).write_text(json.dumps([r.__dict__ for r in sink.records], default=str, ensure_ascii=False,
                                                  indent=1), encoding="utf-8")
    finally:
        await conn.close()


async def _generate_one(conn, gateway, topic_id, args, rng):
    if args.write:
        async with conn.transaction():
            return await G.generate_topic(conn, gateway, topic_id, mcq=args.mcq, debate=args.debate, write=True,
                                          rng=rng)
    return await G.generate_topic(conn, gateway, topic_id, mcq=args.mcq, debate=args.debate, write=False, rng=rng)


def main(argv: list[str] | None = None) -> None:
    load_dotenv(Path(__file__).resolve().parents[3] / ".env")
    parser = argparse.ArgumentParser(prog="app.games.bank.cli")
    parser.add_argument("--dsn-env", default="GAMES_DATABASE_URL")
    sub = parser.add_subparsers(dest="command", required=True)
    p_topics = sub.add_parser("topics")
    p_topics.add_argument("--book", required=True)
    p_gen = sub.add_parser("generate")
    p_gen.add_argument("--topic", action="append", required=True)
    p_gen.add_argument("--mcq", type=int, default=6)
    p_gen.add_argument("--debate", type=int, default=2)
    p_gen.add_argument("--write", action="store_true")
    p_gen.add_argument("--seed", type=int, default=None)
    p_gen.add_argument("--json", default=None)
    args = parser.parse_args(argv)
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(topics(args) if args.command == "topics" else generate(args))


if __name__ == "__main__":
    main()
