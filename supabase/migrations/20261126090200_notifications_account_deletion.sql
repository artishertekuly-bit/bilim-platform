-- D91: хабарламаларды сервер жазады (триггерлер), мұғалім жасырылған сабақтың себебін көреді,
-- пайдаланушы аккаунтын өзі жояды. Кесте мен дерек өшірілмейді; content_reviews.reviewer_id
-- аккаунт жойылғанда null болады (бұрын жоюға кедергі болатын).

-- ================================================================== 1. Хабарламалар
alter table public.notifications
  add column if not exists link text
    check (link is null or (char_length(link) <= 300 and link ~ '^/[A-Za-z0-9]'));
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

-- p_merge берілсе, сол мерзім ішіндегі оқылмаған бір типті, бір сілтемелі хабарлама жаңартылады (спам болмас үшін).
create or replace function public._notify(p_user uuid, p_type text, p_title text, p_message text,
                                          p_link text default null, p_merge interval default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user is null then
    return;
  end if;
  if p_merge is not null then
    update public.notifications n
    set title = left(p_title, 160), message = left(p_message, 500), created_at = now()
    where n.id = (
      select n2.id from public.notifications n2
      where n2.user_id = p_user and n2.type = p_type and n2.link is not distinct from p_link
        and not n2.is_read and n2.created_at > now() - p_merge
      order by n2.created_at desc
      limit 1
    );
    if found then
      return;
    end if;
  end if;
  insert into public.notifications (user_id, title, message, type, link)
  values (p_user, left(p_title, 160), left(p_message, 500), p_type, p_link);
end;
$$;

create or replace function public._display_name(p_user uuid, p_fallback text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select nullif(btrim(p.full_name), '') from public.profiles p where p.user_id = p_user), p_fallback);
$$;

-- Әр триггер хабарлама жаза алмаса да негізгі әрекетті (баға, хабар, қосылу) бұзбайды.

-- 1.1 Чат: әр қатысушыға, бір тред бойынша оқылмаған хабарлама біреу ғана.
create or replace function public._notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.deleted_at is null then
    begin
      perform public._notify(cp.user_id, 'chat',
                             coalesce(nullif(btrim(new.sender_name_snapshot), ''), 'Жаңа хабарлама'),
                             left(regexp_replace(new.body, '\s+', ' ', 'g'), 140),
                             '/chat/' || new.thread_id, interval '12 hours')
      from public.chat_participants cp
      where cp.thread_id = new.thread_id and cp.user_id is distinct from new.sender_id;
    exception when others then
      raise warning 'notify chat failed: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;
drop trigger if exists chat_messages_notify on public.chat_messages;
create trigger chat_messages_notify after insert on public.chat_messages
  for each row execute function public._notify_chat_message();

-- 1.2 Сыныпқа қосылу: оқушыға растау, мұғалімге жаңа оқушылар (бір сағат ішінде біріктіріледі).
create or replace function public._notify_class_join()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text;
  v_subject text;
  v_teacher uuid;
  v_n int;
  v_student text;
begin
  begin
    select c.title, s.name_kk, c.teacher_id into v_title, v_subject, v_teacher
    from public.classes c left join public.subjects s on s.id = c.subject_id
    where c.class_id = new.class_id;

    perform public._notify(new.student_id, 'class', 'Сыныпқа қосылдыңыз',
                           concat_ws(' · ', v_title, v_subject, public._display_name(v_teacher, 'Мұғалім')),
                           '/profile');

    select count(*)::int into v_n from public.class_members m
    where m.class_id = new.class_id and m.joined_at > now() - interval '1 hour';
    v_student := public._display_name(new.student_id, 'Оқушы');
    perform public._notify(v_teacher, 'class', 'Жаңа оқушы · ' || coalesce(v_title, 'сынып'),
                           case when v_n <= 1 then v_student || ' сыныпқа қосылды.'
                                else v_student || ' және тағы ' || (v_n - 1) || ' оқушы қосылды.' end,
                           '/teacher/classes?open=' || new.class_id, interval '1 hour');
  exception when others then
    raise warning 'notify class join failed: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists class_members_notify on public.class_members;
create trigger class_members_notify after insert on public.class_members
  for each row execute function public._notify_class_join();

