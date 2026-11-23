-- 6-қадамның қалғаны (D85): ата-ана рөлі мен байланысы, дабылдар, чат рұқсаты, дербес сабақтар.
-- Ешбір кесте мен дерек өшірілмейді: курс пен модуль кестелері қалады, сабақтар олардан ажыратылады (D19).
-- api §3.10, §5.1, §5.3, §5.4; ortaq §1, §5, §9; karta §2.1, §3.2, §4.

-- ================================================================== 1. Ата-ана рөлі (D26, D27)
alter table public.user_roles drop constraint user_roles_allowed_roles_check;
alter table public.user_roles add constraint user_roles_allowed_roles_check
  check (role in ('student'::public.app_role, 'teacher'::public.app_role, 'parent'::public.app_role,
                  'admin'::public.app_role));

create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.app_role)
returns public.app_role
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Only admin can change user roles';
  end if;

  insert into public.user_roles (user_id, role)
  values (p_user_id, p_role)
  on conflict (user_id) do update
    set role = excluded.role;

  update auth.users
  set raw_user_meta_data =
    coalesce(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', p_role::text)
  where id = p_user_id;

  return p_role;
end;
$$;
revoke all on function public.admin_set_user_role(uuid, public.app_role) from public, anon;
grant execute on function public.admin_set_user_role(uuid, public.app_role) to authenticated;

create or replace function public._my_email()
returns text
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select lower(btrim(u.email)) from auth.users u where u.id = auth.uid();
$$;
-- RLS policy ішінде шақырылады, сондықтан authenticated-ке керек (тек өз email-ін қайтарады).
revoke all on function public._my_email() from public, anon;
grant execute on function public._my_email() to authenticated;

-- ================================================================== 2. Ата-ана мен бала байланысы
create table public.parent_child_link_requests (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users(id) on delete cascade,
  child_email text not null check (child_email = lower(btrim(child_email)) and child_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  student_id uuid references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '72 hours',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index parent_link_one_pending_idx
  on public.parent_child_link_requests (parent_id, child_email) where status = 'pending';
create index parent_link_email_idx on public.parent_child_link_requests (child_email) where status = 'pending';

create table public.parent_student_links (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (parent_id, student_id)
);
create index parent_student_links_student_idx on public.parent_student_links (student_id);

alter table public.parent_child_link_requests enable row level security;
alter table public.parent_student_links enable row level security;
revoke all on public.parent_child_link_requests, public.parent_student_links from anon, authenticated;
grant select on public.parent_child_link_requests, public.parent_student_links to authenticated;

create policy parent_link_requests_select on public.parent_child_link_requests
  for select to authenticated
  using (
    parent_id = (select auth.uid())
    or student_id = (select auth.uid())
    or (student_id is null and status = 'pending' and child_email = (select public._my_email()))
  );

create policy parent_student_links_select on public.parent_student_links
  for select to authenticated
  using (parent_id = (select auth.uid()) or student_id = (select auth.uid()));

-- Examiner ата-анаға баласының профилін береді (api §3.10): тек оқу.
grant select on public.parent_student_links to examiner_svc;
create policy parent_student_links_examiner_read on public.parent_student_links
  for select to examiner_svc using (true);

create or replace function public.request_parent_link(p_child_email text)
returns public.parent_child_link_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_child_email, '')));
  r public.parent_child_link_requests;
begin
  if v_uid is null or not public.has_role(v_uid, 'parent'::public.app_role) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL' using errcode = '22023';
  end if;
  if v_email = public._my_email() then
    raise exception 'OWN_EMAIL' using errcode = '22023';
  end if;

  update public.parent_child_link_requests q
  set status = 'expired', updated_at = now()
  where q.parent_id = v_uid and q.status = 'pending' and q.expires_at < now();

  if exists (select 1 from public.parent_child_link_requests q
             where q.parent_id = v_uid and q.status = 'pending' and q.child_email = v_email) then
    raise exception 'DUPLICATE_REQUEST' using errcode = '23505';
  end if;
  if (select count(*) from public.parent_child_link_requests q
      where q.parent_id = v_uid and q.status = 'pending') >= 10 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  insert into public.parent_child_link_requests (parent_id, child_email)
  values (v_uid, v_email)
  returning * into r;
  return r;
