-- 8-қадам: Ойындар (D89). Негізі: architect/v2/geimifikatsiya.md §1–§8 (D42–D55, D67), ortaq-infraqurylym.md §1, §5.
--
-- games схемасы Data API-ға ашылмайды (D15), сондықтан кестелерінде RLS жоқ: рұқсатты Ойын API-ы тексереді.
-- Клиент ойын күйін тек Realtime Broadcast-тың private арналарынан алады (D67): сервер games.broadcast()
-- арқылы жібереді, ал арнаны тыңдау құқығын realtime.messages-тегі саясат пен games_can_listen() береді.
-- games_svc рөлінің LOGIN мен паролі migration-нан тыс, бір рет орнатылады (service_schemas_and_roles):
--   alter role games_svc with login password '<құпия>';

-- ================================================================== 1. Рөл мен схема

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'games_svc') then
    create role games_svc nologin noinherit nocreatedb nocreaterole noreplication;
  end if;
end
$$;

alter role games_svc connection limit 30;
alter role games_svc set search_path = games, extensions;
alter role games_svc set statement_timeout = '15s';
alter role games_svc set lock_timeout = '5s';
alter role games_svc set idle_in_transaction_session_timeout = '30s';

create schema if not exists games;
revoke all on schema games from public, anon, authenticated, service_role;
grant usage on schema games to games_svc;
grant usage on schema extensions to games_svc;

-- ================================================================== 2. Оқулық корпусы: тек оқу (ortaq §1, D57)

grant usage on schema corpus to games_svc;
grant select on corpus.textbooks, corpus.chunk_meta, corpus.paragraphs, corpus.chunk_text, corpus.subjects to games_svc;
create policy corpus_textbooks_games_read on corpus.textbooks for select to games_svc using (true);
create policy corpus_chunk_meta_games_read on corpus.chunk_meta for select to games_svc using (true);

-- ================================================================== 3. Кестелер (geimifikatsiya §7)

create table games.rooms (
  room_id     uuid primary key default gen_random_uuid(),
  game_type   text not null check (game_type in ('conquest', 'checkers', 'battleship', 'debate', 'baige')),
  mode        text not null default 'multi' check (mode in ('multi', 'bot', 'solo')),
  host_id     uuid not null references auth.users (id) on delete cascade,
  host_role   text not null check (host_role in ('student', 'teacher')),
  class_id    uuid references public.classes (class_id) on delete set null,
  scope       jsonb not null check (jsonb_typeof(scope) = 'object'),
  settings    jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  join_code   text check (join_code ~ '^[2-9A-HJKMNP-Z]{6}$'),
  status      text not null default 'lobby' check (status in ('lobby', 'playing', 'finished', 'abandoned')),
  result      jsonb,
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz,
  check ((mode = 'multi') = (join_code is not null)),
  check (mode = 'multi' or host_role = 'student')
);
-- Код тек ашық бөлмелер арасында бірегей: біткен бөлменің коды қайта беріле алады.
create unique index games_rooms_active_code_idx on games.rooms (join_code) where status in ('lobby', 'playing');
create index games_rooms_host_idx on games.rooms (host_id, created_at desc);

comment on column games.rooms.mode is 'multi — код/QR арқылы бір сыныптың оқушылары; bot — демо-ЖИ-мен (D48); solo — Бәйгенің жеке жаттығуы (D55).';
comment on column games.rooms.scope is 'Масштаб: subject_id, book, topic_ids (§-тер). Әдіс жорығында әр § — картаның бір аймағы (D49).';