-- 1.3 Дабыл: оқушының барлық мұғаліміне (бір оқушы бойынша сағатына біреу).
create or replace function public._notify_security_alert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_where text;
begin
  begin
    v_name := public._display_name(new.student_id, 'Оқушы');
    v_where := case new.source_system when 'examiner' then 'емтихан кезінде ескерту'
                                      when 'tutor' then 'тьютор диалогында ескерту'
                                      else 'ескерту' end;
    perform public._notify(t.teacher_id, 'alert', 'Назар аударыңыз', v_name || ': ' || v_where || '.',
                           '/teacher/students/' || new.student_id, interval '1 hour')
    from (select distinct c.teacher_id from public.class_members m
          join public.classes c on c.class_id = m.class_id
          where m.student_id = new.student_id) t;
  exception when others then
    raise warning 'notify alert failed: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists security_alerts_notify on public.security_alerts;
create trigger security_alerts_notify after insert on public.security_alerts
  for each row execute function public._notify_security_alert();

-- 1.4 Мұғалім ЖИ бағасын растады не шағымды қарады (provisional → final, confirmed_by бар).
create or replace function public._notify_grade_final()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject text;
  v_level int;
  v_scope text;
begin
  if old.grade_status = 'provisional' and new.grade_status = 'final' and new.confirmed_by is not null then
    begin
      select sb.name_kk, s.level into v_subject, v_level
      from examiner.sessions s left join public.subjects sb on sb.id = s.subject_id
      where s.session_id = new.session_id;
      v_scope := concat_ws(' · ', v_subject, case when v_level is not null then v_level || '-деңгей' end);
      if new.appeal_text is not null then
        perform public._notify(new.student_id, 'appeal', 'Шағымға жауап',
                               coalesce(nullif(v_scope, '') || ': ', '') || 'мұғалім шағымыңызды қарады. Балл: ' || coalesce(new.s::text, '—') || '.',
                               '/exam/result/' || new.session_id);
      else
        perform public._notify(new.student_id, 'grade', 'Баға расталды',
                               public._display_name(new.confirmed_by, 'Мұғалім') || ' ' ||
                               coalesce(nullif(v_scope, '') || ' ', '') || 'жауабыңызды тексерді.',
                               '/exam/result/' || new.session_id, interval '3 hours');
      end if;
    exception when others then
      raise warning 'notify grade failed: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;
drop trigger if exists answer_log_notify on examiner.answer_log;
create trigger answer_log_notify after update of grade_status on examiner.answer_log
  for each row execute function public._notify_grade_final();

-- 1.5 Сабақ жасырылды не қайта ашылды (себебімен).
create or replace function public._notify_lesson_review()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text;
  v_author uuid;
begin
  if new.content_type = 'lesson' then
    begin
      select l.title, l.author_id into v_title, v_author from public.lessons l where l.id = new.content_id;
      if v_author is not null and v_author is distinct from new.reviewer_id then
        if new.status = 'archived'::public.content_status then
          perform public._notify(v_author, 'lesson', 'Сабақ жасырылды',
                                 '«' || coalesce(v_title, 'Сабақ') || '»' || coalesce(': ' || new.feedback, '.'),
                                 '/teacher/lessons');
        elsif new.status = 'published'::public.content_status then
          perform public._notify(v_author, 'lesson', 'Сабақ қайта ашылды',
                                 '«' || coalesce(v_title, 'Сабақ') || '» каталогқа қайтты.', '/teacher/lessons');
        end if;
      end if;
    exception when others then
      raise warning 'notify lesson review failed: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;
drop trigger if exists content_reviews_notify on public.content_reviews;
create trigger content_reviews_notify after insert on public.content_reviews
  for each row execute function public._notify_lesson_review();

-- 1.6 Ата-ана байланысы: балаға сұраныс, ата-анаға жауап.
create or replace function public._notify_parent_link()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_child text;
  v_student uuid;
begin
  begin
    if tg_op = 'INSERT' then
      -- Бала email бойынша табылады; ата-анаға баланың аккаунты бар-жоғы көрінбейді.
      v_student := coalesce(new.student_id,
                            (select u.id from auth.users u where lower(u.email::text) = new.child_email limit 1));
      if v_student is not null and new.status = 'pending' and public.has_role(v_student, 'student'::public.app_role) then
        perform public._notify(v_student, 'parent', 'Ата-ана байланысы',
                               public._display_name(new.parent_id, 'Ата-ана') || ' сізді баласы ретінде қосқысы келеді.',
                               '/notifications');
      end if;
    elsif old.status = 'pending' and new.status in ('accepted', 'declined') then
      v_child := public._display_name(new.student_id, new.child_email);
      if new.status = 'accepted' then
        perform public._notify(new.parent_id, 'parent', 'Байланыс расталды', v_child || ' сұранысыңызды растады.', '/parent');
      else
        perform public._notify(new.parent_id, 'parent', 'Сұраныс қабылданбады', v_child || ' байланысты қабылдамады.', '/parent/link');
      end if;
    end if;
  exception when others then
    raise warning 'notify parent link failed: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists parent_link_requests_notify on public.parent_child_link_requests;
