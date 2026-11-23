// Бір ЖИ бағасын растау не түзету (дизайн: TeacherReview.dc.html; api §3.9, D16, Т11).
// Сұрақ, оқушы жауабы (дәйексөздер ерекшеленеді), ЖИ бағасы мен рубрика; «Растау» не «Бағаны өзгерту».
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { CheckIcon } from '@/components/bl/icons';
import { BareScreen, Button, ErrorNote, Field, LoadingBlock, TextArea, TopBar } from '@/components/bl/ui';
import { FORMAT_TITLES, useExaminerApi, type TeacherGradeActionResponse, type TeacherGradeDetail } from '@/lib/examiner-api';
import { reviewReasonTitle } from '@/lib/teacher-ui';
import { cn } from '@/lib/utils';

const SCORE_LABEL = ['Жоқ', 'Әлсіз', 'Жартылай', 'Жеткілікті', 'Толық'];

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function Panel({ title, children, strong }: { title: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <section className={cn('flex flex-col gap-1.5 rounded-2xl bg-white px-4 py-3.5', strong ? 'border-2 border-bl-ink' : 'border border-bl-line')}>
      <h2 className="m-0 text-xs font-semibold uppercase tracking-[0.04em] text-bl-ink2">{title}</h2>
      {children}
    </section>
  );
}

