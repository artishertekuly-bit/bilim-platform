-- D98: Ойындар 1-кезең — біртұтас сұрақ көзі (Games Phase 1, unified bank bridge + on-demand topic cache).
--
-- Ойын сұрақты үш жерден алады, ешбір жол көшірілмейді:
--   game      — games.game_questions (оқулық § бойынша ойын банкі, D45);
--   examiner  — examiner.questions-тің белсенді тесттері, тек оқу көпірі арқылы (төмендегі security definer
--               функциялар; games_svc-ке examiner схемасына рұқсат берілмейді, D15/D68);
--   generated — games.generated_questions: «Кез келген тақырып» режимінде құрылған сұрақтар кэші. Емтихан банкіне
--               (examiner.questions) ешқашан жазылмайды.

-- ================================================================== 1. Жауап журналы — үш көздің ортақ журналы

-- Журнал 14 күндік қайталанбау мен сапа үшін (D45): сұрақ id-і енді үш кестенің біріне жатады, сондықтан
-- game_questions-қа сыртқы кілт алынады, ал көзі `source`-та сақталады.
alter table games.game_answer_log drop constraint game_answer_log_question_id_fkey;
alter table games.game_answer_log
  add column source text not null default 'game' check (source in ('game', 'examiner', 'generated'));

comment on column games.game_answer_log.source is 'Сұрақтың көзі (D98): game — game_questions, examiner — емтихан банкі (көпір), generated — generated_questions.';

-- ================================================================== 2. Еркін тақырып кэші

create table games.generated_questions (
  question_id    uuid primary key default gen_random_uuid(),
  -- Болашақ ойындар үшін (2–3-кезең): mcq мен debate_topic қазір ойналады, қалғандары — интерфейстің орны.
  format         text not null check (format in ('mcq', 'debate_topic', 'true_false_fix', 'term_card', 'role_card', 'escape_step')),
  subject_key    text not null check (char_length(subject_key) between 1 and 80),
  topic_key      text not null check (char_length(topic_key) between 1 and 200),
  subject_title  text not null check (char_length(subject_title) between 1 and 80),
  topic_title    text not null check (char_length(topic_title) between 1 and 200),
  stem_hash      text not null check (stem_hash ~ '^[0-9a-f]{64}$'),
  difficulty     smallint not null default 2 check (difficulty between 1 and 3),
  content        jsonb not null check (jsonb_typeof(content) = 'object'),
  answer_key     jsonb not null default '{}'::jsonb check (jsonb_typeof(answer_key) = 'object'),
  status         text not null default 'active' check (status in ('active', 'rejected', 'retired')),
  checks         jsonb not null default '{}'::jsonb,
  prompt_version text not null,
  model          text,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (subject_key, topic_key, format, stem_hash)
);
create index games_generated_pick_idx on games.generated_questions (subject_key, topic_key, format) where status = 'active';

comment on table games.generated_questions is 'D98: «Кез келген тақырып» сұрақтарының кэші. Кілті — қалыпқа келтірілген пән мен тақырып, сұрақ мәтінінің хэші. Сол тақырыпқа қайта ойнау $0.';

-- Генерация шегі мен есебі: бір шақыруда ең көбі 20 сұрақ, оқушыға/мұғалімге күніне шектеулі шақыру.
create table games.generation_runs (
  run_id      bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  subject_key text not null,
  topic_key   text not null,
  requested   smallint not null check (requested between 1 and 20),
  accepted    smallint not null default 0 check (accepted >= 0),
  outcome     text not null,
  cost_usd    numeric(10, 6),
  created_at  timestamptz not null default now()
);
create index games_generation_runs_user_idx on games.generation_runs (user_id, created_at desc);

revoke all on games.generated_questions, games.generation_runs from public, anon, authenticated, service_role;
grant select, insert, update on games.generated_questions to games_svc;
grant select, insert on games.generation_runs to games_svc;
grant usage on sequence games.generation_runs_run_id_seq to games_svc;

-- ================================================================== 3. Емтихан банкіне тек оқу көпірі (D68)

-- Белсенді, 1-деңгейлі, X1/X2 тесттер ғана. Функциялар емтихан кестесіне жазбайды, тек керек бағандарды береді.

