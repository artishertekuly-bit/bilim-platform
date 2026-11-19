-- 5-қадам: ЖИ/гибрид бағалау, шағым (appeal), D69 тексеру себептері мен басымдық индексі.

alter table examiner.answer_log drop constraint if exists answer_log_review_reason_check;
alter table examiner.answer_log add constraint answer_log_review_reason_check
  check (review_reason is null or review_reason in ('d16_confirmation', 't9_missing_quote', 'borderline', 'appeal', 'gold_sample'));

alter table examiner.answer_log
  add column if not exists grade_reason text,
  add column if not exists appeal_text text,
  add column if not exists appealed_at timestamptz;

alter table examiner.answer_log drop constraint if exists answer_log_appeal_pair_check;
alter table examiner.answer_log add constraint answer_log_appeal_pair_check
  check ((appeal_text is null) = (appealed_at is null));

create index if not exists answer_log_review_priority
  on examiner.answer_log (review_reason, created_at)
  where grade_status = 'provisional';
