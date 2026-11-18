-- Оқулық корпусының метадеректері: corpus схемасы (architect/v2/ortaq-infraqurylym.md §3).
--
-- rag схемасы LightRAG-тікі және бұл migration оған тимейді: онда ешбір объект құрылмайды,
-- құқық өзгермейді. corpus схемасындағы функция мен көріністер LightRAG кестелерін тек оқиды.
--
-- Чанк мәтініндегі «[Оқулық: … | Тарау: … | Тақырып: §… | Тармақ: …]» тақырыбы бір рет
-- талданып, corpus.chunk_meta кестесіне жазылады. Кітаптар мен LightRAG индексі өзгермейді.
-- Жаңа кітап индекстелгенде индекстеу контуры corpus.refresh_chunk_meta() функциясын шақырады.
--
-- topic_id — §-тің тұрақты кілті: '<кітап файлы>#§<нөмірі>', мысалы 'kazakn5.md#§12–13'.
-- Оны Examiner (examiner.questions.topic_id) мен Tutor қолданады.
--
-- Талдаудың ережелері:
--   * § нөмірі чанк тақырыбынан, ол жоқ болса бөлімнің атауынан алынады; '3-4' → '3–4'.
--   * Бөлімнің соңындағы мазмұн мен әдебиет тізімі (нүкте қатарлары бар чанктан бастап)
--     ешбір §-ке жатпайды: олардан сұрақ жасалмайды.
--   * Тарау тек тақырыпта «Тарау:» бар кітапта толтырылады және кітап ретімен алға созылады.
--     Қазіргі корпуста ол тек 5-сынып кітабында бар; басқа кітаптарда тарау масштабы жоқ.
--
-- Құқықтар: examiner_svc пен tutor_svc corpus схемасын тек оқиды (ortaq §1). Чанк мәтіні мен
-- entity байланыстары postgres иеленетін көріністер арқылы беріледі, сондықтан сервистер
-- rag схемасын мүлде көрмейді.

-- 1. Схема
create schema if not exists corpus;
revoke all on schema corpus from public, anon, authenticated, service_role;
grant usage on schema corpus to examiner_svc, tutor_svc, lightrag_app;

comment on schema corpus is 'Оқулық корпусының метадеректері (chunk_meta) және сервистерге арналған оқу көріністері. rag схемасына тимейді.';

-- 2. Кітаптар
create table corpus.textbooks (
  book       text primary key,
  title      text not null,
  subject_id uuid not null references public.subjects (id),
  grade      smallint not null check (grade between 1 and 12)
);

comment on table corpus.textbooks is 'Индекстелген оқулықтар: файл → пән және сынып. Жаңа кітап индекстелмес бұрын осында қосылады.';

insert into corpus.textbooks (book, title, subject_id, grade)
select b.book, b.title, s.id, b.grade
from (values
  ('kazakn5.md', 'Қазақстан тарихы, 5-сынып', 5),
  ('kazakh6.md', 'Қазақстан тарихы, 6-сынып', 6),
  ('kazakh7.md', 'Қазақстан тарихы, 7-сынып', 7),
  ('kazakh8.md', 'Қазақстан тарихы, 8-сынып', 8),
  ('kazakh9.md', 'Қазақстан тарихы, 9-сынып', 9)
) as b (book, title, grade)
join public.subjects s on s.slug = 'history'
on conflict (book) do nothing;

do $$
begin
  if (select count(*) from corpus.textbooks) < 5 then
    raise exception 'corpus.textbooks толмады: public.subjects-те slug = history пәні жоқ';
  end if;
end
$$;

-- 3. Чанктың метадеректері
create table corpus.chunk_meta (
  chunk_id           text primary key,
  book               text not null references corpus.textbooks (book),
  section_no         integer not null,
  chunk_order_index  integer not null,
  chapter_no         text,
  chapter            text,
  paragraph_no       text check (paragraph_no ~ '^[0-9]+(–[0-9]+)?$'),
  paragraph_title    text,
  topic_id           text generated always as (
                       case when paragraph_no is not null then book || '#§' || paragraph_no end
                     ) stored,
  order_in_paragraph integer,
  subitem            text,
  is_back_matter     boolean not null,
  check ((paragraph_no is null) = (order_in_paragraph is null)),
  check ((chapter is null) = (chapter_no is null))
);

