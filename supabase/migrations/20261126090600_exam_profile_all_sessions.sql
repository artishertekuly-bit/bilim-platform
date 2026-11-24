-- D93: the exam is general testing by subject. A learner (or teacher) writes a topic and the session runs on the
-- textbook § that covers it, so there are no "whole subject" sessions any more. The latest result per level now
-- comes from every completed session, whatever its scope. The student profile groups by subject in the service;
-- this view keeps its textbook split for the teacher's class analytics.
-- Same columns in the same order (create or replace view rule); grants stay.

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
order by s.student_id, s.subject_id, s.book, s.level, s.ended_at desc;
