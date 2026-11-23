"""Tutor түйіндерін құру/жаңарту (офлайн, бір рет және жаңа кітап индекстелгенде; personarag §2.1).

    python -m app.tutor.build_nodes --dry-run   # тек санақ
    python -m app.tutor.build_nodes             # tutor схемасына жазу

`tutor_svc` рөлімен (`TUTOR_DATABASE_URL`) іске қосылады. LLM шақырылмайды.
Қайта құрғанда `node_id` сақталады (`norm_key` бойынша upsert), сондықтан оқушы ағаштары бұзылмайды:
бұл құрылымда жоқ болып қалған түйін өшірілмей, `is_learnable = false` болады.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

from .db import create_pool
from .nodes import ChunkPosition, Entity, build_drafts, summary, textbook_prerequisites

BACKEND_DIR = Path(__file__).resolve().parents[2]


async def load_inputs(conn) -> tuple[list[Entity], dict[str, ChunkPosition], list[tuple[str, str, float]]]:
    positions_rows = await conn.fetch(
        """
        select m.chunk_id, m.book, t.grade::int as grade, m.paragraph_no, m.topic_id,
               row_number() over (
                 order by t.grade, m.book, split_part(m.paragraph_no, '–', 1)::int, m.paragraph_no,
                          m.order_in_paragraph
               )::int as rank
        from corpus.chunk_meta m
        join corpus.textbooks t on t.book = m.book
        where m.paragraph_no is not null and not m.is_back_matter
        """
    )
    positions = {
        r["chunk_id"]: ChunkPosition(r["chunk_id"], r["book"], r["grade"], r["paragraph_no"], r["topic_id"], r["rank"])
        for r in positions_rows
    }
    link_rows = await conn.fetch("select entity, chunk_id from corpus.entity_chunk_links")
    links: dict[str, list[str]] = {}
    for r in link_rows:
        links.setdefault(r["entity"], []).append(r["chunk_id"])
    entity_rows = await conn.fetch("select entity, entity_type, description from corpus.entities")
    entities = [
        Entity(r["entity"], r["entity_type"], r["description"] or "", tuple(links.get(r["entity"], ())))
        for r in entity_rows
    ]
    edge_rows = await conn.fetch("select src, tgt, weight from corpus.entity_edges")
    edges = [(r["src"], r["tgt"], float(r["weight"] or 0.0)) for r in edge_rows]
    return entities, positions, edges


async def write(conn, drafts, prerequisites) -> dict[str, int]:
    async with conn.transaction():
        rows = [
            (d.norm_key, d.canonical_name, d.entity_type, d.entity_ids, d.book, d.grade, d.paragraph_no,
             d.topic_id, d.order_key, d.description, d.is_learnable)
            for d in drafts
        ]
        await conn.executemany(
            """
            insert into tutor.tutor_nodes
              (norm_key, canonical_name, entity_type, lightrag_entity_ids, book, grade, paragraph_no, topic_id,
               order_key, description, is_learnable)
            values ($1, $2, $3, $4::text[], $5, $6::smallint, $7, $8, $9, $10, $11)
            on conflict (norm_key) do update set
              canonical_name = excluded.canonical_name, entity_type = excluded.entity_type,
              lightrag_entity_ids = excluded.lightrag_entity_ids, book = excluded.book, grade = excluded.grade,
              paragraph_no = excluded.paragraph_no, topic_id = excluded.topic_id, order_key = excluded.order_key,
              description = excluded.description, is_learnable = excluded.is_learnable, built_at = now()
            """,
            rows,
        )
        keys = [d.norm_key for d in drafts]
        retired = await conn.fetchval(
            """
            with r as (
              update tutor.tutor_nodes set is_learnable = false, built_at = now()
              where is_learnable and not (norm_key = any($1::text[])) returning 1
            ) select count(*)::int from r
            """,
            keys,
        )
        id_rows = await conn.fetch("select node_id, norm_key from tutor.tutor_nodes")
        node_id = {r["norm_key"]: r["node_id"] for r in id_rows}

        await conn.execute("delete from tutor.tutor_node_aliases")
        alias_rows = [(alias, node_id[d.norm_key]) for d in drafts for alias in sorted(d.aliases) if alias]
        await conn.executemany(
            "insert into tutor.tutor_node_aliases (alias, node_id) values ($1, $2) on conflict do nothing",
            alias_rows,
        )

        await conn.execute("delete from tutor.tutor_prerequisites where source = 'textbook_order'")
        prereq_rows = [(node_id[node], node_id[prereq]) for node, prereq in prerequisites]
        await conn.executemany(
            """
            insert into tutor.tutor_prerequisites (node_id, prerequisite_node_id, source)
            values ($1, $2, 'textbook_order') on conflict (node_id, prerequisite_node_id) do nothing
            """,
            prereq_rows,
        )
    return {"retired": int(retired or 0), "aliases": len(alias_rows)}


async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="жазбай, тек санақты шығару")
    args = parser.parse_args(argv)

    load_dotenv(BACKEND_DIR / ".env")
    pool = await create_pool(os.getenv("TUTOR_DATABASE_URL"), max_size=2)
    try:
        async with pool.acquire() as conn:
            entities, positions, edges = await load_inputs(conn)
            drafts = build_drafts(entities, positions)
            prerequisites = textbook_prerequisites(drafts, edges)
            stats = {"entities": len(entities), "chunks_with_position": len(positions), "edges": len(edges),
                     **summary(drafts, prerequisites)}
            if not args.dry_run:
                stats.update(await write(conn, drafts, prerequisites))
            print(json.dumps(stats, ensure_ascii=False, indent=2))
    finally:
        await pool.close()
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(asyncio.run(main()))
