// «Не бойынша тапсырасыз?» (дизайн: ExamPicker.dc.html, D93): оқушы пәнді таңдап, тақырыпты өзі жазады.
// Платформа дерекқордан сол тақырыптың §-ін табады; деңгей басталғанда банкте сұрақ жетпесе, олар құрылады.
// «Толық пән» — оқулықтың барлық §-і (профиль мен жалпы балл осы көлемнен құрылады).
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { BareScreen, Button, ErrorNote, LoadingBlock, Section, Segmented, TextInput, TopBar } from '@/components/bl/ui';
import { useExamSelection } from '@/lib/exam-selection';
import { useExaminerApi } from '@/lib/examiner-api';
import { cn } from '@/lib/utils';

type PickerScope = 'topic' | 'subject';

function RadioDot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('box-border h-[22px] w-[22px] flex-none rounded-full bg-white', on ? 'border-[7px] border-bl-ink' : 'border-2 border-bl-field')}
    />
  );
}

const rowCls = 'flex min-h-[60px] w-full items-center gap-3 border-0 px-4 py-2.5 text-left text-bl-ink';
const listCls = 'flex flex-col overflow-hidden rounded-2xl border border-bl-line bg-white [&>*+*]:border-t [&>*+*]:border-bl-soft';

function gradeRange(grades: number[]): string {
  if (!grades.length) return '';
  const min = Math.min(...grades);
  const max = Math.max(...grades);
  return min === max ? `${min}-сынып` : `${min}–${max}-сынып`;
}

