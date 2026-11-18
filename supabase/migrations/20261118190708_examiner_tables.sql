-- Examiner кестелері.
-- Негізі: architect/v2/bagalau-zhuiesi.md §3, §4, §6, Т4, Т8, Т9, Т11;
--         ai_examiner.md §5, §7.2; api-kelisimderi.md §2.3, §3; README D10, D16, D35–D37.
--
-- Кестелердің иесі — postgres. examiner_svc тек қажет құқықты алады (файлдың соңы):
--   * сұрақ пакеті мен мұғалім түзетуі тек қосылады, өзгертілмейді (Т4, Т11);
--   * басқа кестелерді сервис жазады және жаңартады.
-- Схема Data API-ға ашылмағандықтан RLS қосылмайды: оқушы мен мұғалімнің рұқсатын
-- Examiner API тексереді (api-kelisimderi.md §2.1).
--
-- Сыртқы кілттер:
--   * student_id → auth.users(id) on delete cascade: пайдаланушы өшірілсе, оның емтихан
--     деректері де өшеді (оқушылардың көбі кәмелетке толмаған, ortaq §9);
--   * subject_id → public.subjects(id);
--   * мұғалімнің id-і (teacher_id, confirmed_by, revoked_by) сыртқы кілтсіз сақталады:
--     мұғалім аккаунты өшірілсе де, түзету тарихы қалуы керек (Т11).

-- 1. Домендер
create domain examiner.task_format as text
  check (value in (
    'mcq',              -- 8
    'matching',         -- I-1
    'short_answer',     -- 7
    'sequence',         -- 6
    'true_false_fix',   -- 5
    'error_step',       -- I-2 (Ә)
    'formula_builder',  -- I-3 (Б)
    'slider',           -- I-4 (Г)
    'socratic',         -- 3
    'feynman',          -- 2
    'teach_ai',         -- «ЖИ-ді оқыт»
    'priority',         -- 4
    'case_study'        -- 1
  ));

create domain examiner.tier as text check (value in ('X1', 'X2', 'X3'));
create domain examiner.exam_level as smallint check (value between 1 and 4);
create domain examiner.scope_type as text check (value in ('topic', 'chapter', 'subject'));

-- 2. Сұрақ банкі

-- Сұрақ пакеті: бір рет жазылады және өзгермейді (bagalau §3.2, Т4).
create table examiner.questions (
  question_id          uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  subject_id           uuid not null references public.subjects (id),
  topic_id             text not null check (length(btrim(topic_id)) > 0),
  level                examiner.exam_level not null,
  sarbaz               text generated always as (
                         case level
                           when 1 then 'knowing'
                           when 2 then 'applying'
                           when 3 then 'reasoning'
                           else 'applying_reasoning'
                         end) stored,
  format               examiner.task_format not null,
  question_content     jsonb not null check (jsonb_typeof(question_content) = 'object'),
  ecd_skill            text not null check (length(btrim(ecd_skill)) > 0),
  ecd_evidence         jsonb not null check (jsonb_typeof(ecd_evidence) = 'object'),
  rubric_0_4           jsonb,
  reference_context    jsonb not null
                       check (jsonb_typeof(reference_context -> 'chunk_ids') is not distinct from 'array'),
  socratic_checkpoints jsonb,
  generator_model      text not null,
  prompt_version       text not null,
  -- Формат өз деңгейінде ғана болады (ai_examiner §3). 3-деңгейдің A блогы 1–2-деңгейдің
  -- сұрақтарын өз деңгейімен алады, сондықтан бөлек жол керек емес.
  constraint questions_format_level check (
       (level = 1 and format in ('mcq', 'matching', 'short_answer'))
    or (level = 2 and format in ('sequence', 'true_false_fix', 'error_step', 'formula_builder', 'slider'))
    or (level = 3 and format in ('socratic', 'feynman', 'teach_ai'))
    or (level = 4 and format in ('priority', 'case_study'))
  ),
  -- ЖИ мен гибрид форматтарында рубрика міндетті (Т6).
  constraint questions_rubric check (
    format in ('mcq', 'matching', 'sequence', 'error_step', 'formula_builder', 'slider')
    or rubric_0_4 is not null
  ),
  -- Сократта 2–3 тексеру нүктесі болады, басқа форматта болмайды (Т3, Т6).
  constraint questions_socratic check (
    case
      when socratic_checkpoints is null then format <> 'socratic'
      when jsonb_typeof(socratic_checkpoints) <> 'array' then false
      else format = 'socratic' and jsonb_array_length(socratic_checkpoints) between 2 and 3
    end
  )
);

