-- 7-қадам: AI Tutor (D86). Негізі: architect/v2/lightrag_personarag.md §2–§7, api-kelisimderi.md §4,
-- ortaq-infraqurylym.md §1, §2.3, §3, §5.
--
-- rag схемасына ешнәрсе қосылмайды, құқығы өзгермейді (D57): Tutor LightRAG деректерін postgres
-- иеленетін corpus көріністері мен функциялары арқылы тек оқиды, examiner_svc сияқты.
-- tutor схемасы Data API-ға ашылмайды (D15), сондықтан RLS қосылмайды: рұқсатты Tutor API тексереді.
-- tutor_svc рөлінің LOGIN мен паролі migration-нан тыс, бір рет орнатылады (service_schemas_and_roles).

-- ================================================================== 1. corpus: Tutor-ға керек оқу көзі

-- Оқулық entity-лері: атау, түрі және сипаттамасы (personarag §2.1, тазалау контуры).
create view corpus.entities as
select n.id as entity,
       nullif(btrim(n.properties ->> 'entity_type'), '') as entity_type,
       left(replace(coalesce(n.properties ->> 'description', ''), '<SEP>', E'\n'), 2000) as description
from rag.lightrag_graph_nodes n
where n.workspace = 'textbooks';

-- Entity арасындағы байланыс: textbook_order алғышарттары тек байланысқан түйіндер арасында құрылады.
create view corpus.entity_edges as
select e.src_id as src,
       e.tgt_id as tgt,
       case when e.properties ->> 'weight' ~ '^[0-9]+(\.[0-9]+)?$'
            then (e.properties ->> 'weight')::double precision else 1.0 end as weight
from rag.lightrag_graph_edges e
where e.workspace = 'textbooks';

-- 0-қадам (personarag §7): хабарлама векторына ең жақын entity-лер. LightRAG-тың HNSW индексі қолданылады;
-- workspace сүзгісі индекстен кейін жүретіндіктен, iterative scan жеткілікті жол табылғанша жалғастырады.
-- hnsw.* баптауы функцияның SET тіркесімен емес, денесінде қойылады: Supabase-те postgres кеңейтімнің
-- әлі жүктелмеген параметрін CREATE FUNCTION кезінде орната алмайды (permission denied), ал денеде
-- halfvec параметрі pgvector-ды жүктеп үлгереді.
create function corpus.match_entities(p_query extensions.halfvec, p_limit integer default 30)
returns table (entity text, distance double precision)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform set_config('hnsw.ef_search', '100', true);
  perform set_config('hnsw.iterative_scan', 'strict_order', true);
  return query
    select v.entity_name::text,
           (v.content_vector operator(extensions.<=>) p_query)::double precision
    from rag.lightrag_vdb_entity_text_embedding_3_large_3072d v
    where v.workspace = 'textbooks'
    order by v.content_vector operator(extensions.<=>) p_query
    limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