create index chunk_meta_paragraph on corpus.chunk_meta (book, paragraph_no, order_in_paragraph);
create index chunk_meta_topic on corpus.chunk_meta (topic_id, order_in_paragraph);

comment on table corpus.chunk_meta is 'Чанк → кітап, тарау, §, §-тің ішіндегі реті (ortaq §3). corpus.refresh_chunk_meta() толтырады.';
comment on column corpus.chunk_meta.chunk_id is 'rag.lightrag_doc_chunks.id (workspace textbooks).';
comment on column corpus.chunk_meta.topic_id is '§-тің тұрақты кілті: <кітап>#§<нөмір>. examiner.questions.topic_id осыған сілтейді.';
comment on column corpus.chunk_meta.is_back_matter is 'Кітаптың соңындағы мазмұн немесе әдебиет тізімі: ешбір §-ке жатпайды.';

-- 4. Толтыру функциясы (rag-ты тек оқиды)
create function corpus.refresh_chunk_meta()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count   integer;
  v_unknown text;
begin
  select string_agg(distinct coalesce(x.book, '(файл атауы талданбады)'), ', ')
  into v_unknown
  from (
    select substring(d.file_path from '\(([^,()]+\.md), бөлім') as book
    from rag.lightrag_doc_chunks d
    where d.workspace = 'textbooks'
  ) x
  where x.book is null or not exists (select 1 from corpus.textbooks t where t.book = x.book);

  if v_unknown is not null then
    raise notice 'corpus.textbooks-те жоқ кітаптар өткізілді: %', v_unknown;
  end if;

  delete from corpus.chunk_meta;

  insert into corpus.chunk_meta (
    chunk_id, book, section_no, chunk_order_index, chapter_no, chapter,
    paragraph_no, paragraph_title, order_in_paragraph, subitem, is_back_matter
  )
  with c as (
    select
      d.id as chunk_id,
      substring(d.file_path from '\(([^,()]+\.md), бөлім') as book,
      substring(d.file_path from 'бөлім (\d+)\)$')::int as section_no,
      d.chunk_order_index,
      substring(d.file_path from ' — (.*) \([^()]*\)$') as section_title,
      substring(d.content from '^\[([^\]]*)\]') as header,
      d.content ~ '\.{8,}' as dot_leaders
    from rag.lightrag_doc_chunks d
    where d.workspace = 'textbooks'
  ),
  p as (
    select
      c.*,
      nullif(btrim(substring(c.header from 'Тарау: ([^|]+)')), '') as chapter_raw,
      nullif(btrim(substring(c.header from 'Тармақ: ([^|]+)')), '') as subitem,
      regexp_replace(
        coalesce(
          substring(c.header from 'Тақырып: §\s*([0-9]+(?:\s*[–—-]\s*[0-9]+)?)'),
          substring(c.section_title from '^§\s*([0-9]+(?:\s*[–—-]\s*[0-9]+)?)')
        ),
        '\s*[–—-]\s*', '–') as paragraph_raw,
      nullif(btrim(regexp_replace(
        regexp_replace(c.section_title, '^§\s*[0-9]+(?:\s*[–—-]\s*[0-9]+)?\.?\s*', ''),
        '…\s*$', '')), '') as title_from_section,
      nullif(btrim(regexp_replace(
        substring(c.header from 'Тақырып: §\s*[0-9]+(?:\s*[–—-]\s*[0-9]+)?\.?\s*([^|]*)'),
        '…\s*$', '')), '') as title_from_header,
      bool_or(c.dot_leaders) over (
        partition by c.book, c.section_no order by c.chunk_order_index) as is_back_matter,
      count(nullif(btrim(substring(c.header from 'Тарау: ([^|]+)')), '')) over (
        partition by c.book order by c.section_no, c.chunk_order_index) as chapter_group
    from c
    where c.book is not null
      and c.section_no is not null
      and exists (select 1 from corpus.textbooks t where t.book = c.book)
  ),
  f as (
    select
      p.*,
      first_value(p.chapter_raw) over (
        partition by p.book, p.chapter_group order by p.section_no, p.chunk_order_index) as chapter,
      case when p.is_back_matter then null else p.paragraph_raw end as paragraph_no
    from p
  ),
  titles as (
    select
      f.book,
      f.paragraph_no,
      mode() within group (order by f.title_from_section) as title_from_section,
      mode() within group (order by f.title_from_header) as title_from_header
    from f
    where f.paragraph_no is not null
    group by f.book, f.paragraph_no
  )
  select
    f.chunk_id,
    f.book,
    f.section_no,
    f.chunk_order_index,
    case when f.chapter is not null then coalesce(substring(f.chapter from '^([IVXLC]+)\M'), f.chapter) end,
    f.chapter,
    f.paragraph_no,
    coalesce(t.title_from_section, t.title_from_header),
    case when f.paragraph_no is not null then
      row_number() over (partition by f.book, f.paragraph_no order by f.section_no, f.chunk_order_index)
    end,
    f.subitem,
    f.is_back_matter
  from f
  left join titles t on t.book = f.book and t.paragraph_no = f.paragraph_no;

  get diagnostics v_count = row_count;
  return v_count;