function Highlighted({ text, quotes }: { text: string; quotes: { start: number; end: number }[] }) {
  const ranges = quotes
    .filter((q) => Number.isFinite(q.start) && Number.isFinite(q.end) && q.end > q.start && q.end <= text.length)
    .sort((a, b) => a.start - b.start);
  const parts: ReactNode[] = [];
  let at = 0;
  ranges.forEach((r, i) => {
    if (r.start < at) return;
    if (r.start > at) parts.push(text.slice(at, r.start));
    parts.push(
      <mark key={i} className="rounded bg-bl-warnbg px-0.5 text-bl-ink">
        {text.slice(r.start, r.end)}
      </mark>,
    );
    at = r.end;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <p className="m-0 whitespace-pre-wrap text-[15px] leading-[1.6]">{parts}</p>;
}

function Question({ detail }: { detail: TeacherGradeDetail }) {
  const c = detail.question_content;
  const extra = ['situation', 'scenario', 'statement', 'concept', 'case_text', 'opening_question', 'task_prompt']
    .map((k) => asText(c[k]))
    .filter(Boolean) as string[];
  return (
    <Panel title="Сұрақ">
      {asText(c.stem) ? <p className="m-0 text-[15px] leading-[1.45]">{asText(c.stem)}</p> : null}
      {extra.map((t, i) => (
        <p key={i} className="m-0 text-sm leading-[1.45] text-bl-ink3">
          {t}
        </p>
      ))}
    </Panel>
  );
}

function Answer({ detail }: { detail: TeacherGradeDetail }) {
  if (detail.dialog_turns.length) {
    return (
      <Panel title="Диалог">
        {detail.dialog_turns.map((turn) => (
          <div key={turn.turn_no} className="flex flex-col gap-1 border-b border-bl-soft pb-2 last:border-0 last:pb-0">
            <p className="m-0 text-[15px] leading-[1.5]">
              <span className="text-[13px] font-semibold text-bl-ink2">Оқушы: </span>
              {turn.student_text}
            </p>
            {turn.examiner_text ? (
              <p className="m-0 text-sm leading-[1.5] text-bl-ink3">
                <span className="text-[13px] font-semibold text-bl-ink2">ЖИ: </span>
                {turn.examiner_text}
              </p>
            ) : null}
          </div>
        ))}
      </Panel>
    );
  }
  return (
    <Panel title="Оқушы жауабы">
      {detail.answer_text ? (
        <Highlighted text={detail.answer_text} quotes={detail.evidence_quotes} />
      ) : (
        <p className="m-0 text-sm text-bl-ink2">Жауап бос.</p>
      )}
    </Panel>
  );
}

export default function GradeReview({
  gradeId,
  title,
  back,
  meta,
  onNext,
  nextLabel = 'Келесі жауап',
}: {
  gradeId: string;
  title: string;
  back: string;
  meta?: string;
  onNext?: () => void;
  nextLabel?: string;
}) {
  const api = useExaminerApi();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['examiner', 'teacher', 'grade', gradeId], queryFn: () => api.teacherGradeDetail(gradeId) });
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [score, setScore] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState<{ result: TeacherGradeActionResponse; edited: boolean } | null>(null);

  const after = (edited: boolean) => (result: TeacherGradeActionResponse) => {
    setDone({ result, edited });
    setMode('view');
    void queryClient.invalidateQueries({ queryKey: ['examiner', 'teacher'] });
  };
  const confirm = useMutation({ mutationFn: () => api.teacherConfirmGrade(gradeId), onSuccess: after(false) });
  const override = useMutation({ mutationFn: () => api.teacherOverrideGrade(gradeId, score ?? 0, reason.trim()), onSuccess: after(true) });
  const busy = confirm.isPending || override.isPending;
  const data = detail.data;
  const alreadyFinal = data?.grade_status === 'final' && !done;
  const anchors = (data?.rubric_0_4 ?? [])
    .map((row) => ({ score: Number(row.score), text: asText(row.descriptor) ?? asText(row.criteria) ?? '' }))
    .filter((r) => r.text)
    .sort((a, b) => b.score - a.score);

  const footer = done ? (
    onNext ? <Button onClick={onNext}>{nextLabel}</Button> : null
  ) : alreadyFinal ? (
    onNext ? <Button onClick={onNext}>{nextLabel}</Button> : null
  ) : mode === 'edit' ? (
    <>
      <Button onClick={() => override.mutate()} disabled={score === null || reason.trim().length < 3} loading={override.isPending}>
        Түзетуді сақтау
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setMode('view')} disabled={busy}>
        Болдырмау
      </Button>
    </>
  ) : data ? (
    <>
      <Button onClick={() => confirm.mutate()} loading={confirm.isPending} disabled={busy}>
        Растау
      </Button>
      <Button
        variant="secondary"
        size="md"
        disabled={busy}
        onClick={() => {
          setScore(data.effective_score);
          setMode('edit');
        }}
      >
        Бағаны өзгерту
      </Button>
    </>
  ) : null;

  return (
    <BareScreen header={<TopBar back={back} backLabel="Артқа" title={title} />} footer={footer}>
      <div className="flex flex-col gap-3 px-4 pb-5 pt-1.5">
        {detail.isLoading ? <LoadingBlock rows={3} /> : null}
        {detail.isError ? <ErrorNote error={detail.error} onRetry={() => detail.refetch()} /> : null}
        {data ? (
          <>
            <span className="text-[13px] text-bl-ink3">
              {[meta, `${data.level}-деңгей`, FORMAT_TITLES[data.format] ?? data.format, reviewReasonTitle(data.review_reason)].filter(Boolean).join(' · ')}
            </span>
            <Question detail={data} />
            <Answer detail={data} />

            <section className="flex flex-col gap-2.5 rounded-2xl border border-bl-line bg-white px-4 py-3.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="m-0 text-[15px] font-semibold">ЖИ бағасы</h2>
                <span className="text-[15px] font-bold">
                  {data.original_score ?? '—'} / 4{data.original_score !== null ? ` · ${SCORE_LABEL[data.original_score] ?? ''}` : ''}
                </span>
              </div>
              {data.grade_reason ? <p className="m-0 text-sm leading-normal text-[#333333]">{data.grade_reason}</p> : null}
              <div className="flex flex-col gap-1.5">
                {data.evidence_quotes.length ? (
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-bl-oktext">
                    <CheckIcon size={16} />
                    {data.evidence_quotes.length} дәйексөз жауаптан табылды
                  </span>
                ) : (
                  <span className="text-[13px] font-semibold text-bl-warntext">Дәйексөз табылмады — мұқият тексеріңіз</span>
                )}
                {anchors.length ? (
                  <span className="text-[13px] leading-[1.45] text-bl-ink3">
                    Рубрика: {anchors.map((a) => `${a.score} — ${a.text}`).join('; ')}
                  </span>
                ) : null}
              </div>
            </section>

            {data.appeal_text ? (
              <Panel title="Оқушы шағымы">
                <p className="m-0 whitespace-pre-wrap text-[15px] leading-normal">{data.appeal_text}</p>
              </Panel>
            ) : null}

            {data.reference_text ? (
              <details className="rounded-2xl border border-bl-line bg-white px-4 py-3">
                <summary className="min-h-6 cursor-pointer text-sm font-semibold">Оқулық үзіндісі</summary>
                <p className="mb-0 mt-2 whitespace-pre-wrap text-sm leading-relaxed text-bl-ink3">{data.reference_text}</p>
              </details>
            ) : null}

            {mode === 'edit' ? (
              <section className="flex flex-col gap-2.5 rounded-2xl border-2 border-bl-ink bg-white px-4 py-3.5">
                <h2 className="m-0 text-[15px] font-semibold">Жаңа балл</h2>
                <div role="group" aria-label="Жаңа балл" className="grid grid-cols-5 gap-1.5">
                  {[0, 1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={score === n}
                      onClick={() => setScore(n)}
                      className={cn(
                        'h-12 rounded-xl text-base font-bold',
                        score === n ? 'border-0 bg-bl-ink text-white' : 'border border-bl-field bg-white text-bl-ink',
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <Field label="Себебі (міндетті)" htmlFor={`reason-${gradeId}`}>
                  <TextArea
                    id={`reason-${gradeId}`}
                    value={reason}
                    maxLength={1000}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Неге бағаны өзгерттіңіз?"
                    className="min-h-[84px] resize-none bg-bl-bg"
                  />
                </Field>
              </section>
            ) : null}

            {confirm.isError || override.isError ? <ErrorNote error={confirm.error ?? override.error} /> : null}
            {done || alreadyFinal ? (
              <div role="status" className="flex items-start gap-2.5 rounded-[14px] bg-bl-okbg px-4 py-3.5 text-sm font-semibold leading-[1.45] text-[#14532D]">
                <CheckIcon size={20} className="flex-none" />
                {done
                  ? done.edited
                    ? `Баға ${done.result.effective_score}/4 болып түзетілді. Оқушыға хабарлама жіберіледі.`
                    : `ЖИ бағасы расталды: ${done.result.effective_score}/4.`
                  : 'Бұл баға бұрын расталған.'}
                {done?.result.session_p != null ? ` Сессия нәтижесі: ${Math.round(done.result.session_p)}%.` : ''}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </BareScreen>
  );
}
