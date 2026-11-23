// Бағаны растау (api §3.9, D16, Т11): тапсырма, рубрика, оқушының жауабы, ЖИ балы мен дәйексөздер; растау не түзету.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Banner, Card, Chip, LoadingBlock, PrimaryButton, SectionLabel } from '@/components/exam/ExamUi';
import TeacherScreen from '@/components/teacher/TeacherScreen';
import {
  FORMAT_TITLES,
  LEVEL_TITLES,
  useExaminerApi,
  type TeacherGradeActionResponse,
  type TeacherGradeDetail,
} from '@/lib/examiner-api';
import { formatDateTime, reviewReasonTitle, useStudentNames } from '@/lib/teacher-ui';
import { cn } from '@/lib/utils';

const CONTENT_FIELDS: [string, string][] = [
  ['situation', 'Жағдай'],
  ['scenario', 'Жағдай'],
  ['statement', 'Тұжырым'],
  ['concept', 'Ұғым'],
  ['opening_question', 'Бастапқы сұрақ'],
  ['task', 'Тапсырма'],
];

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>{title}</SectionLabel>
      <Card className="flex flex-col gap-2 px-4 py-3.5 text-[15px] leading-relaxed">{children}</Card>
    </section>
  );
}

function QuestionBlock({ detail }: { detail: TeacherGradeDetail }) {
  const content = detail.question_content;
  const options = Array.isArray(content.options) ? (content.options as { id?: string; text?: string }[]) : [];
  return (
    <Block title="Тапсырма">
      {asText(content.stem) ? <p className="m-0 font-semibold">{asText(content.stem)}</p> : null}
      {CONTENT_FIELDS.map(([key, label]) =>
        asText(content[key]) ? (
          <p key={key} className="m-0">
            <span className="text-[13px] font-semibold text-[#5E5E5E]">{label}: </span>
            {asText(content[key])}
          </p>
        ) : null,
      )}
      {options.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
          {options.map((option) => (
            <li key={option.id ?? option.text}>
              <span className="font-semibold">{option.id}.</span> {option.text}
            </li>
          ))}
        </ul>
      ) : null}
    </Block>
  );
}

function AnswerBlock({ detail }: { detail: TeacherGradeDetail }) {
  const extra = Object.entries(detail.answer).filter(([key]) => key !== 'text');
  if (detail.dialog_turns.length) {
    return (
      <Block title="Диалог">
        {detail.dialog_turns.map((turn) => (
          <div key={turn.turn_no} className="flex flex-col gap-1.5 border-b border-[#ECE9E3] pb-2 last:border-0 last:pb-0">
            <p className="m-0">
              <span className="text-[13px] font-semibold text-[#5E5E5E]">Оқушы: </span>
              {turn.student_text}
            </p>
            {turn.examiner_text ? (
              <p className="m-0 text-[#4A4A4A]">
                <span className="text-[13px] font-semibold text-[#5E5E5E]">ЖИ: </span>
                {turn.examiner_text}
              </p>
            ) : null}
          </div>
        ))}
      </Block>
    );
  }
  return (
    <Block title="Оқушының жауабы">
      {detail.answer_text ? <p className="m-0 whitespace-pre-wrap">{detail.answer_text}</p> : null}
      {extra.length ? (
        <pre className="m-0 whitespace-pre-wrap break-words rounded-xl bg-[#F6F5F2] p-3 text-xs">
          {JSON.stringify(Object.fromEntries(extra), null, 2)}
        </pre>
      ) : null}
      {!detail.answer_text && !extra.length ? <p className="m-0 text-[#5E5E5E]">Жауап бос.</p> : null}
    </Block>
  );
}

function RubricBlock({ detail }: { detail: TeacherGradeDetail }) {
  const rows = (detail.rubric_0_4 ?? []).map((row) => ({
    score: Number(row.score),
    text: asText(row.descriptor) ?? asText(row.criteria) ?? '',
  }));
  if (!rows.length) return null;
  return (
    <Block title="Рубрика">
      {rows
        .sort((a, b) => b.score - a.score)
        .map((row) => (
          <p key={row.score} className={cn('m-0 text-sm', row.score === detail.effective_score && 'font-semibold')}>
            <span className="mr-2 inline-block w-5 font-bold">{row.score}</span>
            {row.text}
          </p>
        ))}
    </Block>
  );
}