-- 3-қадам: жауапқа оқулық чанктары (only_need_context баламасы, D86). Мазмұн мен әдебиет тізімі кірмейді.
create function corpus.match_chunks(p_query extensions.halfvec, p_limit integer default 8)
returns table (chunk_id text, topic_id text, distance double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id::text,
         m.topic_id,
         (c.content_vector operator(extensions.<=>) p_query)::double precision
  from rag.lightrag_vdb_chunks_text_embedding_3_large_3072d c
  join corpus.chunk_meta m on m.chunk_id = c.id
  where c.workspace = 'textbooks' and not m.is_back_matter
  order by c.content_vector operator(extensions.<=>) p_query
  limit least(greatest(coalesce(p_limit, 8), 1), 30);
$$;

revoke all on corpus.entities, corpus.entity_edges from public, anon, authenticated, service_role;
revoke all on function corpus.match_entities(extensions.halfvec, integer) from public, anon, authenticated, service_role;
revoke all on function corpus.match_chunks(extensions.halfvec, integer) from public, anon, authenticated, service_role;
grant select on corpus.entities, corpus.entity_edges to tutor_svc;
grant execute on function corpus.match_entities(extensions.halfvec, integer) to tutor_svc;
grant execute on function corpus.match_chunks(extensions.halfvec, integer) to tutor_svc;

comment on view corpus.entities is 'LightRAG entity: атау, түрі, сипаттамасы (textbooks workspace). Tutor түйіндерін құру үшін.';
comment on view corpus.entity_edges is 'LightRAG entity байланыстары (textbooks workspace). Tutor-дың textbook_order алғышарттары үшін.';

-- ================================================================== 2. Tutor түйіндері (personarag §2.1, D7)

create table tutor.tutor_nodes (
  node_id             bigint generated always as identity primary key,
  norm_key            text not null unique check (length(norm_key) > 0),
  canonical_name      text not null check (length(btrim(canonical_name)) between 1 and 300),
  entity_type         text not null,
  lightrag_entity_ids text[] not null check (cardinality(lightrag_entity_ids) > 0),
  book                text references corpus.textbooks (book),
  grade               smallint,
  paragraph_no        text,
  topic_id            text,
  order_key           integer,
  description         text not null default '',
  is_learnable        boolean not null,
  built_at            timestamptz not null default now()
);
create index tutor_nodes_entities_idx on tutor.tutor_nodes using gin (lightrag_entity_ids);
create index tutor_nodes_topic_idx on tutor.tutor_nodes (topic_id) where is_learnable;

comment on table tutor.tutor_nodes is 'Tutor-дың тұрақты түйін қабаты. norm_key — қалыпқа келтірілген атау: қайта құрғанда node_id өзгермейді.';
comment on column tutor.tutor_nodes.order_key is 'Оқулықтағы алғашқы кездесу реті (сынып, §, §-тің ішіндегі чанк). textbook_order алғышарттары осымен.';

create table tutor.tutor_node_aliases (
  alias   text not null check (length(alias) > 0),
  node_id bigint not null references tutor.tutor_nodes (node_id) on delete cascade,
  primary key (alias, node_id)
);

create table tutor.tutor_prerequisites (
  node_id              bigint not null references tutor.tutor_nodes (node_id) on delete cascade,
  prerequisite_node_id bigint not null references tutor.tutor_nodes (node_id) on delete cascade,
  source               text not null check (source in ('textbook_order', 'curated')),
  verified_at          timestamptz,
  primary key (node_id, prerequisite_node_id),
  check (node_id <> prerequisite_node_id)
);
create index tutor_prerequisites_reverse_idx on tutor.tutor_prerequisites (prerequisite_node_id);

-- ================================================================== 3. Оқушы ағашы (personarag §2.2)

create table tutor.student_knowledge_tree (
  student_id       uuid not null references auth.users (id) on delete cascade,
  node_id          bigint not null references tutor.tutor_nodes (node_id) on delete cascade,
  initial_mastery  real not null check (initial_mastery between 0 and 1),
  bloom_level      text not null default 'REMEMBER'
                   check (bloom_level in ('REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE')),
  review_count     integer not null default 1 check (review_count >= 1),
  fail_streak      integer not null default 0 check (fail_streak >= 0),
  error_type       text not null default 'NONE' check (error_type in ('NONE', 'GAP', 'MISC')),
  last_interaction timestamptz not null default now(),
  primary key (student_id, node_id)
);

-- ================================================================== 4. Диалог (api §4)

create table tutor.conversations (
  conversation_id uuid primary key default gen_random_uuid(),
  student_id      uuid not null references auth.users (id) on delete cascade,
  subject_id      uuid not null references public.subjects (id),
  created_at      timestamptz not null default now(),
  last_message_at timestamptz,
  state           jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  unique (student_id, subject_id)
);

comment on column tutor.conversations.state is 'Ішкі күй: соңғы фокус пен BRIDGE_NODE, соңғы мәнерлер, жауапсыз сұрақтар саны. Клиентке берілмейді (api §4.2).';

create table tutor.messages (
  message_id        uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references tutor.conversations (conversation_id) on delete cascade,
  student_id        uuid not null references auth.users (id) on delete cascade,
  role              text not null check (role in ('student', 'tutor')),
  text              text not null check (char_length(text) <= 8000),
  status            text not null default 'complete' check (status in ('pending', 'complete', 'failed')),
  client_request_id uuid,
  request_hash      text,
  reply_to          uuid references tutor.messages (message_id) on delete cascade,
  meta              jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object'),
  created_at        timestamptz not null default now(),
  check ((role = 'student') = (client_request_id is not null))
);
create unique index tutor_messages_request_idx on tutor.messages (conversation_id, client_request_id)
  where role = 'student';
create unique index tutor_messages_reply_idx on tutor.messages (reply_to) where role = 'tutor';
create index tutor_messages_history_idx on tutor.messages (conversation_id, created_at desc);
create index tutor_messages_rate_idx on tutor.messages (student_id, created_at desc) where role = 'student';

comment on column tutor.messages.meta is 'Тегтер, күй, сценарий, мәнер, M мәндері — ішкі дерек, клиентке берілмейді (api §4.2).';

-- ================================================================== 5. Қауіпсіздік және лимит (personarag §6.3, D70; ortaq §2.3)

create table tutor.student_blocks (
  student_id     uuid primary key references auth.users (id) on delete cascade,
  blocked_until  timestamptz,
  blocked_reason text check (blocked_reason in ('cooldown', 'teacher')),
  updated_at     timestamptz not null default now(),
  updated_by     uuid,
  check (blocked_reason is distinct from 'cooldown' or blocked_until is not null)
);

-- Ескерту тарихы: Tutor security_alerts-ті оқымайды (ortaq §5), 24 сағаттағы екінші Hard Alert осыдан саналады.
create table tutor.safety_events (
  event_id   uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  action     text not null check (action in ('cooldown', 'teacher', 'unblock', 'lock')),
  category   text,
  alert_id   uuid,
  message_id uuid,
  actor_id   uuid,
  created_at timestamptz not null default now()
);
create index tutor_safety_events_student_idx on tutor.safety_events (student_id, created_at desc);

create table tutor.token_usage (
  student_id uuid not null references auth.users (id) on delete cascade,
  day        date not null,
  tokens     integer not null default 0 check (tokens >= 0),
  primary key (student_id, day)
);

-- ================================================================== 6. Құқықтар

revoke all on all tables in schema tutor from public, anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema tutor to tutor_svc;
grant usage on all sequences in schema tutor to tutor_svc;

-- Мұғалімнің бұғатты ашуы мен жабуы (api §4.1): оқушы мұғалімнің сыныбында болуы керек. Тек оқу.
grant select on public.classes, public.class_members to tutor_svc;
create policy classes_tutor_read on public.classes for select to tutor_svc using (true);
create policy class_members_tutor_read on public.class_members for select to tutor_svc using (true);

comment on schema tutor is 'AI Tutor: түйіндер, оқушы ағашы, диалогтар, бұғат (architect/v2/lightrag_personarag.md). Тек tutor_svc.';