create index questions_bank on examiner.questions (subject_id, topic_id, level, format);

comment on table examiner.questions is 'Сұрақ пакеті (bagalau §3.4). Өзгермейді (Т4): түзету керек болса, жаңа question_id жасалады.';
comment on column examiner.questions.topic_id is '§-тің тұрақты кілті; chunk_meta-дан алынады (ortaq §3). Кілттің нақты пішімі 3-қадамда chunk_meta-мен бірге бекітіледі.';
comment on column examiner.questions.question_content is 'public бөлік: клиентке тек осы барады (api §3.4, ortaq §4).';
comment on column examiner.questions.ecd_evidence is 'code_check_target (код үшін) және/немесе llm_expected_rule (ЖИ үшін). private.';
comment on column examiner.questions.rubric_0_4 is 'ЖИ тапсырмасында 0–4 бес дескриптор, гибридте a үшін 0–2. private.';
comment on column examiner.questions.reference_context is '{text, chunk_ids[]}: генерация кезінде бір рет алынған оқулық үзіндісі (Т2). private.';

create function examiner.forbid_question_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'examiner.questions: пакет өзгертілмейді (Т4); түзету үшін жаңа question_id жасаңыз';
end
$$;

create trigger questions_immutable
  before update on examiner.questions
  for each row execute function examiner.forbid_question_update();

-- Сұрақтың өзгеретін күйі (bagalau §3.2, Т10). Әр өзгеріс тарихқа жазылады.
create table examiner.question_state (
  question_id   uuid primary key references examiner.questions (question_id),
  x_tier        examiner.tier not null,
  status        text not null default 'active' check (status in ('active', 'review', 'retired')),
  change_reason text not null default 'generation',
  updated_at    timestamptz not null default now()
);

create index question_state_active on examiner.question_state (x_tier) where status = 'active';

comment on column examiner.question_state.change_reason is 'Өзгерістің себебі: generation, t10_hard, t10_defective, manual т.б. Тарихқа көшіріледі.';

create table examiner.question_state_history (
  history_id  bigint generated always as identity primary key,
  question_id uuid not null references examiner.questions (question_id),
  x_tier      examiner.tier not null,
  status      text not null,
  reason      text not null,
  changed_at  timestamptz not null
);

create index question_state_history_question on examiner.question_state_history (question_id, changed_at);

create function examiner.question_state_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE'
     and new.x_tier is not distinct from old.x_tier
     and new.status is not distinct from old.status then
    return new;
  end if;
  insert into examiner.question_state_history (question_id, x_tier, status, reason, changed_at)
  values (new.question_id, new.x_tier, new.status, new.change_reason, new.updated_at);
  return new;
end
$$;

create trigger question_state_audit
  before insert or update on examiner.question_state
  for each row execute function examiner.question_state_audit();

-- Форматтың пәнге қолданылуы (ai_examiner §5.1, bagalau §2.4). Жол жоқ болса — қолданылады.
create table examiner.format_applicability (
  subject_id uuid not null references public.subjects (id),
  format     examiner.task_format not null,
  applicable boolean not null,
  updated_at timestamptz not null default now(),
  primary key (subject_id, format)
);

-- 3. Сессиялар

create table examiner.sessions (
  session_id       uuid primary key default gen_random_uuid(),
  student_id       uuid not null references auth.users (id) on delete cascade,
  subject_id       uuid not null references public.subjects (id),
  scope_type       examiner.scope_type not null,
  scope_id         text not null,
  level            examiner.exam_level not null,
  status           text not null default 'preparing'
                   check (status in ('preparing', 'active', 'completed', 'blocked', 'abandoned')),
  composition      jsonb not null,
  strike_count     smallint not null default 0 check (strike_count between 0 and 2),
  blocked_until    timestamptz,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  last_activity_at timestamptz not null default now(),
  ended_at         timestamptz,
  unique (session_id, student_id),
  -- Пән масштабының id-і — пәннің өзі (D35).
  check (scope_type <> 'subject' or scope_id = subject_id::text),
  check (status not in ('active', 'blocked', 'completed') or started_at is not null),
  check ((status in ('completed', 'abandoned')) = (ended_at is not null)),
  check (status = 'blocked' or blocked_until is null)
);

