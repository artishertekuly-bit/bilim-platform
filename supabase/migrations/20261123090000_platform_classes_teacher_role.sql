-- 6-қадам (D25, D33, D38, D83): мұғалім рөлі, сыныптар және сыныпқа қосылу RPC-лары.
-- Тіркелген адам бұрынғыдай тек student болады (handle_new_user өзгермейді); teacher рөлін тек әкімші береді.
-- Оқушы `classes` кестесін тікелей оқымайды: қосылу тек security definer RPC арқылы (api §5.2).

-- ------------------------------------------------------------------ 1. Мұғалім рөлі
alter table public.user_roles drop constraint user_roles_allowed_roles_check;
alter table public.user_roles add constraint user_roles_allowed_roles_check
  check (role in ('student'::public.app_role, 'teacher'::public.app_role, 'admin'::public.app_role));

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

  if p_role not in ('student'::public.app_role, 'teacher'::public.app_role, 'admin'::public.app_role) then
    raise exception 'Only student, teacher and admin roles are allowed';
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

-- ------------------------------------------------------------------ 2. Кестелер
create table public.classes (
  class_id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  -- 6 таңба: бас әріп пен сан, шатасатын 0/O, 1/I/L жоқ (api §5.2)
  join_code text not null unique check (join_code ~ '^[2-9A-HJKMNP-Z]{6}$'),
  created_at timestamptz not null default now()
);
create index classes_teacher_idx on public.classes (teacher_id);

create table public.class_members (
  class_id uuid not null references public.classes(class_id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, student_id)
);
create index class_members_student_idx on public.class_members (student_id);