end;
$$;

create or replace function public.cancel_parent_link_request(p_request_id uuid)
returns public.parent_child_link_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.parent_child_link_requests;
begin
  update public.parent_child_link_requests q
  set status = 'cancelled', responded_at = now(), updated_at = now()
  where q.id = p_request_id and q.parent_id = auth.uid() and q.status = 'pending'
  returning * into r;
  if r.id is null then
    raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  return r;
end;
$$;

create or replace function public._respond_parent_link(p_request_id uuid, p_accept boolean)
returns public.parent_child_link_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  r public.parent_child_link_requests;
begin
  if v_uid is null or not public.has_role(v_uid, 'student'::public.app_role) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into r from public.parent_child_link_requests q where q.id = p_request_id for update;
  if r.id is null or r.status <> 'pending' or r.expires_at < now()
     or not (r.student_id = v_uid or (r.student_id is null and r.child_email = public._my_email())) then
    raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_accept then
    insert into public.parent_student_links (parent_id, student_id)
    values (r.parent_id, v_uid)
    on conflict do nothing;
  end if;

  update public.parent_child_link_requests q
  set status = case when p_accept then 'accepted' else 'declined' end,
      student_id = v_uid, responded_at = now(), updated_at = now()
  where q.id = p_request_id
  returning * into r;
  return r;
end;
$$;

create or replace function public.accept_parent_link_request(p_request_id uuid)
returns public.parent_child_link_requests
language sql
security definer
set search_path = public, pg_temp
as $$ select * from public._respond_parent_link(p_request_id, true); $$;

create or replace function public.decline_parent_link_request(p_request_id uuid)
returns public.parent_child_link_requests
language sql
security definer
set search_path = public, pg_temp
as $$ select * from public._respond_parent_link(p_request_id, false); $$;