export default function TeacherGradePage() {
  const { gradeId = '' } = useParams();
  const api = useExaminerApi();
  const queryClient = useQueryClient();
  const names = useStudentNames();
  const detail = useQuery({
    queryKey: ['examiner', 'teacher', 'grade', gradeId],
    queryFn: () => api.teacherGradeDetail(gradeId),
    enabled: !!gradeId,
  });

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState<TeacherGradeActionResponse | null>(null);

  const after = (result: TeacherGradeActionResponse) => {
    setDone(result);
    setOverrideOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['examiner', 'teacher'] });
  };
  const confirm = useMutation({ mutationFn: () => api.teacherConfirmGrade(gradeId), onSuccess: after });
  const override = useMutation({
    mutationFn: () => api.teacherOverrideGrade(gradeId, score ?? 0, reason.trim()),
    onSuccess: after,
  });
  const busy = confirm.isPending || override.isPending;
  const error = (confirm.error ?? override.error) as Error | null;

  const data = detail.data;
  const isFinal = data?.grade_status === 'final' || done !== null;

  return (
    <TeacherScreen title="Бағаны растау" back="/teacher/review">
      {detail.isLoading ? <LoadingBlock /> : null}
      {detail.isError ? <Banner tone="bad">{(detail.error as Error).message}</Banner> : null}

      {data ? (
        <>
          <Card className="flex flex-col gap-2 px-4 py-3.5">
            <span className="flex items-center justify-between gap-3">
              <span className="truncate text-[15px] font-semibold">{names.get(data.student_id) ?? 'Оқушы'}</span>
              <span className="text-2xl font-bold">
                {done?.effective_score ?? data.effective_score ?? '—'}
                <span className="text-sm font-semibold text-[#5E5E5E]">/4</span>
              </span>
            </span>
            <span className="text-[13px] text-[#5E5E5E]">
              {FORMAT_TITLES[data.format] ?? data.format} · {data.level}-деңгей ({LEVEL_TITLES[data.level] ?? ''}) · {data.x_tier}
            </span>
            <span className="flex flex-wrap gap-1.5">
              <Chip>{reviewReasonTitle(data.review_reason)}</Chip>
              {isFinal ? <Chip tone="good">Расталды</Chip> : <Chip tone="muted">Алдын ала</Chip>}
            </span>
          </Card>

          <QuestionBlock detail={data} />
          <AnswerBlock detail={data} />

          <Block title="ЖИ бағасы">
            <p className="m-0">
              <span className="font-bold">{data.original_score ?? '—'}/4</span>
              {data.grade_reason ? ` — ${data.grade_reason}` : ''}
            </p>
            {data.evidence_quotes.length ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-[#5E5E5E]">Жауаптағы дәйексөздер:</span>
                {data.evidence_quotes.map((quote, index) => (
                  <blockquote key={index} className="m-0 border-l-[3px] border-[#D9D6D0] pl-3 text-sm text-[#4A4A4A]">
                    {quote.text}
                  </blockquote>
                ))}
              </div>
            ) : (
              <p className="m-0 text-sm text-[#5E5E5E]">Дәйексөз жоқ.</p>
            )}
          </Block>

          {data.appeal_text ? (
            <Block title="Оқушы шағымы">
              <p className="m-0 whitespace-pre-wrap">{data.appeal_text}</p>
            </Block>
          ) : null}

          <RubricBlock detail={data} />

          {data.reference_text ? (
            <details className="rounded-2xl border border-[#E2E0DB] bg-white px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold">Оқулық үзіндісі</summary>
              <p className="mb-0 mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#4A4A4A]">{data.reference_text}</p>
            </details>
          ) : null}

          {data.overrides.length ? (
            <Block title="Түзетулер">
              {data.overrides.map((item) => (
                <p key={item.override_id} className="m-0 text-sm">
                  <span className="font-bold">{item.new_score}/4</span> — {item.reason}{' '}
                  <span className="text-[#5E5E5E]">({formatDateTime(item.created_at)})</span>
                </p>
              ))}
            </Block>
          ) : null}

          {error ? <Banner tone="bad">{error.message}</Banner> : null}
          {done ? (
            <Banner tone="good">
              Баға сақталды: {done.effective_score}/4.
              {done.session_p !== null ? ` Сессия нәтижесі: ${Math.round(done.session_p)}%.` : ''}
            </Banner>
          ) : null}

          {data.grade_status === 'provisional' && !done ? (
            <div className="flex flex-col gap-2.5">
              <PrimaryButton disabled={busy} onClick={() => confirm.mutate()}>
                {confirm.isPending ? 'Сақталуда…' : `ЖИ бағасын растау (${data.effective_score ?? '—'}/4)`}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => setOverrideOpen((value) => !value)}
                className="h-12 rounded-[14px] border border-[#D9D6D0] bg-white text-[15px] font-semibold"
              >
                Бағаны түзету
              </button>
            </div>
          ) : null}

          {overrideOpen && !done ? (
            <Card className="flex flex-col gap-3 p-4">
              <span className="text-sm font-semibold">Жаңа балл</span>
              <div className="grid grid-cols-5 gap-2">
                {[0, 1, 2, 3, 4].map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={score === value}
                    onClick={() => setScore(value)}
                    className={cn(
                      'h-11 rounded-xl border text-base font-bold',
                      score === value ? 'border-[#121212] bg-[#121212] text-white' : 'border-[#D9D6D0] bg-white',
                    )}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                Себебі (міндетті)
                <textarea
                  value={reason}
                  maxLength={1000}
                  rows={3}
                  onChange={(event) => setReason(event.target.value)}
                  className="rounded-[14px] border border-[#D9D6D0] bg-white px-4 py-3 text-[15px] font-normal outline-none focus:border-[#111111]"
                />
              </label>
              <PrimaryButton disabled={busy || score === null || reason.trim().length < 3} onClick={() => override.mutate()}>
                {override.isPending ? 'Сақталуда…' : 'Түзетуді сақтау'}
              </PrimaryButton>
            </Card>
          ) : null}

          {done ? (
            <Link to="/teacher/review" className="text-center text-[15px] font-semibold text-[#111111]">
              Кезекке оралу
            </Link>
          ) : null}
        </>
      ) : null}
    </TeacherScreen>
  );
}
