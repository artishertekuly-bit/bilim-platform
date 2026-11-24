-- D95: imported JSON question bank (Phase 1). Backward compatible: existing rows become origin = 'generated',
-- and every rule for generated questions stays as it was.
--   * Imported rows are level-1 MCQ with no textbook chunks: topic_id and reference_context.chunk_ids may be
--     missing, but only when origin = 'imported'.
--   * (subject, fact_key) is the import's idempotency key: a re-run inserts nothing twice.
--   * corpus.topic_centroids gives examiner_svc one mean chunk vector per § (no chunk text, no rag access),
--     so the importer can link a question to its nearest § in one query.

alter table examiner.questions
  add column origin       text not null default 'generated' check (origin in ('generated', 'imported')),
  add column subject      text,
  add column era          text,
  add column subtopic     text,
  add column year_sort    bigint,
  add column period_label text,
  add column fact_key     text,
  add column explanation  text;

alter table examiner.questions alter column topic_id drop not null;

alter table examiner.questions
  add constraint questions_topic_origin check (topic_id is not null or origin = 'imported'),
  drop constraint questions_reference_context_check,
  add constraint questions_reference_context_check check (
    jsonb_typeof(reference_context -> 'chunk_ids') = 'array'
    or (origin = 'imported' and reference_context -> 'chunk_ids' is null)
  ),
  add constraint questions_imported_keys check (
    origin <> 'imported' or (subject is not null and fact_key is not null and length(btrim(fact_key)) > 0)
  );

create unique index questions_subject_fact_key on examiner.questions (subject, fact_key)
  where fact_key is not null;
create index questions_subject_era on examiner.questions (subject, era, subtopic)
  where origin = 'imported';
create index questions_year_sort on examiner.questions (year_sort)
  where year_sort is not null;

comment on column examiner.questions.origin is 'generated: Batch/Fast Lane generation (Т2–Т7). imported: ready JSON bank (D95).';
comment on column examiner.questions.subject is 'public.subjects.slug of an imported question; key of the (subject, fact_key) idempotency index.';
comment on column examiner.questions.fact_key is 'Stable fact id from the imported bank. One question per (subject, fact_key).';

-- Mean chunk vector per § of a subject (text-embedding-3-large, 3072). Back matter is left out, as in match_chunks.
create function corpus.topic_centroids(p_subject_id uuid)
returns table (topic_id text, centroid extensions.halfvec)
language sql
stable
security definer
set search_path = ''
as $$
  select m.topic_id, extensions.avg(c.content_vector)
  from rag.lightrag_vdb_chunks_text_embedding_3_large_3072d c
  join corpus.chunk_meta m on m.chunk_id = c.id
  where c.workspace = 'textbooks'
    and not m.is_back_matter
    and m.topic_id in (select p.topic_id from corpus.paragraphs p where p.subject_id = p_subject_id)
  group by m.topic_id;
$$;

revoke all on function corpus.topic_centroids(uuid) from public, anon, authenticated, service_role;
grant execute on function corpus.topic_centroids(uuid) to examiner_svc;

-- examiner_svc already has select, insert on examiner.questions and question_state (new columns are covered by
-- the table grants). Restated so the importer's needs are visible in one place.
grant select, insert on examiner.questions to examiner_svc;
grant select, insert on examiner.question_state, examiner.question_state_history to examiner_svc;
grant select on corpus.subjects to examiner_svc;
