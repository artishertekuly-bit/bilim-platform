-- D96: imported MCQs without a § (all of world_history, 27 history rows) are served by subject queries
-- (backend/app/examiner/session/retrieval.py). Phase 1 left them in `review` so nothing selected a row with no
-- topic; § sessions and stock counts still never match a NULL topic_id, and the audit exempts imported rows from
-- the textbook-quote checks, so they can be active. Data only, no schema change, no new index: the subject query
-- reads the subject through questions_bank (subject_id, level, format); EXPLAIN ANALYZE of its embedding pass on
-- 1.7k history rows took 431 ms, and an ANN index cannot serve a `cosine >= 0.76 OR metadata` filter. That pass
-- only runs when metadata alone falls short. The question_state history trigger records each change.

update examiner.question_state s
set status = 'active', change_reason = 'D96: imported, served by subject queries', updated_at = now()
from examiner.questions q
where q.question_id = s.question_id
  and q.origin = 'imported'
  and q.topic_id is null
  and s.status = 'review';
