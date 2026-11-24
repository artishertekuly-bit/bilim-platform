// «Пән бойынша тест» (D97): пән + қалауынша тақырып + 10 / 20 / 50 сұрақ → тест бірден басталады.
// Сұрақтар тек дайын банктен алынады (60% тест, 40% аралас тапсырма); басқа формат жетпесе, орнын тест толтырады.
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { Banner, Button, ErrorNote, LoadingBlock, Section, TextInput } from '@/components/bl/ui';
import { MAX_TOPIC_CHARS } from '@/lib/exam-selection';
import {
  ExaminerApiError,
  MIXED_COUNTS,
  type MixedCount,
  mixSummary,
  mixTarget,
  useExaminerApi,
} from '@/lib/examiner-api';
import { cn } from '@/lib/utils';

function RadioDot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('box-border h-[22px] w-[22px] flex-none rounded-full bg-white', on ? 'border-[7px] border-bl-ink' : 'border-2 border-bl-field')}
    />
  );
}

export default function MixedTestPanel() {
  const api = useExaminerApi();
  const navigate = useNavigate();
  const subjects = useQuery({ queryKey: ['examiner', 'mixed-subjects'], queryFn: api.mixedSubjects });
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState<MixedCount>(20);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const list = subjects.data;
    if (list?.length && (!subjectId || !list.some((s) => s.subject_id === subjectId))) setSubjectId(list[0].subject_id);
  }, [subjects.data, subjectId]);

  const subject = subjects.data?.find((s) => s.subject_id === subjectId) ?? null;
  const clean = topic.trim().replace(/\s+/g, ' ');
  // Басқа формат банкте жоқ болса (мысалы, «Дүниежүзі тарихы»), тест түгел тест сұрақтарынан құрылады.
  const expected = subject && subject.other === 0 ? { mcq: count, other: 0 } : mixTarget(count);

  const start = useMutation({
    mutationFn: () => api.startMixed(subjectId as string, count, clean),
    onSuccess: (session) => navigate(`/exam/session/${session.session_id}`),
    onError: (err) => {
      if (err instanceof ExaminerApiError && err.code === 'ACTIVE_SESSION_EXISTS') {
        const id = err.details.session_id;
        if (typeof id === 'string') {
          navigate(`/exam/session/${id}`);
          return;
        }
      }
      setError(err instanceof Error ? err.message : 'Тестті бастау мүмкін болмады.');
    },
  });

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!subjectId || start.isPending) return;
    setError(null);
    start.mutate();
  };

  if (subjects.isLoading) return <LoadingBlock rows={3} />;
  if (subjects.isError) return <ErrorNote error={subjects.error} onRetry={() => subjects.refetch()} />;
  if (!subjects.data?.length) {
    return <Banner tone="info">Сұрақ банкі әлі толмаған. Кейінірек қайта кіріп көріңіз.</Banner>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" aria-label="Пән бойынша тест">
      <Section label="Пән">
        <div
          role="radiogroup"
          aria-label="Тест пәні"
          className="flex flex-col overflow-hidden rounded-2xl border border-bl-line bg-white [&>*+*]:border-t [&>*+*]:border-bl-soft"
        >
          {subjects.data.map((s) => {
            const on = s.subject_id === subjectId;
            return (
              <button
                key={s.subject_id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setSubjectId(s.subject_id)}
                className={cn(
                  'flex min-h-[56px] w-full items-center gap-3 border-0 px-4 py-2.5 text-left text-bl-ink',
                  on ? 'bg-[#F1EFEA]' : 'bg-white',
                )}
              >
                <span className="flex-1 text-[15px] font-semibold">{s.title}</span>
                <RadioDot on={on} />
              </button>
            );
          })}
        </div>
      </Section>

      <Section label="Тақырып">
        <label htmlFor="mixed-topic" className="sr-only">
          Тест тақырыбы
        </label>
        <TextInput
          id="mixed-topic"
          placeholder="Міндетті емес: бос қалса, бүкіл пән бойынша"
          value={topic}
          maxLength={MAX_TOPIC_CHARS}
          autoComplete="off"
          onChange={(e) => setTopic(e.target.value)}
          className="h-12 text-[15px]"
        />
      </Section>

      <Section label="Сұрақ саны">
        <div role="radiogroup" aria-label="Сұрақ саны" className="grid grid-cols-3 gap-2">
          {MIXED_COUNTS.map((n) => {
            const on = n === count;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setCount(n)}
                className={cn(
                  'h-12 rounded-xl border text-[17px] font-semibold transition-colors',
                  on ? 'border-bl-ink bg-bl-ink text-white' : 'border-bl-line bg-white text-bl-ink hover:border-bl-field',
                )}
              >
                {n}
              </button>
            );
          })}
        </div>
        <p className="m-0 text-sm leading-[1.4] text-bl-ink2" aria-live="polite">
          Құрамы: {mixSummary(expected)}
          {expected.other === 0 ? ' — бұл пәнде әзірге тек тест сұрақтары бар.' : '. Тапсырмалар кездейсоқ ретпен беріледі.'}
        </p>
      </Section>

      {error ? <Banner tone="warn">{error}</Banner> : null}
      <Button type="submit" disabled={!subjectId} loading={start.isPending}>
        {start.isPending ? 'Тест құрылып жатыр…' : 'Тестті бастау'}
      </Button>
    </form>
  );
}