-- Оқушыда бір уақытта бір ғана аяқталмаған сессия (D36). blocked та аяқталмаған сессия.
create unique index sessions_one_open_per_student on examiner.sessions (student_id)
  where status in ('preparing', 'active', 'blocked');
-- 60 минут белсенділік болмаса, сессия abandoned болады (D36).
create index sessions_idle on examiner.sessions (last_activity_at)
  where status in ('preparing', 'active');
-- Деңгей картасы мен профиль: масштаб пен деңгей бойынша соңғы нәтиже (D35).
create index sessions_results on examiner.sessions (student_id, subject_id, scope_type, scope_id, level, ended_at desc)
  where status = 'completed';

comment on column examiner.sessions.composition is 'Осы сессияға қолданылған құрам мен уақыт (bagalau §2.3). Конфигурация кейін өзгерсе де, бұл сессия өз құрамымен бағаланады (Т4).';
comment on column examiner.sessions.blocked_until is 'Уақытша бұғат (examiner §7.2). null болса — мұғалім ашқанша.';

create table examiner.session_items (
  item_id     uuid primary key default gen_random_uuid(),
  session_id  uuid not null references examiner.sessions (session_id) on delete cascade,
  question_id uuid not null references examiner.questions (question_id),
  position    smallint not null check (position >= 1),
  tier        examiner.tier not null,
  block       text check (block in ('A', 'D')),
  served_at   timestamptz,
  deadline_at timestamptz,
  state       text not null default 'open' check (state in ('open', 'answered', 'grading', 'graded')),
  unique (session_id, position),
  unique (session_id, question_id),
  unique (item_id, session_id, question_id),
  -- Таймер тек A блогында және тек тапсырма берілгеннен кейін (bagalau §4.2, D30).
  check (deadline_at is null
         or (block is not null and block = 'A' and served_at is not null and deadline_at > served_at))
);

create index session_items_question on examiner.session_items (question_id);

comment on column examiner.session_items.tier is 'Сұрақ берілген сәттегі x_tier (Т4).';
comment on column examiner.session_items.served_at is 'Тапсырма берілген сәт, серверде жазылады. A блогында таймер осыдан басталады.';

-- Е1: бекіту мерзімінде сұрақ басқа сессияға берілмейді (ai_examiner §5.2, §5.5).
create table examiner.exam_item_leases (
  question_id  uuid primary key references examiner.questions (question_id),
  session_id   uuid not null references examiner.sessions (session_id) on delete cascade,
  leased_until timestamptz not null
);

create index exam_item_leases_session on examiner.exam_item_leases (session_id);

comment on column examiner.exam_item_leases.leased_until is 'Сессия жүріп жатқанда infinity; аяқталғанда ended_at + T_tail (2 сағат, D14).';

-- Е2: оқушы сұрақты қанша рет және қашан көрді (ai_examiner §5.3, §5.5).
create table examiner.student_item_exposure (
  student_id   uuid not null references auth.users (id) on delete cascade,
  question_id  uuid not null references examiner.questions (question_id),
  n            integer not null check (n >= 1),
  last_seen_at timestamptz not null,
  primary key (student_id, question_id)
);

create index student_item_exposure_question on examiner.student_item_exposure (question_id);

-- 4. Жауаптар мен бағалар