-- Ата-анаға балалары атымен (профиль мәтіні — Examiner-де).
create or replace function public.my_children()
returns table (student_id uuid, full_name text, avatar_url text, linked_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.student_id, coalesce(nullif(btrim(p.full_name), ''), 'Бала'), p.avatar_url, l.created_at
  from public.parent_student_links l
  left join public.profiles p on p.user_id = l.student_id
  where l.parent_id = auth.uid()
  order by l.created_at;
$$;

-- Оқушыға келген сұраныстар атымен.
create or replace function public.my_parent_link_requests()
returns table (id uuid, parent_id uuid, parent_name text, status text, requested_at timestamptz,
               expires_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select q.id, q.parent_id, coalesce(nullif(btrim(p.full_name), ''), 'Ата-ана'), q.status, q.requested_at, q.expires_at
  from public.parent_child_link_requests q
  left join public.profiles p on p.user_id = q.parent_id
  where q.status = 'pending' and q.expires_at > now()
    and (q.student_id = auth.uid() or (q.student_id is null and q.child_email = public._my_email()))
  order by q.requested_at desc;
$$;

revoke all on function public._respond_parent_link(uuid, boolean) from public, anon, authenticated;

-- ================================================================== 3. Байланыс көмекшілері
create or replace function public._teacher_has_student(p_teacher uuid, p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_role(p_teacher, 'teacher'::public.app_role) and exists (
    select 1 from public.class_members m
    join public.classes c on c.class_id = m.class_id
    where c.teacher_id = p_teacher and m.student_id = p_student
  );
$$;

-- api §5.3: мұғалім ↔ өз сыныбындағы оқушы; мұғалім ↔ сол оқушының расталған ата-анасы.
create or replace function public._chat_allowed(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_a is not null and p_b is not null and p_a <> p_b and (
    public._teacher_has_student(p_a, p_b)
    or public._teacher_has_student(p_b, p_a)
    or exists (select 1 from public.parent_student_links l
               where l.parent_id = p_b and public._teacher_has_student(p_a, l.student_id))
    or exists (select 1 from public.parent_student_links l
               where l.parent_id = p_a and public._teacher_has_student(p_b, l.student_id))
  );
$$;

revoke all on function public._teacher_has_student(uuid, uuid) from public, anon, authenticated;
revoke all on function public._chat_allowed(uuid, uuid) from public, anon, authenticated;

-- ================================================================== 4. Дабылдар (ortaq §5, api §5.4)
create table public.security_alerts (
  alert_id uuid primary key default gen_random_uuid(),
  source_system text not null check (source_system in ('examiner', 'tutor', 'games')),
  student_id uuid not null references auth.users(id) on delete cascade,
  severity text not null default 'hard' check (severity in ('soft', 'hard')),
  category text not null check (category in ('TOXIC', 'TROLLING', 'PROMPT_INJECTION', 'PROFANITY', 'AGGRESSION')),
  evidence_text text not null check (char_length(evidence_text) <= 4000),
  context_ref jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved', 'false_positive')),
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz
);
create index security_alerts_student_idx on public.security_alerts (student_id, created_at desc);
create index security_alerts_open_idx on public.security_alerts (student_id) where status = 'open';

alter table public.security_alerts enable row level security;
revoke all on public.security_alerts from anon, authenticated;
grant select on public.security_alerts to authenticated;

-- Мұғалім тек өз сыныптарындағы оқушылардың дабылын оқиды.
create policy security_alerts_teacher_select on public.security_alerts
  for select to authenticated
  using (
    public.has_role((select auth.uid()), 'teacher'::public.app_role)
    and exists (
      select 1 from public.class_members m
      join public.classes c on c.class_id = m.class_id
      where c.teacher_id = (select auth.uid()) and m.student_id = security_alerts.student_id
    )
  );

-- Сервистер тек жазады (ortaq §1): әрқайсысы тек өз source_system-імен.
grant insert on public.security_alerts to examiner_svc, tutor_svc;
create policy security_alerts_examiner_insert on public.security_alerts
  for insert to examiner_svc with check (source_system = 'examiner');
create policy security_alerts_tutor_insert on public.security_alerts
  for insert to tutor_svc with check (source_system = 'tutor');

-- «Назар аударуды қажет ететін оқушылар»: бір оқушы — бір жол (alert fatigue-тің алдын алу).
create view public.teacher_attention_list with (security_invoker = true) as
select a.student_id,
       count(*) filter (where a.status = 'open')::int as open_count,
       (array_agg(a.category order by a.created_at desc) filter (where a.status = 'open'))[1] as last_category,
       max(a.created_at) filter (where a.status = 'open') as last_alert_at
from public.security_alerts a
group by a.student_id
having count(*) filter (where a.status = 'open') > 0;
revoke all on public.teacher_attention_list from anon;
grant select on public.teacher_attention_list to authenticated;

create or replace function public.resolve_alert(p_alert_id uuid, p_resolution text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_student uuid;
begin
  if p_resolution not in ('resolved', 'false_positive') then
    raise exception 'INVALID_RESOLUTION' using errcode = '22023';
  end if;
  select a.student_id into v_student from public.security_alerts a where a.alert_id = p_alert_id;
  if v_student is null or not public._teacher_has_student(v_uid, v_student) then
    raise exception 'ALERT_NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Бастапқы жазба сақталады, тек күйі өзгереді (ortaq §5).
  update public.security_alerts a
  set status = p_resolution, resolved_by = v_uid, resolved_at = now()
  where a.alert_id = p_alert_id;
  return p_resolution;
end;
$$;

-- ================================================================== 5. Чат (api §5.3, D24, D28)
create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'direct' check (type = 'direct'),
  title text,
  course_id uuid,
  direct_key text unique,
  created_by uuid references auth.users(id) on delete set null,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_participants (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_role text not null default 'member',
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (thread_id, user_id)
);
create index chat_participants_user_idx on public.chat_participants (user_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_name_snapshot text not null default '',
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index chat_messages_thread_idx on public.chat_messages (thread_id, created_at desc);

create or replace function public.is_chat_participant(p_thread_id uuid, p_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (p_user_id is null or p_user_id = auth.uid()) and exists (
    select 1 from public.chat_participants p where p.thread_id = p_thread_id and p.user_id = auth.uid()
  );
$$;

alter table public.chat_threads enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.chat_threads, public.chat_participants, public.chat_messages from anon, authenticated;
grant select on public.chat_threads, public.chat_participants, public.chat_messages to authenticated;

-- Хабарламаны тек тредтің қатысушысы оқиды; жазу тек RPC арқылы.
create policy chat_threads_participant_select on public.chat_threads
  for select to authenticated using (public.is_chat_participant(id));
create policy chat_participants_participant_select on public.chat_participants
  for select to authenticated using (public.is_chat_participant(thread_id));
create policy chat_messages_participant_select on public.chat_messages
  for select to authenticated using (public.is_chat_participant(thread_id));

alter publication supabase_realtime add table public.chat_messages;

create or replace function public.can_start_direct_chat(p_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select public._chat_allowed(auth.uid(), p_other_user_id); $$;

create or replace function public.get_or_create_direct_chat(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_thread uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public._chat_allowed(v_uid, p_other_user_id) then
    raise exception 'CHAT_NOT_ALLOWED' using errcode = '42501';
  end if;
  v_key := least(v_uid::text, p_other_user_id::text) || ':' || greatest(v_uid::text, p_other_user_id::text);

  select t.id into v_thread from public.chat_threads t where t.direct_key = v_key;
  if v_thread is null then
    insert into public.chat_threads (type, direct_key, created_by)
    values ('direct', v_key, v_uid)
    on conflict (direct_key) do nothing
    returning id into v_thread;
    if v_thread is null then
      select t.id into v_thread from public.chat_threads t where t.direct_key = v_key;
    end if;
  end if;

  insert into public.chat_participants (thread_id, user_id)
  values (v_thread, v_uid), (v_thread, p_other_user_id)
  on conflict (thread_id, user_id) do nothing;
  return v_thread;
end;
$$;

-- api §5.3-тегі атау.
create or replace function public.open_chat(other_user_id uuid)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$ select public.get_or_create_direct_chat(other_user_id); $$;

create or replace function public.send_chat_message(p_thread_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_other uuid;
  v_name text;
  v_id uuid;
begin
  if not public.is_chat_participant(p_thread_id) then
    raise exception 'CHAT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if char_length(v_body) not between 1 and 4000 then
    raise exception 'INVALID_MESSAGE' using errcode = '22023';
  end if;
  select p.user_id into v_other from public.chat_participants p
  where p.thread_id = p_thread_id and p.user_id <> v_uid limit 1;
  -- Оқушы сыныптан шығарылса, тред тек оқу үшін қалады.
  if not public._chat_allowed(v_uid, v_other) then
    raise exception 'CHAT_READ_ONLY' using errcode = '42501';
  end if;

  select coalesce(nullif(btrim(pr.full_name), ''), 'Пайдаланушы') into v_name
  from public.profiles pr where pr.user_id = v_uid;

  insert into public.chat_messages (thread_id, sender_id, sender_name_snapshot, body)
  values (p_thread_id, v_uid, coalesce(v_name, 'Пайдаланушы'), v_body)
  returning id into v_id;

  update public.chat_threads t set last_message_at = now(), updated_at = now() where t.id = p_thread_id;
  update public.chat_participants p set last_read_at = now()
  where p.thread_id = p_thread_id and p.user_id = v_uid;
  return v_id;
end;
$$;

create or replace function public.get_my_chat_threads()
returns table (thread_id uuid, thread_type text, title text, course_id uuid, last_message_at timestamptz,
               updated_at timestamptz, other_user_id uuid, display_name text, display_avatar_url text,
               last_message_body text, last_message_created_at timestamptz, unread_count int, can_send boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id, t.type, t.title, t.course_id, t.last_message_at, t.updated_at,
         o.user_id, coalesce(nullif(btrim(p.full_name), ''), 'Пайдаланушы'), p.avatar_url,
         lm.body, lm.created_at,
         (select count(*)::int from public.chat_messages m
          where m.thread_id = t.id and m.sender_id is distinct from me.user_id and m.deleted_at is null
            and m.created_at > coalesce(me.last_read_at, '-infinity'::timestamptz)),
         public._chat_allowed(me.user_id, o.user_id)
  from public.chat_participants me
  join public.chat_threads t on t.id = me.thread_id
  left join lateral (
    select x.user_id from public.chat_participants x where x.thread_id = t.id and x.user_id <> me.user_id limit 1
  ) o on true
  left join public.profiles p on p.user_id = o.user_id
  left join lateral (
    select m.body, m.created_at from public.chat_messages m
    where m.thread_id = t.id and m.deleted_at is null order by m.created_at desc limit 1
  ) lm on true
  where me.user_id = auth.uid()
  order by coalesce(t.last_message_at, t.created_at) desc;
$$;

create or replace function public.get_chat_messages(p_thread_id uuid, p_limit int default 50)
returns table (id uuid, thread_id uuid, sender_id uuid, sender_name text, body text, created_at timestamptz,
               edited_at timestamptz, deleted_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not public.is_chat_participant(p_thread_id) then
    raise exception 'CHAT_NOT_FOUND' using errcode = 'P0002';
  end if;
  return query
    select x.id, x.thread_id, x.sender_id, x.sender_name, x.body, x.created_at, x.edited_at, x.deleted_at
    from (
      select m.id, m.thread_id, m.sender_id, m.sender_name_snapshot as sender_name,
             case when m.deleted_at is not null then 'Хабарлама өшірілді' else m.body end as body,
             m.created_at, m.edited_at, m.deleted_at
      from public.chat_messages m
      where m.thread_id = p_thread_id
      order by m.created_at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) x
    order by x.created_at;
end;
$$;

create or replace function public.mark_chat_thread_read(p_thread_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.chat_participants p set last_read_at = now()
  where p.thread_id = p_thread_id and p.user_id = auth.uid();
$$;

-- Рұқсат етілген жұптар ғана (email берілмейді: оқушылардың көбі кәмелетке толмаған, ortaq §9).
create or replace function public.get_chat_contacts()
returns table (user_id uuid, full_name text, email text, avatar_url text, role public.app_role, source text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (select auth.uid() as uid),
  pairs as (
    select m.student_id as uid, 'class:' || c.title as src
    from public.classes c join public.class_members m on m.class_id = c.class_id, me
    where c.teacher_id = me.uid and public.has_role(me.uid, 'teacher'::public.app_role)
    union all
    select l.parent_id, 'parent'
    from public.parent_student_links l, me
    where public._teacher_has_student(me.uid, l.student_id)
    union all
    select c.teacher_id, 'class:' || c.title
    from public.class_members m join public.classes c on c.class_id = m.class_id, me
    where m.student_id = me.uid and public.has_role(c.teacher_id, 'teacher'::public.app_role)
    union all
    select c.teacher_id, 'child_class:' || c.title
    from public.parent_student_links l
    join public.class_members m on m.student_id = l.student_id
    join public.classes c on c.class_id = m.class_id, me
    where l.parent_id = me.uid and public.has_role(c.teacher_id, 'teacher'::public.app_role)
  )
  select distinct on (pairs.uid) pairs.uid, coalesce(nullif(btrim(p.full_name), ''), 'Пайдаланушы'), null::text,
         p.avatar_url, r.role, pairs.src
  from pairs
  left join public.profiles p on p.user_id = pairs.uid
  left join public.user_roles r on r.user_id = pairs.uid
  where pairs.uid <> (select uid from me)
  order by pairs.uid, pairs.src;
$$;

-- ================================================================== 6. Дербес сабақтар (D19–D21, D29; api §5.1)
alter table public.lessons
  add column author_id uuid references auth.users(id) on delete set null,
  add column body_md text,
  add column status text not null default 'draft' check (status in ('draft', 'published', 'hidden')),
  add column published_at timestamptz;
alter table public.lessons alter column module_id drop not null;
-- Курс пен модуль кейін алынса да, сабақ өшпейді.
alter table public.lessons drop constraint lessons_module_id_fkey;
alter table public.lessons add constraint lessons_module_id_fkey
  foreign key (module_id) references public.modules(id) on delete set null;

-- Бұрынғы 53 сабақ: автор — курс иесі, мәтін + практика бір body_md-ға, жариялау күйі сақталады.
update public.lessons l
set author_id = c.teacher_id,
    body_md = concat_ws(E'\n\n',
                        nullif(btrim(l.content_body), ''),
                        case when nullif(btrim(l.practice_content), '') is not null
                             then E'## Практика\n\n' || btrim(l.practice_content) end),
    status = case when l.is_published then 'published' else 'draft' end,
    published_at = case when l.is_published then coalesce(l.updated_at, l.created_at) end
from public.modules m
join public.courses c on c.id = m.course_id
where m.id = l.module_id;

alter table public.lessons add constraint lessons_publish_check check (
  status <> 'published' or (char_length(btrim(title)) >= 5 and char_length(btrim(coalesce(body_md, ''))) >= 20)
);
alter table public.lessons add constraint lessons_body_length check (char_length(coalesce(body_md, '')) <= 50000);
alter table public.lessons add constraint lessons_title_length check (char_length(title) <= 200);

create extension if not exists pg_trgm with schema extensions;
create index lessons_title_trgm_idx on public.lessons using gin (title extensions.gin_trgm_ops);
create index lessons_author_idx on public.lessons (author_id);
create index lessons_published_idx on public.lessons (published_at desc) where status = 'published';

create or replace function public._lessons_v2_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin boolean := public.is_platform_admin(auth.uid());
begin
  -- Жасыру мен қайта ашу — тек әкімшінің ісі (content_reviews).
  if tg_op = 'INSERT' and new.status = 'hidden' and not v_admin then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.status is distinct from new.status
     and (old.status = 'hidden' or new.status = 'hidden') and not v_admin then
    raise exception 'LESSON_HIDDEN' using errcode = '42501';
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    new.published_at := now();
  end if;
  new.is_published := new.status = 'published';
  new.updated_at := now();
  return new;
end;
$$;
create trigger lessons_v2_guard before insert or update on public.lessons
  for each row execute function public._lessons_v2_guard();

drop policy if exists "Published lessons readable" on public.lessons;
drop policy if exists "Teachers manage own lessons" on public.lessons;

create policy lessons_read on public.lessons
  for select to authenticated
  using (status = 'published' or author_id = (select auth.uid()) or public.is_platform_admin((select auth.uid())));
create policy lessons_teacher_insert on public.lessons
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.has_role((select auth.uid()), 'teacher'::public.app_role));
create policy lessons_teacher_update on public.lessons
  for update to authenticated
  using (author_id = (select auth.uid()) and public.has_role((select auth.uid()), 'teacher'::public.app_role))
  with check (author_id = (select auth.uid()));
create policy lessons_teacher_delete on public.lessons
  for delete to authenticated
  using (author_id = (select auth.uid()) and public.has_role((select auth.uid()), 'teacher'::public.app_role));

-- Сақталған сабақтар мен жеке жазбалар курстан ажыратылады; жазбаны тек оқушының өзі көреді (D29).
alter table public.student_lesson_bookmarks alter column course_id drop not null;
alter table public.student_lesson_notes alter column course_id drop not null;
alter table public.lesson_attachments alter column course_id drop not null;
alter table public.student_lesson_bookmarks drop constraint student_lesson_bookmarks_course_id_fkey;
alter table public.student_lesson_bookmarks add constraint student_lesson_bookmarks_course_id_fkey
  foreign key (course_id) references public.courses(id) on delete set null;
alter table public.student_lesson_notes drop constraint student_lesson_notes_course_id_fkey;
alter table public.student_lesson_notes add constraint student_lesson_notes_course_id_fkey
  foreign key (course_id) references public.courses(id) on delete set null;
alter table public.lesson_attachments drop constraint lesson_attachments_course_id_fkey;
alter table public.lesson_attachments add constraint lesson_attachments_course_id_fkey
  foreign key (course_id) references public.courses(id) on delete set null;

-- Курсы жоқ сабақта бұрынғы триггер қате бермейді.
create or replace function public.set_course_id_from_lesson()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth', 'storage', 'pg_temp'
as $$
declare
  v_course_id uuid;
begin
  if new.lesson_id is null then
    return new;
  end if;
  select public.get_lesson_course_id(new.lesson_id) into v_course_id;
  if v_course_id is not null and new.course_id is null then
    new.course_id = v_course_id;
  end if;
  return new;
end;
$$;

create or replace function public._lesson_is_published(p_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select exists (select 1 from public.lessons l where l.id = p_lesson_id and l.status = 'published'); $$;

create or replace function public._lesson_is_mine(p_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select exists (select 1 from public.lessons l where l.id = p_lesson_id and l.author_id = auth.uid()); $$;

drop policy if exists "Students can create own lesson bookmarks" on public.student_lesson_bookmarks;
drop policy if exists "Students can delete own lesson bookmarks" on public.student_lesson_bookmarks;
drop policy if exists "Students can view own lesson bookmarks" on public.student_lesson_bookmarks;
create policy lesson_bookmarks_own_select on public.student_lesson_bookmarks
  for select to authenticated using (student_id = (select auth.uid()));
create policy lesson_bookmarks_own_insert on public.student_lesson_bookmarks
  for insert to authenticated
  with check (student_id = (select auth.uid()) and public._lesson_is_published(lesson_id));
create policy lesson_bookmarks_own_delete on public.student_lesson_bookmarks
  for delete to authenticated using (student_id = (select auth.uid()));

drop policy if exists "Students can create own lesson notes" on public.student_lesson_notes;
drop policy if exists "Students can delete own lesson notes" on public.student_lesson_notes;
drop policy if exists "Students can update own lesson notes" on public.student_lesson_notes;
drop policy if exists "Students can view own lesson notes" on public.student_lesson_notes;
create policy lesson_notes_own_select on public.student_lesson_notes
  for select to authenticated using (student_id = (select auth.uid()));
create policy lesson_notes_own_insert on public.student_lesson_notes
  for insert to authenticated
  with check (student_id = (select auth.uid()) and public._lesson_is_published(lesson_id));
create policy lesson_notes_own_update on public.student_lesson_notes
  for update to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));
create policy lesson_notes_own_delete on public.student_lesson_notes
  for delete to authenticated using (student_id = (select auth.uid()));
alter table public.student_lesson_notes add constraint student_lesson_notes_content_length
  check (char_length(content) <= 10000);

drop policy if exists "Teachers can create lesson attachments" on public.lesson_attachments;
drop policy if exists "Teachers can delete lesson attachments" on public.lesson_attachments;
drop policy if exists "Teachers can update lesson attachments" on public.lesson_attachments;
drop policy if exists "Users can view lesson attachments with course access" on public.lesson_attachments;
create policy lesson_attachments_read on public.lesson_attachments
  for select to authenticated
  using (public._lesson_is_published(lesson_id) or public._lesson_is_mine(lesson_id));
create policy lesson_attachments_author_insert on public.lesson_attachments
  for insert to authenticated
  with check (created_by = (select auth.uid()) and public._lesson_is_mine(lesson_id));
create policy lesson_attachments_author_update on public.lesson_attachments
  for update to authenticated
  using (public._lesson_is_mine(lesson_id)) with check (public._lesson_is_mine(lesson_id));
create policy lesson_attachments_author_delete on public.lesson_attachments
  for delete to authenticated using (public._lesson_is_mine(lesson_id));

-- Каталог: тек жарияланғандар, `title` бойынша триграмма іздеу (api §5.1).
create or replace function public.search_lessons(p_query text default null, p_limit int default 20, p_offset int default 0)
returns table (lesson_id uuid, title text, author_id uuid, author_name text, published_at timestamptz,
               excerpt text, media_url text, total bigint)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with q as (select nullif(btrim(coalesce(p_query, '')), '') as qtext),
  found as (
    select l.*, case when (select qtext from q) is null then 0
                     else extensions.similarity(l.title, (select qtext from q)) end as score
    from public.lessons l
    where l.status = 'published'
      and ((select qtext from q) is null
           or l.title ilike '%' || (select qtext from q) || '%'
           or l.title operator(extensions.%) (select qtext from q))
  )
  select f.id, f.title, f.author_id, coalesce(nullif(btrim(p.full_name), ''), 'Мұғалім'), f.published_at,
         left(regexp_replace(coalesce(f.body_md, ''), '[#*_>`\[\]()-]+', '', 'g'), 180), f.media_url,
         count(*) over ()
  from found f
  left join public.profiles p on p.user_id = f.author_id
  order by f.score desc, f.published_at desc nulls last, f.title
  limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Әкімші мұғалім жариялаған сабақты жасырады не қайта ашады (karta §5, content_reviews).
create or replace function public.admin_set_lesson_status(p_lesson_id uuid, p_status text, p_feedback text default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_platform_admin(v_uid) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_status not in ('published', 'hidden') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  update public.lessons l set status = p_status where l.id = p_lesson_id;
  if not found then
    raise exception 'LESSON_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.content_reviews (content_type, content_id, reviewer_id, status, feedback)
  values ('lesson', p_lesson_id, v_uid,
          case when p_status = 'hidden' then 'archived' else 'published' end::public.content_status,
          nullif(btrim(coalesce(p_feedback, '')), ''));
  return p_status;
end;
$$;

revoke all on function public._lessons_v2_guard() from public, anon, authenticated;
-- RLS policy ішінде шақырылады.
revoke all on function public._lesson_is_published(uuid) from public, anon;
revoke all on function public._lesson_is_mine(uuid) from public, anon;
grant execute on function public._lesson_is_published(uuid) to authenticated;
grant execute on function public._lesson_is_mine(uuid) to authenticated;

-- ================================================================== 7. Құқықтар
revoke all on function public.request_parent_link(text) from public, anon;
revoke all on function public.cancel_parent_link_request(uuid) from public, anon;
revoke all on function public.accept_parent_link_request(uuid) from public, anon;
revoke all on function public.decline_parent_link_request(uuid) from public, anon;
revoke all on function public.my_children() from public, anon;
revoke all on function public.my_parent_link_requests() from public, anon;
revoke all on function public.resolve_alert(uuid, text) from public, anon;
revoke all on function public.is_chat_participant(uuid, uuid) from public, anon;
revoke all on function public.can_start_direct_chat(uuid) from public, anon;
revoke all on function public.get_or_create_direct_chat(uuid) from public, anon;
revoke all on function public.open_chat(uuid) from public, anon;
revoke all on function public.send_chat_message(uuid, text) from public, anon;
revoke all on function public.get_my_chat_threads() from public, anon;
revoke all on function public.get_chat_messages(uuid, int) from public, anon;
revoke all on function public.mark_chat_thread_read(uuid) from public, anon;
revoke all on function public.get_chat_contacts() from public, anon;
revoke all on function public.search_lessons(text, int, int) from public, anon;
revoke all on function public.admin_set_lesson_status(uuid, text, text) from public, anon;

grant execute on function public.request_parent_link(text) to authenticated;
grant execute on function public.cancel_parent_link_request(uuid) to authenticated;
grant execute on function public.accept_parent_link_request(uuid) to authenticated;
grant execute on function public.decline_parent_link_request(uuid) to authenticated;
grant execute on function public.my_children() to authenticated;
grant execute on function public.my_parent_link_requests() to authenticated;
grant execute on function public.resolve_alert(uuid, text) to authenticated;
grant execute on function public.is_chat_participant(uuid, uuid) to authenticated;
grant execute on function public.can_start_direct_chat(uuid) to authenticated;
grant execute on function public.get_or_create_direct_chat(uuid) to authenticated;
grant execute on function public.open_chat(uuid) to authenticated;
grant execute on function public.send_chat_message(uuid, text) to authenticated;
grant execute on function public.get_my_chat_threads() to authenticated;
grant execute on function public.get_chat_messages(uuid, int) to authenticated;
grant execute on function public.mark_chat_thread_read(uuid) to authenticated;
grant execute on function public.get_chat_contacts() to authenticated;
grant execute on function public.search_lessons(text, int, int) to authenticated;
grant execute on function public.admin_set_lesson_status(uuid, text, text) to authenticated;
