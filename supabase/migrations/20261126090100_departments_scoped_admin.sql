-- D90: әкімші — білім басқармасының басшысы, платформа иесі емес.
-- Ішкі рөл атаулары: 'admin' — платформа иесі (бұрынғы барлық құқық пен policy өзгермейді),
-- 'head' — басқарма басшысы. Басшы тек өз басқармасындағы мұғалімдерді және солардың сыныптарындағы
-- оқушыларды көреді. Мұғалім басқарма кодымен өтінім береді, басшы растайды. Ата-ана рөлін адам
-- тіркелгенде өзі таңдайды. Ешбір кесте мен дерек өшірілмейді.

-- ================================================================== 1. Рөлдер
alter table public.user_roles drop constraint user_roles_allowed_roles_check;
alter table public.user_roles add constraint user_roles_allowed_roles_check
  check (role in ('student'::public.app_role, 'teacher'::public.app_role, 'parent'::public.app_role,
                  'head'::public.app_role, 'admin'::public.app_role));

create or replace function public._set_user_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  insert into public.user_roles (user_id, role)
  values (p_user_id, p_role)
  on conflict (user_id) do update set role = excluded.role;

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', p_role::text)
  where id = p_user_id;
end;
$$;

-- ================================================================== 2. Кестелер
create table public.departments (
  department_id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 160),
  region text check (region is null or char_length(btrim(region)) between 2 and 120),
  -- Сынып кодымен бірдей әліпби (0/O, 1/I/L жоқ).
  join_code text not null unique check (join_code ~ '^[2-9A-HJKMNP-Z]{6}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.department_members (
  department_id uuid not null references public.departments(department_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null check (member_role in ('head', 'teacher')),
  status text not null default 'pending' check (status in ('pending', 'active')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  constraint department_members_pkey primary key (department_id, user_id),
  constraint department_members_approved_check check ((status = 'active') = (approved_at is not null))
);
-- Мұғалім бір ғана басқармада (не бір өтінімде), басшы бір ғана басқарманы басқарады.
create unique index department_members_one_teacher_idx on public.department_members (user_id) where member_role = 'teacher';
create unique index department_members_one_head_idx on public.department_members (user_id) where member_role = 'head';
create index department_members_dept_idx on public.department_members (department_id, member_role, status);

alter table public.departments enable row level security;
alter table public.department_members enable row level security;
-- Тікелей оқу да, жазу да жоқ: бәрі төмендегі security definer RPC арқылы.
revoke all on public.departments, public.department_members from anon, authenticated;

-- ================================================================== 3. Ішкі көмекшілер
create or replace function public._head_department(p_uid uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select dm.department_id
  from public.department_members dm
  where dm.user_id = p_uid and dm.member_role = 'head' and dm.status = 'active'
    and public.has_role(p_uid, 'head'::public.app_role)
  limit 1;
$$;

create or replace function public._head_has_teacher(p_head uuid, p_teacher uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_head is not null and p_teacher is not null and exists (
    select 1 from public.department_members t
    where t.user_id = p_teacher and t.member_role = 'teacher' and t.status = 'active'
      and t.department_id = public._head_department(p_head)
  );
$$;

-- RLS policy ішінде шақырылады: тек ағымдағы пайдаланушы туралы жауап береді.
create or replace function public._me_head_of(p_teacher uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select public._head_has_teacher(auth.uid(), p_teacher); $$;

create or replace function public._require_owner()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.has_role(v_uid, 'admin'::public.app_role) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create or replace function public._require_head()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_dept uuid := public._head_department(auth.uid());
begin
  if auth.uid() is null or v_dept is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return v_dept;
end;
$$;

create or replace function public._department_code()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  for attempt in 1..20 loop
    v_code := public._class_join_code();
    if not exists (select 1 from public.departments d where d.join_code = v_code)
       and not exists (select 1 from public.classes c where c.join_code = v_code) then
      return v_code;
    end if;
  end loop;
  raise exception 'JOIN_CODE_EXHAUSTED';
end;
$$;

-- ================================================================== 4. Платформа иесі
create or replace function public.owner_departments()
returns table (department_id uuid, name text, region text, join_code text, created_at timestamptz,
               heads text, teacher_count int, pending_count int, student_count int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public._require_owner();
  return query
    select d.department_id, d.name, d.region, d.join_code, d.created_at,
           (select string_agg(coalesce(nullif(btrim(p.full_name), ''), 'Басшы'), ', ' order by p.full_name)
              from public.department_members h left join public.profiles p on p.user_id = h.user_id
              where h.department_id = d.department_id and h.member_role = 'head'),
           (select count(*)::int from public.department_members t
              where t.department_id = d.department_id and t.member_role = 'teacher' and t.status = 'active'),
           (select count(*)::int from public.department_members t
              where t.department_id = d.department_id and t.member_role = 'teacher' and t.status = 'pending'),
           (select count(distinct m.student_id)::int
              from public.department_members t
              join public.classes c on c.teacher_id = t.user_id
              join public.class_members m on m.class_id = c.class_id
              where t.department_id = d.department_id and t.member_role = 'teacher' and t.status = 'active')
    from public.departments d
    order by d.created_at desc;
end;
$$;

create or replace function public.owner_department_members(p_department_id uuid)
returns table (user_id uuid, full_name text, email text, member_role text, status text, requested_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  perform public._require_owner();
  return query
    select dm.user_id, coalesce(nullif(btrim(p.full_name), ''), split_part(u.email::text, '@', 1)), u.email::text,
           dm.member_role, dm.status, dm.requested_at
    from public.department_members dm
    join auth.users u on u.id = dm.user_id
    left join public.profiles p on p.user_id = dm.user_id
    where dm.department_id = p_department_id
    order by (dm.member_role = 'head') desc, dm.status desc, p.full_name nulls last;
end;
$$;

create or replace function public.owner_create_department(p_name text, p_region text default null)
returns table (department_id uuid, join_code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := public._require_owner();
  v_name text := btrim(coalesce(p_name, ''));
  v_region text := nullif(btrim(coalesce(p_region, '')), '');
  v_code text;
  v_id uuid;
begin
  if char_length(v_name) not between 3 and 160 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;
  if v_region is not null and char_length(v_region) not between 2 and 120 then
    raise exception 'INVALID_REGION' using errcode = '22023';
  end if;
  v_code := public._department_code();
  insert into public.departments (name, region, join_code, created_by)
  values (v_name, v_region, v_code, v_uid)
  returning departments.department_id into v_id;
  return query select v_id, v_code;
end;
$$;

create or replace function public.owner_rotate_department_code(p_department_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  perform public._require_owner();
  v_code := public._department_code();
  update public.departments d set join_code = v_code where d.department_id = p_department_id;
  if not found then
    raise exception 'DEPARTMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_code;
end;
$$;

-- Басшыны email бойынша тағайындайды. Мұғалім сыныбы барда басшы бола алмайды (сыныптары иесіз қалады).
create or replace function public.owner_appoint_head(p_department_id uuid, p_email text)
returns table (user_id uuid, full_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_owner uuid := public._require_owner();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user uuid;
  v_role public.app_role;
begin
  if not exists (select 1 from public.departments d where d.department_id = p_department_id) then
    raise exception 'DEPARTMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  select u.id into v_user from auth.users u where lower(u.email::text) = v_email limit 1;
  if v_user is null then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;
  select r.role into v_role from public.user_roles r where r.user_id = v_user;
  if v_role in ('admin'::public.app_role, 'parent'::public.app_role) then
    raise exception 'ROLE_CONFLICT' using errcode = '22023';
  end if;
  if exists (select 1 from public.department_members dm
             where dm.user_id = v_user and dm.member_role = 'head' and dm.department_id <> p_department_id) then
    raise exception 'ALREADY_HEAD' using errcode = '22023';
  end if;
  if exists (select 1 from public.classes c where c.teacher_id = v_user) then
    raise exception 'TEACHER_HAS_CLASSES' using errcode = '22023';
  end if;

  delete from public.department_members dm where dm.user_id = v_user and dm.member_role = 'teacher';
  insert into public.department_members (department_id, user_id, member_role, status, approved_at, approved_by)
  values (p_department_id, v_user, 'head', 'active', now(), v_owner)
  on conflict on constraint department_members_pkey do update
    set member_role = 'head', status = 'active', approved_at = now(), approved_by = v_owner;
  perform public._set_user_role(v_user, 'head'::public.app_role);

  return query
    select v_user, coalesce((select nullif(btrim(p.full_name), '') from public.profiles p where p.user_id = v_user),
                            split_part(v_email, '@', 1));
end;
$$;

create or replace function public.owner_remove_head(p_department_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._require_owner();
  delete from public.department_members dm
  where dm.department_id = p_department_id and dm.user_id = p_user_id and dm.member_role = 'head';
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if public.has_role(p_user_id, 'head'::public.app_role) then
    perform public._set_user_role(p_user_id, 'student'::public.app_role);
  end if;
end;
$$;

-- Пайдаланушылар тізімі email-імен (тек иесі көреді).
create or replace function public.owner_users(p_query text default null, p_role text default null,
                                              p_limit int default 200, p_offset int default 0)
returns table (user_id uuid, full_name text, email text, avatar_url text, role text, created_at timestamptz,
               department text, total bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  perform public._require_owner();
  return query
    select u.id,
           coalesce(nullif(btrim(p.full_name), ''), split_part(u.email::text, '@', 1)),
           u.email::text, p.avatar_url, coalesce(r.role::text, 'student'), u.created_at,
           (select d.name from public.department_members dm
              join public.departments d on d.department_id = dm.department_id
              where dm.user_id = u.id and dm.status = 'active' limit 1),
           count(*) over ()
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    left join public.user_roles r on r.user_id = u.id
    where (p_role is null or coalesce(r.role::text, 'student') = p_role)
      and (v_q is null or p.full_name ilike '%' || v_q || '%' or u.email::text ilike '%' || v_q || '%')
    order by u.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Рөлді тек платформа иесі береді: оқушы, мұғалім, ата-ана. Басшы — басқарма арқылы, иесі — тек SQL арқылы.
create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.app_role)
returns public.app_role
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := public._require_owner();
  v_current public.app_role;
begin
  if p_role not in ('student'::public.app_role, 'teacher'::public.app_role, 'parent'::public.app_role) then
    raise exception 'ROLE_NOT_ASSIGNABLE' using errcode = '22023';
  end if;
  if p_user_id = v_owner then
    raise exception 'CANNOT_CHANGE_SELF' using errcode = '22023';
  end if;
  select r.role into v_current from public.user_roles r where r.user_id = p_user_id;
  if v_current in ('admin'::public.app_role, 'head'::public.app_role) then
    raise exception 'ROLE_CONFLICT' using errcode = '22023';
  end if;
  if p_role <> 'teacher'::public.app_role then
    delete from public.department_members dm where dm.user_id = p_user_id and dm.member_role = 'teacher';
  end if;
  perform public._set_user_role(p_user_id, p_role);
  return p_role;
end;
$$;

-- ================================================================== 5. Басқарма басшысы
create or replace function public.head_overview()
returns table (department_id uuid, name text, region text, join_code text, teacher_count int, pending_count int,
               class_count int, student_count int, sessions_7d int, avg_p_7d numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_dept uuid := public._require_head();
begin
  return query
    with t as (
      select dm.user_id from public.department_members dm
      where dm.department_id = v_dept and dm.member_role = 'teacher' and dm.status = 'active'
    ),
    cls as (select c.class_id from public.classes c where c.teacher_id in (select t.user_id from t)),
    st as (select distinct m.student_id from public.class_members m where m.class_id in (select cls.class_id from cls)),
    ses as (
      select s.session_id from examiner.sessions s
      where s.student_id in (select st.student_id from st)
        and s.status = 'completed' and s.ended_at > now() - interval '7 days'
    )
    select d.department_id, d.name, d.region, d.join_code,
           (select count(*)::int from t),
           (select count(*)::int from public.department_members dm
              where dm.department_id = v_dept and dm.member_role = 'teacher' and dm.status = 'pending'),
           (select count(*)::int from cls),
           (select count(*)::int from st),
           (select count(*)::int from ses),
           (select round(avg(r.p)::numeric, 3) from examiner.session_results r
              where r.session_id in (select ses.session_id from ses))
    from public.departments d
    where d.department_id = v_dept;
end;
$$;

create or replace function public.head_teachers()
returns table (user_id uuid, full_name text, email text, avatar_url text, status text, requested_at timestamptz,
               approved_at timestamptz, class_count int, student_count int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_dept uuid := public._require_head();
begin
  return query
    select dm.user_id,
           coalesce(nullif(btrim(p.full_name), ''), split_part(u.email::text, '@', 1)),
           u.email::text, p.avatar_url, dm.status, dm.requested_at, dm.approved_at,
           (select count(*)::int from public.classes c where c.teacher_id = dm.user_id),
           (select count(distinct m.student_id)::int from public.classes c
              join public.class_members m on m.class_id = c.class_id where c.teacher_id = dm.user_id)
    from public.department_members dm
    join auth.users u on u.id = dm.user_id
    left join public.profiles p on p.user_id = dm.user_id
    where dm.department_id = v_dept and dm.member_role = 'teacher'
    order by (dm.status = 'pending') desc, p.full_name nulls last;
end;
$$;

-- Оқушы басқармаға мұғалімінің сыныбы арқылы кіреді. Емтихан нәтижесі — тек жиынтық (сессия саны, орташа P).
create or replace function public.head_students(p_query text default null)
returns table (student_id uuid, full_name text, avatar_url text, classes text, teachers text, joined_at timestamptz,
               sessions_done int, avg_p numeric, last_activity_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_dept uuid := public._require_head();
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  return query
    with mem as (
      select m.student_id, c.title, c.teacher_id, m.joined_at
      from public.class_members m
      join public.classes c on c.class_id = m.class_id
      join public.department_members t
        on t.user_id = c.teacher_id and t.member_role = 'teacher' and t.status = 'active' and t.department_id = v_dept
    ),
    grp as (
      select mem.student_id,
             string_agg(distinct mem.title, ', ') as classes,
             string_agg(distinct coalesce(nullif(btrim(tp.full_name), ''), 'Мұғалім'), ', ') as teachers,
             min(mem.joined_at) as joined_at
      from mem
      left join public.profiles tp on tp.user_id = mem.teacher_id
      group by mem.student_id
    )
    select g.student_id, coalesce(nullif(btrim(p.full_name), ''), 'Оқушы'), p.avatar_url, g.classes, g.teachers, g.joined_at,
           (select count(*)::int from examiner.sessions s where s.student_id = g.student_id and s.status = 'completed'),
           (select round(avg(r.p)::numeric, 3) from examiner.sessions s
              join examiner.session_results r on r.session_id = s.session_id
              where s.student_id = g.student_id and s.status = 'completed'),
           (select max(s.last_activity_at) from examiner.sessions s where s.student_id = g.student_id)
    from grp g
    left join public.profiles p on p.user_id = g.student_id
    where v_q is null or p.full_name ilike '%' || v_q || '%'
    order by p.full_name nulls last
    limit 1000;
end;
$$;

create or replace function public.head_approve_teacher(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dept uuid := public._require_head();
  v_role public.app_role;
begin
  if not exists (select 1 from public.department_members dm
                 where dm.department_id = v_dept and dm.user_id = p_user_id
                   and dm.member_role = 'teacher' and dm.status = 'pending') then
    raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  select r.role into v_role from public.user_roles r where r.user_id = p_user_id;
  v_role := coalesce(v_role, 'student'::public.app_role);
  if v_role not in ('student'::public.app_role, 'teacher'::public.app_role) then
    raise exception 'ROLE_CONFLICT' using errcode = '22023';
  end if;
  update public.department_members dm
  set status = 'active', approved_at = now(), approved_by = auth.uid()
  where dm.department_id = v_dept and dm.user_id = p_user_id and dm.member_role = 'teacher';
  if v_role <> 'teacher'::public.app_role then
    perform public._set_user_role(p_user_id, 'teacher'::public.app_role);
  end if;
end;
$$;

create or replace function public.head_decline_teacher(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dept uuid := public._require_head();
begin
  delete from public.department_members dm
  where dm.department_id = v_dept and dm.user_id = p_user_id and dm.member_role = 'teacher' and dm.status = 'pending';
  if not found then
    raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

-- Мұғалім басқармадан шығарылады, бірақ рөлі мен сыныптары қалады.
create or replace function public.head_remove_teacher(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dept uuid := public._require_head();
begin
  delete from public.department_members dm
  where dm.department_id = v_dept and dm.user_id = p_user_id and dm.member_role = 'teacher' and dm.status = 'active';
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.head_rotate_code()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dept uuid := public._require_head();
  v_code text := public._department_code();
begin
  update public.departments d set join_code = v_code where d.department_id = v_dept;
  return v_code;  -- ескі код бірден жарамсыз
end;
$$;

-- ================================================================== 6. Мұғалімнің өтінімі
create or replace function public.my_department()
returns table (department_id uuid, name text, region text, member_role text, status text, join_code text,
               requested_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.department_id, d.name, d.region, dm.member_role, dm.status,
         case when dm.member_role = 'head' and dm.status = 'active' then d.join_code end,
         dm.requested_at
  from public.department_members dm
  join public.departments d on d.department_id = dm.department_id
  where dm.user_id = auth.uid()
  order by (dm.member_role = 'head') desc, dm.requested_at desc
  limit 1;
$$;

create or replace function public.preview_department(p_code text)
returns table (department_id uuid, name text, region text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
begin
  if v_uid is null
     or not (public.has_role(v_uid, 'student'::public.app_role) or public.has_role(v_uid, 'teacher'::public.app_role)) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform public._class_code_guard(v_uid);
  insert into public.class_join_attempts (user_id) values (v_uid);
  return query select d.department_id, d.name, d.region from public.departments d where d.join_code = v_code;
end;
$$;

-- Код табылмаса бос жауап қайтарады, сонда сәтсіз әрекет есепте қалады.
create or replace function public.request_department_join(p_code text)
returns table (department_id uuid, name text, status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_dept uuid;
  v_existing uuid;
  v_status text;
begin
  if v_uid is null
     or not (public.has_role(v_uid, 'student'::public.app_role) or public.has_role(v_uid, 'teacher'::public.app_role)) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform public._class_code_guard(v_uid);

  select d.department_id into v_dept from public.departments d where d.join_code = v_code;
  if v_dept is null then
    insert into public.class_join_attempts (user_id) values (v_uid);
    return;
  end if;

  select dm.department_id, dm.status into v_existing, v_status
  from public.department_members dm where dm.user_id = v_uid and dm.member_role = 'teacher';
  if v_existing is not null and v_existing <> v_dept then
    raise exception 'ALREADY_IN_DEPARTMENT' using errcode = '22023';
  end if;
  if v_existing is null then
    insert into public.department_members (department_id, user_id, member_role, status)
    values (v_dept, v_uid, 'teacher', 'pending');
    v_status := 'pending';
  end if;
  return query select d.department_id, d.name, v_status from public.departments d where d.department_id = v_dept;
end;
$$;

create or replace function public.cancel_department_request()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.department_members dm
  where dm.user_id = auth.uid() and dm.member_role = 'teacher' and dm.status = 'pending';
$$;

create or replace function public.leave_department()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.department_members dm
  where dm.user_id = auth.uid() and dm.member_role = 'teacher' and dm.status = 'active';
$$;

-- ================================================================== 7. Сабақ модерациясы басқарма аясында
create or replace function public._lessons_v2_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Жасыру мен қайта ашу — платформа иесінің не авторы тұрған басқарма басшысының ісі.
  v_admin boolean := public.is_platform_admin(auth.uid()) or public._head_has_teacher(auth.uid(), new.author_id);
begin
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

create or replace function public.admin_set_lesson_status(p_lesson_id uuid, p_status text, p_feedback text default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_current text;
begin
  if v_uid is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_status not in ('published', 'hidden') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  select l.author_id, l.status into v_author, v_current from public.lessons l where l.id = p_lesson_id;
  if not found then
    raise exception 'LESSON_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (public.is_platform_admin(v_uid) or public._head_has_teacher(v_uid, v_author)) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  -- Жобаны модератор жарияламайды.
  if v_current not in ('published', 'hidden') then
    raise exception 'LESSON_IS_DRAFT' using errcode = '22023';
  end if;
  update public.lessons l set status = p_status where l.id = p_lesson_id;
  insert into public.content_reviews (content_type, content_id, reviewer_id, status, feedback)
  values ('lesson', p_lesson_id, v_uid,
          case when p_status = 'hidden' then 'archived' else 'published' end::public.content_status,
          nullif(btrim(coalesce(p_feedback, '')), ''));
  return p_status;
end;
$$;

-- Модерация тізімі: иесіне барлығы, басшыға тек өз мұғалімдерінікі. feedback — соңғы шешімнің себебі.
create or replace function public.moderation_lessons()
returns table (id uuid, title text, status text, updated_at timestamptz, published_at timestamptz, author_id uuid,
               author_name text, feedback text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_owner boolean := v_uid is not null and public.is_platform_admin(v_uid);
  v_dept uuid := public._head_department(v_uid);
begin
  if not v_owner and v_dept is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
    select l.id, l.title, l.status, l.updated_at, l.published_at, l.author_id,
           coalesce(nullif(btrim(p.full_name), ''), 'Мұғалім'),
           (select cr.feedback from public.content_reviews cr
              where cr.content_type = 'lesson' and cr.content_id = l.id
              order by cr.reviewed_at desc limit 1)
    from public.lessons l
    left join public.profiles p on p.user_id = l.author_id
    where l.status in ('published', 'hidden')
      and (v_owner or exists (
        select 1 from public.department_members t
        where t.user_id = l.author_id and t.department_id = v_dept and t.member_role = 'teacher' and t.status = 'active'))
    order by l.updated_at desc
    limit 300;
end;
$$;

drop policy if exists lessons_read on public.lessons;
create policy lessons_read on public.lessons
  for select to authenticated
  using (status = 'published' or author_id = (select auth.uid()) or public.is_platform_admin((select auth.uid()))
         or (status = 'hidden' and public._me_head_of(author_id)));

-- ================================================================== 8. Ата-ана рөлін тіркелгенде таңдау
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
  v_full_name text;
  v_avatar_url text;
  v_role public.app_role;
begin
  v_full_name :=
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, ''), '@', 1),
      ''
    );

  v_avatar_url :=
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', '')), '');

  insert into public.profiles (user_id, full_name, avatar_url, created_at, updated_at)
  values (new.id, v_full_name, v_avatar_url, now(), now())
  on conflict (user_id) do update
  set
    full_name = case when nullif(trim(excluded.full_name), '') is not null then excluded.full_name
                     else public.profiles.full_name end,
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  -- Ашық тіркелуде тек екі рөл: оқушы (әдепкі) не ата-ана (D90). Басқа сұралған рөл елемейді.
  v_role := case when lower(coalesce(new.raw_user_meta_data ->> 'role', '')) = 'parent'
                 then 'parent'::public.app_role else 'student'::public.app_role end;

  insert into public.user_roles (user_id, role, created_at)
  values (new.id, v_role, now())
  on conflict (user_id) do nothing;

  update auth.users
  set raw_user_meta_data =
    (coalesce(raw_user_meta_data, '{}'::jsonb) - 'requested_role' - 'user_role')
    || jsonb_build_object('role', v_role::text)
  where id = new.id;

  return new;
end;
$$;

-- Google арқылы тіркелгенде рөл кейін сұралады: тек жаңа (1 сағат), әлі ешқайда қосылмаған оқушы ата-ана бола алады.
create or replace function public.claim_requested_role(p_requested_role text default null)
returns public.app_role
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
  v_user_id uuid := auth.uid();
  v_effective_role public.app_role;
  v_created timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select ur.role, ur.created_at into v_effective_role, v_created
  from public.user_roles as ur where ur.user_id = v_user_id limit 1;

  if v_effective_role is null then
    insert into public.user_roles (user_id, role, created_at)
    values (v_user_id, 'student'::public.app_role, now())
    on conflict (user_id) do nothing;
    select ur.role, ur.created_at into v_effective_role, v_created
    from public.user_roles as ur where ur.user_id = v_user_id limit 1;
  end if;

  v_effective_role := coalesce(v_effective_role, 'student'::public.app_role);

  if lower(coalesce(p_requested_role, '')) = 'parent'
     and v_effective_role = 'student'::public.app_role
     and v_created > now() - interval '1 hour'
     and not exists (select 1 from public.class_members m where m.student_id = v_user_id)
     and not exists (select 1 from public.department_members dm where dm.user_id = v_user_id) then
    update public.user_roles set role = 'parent'::public.app_role where user_id = v_user_id;
    v_effective_role := 'parent'::public.app_role;
  end if;

  -- Metadata тек ақпарат үшін: қорғалған БД рөлімен бірдей.
  update auth.users
  set raw_user_meta_data =
    (coalesce(raw_user_meta_data, '{}'::jsonb) - 'requested_role' - 'user_role')
    || jsonb_build_object('role', v_effective_role::text)
  where id = v_user_id;

  return v_effective_role;
end;
$$;

-- ================================================================== 9. Құқықтар
revoke all on function public._set_user_role(uuid, public.app_role) from public, anon, authenticated;
revoke all on function public._head_department(uuid) from public, anon, authenticated;
revoke all on function public._head_has_teacher(uuid, uuid) from public, anon, authenticated;
revoke all on function public._require_owner() from public, anon, authenticated;
revoke all on function public._require_head() from public, anon, authenticated;
revoke all on function public._department_code() from public, anon, authenticated;
revoke all on function public._me_head_of(uuid) from public, anon;
grant execute on function public._me_head_of(uuid) to authenticated;

revoke all on function public.owner_departments() from public, anon;
revoke all on function public.owner_department_members(uuid) from public, anon;
revoke all on function public.owner_create_department(text, text) from public, anon;
revoke all on function public.owner_rotate_department_code(uuid) from public, anon;
revoke all on function public.owner_appoint_head(uuid, text) from public, anon;
revoke all on function public.owner_remove_head(uuid, uuid) from public, anon;
revoke all on function public.owner_users(text, text, int, int) from public, anon;
revoke all on function public.admin_set_user_role(uuid, public.app_role) from public, anon;
revoke all on function public.head_overview() from public, anon;
revoke all on function public.head_teachers() from public, anon;
revoke all on function public.head_students(text) from public, anon;
revoke all on function public.head_approve_teacher(uuid) from public, anon;
revoke all on function public.head_decline_teacher(uuid) from public, anon;
revoke all on function public.head_remove_teacher(uuid) from public, anon;
revoke all on function public.head_rotate_code() from public, anon;
revoke all on function public.my_department() from public, anon;
revoke all on function public.preview_department(text) from public, anon;
revoke all on function public.request_department_join(text) from public, anon;
revoke all on function public.cancel_department_request() from public, anon;
revoke all on function public.leave_department() from public, anon;
revoke all on function public.moderation_lessons() from public, anon;
revoke all on function public.admin_set_lesson_status(uuid, text, text) from public, anon;

grant execute on function public.owner_departments() to authenticated;
grant execute on function public.owner_department_members(uuid) to authenticated;
grant execute on function public.owner_create_department(text, text) to authenticated;
grant execute on function public.owner_rotate_department_code(uuid) to authenticated;
grant execute on function public.owner_appoint_head(uuid, text) to authenticated;
grant execute on function public.owner_remove_head(uuid, uuid) to authenticated;
grant execute on function public.owner_users(text, text, int, int) to authenticated;
grant execute on function public.admin_set_user_role(uuid, public.app_role) to authenticated;
grant execute on function public.head_overview() to authenticated;
grant execute on function public.head_teachers() to authenticated;
grant execute on function public.head_students(text) to authenticated;
grant execute on function public.head_approve_teacher(uuid) to authenticated;
grant execute on function public.head_decline_teacher(uuid) to authenticated;
grant execute on function public.head_remove_teacher(uuid) to authenticated;
grant execute on function public.head_rotate_code() to authenticated;
grant execute on function public.my_department() to authenticated;
grant execute on function public.preview_department(text) to authenticated;
grant execute on function public.request_department_join(text) to authenticated;
grant execute on function public.cancel_department_request() to authenticated;
grant execute on function public.leave_department() to authenticated;
grant execute on function public.moderation_lessons() to authenticated;
grant execute on function public.admin_set_lesson_status(uuid, text, text) to authenticated;