-- Әр тапсырманың қабылданған жауабы және оның бағасы (bagalau §6).
-- answer_id — API-дегі grade_id (api §3.9). Модерациядан өтпеген жауап мұнда емес,
-- moderation_events-те тұрады.
create table examiner.answer_log (
  answer_id       uuid primary key default gen_random_uuid(),
  item_id         uuid not null unique,
  session_id      uuid not null,
  student_id      uuid not null,
  question_id     uuid not null references examiner.questions (question_id),
  x_tier          examiner.tier not null,
  answer          jsonb not null,
  answer_text     text,
  answer_hash     text,
  late            boolean not null default false,
  c               smallint check (c in (0, 1)),
  a               smallint check (a between 0 and 2),
  s               smallint check (s between 0 and 4),
  grade_source    text check (grade_source in ('code', 'hash', 'vector', 'llm', 'moderation')),
  grade_status    text not null default 'pending' check (grade_status in ('pending', 'provisional', 'final')),
  review_reason   text check (review_reason in ('d16_confirmation', 't9_missing_quote')),
  evidence_quotes jsonb,
  grader_model    text,
  prompt_version  text,
  rubric_version  text,
  created_at      timestamptz not null default now(),
  graded_at       timestamptz,
  confirmed_by    uuid,
  confirmed_at    timestamptz,
  unique (answer_id, question_id),
  foreign key (item_id, session_id, question_id)
    references examiner.session_items (item_id, session_id, question_id) on delete cascade,
  foreign key (session_id, student_id)
    references examiner.sessions (session_id, student_id) on delete cascade,
  -- Баға әлі жоқ ⇔ pending (api §2.4: провайдер істен шықса, жауап кезекте күтеді).
  check ((s is null) = (grade_status = 'pending')),
  check ((s is null) = (grade_source is null)),
  check ((s is null) = (graded_at is null)),
  -- Алдын ала ЖИ бағасы мұғалімнің кезегінде тұрады (D16, Т9).
  check (grade_status <> 'provisional' or review_reason is not null),
  -- Нұсқа өрістері міндетті, әйтпесе пулда сыйыспайтын бағалар араласады (bagalau §6).
  check (grade_source is distinct from 'llm'
         or (grader_model is not null and prompt_version is not null and rubric_version is not null)),
  check (answer_hash is null or answer_text is not null),
  check ((confirmed_by is null) = (confirmed_at is null))
);

create index answer_log_session on examiner.answer_log (session_id);
create index answer_log_student on examiner.answer_log (student_id, created_at);
-- Мәтінді тексерудің 1-деңгейі: нақты hash (bagalau §4.1).
create index answer_log_hash on examiner.answer_log (question_id, answer_hash)
  where answer_hash is not null and s is not null;
-- Мұғалімнің растау кезегі (api §3.9).
create index answer_log_review on examiner.answer_log (student_id, created_at)
  where grade_status = 'provisional';

comment on column examiner.answer_log.answer is 'Клиенттен келген жауап (api §3.4 answer).';
comment on column examiner.answer_log.answer_text is 'Бағаланатын мәтін бөлігі: 7, 5 мен 4-тің түсіндірмесі, 1, 2; диалогта — оқушы хабарламаларының жиыны.';
comment on column examiner.answer_log.answer_hash is 'Қалыпқа келтірілген answer_text-тің sha256-ы (bagalau §4.1).';
comment on column examiner.answer_log.late is 'A блогы: уақыт біткеннен кейін келді, s = 0 (bagalau §4.2).';
comment on column examiner.answer_log.s is 'Тапсырма балы 0–4 (bagalau §4.1). null — баға әлі жоқ. Күшіндегі балл — effective_grades көрінісінде.';
comment on column examiner.answer_log.evidence_quotes is 'ЖИ балының дәйексөздері [{text, start, end}] (Т9).';

-- Мұғалімнің түзетуі (Т11). Тек қосылады: күшіндегі баға — соңғы түзету, бастапқы баға қалады.
create table examiner.grade_overrides (
  override_id uuid primary key default gen_random_uuid(),
  grade_id    uuid not null references examiner.answer_log (answer_id) on delete cascade,
  teacher_id  uuid not null,
  new_score   smallint not null check (new_score between 0 and 4),
  reason      text not null check (length(btrim(reason)) >= 3),
  kind        text not null default 'review' check (kind in ('review', 'false_positive')),
  created_at  timestamptz not null default now()
);

create index grade_overrides_grade on examiner.grade_overrides (grade_id, created_at desc);

comment on column examiner.grade_overrides.kind is 'review — мұғалім бағаны түзетті; false_positive — қате дабылдан кейін балл қалпына келді (examiner §7.2).';