export default function ExamPickerPage() {
  const api = useExaminerApi();
  const navigate = useNavigate();
  const [sel, update] = useExamSelection();

  const subjects = useQuery({ queryKey: ['examiner', 'subjects'], queryFn: api.subjects });
  const [subjectId, setSubjectId] = useState<string | null>(sel.subjectId);
  const [scope, setScope] = useState<PickerScope>(sel.scopeType === 'subject' ? 'subject' : 'topic');
  const [query, setQuery] = useState(sel.topicQuery);
  const [submitted, setSubmitted] = useState(sel.topicQuery.trim());
  const [topicId, setTopicId] = useState<string | null>(sel.topicId);
  const [book, setBook] = useState<string | null>(sel.book);

  // Бұрынғы таңдау (тек оқулық сақталған) немесе бірінші пән.
  useEffect(() => {
    const list = subjects.data;
    if (!list?.length || (subjectId && list.some((s) => s.subject_id === subjectId))) return;
    const bySavedBook = list.find((s) => s.books.some((b) => b.book === sel.book));
    setSubjectId((bySavedBook ?? list[0]).subject_id);
  }, [subjects.data, subjectId, sel.book]);

  const subject = useMemo(() => subjects.data?.find((s) => s.subject_id === subjectId) ?? null, [subjects.data, subjectId]);

  useEffect(() => {
    if (subject && (!book || !subject.books.some((b) => b.book === book))) setBook(subject.books[0]?.book ?? null);
  }, [subject, book]);

  const search = useQuery({
    queryKey: ['examiner', 'topics', subjectId, submitted],
    queryFn: () => api.searchTopics(subjectId as string, submitted),
    enabled: Boolean(subjectId) && submitted.length >= 2 && scope === 'topic',
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const found = search.data?.topics;
    if (!found) return;
    if (!topicId || !found.some((t) => t.id === topicId)) setTopicId(found[0]?.id ?? null);
  }, [search.data, topicId]);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    const clean = query.trim().replace(/\s+/g, ' ');
    setSubmitted(clean);
    if (clean !== submitted) setTopicId(null);
  };

  const matches = search.data?.topics ?? [];
  const topic = matches.find((t) => t.id === topicId) ?? null;
  const currentBook = subject?.books.find((b) => b.book === book) ?? null;
  const ready = scope === 'topic' ? Boolean(subjectId && topic) : Boolean(subjectId && currentBook);
  const summary =
    scope === 'topic'
      ? topic
        ? `§${topic.no} · ${topic.title}`
        : '—'
      : currentBook
        ? `${currentBook.title} · ${currentBook.grade}-сынып`
        : '—';

  const apply = () => {
    if (scope === 'topic' && topic) {
      update({ subjectId, topicQuery: submitted, scopeType: 'topic', topicId: topic.id, book: topic.book, chapterId: null });
    } else if (scope === 'subject' && currentBook) {
      update({ subjectId, scopeType: 'subject', book: currentBook.book, chapterId: null });
    }
    navigate('/exam');
  };

  return (
    <BareScreen
      header={<TopBar back="/exam" backLabel="Деңгей таңдауға оралу" title="Не бойынша тапсырасыз?" />}
      footer={
        <>
          <span className="text-center text-[13px] text-bl-ink2">Таңдалды: {summary}</span>
          <Button onClick={apply} disabled={!ready}>
            Деңгей таңдауға өту
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 px-4 pb-5 pt-2">
        {subjects.isError ? <ErrorNote error={subjects.error} onRetry={() => subjects.refetch()} /> : null}
        {subjects.isLoading ? <LoadingBlock rows={3} /> : null}

        {subjects.data?.length ? (
          <Section label="Пән">
            <div role="radiogroup" aria-label="Пән" className={listCls}>
              {subjects.data.map((s) => {
                const on = s.subject_id === subjectId;
                return (
                  <button
                    key={s.subject_id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      if (s.subject_id === subjectId) return;
                      setSubjectId(s.subject_id);
                      setTopicId(null);
                      setBook(null);
                    }}
                    className={cn(rowCls, on ? 'bg-[#F1EFEA]' : 'bg-white')}
                  >
                    <span className="flex flex-1 flex-col gap-0.5">
                      <span className="text-[15px] font-semibold">{s.title}</span>
                      <span className="text-[13px] text-bl-ink2">{gradeRange(s.books.map((b) => b.grade))}</span>
                    </span>
                    <RadioDot on={on} />
                  </button>
                );
              })}
            </div>
          </Section>
        ) : null}

        <Section label="Емтихан көлемі">
          <Segmented
            label="Емтихан көлемі"
            value={scope}
            onChange={(id) => setScope(id)}
            options={[
              { id: 'topic', label: 'Тақырып' },
              { id: 'subject', label: 'Толық пән' },
            ]}
          />

          {scope === 'topic' ? (
            <>
              <form onSubmit={onSearch} className="flex gap-2">
                <label htmlFor="picker-topic" className="sr-only">
                  Тақырып
                </label>
                <TextInput
                  id="picker-topic"
                  type="search"
                  placeholder="Тақырыпты жазыңыз"
                  value={query}
                  maxLength={200}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-12 min-w-0 flex-1 text-[15px]"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  size="md"
                  full={false}
                  className="h-12"
                  disabled={query.trim().length < 2 || !subjectId}
                >
                  Іздеу
                </Button>
              </form>

              {search.isFetching ? <LoadingBlock rows={2} /> : null}
              {search.isError ? <ErrorNote error={search.error} onRetry={() => search.refetch()} /> : null}
              {search.data && !search.isFetching ? (
                matches.length ? (
                  <div role="radiogroup" aria-label="Табылған бөлім" className={listCls}>
                    {matches.map((t) => {
                      const on = t.id === topicId;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setTopicId(t.id)}
                          className={cn(rowCls, on ? 'bg-[#F1EFEA]' : 'bg-white')}
                        >
                          <span className="flex flex-1 flex-col gap-0.5">
                            <span className="text-[15px] font-semibold">
                              §{t.no} · {t.title}
                            </span>
                            <span className="text-[13px] text-bl-ink2">
                              {t.grade}-сынып · {t.book_title}
                            </span>
                          </span>
                          <RadioDot on={on} />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="m-0 rounded-2xl border border-bl-line bg-white p-4 text-center text-sm leading-normal text-bl-ink2">
                    Бұл тақырып бойынша дерекқорда материал табылмады. Басқаша жазып көріңіз.
                  </p>
                )
              ) : null}
            </>
          ) : subject ? (
            <>
              <div role="radiogroup" aria-label="Оқулық" className={listCls}>
                {subject.books.map((b) => {
                  const on = b.book === book;
                  return (
                    <button
                      key={b.book}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setBook(b.book)}
                      className={cn(rowCls, on ? 'bg-[#F1EFEA]' : 'bg-white')}
                    >
                      <span className="flex flex-1 flex-col gap-0.5">
                        <span className="text-[15px] font-semibold">{b.title}</span>
                        <span className="text-[13px] text-bl-ink2">{b.grade}-сынып</span>
                      </span>
                      <RadioDot on={on} />
                    </button>
                  );
                })}
              </div>
              <p className="m-0 text-sm leading-[1.4] text-bl-ink2">
                Оқулықтың барлық бөлімінен тең үлеспен. Профиль мен жалпы балл тек осы көлемнен құрылады.
              </p>
            </>
          ) : null}
        </Section>
      </div>
    </BareScreen>
  );
}
