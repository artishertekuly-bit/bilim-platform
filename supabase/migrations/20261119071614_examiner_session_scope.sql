-- 4-қадам: Examiner сессиясы (api-kelisimderi.md §3; README D62–D64).
--
-- 1. Пән масштабы бір оқулыққа тиесілі (D63). public.subjects-те сынып жоқ: «Қазақстан тарихы»
--    бес сыныптың бес оқулығын қамтиды. Сондықтан сессия өз оқулығын сақтайды, ал профиль мен
--    «Пән» масштабының емтиханы (пән, оқулық) жұбы бойынша құрылады. scope_id-тің ережесі өзгермейді:
--    topic → topic_id, chapter → '<кітап>#ch<нөмір>', subject → subject_id.
alter table examiner.sessions add column book text not null check (length(btrim(book)) > 0);

comment on column examiner.sessions.book is 'Сессияның оқулығы (corpus.textbooks.book): пән + сынып (D63).';

create index sessions_results_book on examiner.sessions (student_id, book, scope_type, scope_id, level, ended_at desc)
  where status = 'completed';

-- Профиль: (пән, оқулық) бойынша әр деңгейдің соңғы аяқталған сессиясы (bagalau §4.3, D35, D63).
-- Бағандардың реті сақталады, book соңына қосылады (create or replace view шарты).
create or replace view examiner.subject_level_latest with (security_invoker = true) as
select distinct on (s.student_id, s.subject_id, s.book, s.level)
  s.student_id,
  s.subject_id,
  s.level,
  s.session_id,
  r.p,
  r.mastered,
  r.is_final,
  s.ended_at as taken_at,
  s.book
from examiner.sessions s
join examiner.session_results r on r.session_id = s.session_id
where s.status = 'completed'
  and s.scope_type = 'subject'
order by s.student_id, s.subject_id, s.book, s.level, s.ended_at desc;

-- 2. Пәннің атауы. Сервис рөлдері public схемасының кестелерін оқымайды (D15): оларға тек осы
--    көрініс ашылады. Көріністі postgres иеленеді, сондықтан security_invoker қойылмайды.
create view corpus.subjects as
select id, name_kk, name_ru, slug, sort_order
from public.subjects;

revoke all on corpus.subjects from public, anon, authenticated, service_role;
grant select on corpus.subjects to examiner_svc, tutor_svc;
