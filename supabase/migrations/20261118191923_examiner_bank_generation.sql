-- Сұрақ банкін толтыру контуры (architect/v2/ai_examiner.md §5.1, §5.4; bagalau-zhuiesi.md §3, Т6, Т7).
--
--   * questions.content_embedding — Т7 қайталау тексеруі: жаңа сұрақ сол topic_id мен
--     level-дегі бар сұраққа ≥ 0.92 ұқсас болса, қабылданбайды. Пакет өзгермейтіндіктен (Т4)
--     вектор сұрақпен бірге бір рет жазылады.
--   * generation_batches / generation_requests — Batch API-ға жіберілген сұраныстар. Контур
--     қайта іске қосылса да, нәтиже жоғалмайды және сұрақ екі рет жазылмайды.
--   * format_applicability — тарихта формула конструкторы мен слайдер қолданылмайды
--     (bagalau §2.4); олардың орнын сол деңгейдің басқа код форматы алады.

-- 1. Қайталау тексеруіне арналған вектор
alter table examiner.questions
  add column content_embedding extensions.vector(1536),
  add column content_embedding_model text,
  add constraint questions_embedding_pair
    check ((content_embedding is null) = (content_embedding_model is null));

comment on column examiner.questions.content_embedding is 'Сұрақ мәтінінің векторы (Т7 қайталау тексеруі). text-embedding-3-small, 1536.';

-- 2. Batch API сұраныстары
create table examiner.generation_batches (
  batch_id       text primary key,
  provider       text not null,
  model_key      text not null,
  prompt_id      text not null,
  prompt_version text not null,
  status         text not null default 'submitted'
                 check (status in ('submitted', 'completed', 'failed', 'expired', 'cancelled', 'processed')),
  request_count  integer not null check (request_count > 0),
  submitted_at   timestamptz not null default now(),
  finished_at    timestamptz,
  processed_at   timestamptz,
  check ((status = 'processed') = (processed_at is not null))
);

create index generation_batches_open on examiner.generation_batches (submitted_at)
  where status in ('submitted', 'completed');

create table examiner.generation_requests (
  custom_id      text primary key,
  batch_id       text not null references examiner.generation_batches (batch_id),
  subject_id     uuid not null references public.subjects (id),
  topic_id       text not null,
  level          examiner.exam_level not null,
  format         examiner.task_format not null,
  x_tier         examiner.tier not null,
  chunk_ids      text[] not null check (cardinality(chunk_ids) between 1 and 3),
  status         text not null default 'pending'
                 check (status in ('pending', 'accepted', 'rejected', 'failed')),
  reject_reasons text[],
  question_id    uuid unique references examiner.questions (question_id),
  created_at     timestamptz not null default now(),
  processed_at   timestamptz,
  check ((status = 'accepted') = (question_id is not null)),
  check ((status = 'pending') = (processed_at is null)),
  check (status not in ('rejected', 'failed') or coalesce(cardinality(reject_reasons), 0) > 0)
);

create index generation_requests_batch on examiner.generation_requests (batch_id);
-- Жоспарлаушы әлі өңделмеген сұраныстарды қор есебіне қосады (ai_examiner §5.4).
create index generation_requests_pending on examiner.generation_requests (subject_id, topic_id, level, format, x_tier)
  where status = 'pending';

comment on column examiner.generation_requests.reject_reasons is 'Т6/Т7 тексерісінің себептері: сапа статистикасы мен промптты жақсарту үшін.';

-- 3. Форматтың пәнге қолданылуы: тарих
insert into examiner.format_applicability (subject_id, format, applicable)
select s.id, f.format, false
from public.subjects s
cross join (values ('formula_builder'), ('slider')) as f (format)
where s.slug = 'history'
on conflict (subject_id, format) do nothing;

-- 4. Құқықтар
revoke all on examiner.generation_batches, examiner.generation_requests
  from public, anon, authenticated, service_role;
grant select, insert, update on examiner.generation_batches, examiner.generation_requests to examiner_svc;