create trigger parent_link_requests_notify after insert or update of status on public.parent_child_link_requests
  for each row execute function public._notify_parent_link();

-- 1.7 Басқарма: басшыға жаңа өтінім, мұғалімге растау.
create or replace function public._notify_department_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n int;
  v_dept text;
begin
  begin
    if new.member_role = 'teacher' then
      if tg_op = 'INSERT' and new.status = 'pending' then
        select count(*)::int into v_n from public.department_members dm
        where dm.department_id = new.department_id and dm.member_role = 'teacher' and dm.status = 'pending';
        perform public._notify(h.user_id, 'department', 'Мұғалім өтінімі',
                               case when v_n <= 1 then public._display_name(new.user_id, 'Мұғалім') || ' басқармаға қосылғысы келеді.'
                                    else v_n || ' мұғалім растауды күтіп тұр.' end,
                               '/department/teachers', interval '12 hours')
        from public.department_members h
        where h.department_id = new.department_id and h.member_role = 'head' and h.status = 'active';
      elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'active' then
        select d.name into v_dept from public.departments d where d.department_id = new.department_id;
        perform public._notify(new.user_id, 'department', 'Басқармаға қабылдандыңыз',
                               coalesce(v_dept, 'Басқарма') || ' сізді мұғалім ретінде растады.', '/teacher');
      end if;
    end if;
  exception when others then
    raise warning 'notify department failed: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists department_members_notify on public.department_members;
create trigger department_members_notify after insert or update of status on public.department_members
  for each row execute function public._notify_department_member();

-- ================================================================== 2. Мұғалім жасырылған сабақтың себебін көреді
create or replace function public.my_lesson_reviews()
returns table (lesson_id uuid, review_status text, feedback text, reviewed_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct on (cr.content_id) cr.content_id, cr.status::text, cr.feedback, cr.reviewed_at
  from public.content_reviews cr
  join public.lessons l on l.id = cr.content_id
  where cr.content_type = 'lesson' and l.author_id = auth.uid()
  order by cr.content_id, cr.reviewed_at desc;
$$;

-- ================================================================== 3. Аккаунтты жою
alter table public.content_reviews alter column reviewer_id drop not null;
alter table public.content_reviews drop constraint content_reviews_reviewer_id_fkey;
alter table public.content_reviews add constraint content_reviews_reviewer_id_fkey
  foreign key (reviewer_id) references auth.users(id) on delete set null;

-- Пайдаланушы деректері auth.users-тен каскадпен кетеді (профиль, рөл, сынып мүшелігі, емтихан, тьютор, ойын,
-- чат қатысуы, хабарламалар). Мұғалімнің сыныптары да жойылады. Соңғы платформа иесі өзін жоя алмайды.
-- Ескі (v1) кестелерде жазбасы бар аккаунт жойылмайды: ACCOUNT_LINKED_DATA.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if public.has_role(v_uid, 'admin'::public.app_role)
     and (select count(*) from public.user_roles r where r.role = 'admin'::public.app_role) <= 1 then
    raise exception 'LAST_OWNER' using errcode = 'P0001';
  end if;

  delete from examiner.request_log rl where rl.user_id = v_uid;
  begin
    delete from auth.users u where u.id = v_uid;
  exception when foreign_key_violation then
    raise exception 'ACCOUNT_LINKED_DATA' using errcode = 'P0001';
  end;
end;
$$;

-- ================================================================== 4. Құқықтар
revoke all on function public._notify(uuid, text, text, text, text, interval) from public, anon, authenticated;
revoke all on function public._display_name(uuid, text) from public, anon, authenticated;
revoke all on function public._notify_chat_message() from public, anon, authenticated;
revoke all on function public._notify_class_join() from public, anon, authenticated;
revoke all on function public._notify_security_alert() from public, anon, authenticated;
revoke all on function public._notify_grade_final() from public, anon, authenticated;
revoke all on function public._notify_lesson_review() from public, anon, authenticated;
revoke all on function public._notify_parent_link() from public, anon, authenticated;
revoke all on function public._notify_department_member() from public, anon, authenticated;

revoke all on function public.my_lesson_reviews() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.my_lesson_reviews() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
