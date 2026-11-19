"""Банкті толтыру контурын қолмен іске қосу.

Мысалдар (backend қалтасынан):
  python -m app.examiner.bank.cli submit --book kazakn5.md --level 1 --max-requests 20
  python -m app.examiner.bank.cli process
  python -m app.examiner.bank.cli generate --book kazakn5.md --topic "kazakn5.md#§2" --level 1
  python -m app.examiner.bank.cli watchdog --max-age-hours 4
  python -m app.examiner.bank.cli tick --book kazakn5.md --level 1

`submit` жетпейтін қорды есептеп, Batch API-ға ұсақ партиялармен жібереді. `process` дайын batch-терді
өңдейді; оны мерзімді түрде қайта шақыруға болады — өңделген сұраныс қайталанбайды.
`generate` — Fast Lane: берілген §-тің қорын синхрон шақырумен бірнеше минутта толтырады.
`watchdog` — мерзімінен ұзақ тұрып қалған batch-терді тоқтатады.
`tick` — cron үшін: process → watchdog → submit (фондық толтыру, ai_examiner §5.4). Тоқтатылған batch-тің
біткен бөлігін келесі tick-тегі process өңдейді.

Қажетті env: EXAMINER_DATABASE_URL (examiner_svc), OPENAI_API_KEY, LLM_STRONG_MODEL және т.б.
(backend/config/llm_gateway.json). Жергілікті іске қосуда олар түбірдегі .env пен backend/.env-тен
оқылады (main.py-дағыдай, процестің өз env-і басым).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import time
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

from ...llm_gateway import get_gateway
from .audit import audit
from .formats import CODE_FORMATS
from .pipeline import WATCHDOG_MAX_AGE, BankPipeline, ProcessReport
from .repository import PgBankRepository, create_pool

BACKEND_DIR = Path(__file__).resolve().parents[3]
ENV_FILES = (BACKEND_DIR.parent / ".env", BACKEND_DIR / ".env")


def _load_environment() -> None:
    for env_file in ENV_FILES:
        if env_file.exists():
            load_dotenv(env_file, override=False)


def _print_report(report: ProcessReport, title: str = "") -> None:
    if title:
        print(title)
    print(json.dumps({
        "accepted": report.accepted, "rejected": report.rejected, "failed": report.failed,
        "deferred": report.deferred, "reasons": dict(report.reasons),
    }, ensure_ascii=False, indent=1))


def _print_batches(batches: list) -> None:
    for batch in batches:
        print(f"batch {batch.batch_id}: {batch.prompt_id}, {batch.request_count} сұраныс")
    if not batches:
        print("Қор жеткілікті: жаңа сұраныс жоқ.")


async def _run(args: argparse.Namespace) -> int:
    pool = await create_pool()
    try:
        pipeline = BankPipeline(get_gateway(), PgBankRepository(pool))
        formats = getattr(args, "format", None) or CODE_FORMATS
        if args.command == "submit":
            _print_batches(await pipeline.submit(args.book, args.level, formats=formats,
                                                 max_requests=args.max_requests))
        elif args.command == "generate":
            started = time.monotonic()
            report = await pipeline.generate_now(args.book, args.level, topics=args.topic, formats=formats,
                                                 max_requests=args.max_requests)
            _print_report(report, f"Fast Lane: {time.monotonic() - started:.0f} сек")
        elif args.command == "audit":
            repo = PgBankRepository(pool)
            findings = audit(await repo.active_questions())
            for finding in findings:
                q = finding.question
                stem = str(q.content.get("stem", ""))[:70]
                print(f"{q.question_id[:8]} {q.topic_id} {q.format}/{q.x_tier}: {stem}")
                for reason in finding.reasons:
                    print(f"    {reason}")
                if args.apply:
                    await repo.retire(q.question_id, "audit: " + "; ".join(finding.reasons))
            verb = "банктен шығарылды (retired)" if args.apply else "белгіленді (--apply берілмеді, өзгеріс жоқ)"
            print(f"--- {len(findings)} сұрақ {verb}")
        elif args.command == "watchdog":
            cancelled = await pipeline.watchdog(timedelta(hours=args.max_age_hours))
            print(f"тоқтатылған batch: {cancelled or 'жоқ'}")
        elif args.command == "tick":
            _print_report(await pipeline.process(), "process")
            cancelled = await pipeline.watchdog(timedelta(hours=args.max_age_hours))
            if cancelled:
                print(f"watchdog тоқтатты: {cancelled}")
            for level in args.level:
                _print_batches(await pipeline.submit(args.book, level, max_requests=args.max_requests))
        else:
            _print_report(await pipeline.process())
    finally:
        await pool.close()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m app.examiner.bank.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    submit = sub.add_parser("submit", help="Жетпейтін қорды Batch API-ға жіберу")
    submit.add_argument("--book", action="append", required=True, help="corpus.textbooks.book, қайталауға болады")
    submit.add_argument("--level", type=int, choices=(1, 2), required=True)
    submit.add_argument("--format", action="append", choices=CODE_FORMATS)
    submit.add_argument("--max-requests", type=int)
    sub.add_parser("process", help="Дайын batch-терді өңдеп, банкке жазу")
    generate = sub.add_parser("generate", help="Fast Lane: §-тің қорын синхрон толтыру")
    generate.add_argument("--book", action="append", required=True)
    generate.add_argument("--topic", action="append", required=True, help="topic_id, мысалы kazakn5.md#§2")
    generate.add_argument("--level", type=int, choices=(1, 2), required=True)
    generate.add_argument("--format", action="append", choices=CODE_FORMATS)
    generate.add_argument("--max-requests", type=int)
    audit_cmd = sub.add_parser("audit", help="Белсенді сұрақтарды қазіргі Т6/Т7 ережесімен қайта тексеру")
    audit_cmd.add_argument("--apply", action="store_true", help="өтпегендерін банктен шығару (retired)")
    watchdog = sub.add_parser("watchdog", help="Тұрып қалған batch-терді тоқтату")
    watchdog.add_argument("--max-age-hours", type=float, default=WATCHDOG_MAX_AGE.total_seconds() / 3600)
    tick = sub.add_parser("tick", help="Cron: process, watchdog және фондық submit")
    tick.add_argument("--book", action="append", required=True)
    tick.add_argument("--level", type=int, action="append", choices=(1, 2), required=True)
    tick.add_argument("--max-requests", type=int, help="бір іске қосудағы сұраныс шегі (шығынды шектеу)")
    tick.add_argument("--max-age-hours", type=float, default=WATCHDOG_MAX_AGE.total_seconds() / 3600)
    args = parser.parse_args()
    _load_environment()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    return asyncio.run(_run(args))


if __name__ == "__main__":
    raise SystemExit(main())
