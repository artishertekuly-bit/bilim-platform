-- Simulation Lab (D92): simulation catalogue, learners' attempts and the future asset contract.
-- Additive only: no existing table, policy or function is changed.
--
-- Security model
--   * Clients never write these tables directly. Attempts go through save_simulation_attempt(),
--     which takes the user id from auth.uid() and never from the request body.
--   * A learner reads only their own attempts; a teacher reads the attempts of students in
--     their classes (public._teacher_has_student). Nobody else, and never anon.
--   * The catalogue row is only a key for the code-side registry: no code is ever loaded from it.
--   * simulation_assets describes files in Supabase Storage (never on Render's disk) and enforces
--     licence metadata. No upload path exists yet: rows are written by the service role only.

create table if not exists public.simulations (
  simulation_id   uuid primary key default gen_random_uuid(),
  slug            text not null unique
                  check (char_length(slug) between 3 and 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  subject_id      uuid references public.subjects(id) on delete set null,
  title           text not null check (char_length(title) between 3 and 80),
  grade_min       smallint not null check (grade_min between 1 and 11),
  grade_max       smallint not null check (grade_max between 1 and 11),
  current_version int not null default 1 check (current_version > 0),
  is_published    boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint simulations_grade_range check (grade_min <= grade_max)
);

create table if not exists public.simulation_attempts (
  attempt_id    uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.simulations(simulation_id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  sim_version   int not null check (sim_version > 0),
  params        jsonb not null check (jsonb_typeof(params) = 'object' and pg_column_size(params) <= 4096),
  outputs       jsonb not null check (jsonb_typeof(outputs) = 'object' and pg_column_size(outputs) <= 8192),
  hypothesis    text check (hypothesis is null or char_length(hypothesis) <= 40),
  check_answer  text check (check_answer is null or char_length(check_answer) <= 40),
  check_correct boolean,
  created_at    timestamptz not null default now()
);

create index if not exists simulation_attempts_user_created_idx on public.simulation_attempts (user_id, created_at desc);
create index if not exists simulation_attempts_sim_created_idx on public.simulation_attempts (simulation_id, created_at desc);

create table if not exists public.simulation_assets (
  asset_id      uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.simulations(simulation_id) on delete cascade,
  storage_path  text not null unique
                check (char_length(storage_path) <= 300 and storage_path ~ '^simulation-assets/[a-z0-9-]+/[A-Za-z0-9._/-]+$'),
  kind          text not null check (kind in ('model', 'texture', 'audio')),
  mime_type     text not null
                check (mime_type in ('model/gltf-binary', 'image/webp', 'image/png', 'image/jpeg', 'audio/mpeg', 'audio/ogg')),
  bytes         int not null check (bytes > 0 and bytes <= 15728640),
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  license       text not null check (license in ('CC0-1.0', 'CC-BY-4.0', 'own-work')),
  author        text not null check (char_length(author) between 1 and 160),
  source_url    text check (source_url is null or (char_length(source_url) <= 500 and source_url ~ '^https://')),
  attribution   text check (attribution is null or char_length(attribution) <= 300),
  created_at    timestamptz not null default now(),
  constraint simulation_assets_attribution check (license <> 'CC-BY-4.0' or attribution is not null)
);

create index if not exists simulation_assets_simulation_idx on public.simulation_assets (simulation_id);

alter table public.simulations enable row level security;
alter table public.simulation_attempts enable row level security;
alter table public.simulation_assets enable row level security;

revoke all on public.simulations, public.simulation_attempts, public.simulation_assets from public, anon, authenticated;
grant select on public.simulations, public.simulation_attempts, public.simulation_assets to authenticated;

-- RLS helper: does the caller teach this student? Wraps the internal helper for use in policies.
create or replace function public._me_teacher_of(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select public._teacher_has_student(auth.uid(), p_student); $$;

revoke all on function public._me_teacher_of(uuid) from public, anon;
grant execute on function public._me_teacher_of(uuid) to authenticated;

drop policy if exists simulations_read on public.simulations;
create policy simulations_read on public.simulations
  for select to authenticated
  using (is_published);

drop policy if exists simulation_attempts_read on public.simulation_attempts;
create policy simulation_attempts_read on public.simulation_attempts
  for select to authenticated
  using (user_id = auth.uid() or public._me_teacher_of(user_id));

drop policy if exists simulation_assets_read on public.simulation_assets;
create policy simulation_assets_read on public.simulation_assets
  for select to authenticated
  using (exists (
    select 1 from public.simulations s
    where s.simulation_id = simulation_assets.simulation_id and s.is_published
  ));

-- Saves one attempt for the caller. The client sends the deterministic summary it computed;
-- the server bounds its size and rate but takes identity only from the JWT.
create or replace function public.save_simulation_attempt(
  p_slug text,
  p_version int,
  p_params jsonb,
  p_outputs jsonb,
  p_hypothesis text default null,
  p_check_answer text default null,
  p_check_correct boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_sim public.simulations%rowtype;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_sim from public.simulations s where s.slug = p_slug and s.is_published;
  if not found then
    raise exception 'SIMULATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_version is null or p_version < 1 or p_version > v_sim.current_version
     or p_params is null or jsonb_typeof(p_params) <> 'object' or pg_column_size(p_params) > 4096
     or p_outputs is null or jsonb_typeof(p_outputs) <> 'object' or pg_column_size(p_outputs) > 8192
     or char_length(coalesce(p_hypothesis, '')) > 40
     or char_length(coalesce(p_check_answer, '')) > 40 then
    raise exception 'INVALID_PAYLOAD' using errcode = '22023';
  end if;

  if (select count(*) from public.simulation_attempts a
      where a.user_id = v_uid and a.created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  insert into public.simulation_attempts
    (simulation_id, user_id, sim_version, params, outputs, hypothesis, check_answer, check_correct)
  values
    (v_sim.simulation_id, v_uid, p_version, p_params, p_outputs,
     nullif(btrim(p_hypothesis), ''), nullif(btrim(p_check_answer), ''), p_check_correct)
  returning attempt_id into v_id;

  return v_id;
end;
$$;

revoke all on function public.save_simulation_attempt(text, int, jsonb, jsonb, text, text, boolean) from public, anon;
grant execute on function public.save_simulation_attempt(text, int, jsonb, jsonb, text, text, boolean) to authenticated;

-- The caller's attempt count and last attempt per simulation (catalogue badges).
create or replace function public.my_simulation_stats()
returns table (slug text, attempts int, last_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.slug, count(a.attempt_id)::int, max(a.created_at)
  from public.simulation_attempts a
  join public.simulations s on s.simulation_id = a.simulation_id
  where a.user_id = auth.uid()
  group by s.slug;
$$;

revoke all on function public.my_simulation_stats() from public, anon;
grant execute on function public.my_simulation_stats() to authenticated;

-- First entry of the code registry (src/modules/simulation-lab/registry/registry.ts).
insert into public.simulations (slug, subject_id, title, grade_min, grade_max, current_version)
values (
  'nomad-seasons',
  (select id from public.subjects where slug = 'history'),
  'Көшпелілердің маусымдық көші',
  5,
  8,
  1
)
on conflict (slug) do nothing;