-- «2 мүмкіндік» ережесінің журналы (examiner §7.2, D17). Бастапқы жазба өшірілмейді.
create table examiner.moderation_events (
  event_id      uuid primary key default gen_random_uuid(),
  session_id    uuid not null,
  item_id       uuid not null,
  student_id    uuid not null,
  strike_no     smallint not null check (strike_no in (1, 2)),
  category      text not null
                check (category in ('TOXIC', 'TROLLING', 'PROMPT_INJECTION', 'PROFANITY', 'AGGRESSION')),
  evidence_text text not null,
  alert_id      uuid,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  revoked_by    uuid,
  foreign key (session_id, student_id)
    references examiner.sessions (session_id, student_id) on delete cascade,
  foreign key (item_id) references examiner.session_items (item_id) on delete cascade,
  check ((revoked_at is null) = (revoked_by is null))
);

-- Жойылмаған страйктің нөмірі сессияда қайталанбайды.
create unique index moderation_events_strike on examiner.moderation_events (session_id, strike_no)
  where revoked_at is null;

comment on column examiner.moderation_events.alert_id is '2-ші бұзушылықта жазылған public.security_alerts жазбасы (ortaq §5).';
comment on column examiner.moderation_events.evidence_text is 'Оқу жылының соңына дейін сақталады, содан кейін өшіріледі немесе анонимделеді (D14).';

-- Сократ пен «ЖИ-ді оқыт» диалогы (api §3.6). Ағын үзілсе де, сервер жауапты аяғына дейін жазады.
create table examiner.dialog_turns (
  item_id           uuid not null references examiner.session_items (item_id) on delete cascade,
  turn_no           smallint not null check (turn_no >= 1),
  student_text      text not null,
  examiner_text     text,
  client_request_id uuid not null,
  model             text,
  prompt_version    text,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz,
  primary key (item_id, turn_no),
  unique (item_id, client_request_id),
  check ((examiner_text is null) = (completed_at is null))
);

comment on column examiner.dialog_turns.turn_no is 'Сұрақ санын (ең көбі 3) ЖИ емес, бэкенд санайды (Т3).';

