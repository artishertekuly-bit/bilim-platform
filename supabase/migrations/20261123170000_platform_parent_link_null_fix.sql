-- D85 түзетуі: бөгде оқушы басқа баланың ата-ана сұранысын қабылдай алмауы керек.
-- Бұрынғы тексеруде `r.student_id = v_uid` NULL берді (student_id әлі бос), ал `not (NULL or false)` = NULL,
-- сондықтан `if` іске қосылмай, кез келген оқушы сұранысты қабылдап кететін.
-- Сонымен бірге resolve_alert пен admin_set_lesson_status NULL күйін нақты қабылдамайды.

create or replace function public._respond_parent_link(p_request_id uuid, p_accept boolean)
returns public.parent_child_link_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_mine boolean;
  r public.parent_child_link_requests;
begin
  if v_uid is null or not public.has_role(v_uid, 'student'::public.app_role) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into r from public.parent_child_link_requests q where q.id = p_request_id for update;
  v_mine := coalesce(r.student_id = v_uid, false)
            or (r.student_id is null and r.child_email is not distinct from public._my_email());
  if r.id is null or r.status <> 'pending' or r.expires_at < now() or not v_mine then
    raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  if coalesce(p_accept, false) then
    insert into public.parent_student_links (parent_id, student_id)
    values (r.parent_id, v_uid)
    on conflict do nothing;
  end if;

  update public.parent_child_link_requests q
  set status = case when coalesce(p_accept, false) then 'accepted' else 'declined' end,
      student_id = v_uid, responded_at = now(), updated_at = now()
  where q.id = p_request_id
  returning * into r;
  return r;
end;
$$;
revoke all on function public._respond_parent_link(uuid, boolean) from public, anon, authenticated;

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
  if coalesce(p_resolution, '') not in ('resolved', 'false_positive') then
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
  if coalesce(p_status, '') not in ('published', 'hidden') then
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