create table games.room_players (
  room_id      uuid not null references games.rooms (room_id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  seat         smallint not null check (seat between 0 and 5),
  display_name text not null default '' check (char_length(display_name) <= 80),
  joined_at    timestamptz not null default now(),
  left_at      timestamptz,
  primary key (room_id, user_id),
  unique (room_id, seat)
);
create index games_room_players_user_idx on games.room_players (user_id, joined_at desc);

-- Ойын күйі тек серверде (geimifikatsiya §1): кілт, кемелер мен жеке карталар осында, клиентке проекция ғана барады.
create table games.match_state (
  room_id     uuid primary key references games.rooms (room_id) on delete cascade,
  state       jsonb not null check (jsonb_typeof(state) = 'object'),
  version     integer not null default 0 check (version >= 0),
  deadline_at timestamptz,
  updated_at  timestamptz not null default now()
);
create index games_match_state_deadline_idx on games.match_state (deadline_at) where deadline_at is not null;

comment on column games.match_state.deadline_at is 'Келесі таймер оқиғасы (жауап, жүріс, раунд, бот жүрісі, төреші). Сервердің фондық циклі осы бойынша жүреді.';

-- Ойын банкі емтихан банкінен бөлек (D45).
create table games.game_questions (
  question_id       uuid primary key default gen_random_uuid(),
  kind              text not null check (kind in ('mcq', 'debate_topic')),
  subject_id        uuid not null references public.subjects (id),
  book              text not null references corpus.textbooks (book),
  topic_id          text not null,
  paragraph         text not null check (char_length(paragraph) between 1 and 40),
  difficulty        smallint not null check (difficulty between 1 and 3),
  content           jsonb not null check (jsonb_typeof(content) = 'object'),
  answer_key        jsonb not null default '{}'::jsonb check (jsonb_typeof(answer_key) = 'object'),
  reference_context text not null default '',
  status            text not null default 'active' check (status in ('active', 'rejected', 'retired')),
  checks            jsonb not null default '{}'::jsonb,
  prompt_version    text not null,
  source_chunk_ids  text[] not null default '{}',
  created_at        timestamptz not null default now()
);
create index games_questions_pick_idx on games.game_questions (topic_id, kind, difficulty) where status = 'active';

comment on column games.game_questions.content is 'mcq: stem, options[{id,text}]; debate_topic: statement, pro[], con[]. Клиентке тек content барады, answer_key — жауаптан кейін.';

create table games.game_answer_log (
  answer_id   bigint generated always as identity primary key,
  room_id     uuid not null references games.rooms (room_id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references games.game_questions (question_id) on delete cascade,
  correct     boolean,
  created_at  timestamptz not null default now()
);
create index games_answer_log_seen_idx on games.game_answer_log (user_id, question_id, created_at desc);
create index games_answer_log_question_idx on games.game_answer_log (question_id);

comment on table games.game_answer_log is 'Сұрақты кім көрді, кім дұрыс жауап берді. Сұрақ сапасы мен 14 күндік қайталанбау үшін, бағалау үшін емес (D3, D45). correct = null — көрді, бірақ жауап бермеді.';

create table games.debate_entries (
  room_id    uuid not null references games.rooms (room_id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  round      smallint not null check (round between 1 and 3),
  text       text not null check (char_length(text) <= 600),
  moderation text not null default 'SAFE'
             check (moderation in ('SAFE', 'TOXIC', 'TROLLING', 'PROMPT_INJECTION', 'PROFANITY', 'AGGRESSION')),
  alert_id   uuid,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id, round)
);

-- Бәйгенің жеке жаттығуындағы рекорд (D55). Профильге шықпайды (D53).
create table games.practice_records (
  user_id      uuid not null references auth.users (id) on delete cascade,
  game_type    text not null check (game_type in ('baige')),
  best_score   integer not null check (best_score >= 0),
  best_correct integer not null default 0 check (best_correct >= 0),
  achieved_at  timestamptz not null default now(),
  primary key (user_id, game_type)
);

revoke all on all tables in schema games from public, anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema games to games_svc;
grant usage on all sequences in schema games to games_svc;

-- ================================================================== 4. Realtime Broadcast (D67)

-- Сервер күй проекциясын жібереді. Арна атауы сервердің өзінде құрылады: games_svc тек room:… арналарына жаза алады.
create function games.broadcast(p_room_id uuid, p_user_id uuid, p_event text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    p_payload,
    p_event,
    case when p_user_id is null then 'room:' || p_room_id::text
         else 'room:' || p_room_id::text || ':player:' || p_user_id::text end,
    true
  );
end;
$$;
revoke all on function games.broadcast(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function games.broadcast(uuid, uuid, text, jsonb) to games_svc;

-- Арнаны тыңдау құқығы: ортақ арна — бөлменің ойыншылары мен иесі (мұғалім проекторы), жеке арна — тек сол ойыншы.
-- Клиентке games кестелеріне рұқсат берілмейді, сондықтан тексеру security definer функциясында.
create function public.games_can_listen(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_match text[];
  v_room uuid;
begin
  if v_uid is null or p_topic is null then
    return false;
  end if;
  v_match := regexp_match(
    p_topic,
    '^room:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'
    '(?::player:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?$'
  );
  if v_match is null then
    return false;
  end if;
  v_room := v_match[1]::uuid;
  if v_match[2] is not null then
    return v_match[2]::uuid = v_uid
       and exists (select 1 from games.room_players p where p.room_id = v_room and p.user_id = v_uid);
  end if;
  return exists (select 1 from games.room_players p where p.room_id = v_room and p.user_id = v_uid)
      or exists (select 1 from games.rooms r where r.room_id = v_room and r.host_id = v_uid);
end;
$$;
revoke all on function public.games_can_listen(text) from public, anon, service_role;
grant execute on function public.games_can_listen(text) to authenticated;

-- Тек оқу: клиенттің арнаға жазатын (INSERT) саясаты жоқ, жіберетін — тек сервер.
create policy games_room_listen on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.games_can_listen((select realtime.topic())));

-- ================================================================== 5. Платформа деректері (тек керегі)

-- Бөлмеге кіру ережесі (D52): бөлме иесімен бір сыныпта оқитын оқушы не мұғалімнің сыныбындағы оқушы.
grant select on public.classes, public.class_members to games_svc;
create policy classes_games_read on public.classes for select to games_svc using (true);
create policy class_members_games_read on public.class_members for select to games_svc using (true);

-- Ойыншылардың аты (бір сыныптың оқушылары бір-бірін көреді). Тек екі баған.
grant select (user_id, full_name) on public.profiles to games_svc;
create policy profiles_games_read on public.profiles for select to games_svc using (true);

-- Дебат мәтіні ережені бұзса, мұғалімге дабыл (D52, ortaq §5).
grant insert on public.security_alerts to games_svc;
create policy security_alerts_games_insert on public.security_alerts
  for insert to games_svc with check (source_system = 'games');

comment on schema games is 'Ойындар: бөлмелер, ойын күйі, ойын банкі, дебат мәтіндері (architect/v2/geimifikatsiya.md). Тек games_svc.';