-- Кодты теріп табуға тосқауыл: сағатына 10 әрекет (api §5.2).
create table public.class_join_attempts (
  attempt_id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index class_join_attempts_user_idx on public.class_join_attempts (user_id, attempted_at desc);

alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.class_join_attempts enable row level security;

revoke all on public.classes, public.class_members, public.class_join_attempts from anon, authenticated;
grant select on public.classes, public.class_members to authenticated;

-- Мұғалім өз сыныптары мен олардың құрамын көреді; оқушыға тікелей оқу жоқ.
create policy classes_teacher_select on public.classes
  for select to authenticated
  using (teacher_id = (select auth.uid()));

create policy class_members_teacher_select on public.class_members
  for select to authenticated
  using (exists (
    select 1 from public.classes c
    where c.class_id = class_members.class_id and c.teacher_id = (select auth.uid())
  ));

-- Examiner мұғалім кезегін сынып пен пән бойынша сүзеді (D38, D78): тек оқу.
grant select on public.classes, public.class_members to examiner_svc;
create policy classes_examiner_read on public.classes for select to examiner_svc using (true);
create policy class_members_examiner_read on public.class_members for select to examiner_svc using (true);

-- ------------------------------------------------------------------ 3. Ішкі көмекшілер
create or replace function public._class_join_code()
returns text
language plpgsql
volatile
set search_path = public, extensions, pg_temp
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';  -- 31 таңба
  code text := '';
  b int;
begin
  while char_length(code) < 6 loop
    b := get_byte(extensions.gen_random_bytes(1), 0);
    if b < 248 then  -- 248 = 8·31: модуль ауытқуы болмас үшін
      code := code || substr(alphabet, 1 + b % 31, 1);
    end if;
  end loop;
  return code;
end;
$$;

create or replace function public._class_code_guard(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.class_join_attempts a
  where a.user_id = p_uid and a.attempted_at < now() - interval '1 day';

  if (select count(*) from public.class_join_attempts a
      where a.user_id = p_uid and a.attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001', hint = 'Бір сағаттан кейін қайталаңыз.';
  end if;
end;
$$;

revoke all on function public._class_join_code() from public, anon, authenticated;
revoke all on function public._class_code_guard(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ 4. RPC (api §5.2)
create or replace function public.create_class(p_title text, p_subject_id uuid)
returns table (class_id uuid, join_code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_code text;
  v_id uuid;
begin
  if v_uid is null or not public.has_role(v_uid, 'teacher'::public.app_role) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if char_length(v_title) not between 1 and 120 then
    raise exception 'INVALID_TITLE' using errcode = '22023';
  end if;
  if not exists (select 1 from public.subjects s where s.id = p_subject_id) then
    raise exception 'SUBJECT_NOT_FOUND' using errcode = '22023';
  end if;

  for attempt in 1..10 loop
    v_code := public._class_join_code();
    begin
      insert into public.classes (teacher_id, subject_id, title, join_code)
      values (v_uid, p_subject_id, v_title, v_code)
      returning classes.class_id into v_id;
      return query select v_id, v_code;
      return;
    exception when unique_violation then
      null;  -- код бос емес: жаңасын шығарамыз
    end;
  end loop;
  raise exception 'JOIN_CODE_EXHAUSTED';
end;
$$;

create or replace function public.rotate_join_code(p_class_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
begin
  if v_uid is null or not public.has_role(v_uid, 'teacher'::public.app_role) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.classes c where c.class_id = p_class_id and c.teacher_id = v_uid) then
    raise exception 'CLASS_NOT_FOUND' using errcode = 'P0002';
  end if;

  for attempt in 1..10 loop
    v_code := public._class_join_code();
    begin
      update public.classes c set join_code = v_code where c.class_id = p_class_id;
      return v_code;  -- ескі код бірден жарамсыз
    exception when unique_violation then
      null;
    end;
  end loop;
  raise exception 'JOIN_CODE_EXHAUSTED';
end;
$$;

create or replace function public.preview_class(p_code text)
returns table (class_id uuid, title text, subject_id uuid, subject text, teacher_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
begin
  if v_uid is null or not public.has_role(v_uid, 'student'::public.app_role) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform public._class_code_guard(v_uid);
  insert into public.class_join_attempts (user_id) values (v_uid);

  return query
    select c.class_id, c.title, c.subject_id, s.name_kk,
           coalesce(nullif(btrim(p.full_name), ''), 'Мұғалім')
    from public.classes c
    join public.subjects s on s.id = c.subject_id
    left join public.profiles p on p.user_id = c.teacher_id
    where c.join_code = v_code;
end;
$$;

-- Код табылмаса null қайтарады (қате емес), сонда сәтсіз әрекет есепте қалады.
create or replace function public.join_class(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_class uuid;
begin
  if v_uid is null or not public.has_role(v_uid, 'student'::public.app_role) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform public._class_code_guard(v_uid);

  select c.class_id into v_class from public.classes c where c.join_code = v_code;
  if v_class is null then
    insert into public.class_join_attempts (user_id) values (v_uid);
    return null;
  end if;

  insert into public.class_members (class_id, student_id)
  values (v_class, v_uid)
  on conflict do nothing;  -- қайта қосылу қате емес
  return v_class;
end;
$$;

create or replace function public.my_classes()
returns table (class_id uuid, title text, subject_id uuid, subject text, teacher_id uuid, teacher_name text,
               joined_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.class_id, c.title, c.subject_id, s.name_kk, c.teacher_id,
         coalesce(nullif(btrim(p.full_name), ''), 'Мұғалім'), m.joined_at
  from public.class_members m
  join public.classes c on c.class_id = m.class_id
  join public.subjects s on s.id = c.subject_id
  left join public.profiles p on p.user_id = c.teacher_id
  where m.student_id = auth.uid()
  order by m.joined_at desc;
$$;

create or replace function public.remove_class_member(p_class_id uuid, p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.has_role(v_uid, 'teacher'::public.app_role) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.classes c where c.class_id = p_class_id and c.teacher_id = v_uid) then
    raise exception 'CLASS_NOT_FOUND' using errcode = 'P0002';
  end if;
  delete from public.class_members m where m.class_id = p_class_id and m.student_id = p_student_id;
end;
$$;

-- Мұғалім панеліне (D83): сыныптар оқушы санымен және сынып құрамы атымен.
create or replace function public.teacher_classes()
returns table (class_id uuid, title text, subject_id uuid, subject text, join_code text, created_at timestamptz,
               member_count int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.class_id, c.title, c.subject_id, s.name_kk, c.join_code, c.created_at,
         (select count(*)::int from public.class_members m where m.class_id = c.class_id)
  from public.classes c
  join public.subjects s on s.id = c.subject_id
  where c.teacher_id = auth.uid() and public.has_role(auth.uid(), 'teacher'::public.app_role)
  order by c.created_at desc;
$$;

-- p_class_id = null: мұғалімнің барлық сыныбы (растау кезегінде оқушының атын көрсету үшін).
create or replace function public.class_roster(p_class_id uuid default null)
returns table (class_id uuid, student_id uuid, full_name text, avatar_url text, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.has_role(v_uid, 'teacher'::public.app_role) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_class_id is not null
     and not exists (select 1 from public.classes c where c.class_id = p_class_id and c.teacher_id = v_uid) then
    raise exception 'CLASS_NOT_FOUND' using errcode = 'P0002';
  end if;
  return query
    select m.class_id, m.student_id, coalesce(nullif(btrim(p.full_name), ''), 'Оқушы'), p.avatar_url, m.joined_at
    from public.class_members m
    join public.classes c on c.class_id = m.class_id
    left join public.profiles p on p.user_id = m.student_id
    where c.teacher_id = v_uid and (p_class_id is null or m.class_id = p_class_id)
    order by p.full_name nulls last, m.joined_at;
end;
$$;

revoke all on function public.create_class(text, uuid) from public, anon;
revoke all on function public.rotate_join_code(uuid) from public, anon;
revoke all on function public.preview_class(text) from public, anon;
revoke all on function public.join_class(text) from public, anon;
revoke all on function public.my_classes() from public, anon;
revoke all on function public.remove_class_member(uuid, uuid) from public, anon;
revoke all on function public.teacher_classes() from public, anon;
revoke all on function public.class_roster(uuid) from public, anon;

grant execute on function public.create_class(text, uuid) to authenticated;
grant execute on function public.rotate_join_code(uuid) to authenticated;
grant execute on function public.preview_class(text) to authenticated;
grant execute on function public.join_class(text) to authenticated;
grant execute on function public.my_classes() to authenticated;
grant execute on function public.remove_class_member(uuid, uuid) to authenticated;
grant execute on function public.teacher_classes() to authenticated;
grant execute on function public.class_roster(uuid) to authenticated;