create function games.examiner_bank_subjects()
returns table (subject_id uuid, title text, mcq integer, has_textbook boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name_kk, count(*)::int,
         exists (select 1 from corpus.textbooks t where t.subject_id = s.id)
  from examiner.questions q
  join examiner.question_state st on st.question_id = q.question_id
  join public.subjects s on s.id = q.subject_id
  where q.format::text = 'mcq' and q.level = 1 and st.status = 'active' and st.x_tier::text in ('X1', 'X2')
  group by s.id, s.name_kk, s.sort_order
  order by s.sort_order nulls last, s.name_kk
$$;

-- § бойынша саны: «Оқулық параграфтары» режимінде емтихан банкіндегі тесттер §-ті бірден ашады.
create function games.examiner_paragraph_mcq(p_topic_ids text[] default null)
returns table (topic_id text, mcq integer)
language sql
stable
security definer
set search_path = ''
as $$
  select q.topic_id, count(*)::int
  from examiner.questions q
  join examiner.question_state st on st.question_id = q.question_id
  where q.topic_id is not null and q.format::text = 'mcq' and q.level = 1 and st.status = 'active'
    and st.x_tier::text in ('X1', 'X2')
    and (p_topic_ids is null or q.topic_id = any (p_topic_ids))
  group by q.topic_id
$$;

-- Іріктеме: бір fact_key / concept_key — бір сұрақ; дәуірлер мен тақырыпшалар кезекпен (әр топтың 1-сі, сосын 2-сі…).
-- p_topic_ids — § сүзгісі, p_patterns — тақырып сөздерінің LIKE үлгілері (метадерек пен сұрақ мәтіні бойынша).
create function games.examiner_mcq_pool(p_subject_id uuid, p_topic_ids text[], p_patterns text[], p_limit integer)
returns table (question_id uuid, topic_id text, era text, subtopic text, tier text)
language sql
volatile
security definer
set search_path = ''
as $$
  with pool as (
    select q.question_id, q.topic_id, q.era, q.subtopic, st.x_tier::text as tier,
           row_number() over (partition by coalesce(q.fact_key, q.concept_key, q.question_id::text)
                              order by random()) as dup
    from examiner.questions q
    join examiner.question_state st on st.question_id = q.question_id
    where (p_subject_id is null or q.subject_id = p_subject_id)
      and q.format::text = 'mcq' and q.level = 1 and st.status = 'active' and st.x_tier::text in ('X1', 'X2')
      and (p_topic_ids is null or q.topic_id = any (p_topic_ids))
      and (p_patterns is null
           or lower(concat_ws(' ', q.era, q.subtopic, q.period_label, q.question_content ->> 'stem')) like any (p_patterns))
  ), ranked as (
    select p.question_id, p.topic_id, p.era, p.subtopic, p.tier,
           row_number() over (partition by coalesce(p.era, ''), coalesce(p.subtopic, p.topic_id, '')
                              order by random()) as rn
    from pool p
    where p.dup = 1
  )
  select r.question_id, r.topic_id, r.era, r.subtopic, r.tier
  from ranked r
  order by r.rn, random()
  limit least(greatest(coalesce(p_limit, 0), 0), 200)
$$;

-- Ойын кезінде бір сұрақтың мазмұны мен кілті (кілт клиентке жіберілмейді, тек сервер күйінде тұрады).
create function games.examiner_mcq_items(p_ids uuid[])
returns table (question_id uuid, topic_id text, era text, subtopic text, tier text, content jsonb, correct_option_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select q.question_id, q.topic_id, q.era, q.subtopic, st.x_tier::text,
         jsonb_build_object('stem', q.question_content -> 'stem', 'options', q.question_content -> 'options'),
         q.ecd_evidence -> 'code_check_target' ->> 'correct_option_id'
  from examiner.questions q
  join examiner.question_state st on st.question_id = q.question_id
  where q.question_id = any (p_ids) and q.format::text = 'mcq' and st.status = 'active'
$$;

revoke all on function games.examiner_bank_subjects() from public, anon, authenticated, service_role;
revoke all on function games.examiner_paragraph_mcq(text[]) from public, anon, authenticated, service_role;
revoke all on function games.examiner_mcq_pool(uuid, text[], text[], integer) from public, anon, authenticated, service_role;
revoke all on function games.examiner_mcq_items(uuid[]) from public, anon, authenticated, service_role;
grant execute on function games.examiner_bank_subjects() to games_svc;
grant execute on function games.examiner_paragraph_mcq(text[]) to games_svc;
grant execute on function games.examiner_mcq_pool(uuid, text[], text[], integer) to games_svc;
grant execute on function games.examiner_mcq_items(uuid[]) to games_svc;

comment on function games.examiner_mcq_pool(uuid, text[], text[], integer) is 'D98: емтихан банкінен ойынға тек оқу көпірі. Тек games_svc шақырады; games_svc-ке examiner кестелеріне рұқсат жоқ.';
