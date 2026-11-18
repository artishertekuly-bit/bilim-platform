"""Банкті толтыру контурын қолмен іске қосу.

Мысалдар (backend қалтасынан):
  python -m app.examiner.bank.cli submit --book kazakn5.md --level 1 --max-requests 20
  python -m app.examiner.bank.cli process

`submit` жетпейтін қорды есептеп, Batch API-ға жібереді. `process` дайын batch-терді өңдейді;
оны мерзімді түрде (мысалы, сағат сайын) қайта шақыруға болады — өңделген сұраныс қайталанбайды.

Қажетті env: EXAMINER_DATABASE_URL (examiner_svc), OPENAI_API_KEY, LLM_STRONG_MODEL және т.б.
(backend/config/llm_gateway.json).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging

from ...llm_gateway import get_gateway
from .formats import CODE_FORMATS
from .pipeline import BankPipeline
from .repository import PgBankRepository, create_pool


async def _run(args: argparse.Namespace) -> int:
    pool = await create_pool()
    try:
        pipeline = BankPipeline(get_gateway(), PgBankRepository(pool))
        if args.command == "submit":
            batches = await pipeline.submit(
                args.book, args.level, formats=args.format or CODE_FORMATS, max_requests=args.max_requests
            )
            for batch in batches:
                print(f"batch {batch.batch_id}: {batch.prompt_id}, {batch.request_count} сұраныс")
            if not batches:
                print("Қор жеткілікті: жаңа сұраныс жоқ.")
        else:
            report = await pipeline.process()
            print(json.dumps({
                "accepted": report.accepted, "rejected": report.rejected, "failed": report.failed,
                "deferred": report.deferred, "reasons": dict(report.reasons),
            }, ensure_ascii=False, indent=1))
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
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    return asyncio.run(_run(args))


if __name__ == "__main__":
    raise SystemExit(main())