-- 2-сатының түсіндірмесі (examiner §6, api §3.6).
create table examiner.explanations (
  item_id        uuid primary key references examiner.session_items (item_id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  text           text,
  model          text,
  prompt_version text,
  created_at     timestamptz not null default now(),
  ready_at       timestamptz,
  check ((status = 'ready') = (text is not null)),
  check ((status = 'ready') = (ready_at is not null))
);

-- Векторлық кэш (bagalau §4.1, §6, Т2, Т8).
-- Іздеу тек бір question_id-тің verified жауаптары арасында жүреді. Бір сұраққа келетін вектор
-- саны аз, сондықтан HNSW емес, question_id бойынша дәл іздеу қолданылады.
create table examiner.answer_vectors (
  answer_id        uuid primary key,
  question_id      uuid not null,
  value            smallint not null check (value between 0 and 4),
  cluster_state    text not null default 'candidate' check (cluster_state in ('candidate', 'verified', 'suspended')),
  verified_by      text check (verified_by in ('second_grading', 'teacher')),
  embedding        extensions.vector(1536) not null,
  embedding_model  text not null,
  created_at       timestamptz not null default now(),
  state_changed_at timestamptz not null default now(),
  foreign key (answer_id, question_id)
    references examiner.answer_log (answer_id, question_id) on delete cascade,
  check (cluster_state <> 'verified' or verified_by is not null)
);

create index answer_vectors_lookup on examiner.answer_vectors (question_id, embedding_model)
  where cluster_state = 'verified';

comment on column examiner.answer_vectors.value is 'ЖИ тапсырмасында s, гибридте a (bagalau §6).';
comment on column examiner.answer_vectors.embedding is 'text-embedding-3-small (1536). Бір бағанда модельдер араласпайды: модель ауысса, жаңа баған немесе кесте керек.';

-- 5. Нәтиже

-- Сессияның нәтижесі (bagalau §4.2, §4.3; api §3.7). Мұғалім бағаны растаса немесе түзетсе,
-- сервис нәтижені қайта есептейді.
create table examiner.session_results (
  session_id      uuid primary key references examiner.sessions (session_id) on delete cascade,
  p               numeric(5, 2) not null check (p between 0 and 100),
  part_d          numeric(5, 4) check (part_d between 0 and 1),
  part_a          numeric(5, 4) check (part_a between 0 and 1),
  mastered        boolean not null,
  is_final        boolean not null,
  x3_status       text not null check (x3_status in ('not_eligible', 'passed', 'failed')),
  x3_rating_valid boolean not null default true,
  computed_at     timestamptz not null default now(),
  check ((part_d is null) = (part_a is null))
);

comment on column examiner.session_results.part_d is 'Тек 3-деңгей: D = Σs / (4·n), диалог блогы (bagalau §4.2, D11).';
comment on column examiner.session_results.part_a is 'Тек 3-деңгей: A = Σs / (4·n), ұшқырлық блогы.';
comment on column examiner.session_results.x3_rating_valid is 'D37: мұғалім X.1–X.2-дегі ЖИ бағасын 3-тен төмен түзетсе, false болады, ал X.3 нәтижесі рейтингте қолданылмайды.';

-- 6. Қайталанған сұраныс (api §2.3)
-- Сол client_request_id-мен қайта келген сұранысқа бірінші жауап қайталанады. Жазба күй
-- өзгерісімен бір транзакцияда жазылады. Ескі жазбаларды сервис тазалайды.
create table examiner.request_log (
  user_id           uuid not null,
  client_request_id uuid not null,
  endpoint          text not null,
  request_hash      text not null,
  status_code       smallint not null,
  response          jsonb not null,
  created_at        timestamptz not null default now(),
  primary key (user_id, client_request_id)
);

create index request_log_created on examiner.request_log (created_at);

-- 7. Көріністер

-- Күшіндегі балл: соңғы түзету, ол болмаса бастапқы балл (Т11).
create view examiner.effective_grades with (security_invoker = true) as
select
  a.answer_id as grade_id,
  a.item_id,
  a.session_id,
  a.student_id,
  a.question_id,
  a.s as original_s,
  coalesce(o.new_score, a.s) as s,
  o.override_id is not null as overridden,
  a.grade_status,
  a.grade_source
from examiner.answer_log a
left join lateral (
  select g.override_id, g.new_score
  from examiner.grade_overrides g
  where g.grade_id = a.answer_id
  order by g.created_at desc, g.override_id desc
  limit 1
) o on true;

-- Профиль: пән масштабындағы әр деңгейдің соңғы аяқталған сессиясы (bagalau §4.3, D35).
create view examiner.subject_level_latest with (security_invoker = true) as
select distinct on (s.student_id, s.subject_id, s.level)
  s.student_id,
  s.subject_id,
  s.level,
  s.session_id,
  r.p,
  r.mastered,
  r.is_final,
  s.ended_at as taken_at
from examiner.sessions s
join examiner.session_results r on r.session_id = s.session_id
where s.status = 'completed'
  and s.scope_type = 'subject'
order by s.student_id, s.subject_id, s.level, s.ended_at desc;

-- 8. Құқықтар

revoke all on all tables in schema examiner from public, anon, authenticated, service_role;
revoke all on all sequences in schema examiner from public, anon, authenticated, service_role;
revoke all on all functions in schema examiner from public, anon, authenticated, service_role;

-- Тек қосылады (Т4, Т11).
grant select, insert on
  examiner.questions,
  examiner.grade_overrides
to examiner_svc;

-- Тарихты триггер жазады; сервис тек оқиды. Триггер шақырушының құқығымен жүреді,
-- сондықтан INSERT құқығы да керек.
grant select, insert on examiner.question_state_history to examiner_svc;

grant select, insert, update on
  examiner.question_state,
  examiner.format_applicability,
  examiner.sessions,
  examiner.session_items,
  examiner.student_item_exposure,
  examiner.answer_log,
  examiner.moderation_events,
  examiner.dialog_turns,
  examiner.explanations,
  examiner.answer_vectors,
  examiner.session_results
to examiner_svc;

grant select, insert, update, delete on examiner.exam_item_leases to examiner_svc;
grant select, insert, delete on examiner.request_log to examiner_svc;

grant select on examiner.effective_grades, examiner.subject_level_latest to examiner_svc;

grant usage on all sequences in schema examiner to examiner_svc;
