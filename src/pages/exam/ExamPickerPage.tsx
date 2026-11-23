// «Не бойынша тапсырасыз?» — оқулық, көлем, тарау және § (дизайн: ExamPicker.dc.html).
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ChevronDownIcon } from '@/components/bl/icons';
import { BareScreen, Button, ErrorNote, LoadingBlock, Section, Segmented, TextInput, TopBar } from '@/components/bl/ui';
import { useExamSelection } from '@/lib/exam-selection';
import { type ScopeType, type Topic, useExaminerApi } from '@/lib/examiner-api';
import { cn } from '@/lib/utils';

function RadioDot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('box-border h-[22px] w-[22px] flex-none rounded-full bg-white', on ? 'border-[7px] border-bl-ink' : 'border-2 border-bl-field')}
    />
  );
}

const rowCls = 'flex min-h-[60px] w-full items-center gap-3 border-0 px-4 py-2.5 text-left text-bl-ink';

export default function ExamPickerPage() {
  const api = useExaminerApi();
  const navigate = useNavigate();
  const [sel, update] = useExamSelection();
  const [book, setBook] = useState(sel.book);
  const [scopeType, setScopeType] = useState<ScopeType>(sel.scopeType);
  const [topicId, setTopicId] = useState(sel.topicId);
  const [chapterId, setChapterId] = useState(sel.chapterId);
  const [openChapter, setOpenChapter] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const subjects = useQuery({ queryKey: ['examiner', 'subjects'], queryFn: api.subjects });
  const books = useMemo(
    () => (subjects.data ?? []).flatMap((s) => s.books.map((b) => ({ ...b, subject: s.title }))),
    [subjects.data],
  );

  useEffect(() => {
    if (books.length && (!book || !books.some((b) => b.book === book))) setBook(books[0].book);
  }, [books, book]);

  const scopes = useQuery({
    queryKey: ['examiner', 'scopes', book],
    queryFn: () => api.scopes(book as string),
    enabled: Boolean(book),
  });

  useEffect(() => {
    const data = scopes.data;
    if (!data) return;
    if (!topicId || !data.topics.some((t) => t.id === topicId)) setTopicId(data.topics[0]?.id ?? null);
    if (!chapterId || !data.chapters.some((c) => c.id === chapterId)) setChapterId(data.chapters[0]?.id ?? null);
    if (scopeType === 'chapter' && !data.book.has_chapters) setScopeType('topic');
    const current = data.topics.find((t) => t.id === topicId);
    if (openChapter === null) setOpenChapter(current?.chapter_id ?? data.chapters[0]?.id ?? '');
  }, [scopes.data, topicId, chapterId, scopeType, openChapter]);

  const data = scopes.data;
  const query = q.trim().toLowerCase();

  // Тараусыз оқулықта §-тар бір топта.
  const groups = useMemo(() => {
    if (!data) return [];
    const byChapter = new Map<string, Topic[]>();
    data.topics.forEach((t) => {
      const key = t.chapter_id ?? '';
      byChapter.set(key, [...(byChapter.get(key) ?? []), t]);
    });
    const list = data.chapters.map((c) => ({ id: c.id, title: c.no ? `${c.no}-тарау · ${c.title}` : c.title, topics: byChapter.get(c.id) ?? [] }));
    const loose = byChapter.get('') ?? [];
    if (loose.length) list.push({ id: '', title: data.chapters.length ? 'Басқа параграфтар' : 'Параграфтар', topics: loose });
    return list;
  }, [data]);

  const filtered = groups.map((g) => ({
    ...g,
    shown: g.topics.filter((t) => !query || `§${t.no} ${t.title}`.toLowerCase().includes(query)),
  }));
  const noMatch = scopeType === 'topic' && Boolean(query) && filtered.every((g) => g.shown.length === 0);

  const currentBook = books.find((b) => b.book === book);
  const topic = data?.topics.find((t) => t.id === topicId);
  const chapter = groups.find((g) => g.id === chapterId);
  const summary =
    scopeType === 'topic'
      ? topic
        ? `§${topic.no} · ${topic.title}`
        : '—'
      : scopeType === 'chapter'
        ? chapter?.title ?? '—'
        : currentBook
          ? `${currentBook.title} · ${currentBook.grade}-сынып`
          : '—';
  const ready = Boolean(book && (scopeType === 'subject' || (scopeType === 'topic' ? topicId : chapterId)));

  const apply = () => {
    update({ book, scopeType, topicId, chapterId });
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

        {books.length ? (
          <Section label="Оқулық">
            <div role="radiogroup" aria-label="Оқулық" className="flex flex-col overflow-hidden rounded-2xl border border-bl-line bg-white [&>*+*]:border-t [&>*+*]:border-bl-soft">
              {books.map((b) => {
                const on = b.book === book;
                return (
                  <button
                    key={b.book}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setBook(b.book);
                      setTopicId(null);
                      setChapterId(null);
                      setOpenChapter(null);
                      setQ('');
                    }}
                    className={cn(rowCls, on ? 'bg-[#F1EFEA]' : 'bg-white')}
                  >
                    <span className="flex flex-1 flex-col gap-0.5">
                      <span className="text-[15px] font-semibold">{b.title}</span>
                      <span className="text-[13px] text-bl-ink2">
                        {b.subject} · {b.grade}-сынып
                      </span>
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
            value={scopeType}
            onChange={(id) => {
              setScopeType(id);
              setQ('');
            }}
            options={[
              { id: 'topic', label: 'Тақырып' },
              { id: 'chapter', label: 'Тарау', disabled: data ? !data.book.has_chapters : true },
              { id: 'subject', label: 'Пән' },
            ]}
          />

          {scopes.isLoading ? <LoadingBlock rows={3} /> : null}
          {scopes.isError ? <ErrorNote error={scopes.error} onRetry={() => scopes.refetch()} /> : null}

          {scopeType === 'topic' && data ? (
            <>
              <label htmlFor="picker-search" className="sr-only">
                Параграф іздеу
              </label>
              <TextInput
                id="picker-search"
                type="search"
                placeholder="§ немесе тақырып атауы"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-12 text-[15px]"
              />
            </>
          ) : null}

          {scopeType !== 'subject' && data ? (
            <div className="flex flex-col gap-2">
              {filtered.map((g) => {
                if (scopeType === 'topic' && query && g.shown.length === 0) return null;
                const isOpen = scopeType === 'topic' && (query ? g.shown.length > 0 : openChapter === g.id);
                const chosen = scopeType === 'chapter' && chapterId === g.id;
                if (scopeType === 'chapter' && !g.id) return null;
                return (
                  <div key={g.id || 'loose'} className="flex flex-col overflow-hidden rounded-2xl border border-bl-line bg-white">
                    <button
                      type="button"
                      role={scopeType === 'chapter' ? 'radio' : undefined}
                      aria-checked={scopeType === 'chapter' ? chosen : undefined}
                      aria-expanded={scopeType === 'topic' ? isOpen : undefined}
                      onClick={() => (scopeType === 'chapter' ? setChapterId(g.id) : setOpenChapter(openChapter === g.id ? '' : g.id))}
                      className={cn(rowCls, chosen ? 'bg-[#F1EFEA]' : 'bg-white')}
                    >
                      <span className="flex flex-1 flex-col gap-0.5">
                        <span className="text-[15px] font-semibold">{g.title}</span>
                        <span className="text-[13px] text-bl-ink2">
                          {g.topics.length} §{scopeType === 'topic' ? ` · ${isOpen ? 'жабу' : 'ашу'}` : ''}
                        </span>
                      </span>
                      {scopeType === 'chapter' ? (
                        <RadioDot on={chosen} />
                      ) : (
                        <ChevronDownIcon className={cn('text-bl-ink3 transition-transform', isOpen && 'rotate-180')} />
                      )}
                    </button>
                    {isOpen ? (
                      <div role="radiogroup" aria-label="Параграф" className="flex flex-col border-t border-bl-soft [&>*+*]:border-t [&>*+*]:border-bl-soft">
                        {g.shown.map((t) => {
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
                              <span className="w-10 flex-none text-sm font-bold tabular-nums">§{t.no}</span>
                              <span className="flex-1 text-[15px]">{t.title}</span>
                              <RadioDot on={on} />
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {noMatch ? <p className="m-0 p-4 text-center text-sm text-bl-ink2">Ондай параграф табылмады</p> : null}
            </div>
          ) : null}

          {scopeType === 'subject' && currentBook ? (
            <div className="flex flex-col gap-0.5 rounded-2xl border border-bl-line bg-white px-4 py-3.5">
              <span className="text-base font-semibold">
                {currentBook.title} · {currentBook.grade}-сынып
              </span>
              <span className="text-sm leading-[1.4] text-bl-ink2">
                Барлық тараудан тең үлеспен, тарауаралық байланыспен. Профиль мен жалпы балл тек осы көлемнен құрылады.
              </span>
            </div>
          ) : null}
        </Section>
      </div>
    </BareScreen>
  );
}
