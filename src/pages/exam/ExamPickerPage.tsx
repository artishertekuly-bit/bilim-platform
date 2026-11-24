// «Не бойынша тапсырасыз?» (дизайн: ExamPicker.dc.html, D93): емтихан — пән бойынша жалпы тестілеу.
// Оқушы не мұғалім пәнді таңдап, тақырыпты өзі жазады. Іздеу де, сынып та жоқ: деңгей басталғанда платформа
// тақырыпқа сай мәтінді дерекқордан өзі алады, ал банкте сұрақ жетпесе, тапсырмалар генерацияланады.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { BareScreen, Button, ErrorNote, LoadingBlock, Section, TextInput, TopBar } from '@/components/bl/ui';
import { MAX_TOPIC_CHARS, useExamSelection } from '@/lib/exam-selection';
import { useExaminerApi } from '@/lib/examiner-api';
import { cn } from '@/lib/utils';

function RadioDot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('box-border h-[22px] w-[22px] flex-none rounded-full bg-white', on ? 'border-[7px] border-bl-ink' : 'border-2 border-bl-field')}
    />
  );
}

export default function ExamPickerPage() {
  const api = useExaminerApi();
  const navigate = useNavigate();
  const [sel, update] = useExamSelection();
  const subjects = useQuery({ queryKey: ['examiner', 'subjects'], queryFn: api.subjects });
  const [subjectId, setSubjectId] = useState<string | null>(sel.subjectId);
  const [topic, setTopic] = useState(sel.topic);

  useEffect(() => {
    const list = subjects.data;
    if (list?.length && (!subjectId || !list.some((s) => s.subject_id === subjectId))) setSubjectId(list[0].subject_id);
  }, [subjects.data, subjectId]);

  const clean = topic.trim().replace(/\s+/g, ' ');
  const ready = Boolean(subjectId) && clean.length >= 2;
  const subjectTitle = subjects.data?.find((s) => s.subject_id === subjectId)?.title;

  const apply = (event?: FormEvent) => {
    event?.preventDefault();
    if (!ready) return;
    update({ subjectId, topic: clean, mode: 'levels' });
    navigate('/exam');
  };

  return (
    <BareScreen
      header={<TopBar back="/exam" backLabel="Деңгей таңдауға оралу" title="Не бойынша тапсырасыз?" />}
      footer={
        <>
          <span className="text-center text-[13px] text-bl-ink2">
            Таңдалды: {subjectTitle && clean ? `${subjectTitle} · ${clean}` : '—'}
          </span>
          <Button onClick={() => apply()} disabled={!ready}>
            Деңгей таңдауға өту
          </Button>
        </>
      }
    >
      <form onSubmit={apply} className="flex flex-col gap-5 px-4 pb-5 pt-2">
        {subjects.isError ? <ErrorNote error={subjects.error} onRetry={() => subjects.refetch()} /> : null}
        {subjects.isLoading ? <LoadingBlock rows={3} /> : null}

        {subjects.data?.length ? (
          <Section label="Пән">
            <div
              role="radiogroup"
              aria-label="Пән"
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
        ) : null}

        <Section label="Тақырып">
          <label htmlFor="picker-topic" className="sr-only">
            Тақырып
          </label>
          <TextInput
            id="picker-topic"
            placeholder="Тақырыпты жазыңыз"
            value={topic}
            maxLength={MAX_TOPIC_CHARS}
            autoComplete="off"
            onChange={(e) => setTopic(e.target.value)}
            className="h-12 text-[15px]"
          />
          <p className="m-0 text-sm leading-[1.4] text-bl-ink2">
            Тапсырмалар осы тақырып бойынша дерекқордағы оқулық мәтінінен құрылады.
          </p>
        </Section>
      </form>
    </BareScreen>
  );
}