end
$$;

comment on function corpus.refresh_chunk_meta() is 'chunk_meta-ны LightRAG чанктарынан қайта құрады; жазылған жол санын қайтарады. Индекстеу контуры шақырады.';

-- 5. Сервистерге арналған көріністер

-- §-тер тізімі: Examiner-дің GET /scopes эндпоинті мен Tutor осыдан оқиды (api §3.2).
create view corpus.paragraphs with (security_invoker = true) as
select
  m.topic_id,
  m.book,
  t.subject_id,
  t.grade,
  t.title as book_title,
  min(m.chapter_no) as chapter_no,
  min(m.chapter) as chapter,
  m.paragraph_no,
  min(m.paragraph_title) as paragraph_title,
  split_part(m.paragraph_no, '–', 1)::int as sort_no,
  count(*) as chunk_count
from corpus.chunk_meta m
join corpus.textbooks t on t.book = m.book
where m.paragraph_no is not null
group by m.topic_id, m.book, t.subject_id, t.grade, t.title, m.paragraph_no;

-- Чанк мәтіні. security_invoker қойылмаған: көріністі postgres иеленеді, сондықтан сервис
-- rag схемасын көрмей, тек осы бағандарды оқиды.
create view corpus.chunk_text as
select m.chunk_id, m.topic_id, m.order_in_paragraph, d.content
from corpus.chunk_meta m
join rag.lightrag_doc_chunks d on d.id = m.chunk_id and d.workspace = 'textbooks';

-- Entity → чанк байланысы (ai_examiner §2.1–2.2: микро масштаб пен кросс-чанк комбинациясы).
create view corpus.entity_chunk_links as
select e.id as entity, jsonb_array_elements_text(e.chunk_ids) as chunk_id
from rag.lightrag_entity_chunks e
where e.workspace = 'textbooks';

comment on view corpus.chunk_text is 'Чанк мәтіні сервистер үшін (тек оқу).';
comment on view corpus.entity_chunk_links is 'LightRAG entity мен чанк байланысы, LLM-сіз (ai_examiner §2.1).';

-- 6. Құқықтар
revoke all on corpus.textbooks, corpus.chunk_meta, corpus.paragraphs, corpus.chunk_text, corpus.entity_chunk_links
  from public, anon, authenticated, service_role;
revoke all on function corpus.refresh_chunk_meta() from public, anon, authenticated, service_role;

grant select on corpus.textbooks, corpus.chunk_meta, corpus.paragraphs, corpus.chunk_text, corpus.entity_chunk_links
  to examiner_svc, tutor_svc;
grant execute on function corpus.refresh_chunk_meta() to lightrag_app;

-- 7. Алғашқы толтыру
select corpus.refresh_chunk_meta();
