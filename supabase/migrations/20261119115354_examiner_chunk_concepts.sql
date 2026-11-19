-- §-тің ұғымдары және ұғымға байланған генерация (architect/v2/ai_examiner.md §5.4, D76).
--
--   * chunk_concepts — әр чанктан кіші модель шығарған ұғымдар. Чанк мәтіні (тазалау ережесімен бірге)
--     немесе ұғым промпты өзгерсе, text_hash өзгереді де, ұғымдар қайта шығарылады. Ұғымы жоқ чанк
--     (тапсырма, кеңес, әдебиет тізімі) генерацияға берілмейді.
--   * concept_key — тест сұрағының нысанасы (ұғым атауының қалыпты түрі). Бір § пен санатта бір ұғымнан
--     бір ғана сұрақ: жоспарлаушы белсенді сұрақтар мен өңделмеген сұраныстардың кілттерін санайды.

create table examiner.chunk_concepts (
  chunk_id        text primary key,
  topic_id        text not null,
  text_hash       text not null,
  concepts        jsonb not null default '[]'::jsonb check (jsonb_typeof(concepts) = 'array'),
  extractor_model text not null,
  prompt_version  text not null,
  extracted_at    timestamptz not null default now()
);

create index chunk_concepts_topic on examiner.chunk_concepts (topic_id);

comment on table examiner.chunk_concepts is 'Чанктың ұғымдары: [{key, term, quote}]. quote — мәтінде сөзбе-сөз табылса ғана (D76).';

alter table examiner.generation_requests add column concept_key text;
alter table examiner.questions add column concept_key text;

create index questions_concept on examiner.questions (topic_id, level, format, concept_key)
  where concept_key is not null;

comment on column examiner.questions.concept_key is 'Сұрақтың нысанасы: chunk_concepts-тегі ұғымның кілті (D76). Ескі сұрақтарда null.';

revoke all on examiner.chunk_concepts from public, anon, authenticated, service_role;
grant select, insert, update on examiner.chunk_concepts to examiner_svc;
