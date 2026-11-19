// Емтихан · деңгей таңдау (дизайн: Main.dc.html). Масштаб: тақырып (§), тарау немесе пән (оқулық, D63).
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  Banner,
  Card,
  Chip,
  ExamScreen,
  LoadingBlock,
  SectionLabel,
} from '@/components/exam/ExamUi';
import {
  ExaminerApiError,
  type LevelCard,
  type ScopeType,
  useExaminerApi,
} from '@/lib/examiner-api';

const BOOK_KEY = 'bilim.exam.book';
const SCOPE_KEY = 'bilim.exam.scope';

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* жеке терезеде сақталмауы мүмкін */
  }
}

function levelStatus(card: LevelCard): { text: string; tone: 'good' | 'neutral' } {
  const p = card.last.p;
  if (p === null) return { text: 'Өтпеді', tone: 'neutral' };
  const value = `${Math.round(p)}%`;
  return card.last.mastered ? { text: `Меңгерілді · ${value}`, tone: 'good' } : { text: value, tone: 'neutral' };
}

export default function ExamHomePage() {
  const api = useExaminerApi();
  const navigate = useNavigate();
  const [book, setBook] = useState<string | null>(() => readStored(BOOK_KEY));
  const [scopeType, setScopeType] = useState<ScopeType>(() => (readStored(SCOPE_KEY) as ScopeType) || 'topic');
  const [topicId, setTopicId] = useState<string | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

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
  }, [scopes.data, topicId, chapterId, scopeType]);

  const scopeId = scopeType === 'topic' ? topicId : scopeType === 'chapter' ? chapterId : book;
  const levels = useQuery({
    queryKey: ['examiner', 'levels', scopeType, scopeId],
    queryFn: () => api.levels(scopeType, scopeId as string),
    enabled: Boolean(scopeId),
  });
  const active = useQuery({ queryKey: ['examiner', 'active'], queryFn: api.active });

  const start = useMutation({
    mutationFn: (level: number) => api.start(scopeType, scopeId as string, level),
    onSuccess: (session) => navigate(`/exam/session/${session.session_id}`),
    onError: (error) => {
      if (error instanceof ExaminerApiError && error.code === 'ACTIVE_SESSION_EXISTS') {
        const id = error.details.session_id;
        if (typeof id === 'string') {
          navigate(`/exam/session/${id}`);
          return;
        }
      }
      setStartError(error instanceof Error ? error.message : 'Емтиханды бастау мүмкін болмады.');
    },
  });

  const currentBook = books.find((b) => b.book === book);
  const scopeTabs: { id: ScopeType; label: string; disabled?: boolean }[] = [
    { id: 'topic', label: 'Тақырып' },
    { id: 'chapter', label: 'Тарау', disabled: scopes.data ? !scopes.data.book.has_chapters : true },
    { id: 'subject', label: 'Пән' },
  ];

  const pickScope = (id: ScopeType) => {
    setScopeType(id);
    setStartError(null);
    writeStored(SCOPE_KEY, id);
  };

  return (
    <ExamScreen>
      <div className="flex items-start justify-between gap-3 pt-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-bold leading-tight tracking-[-0.02em]">Емтихан</h1>
          <p className="m-0 text-[15px] text-[#5E5E5E]">
            {currentBook ? `${currentBook.subject} · ${currentBook.grade}-сынып` : ' '}
          </p>
        </div>
        <div className="flex gap-1">
          <Link
            to="/exam/profile"
            className="flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-[#111111] no-underline hover:bg-[#ECE9E3]"
          >
            Профиль
          </Link>
          <Link
            to="/dashboard"
            className="flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-[#5E5E5E] no-underline hover:bg-[#ECE9E3]"
          >
            Басты бет
          </Link>
        </div>
      </div>

      {active.data ? (
        <Card className="flex items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-semibold">Аяқталмаған емтихан бар</span>
            <span className="truncate text-sm text-[#5E5E5E]">
              {active.data.level}-деңгей · {active.data.scope.title}
            </span>
          </div>
          <Link
            to={`/exam/session/${active.data.session_id}`}
            className="flex h-11 flex-none items-center rounded-xl bg-[#121212] px-4 text-sm font-semibold text-white no-underline"
          >
            Жалғастыру
          </Link>
        </Card>
      ) : null}

      {subjects.isError ? (
        <Banner tone="bad">{(subjects.error as Error).message}</Banner>
      ) : null}

      <section className="flex flex-col gap-2.5">
        <SectionLabel>Оқулық</SectionLabel>
        <label className="sr-only" htmlFor="exam-book">
          Оқулық
        </label>
        <select
          id="exam-book"
          value={book ?? ''}
          onChange={(event) => {
            setBook(event.target.value);
            writeStored(BOOK_KEY, event.target.value);
            setStartError(null);
          }}
          className="h-12 rounded-[14px] border border-[#E2E0DB] bg-white px-3 text-[15px] font-medium"
        >
          {books.map((b) => (
            <option key={b.book} value={b.book}>
              {b.title}
            </option>
          ))}
        </select>
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionLabel>Емтихан көлемі</SectionLabel>
        <div className="grid grid-cols-3 gap-1 rounded-[14px] bg-[#ECE9E3] p-1" role="group" aria-label="Емтихан көлемі">
          {scopeTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={scopeType === tab.id}
              disabled={tab.disabled}
              onClick={() => pickScope(tab.id)}
              className={
                scopeType === tab.id
                  ? 'h-11 rounded-[10px] bg-white text-sm font-semibold text-[#111111] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                  : 'h-11 rounded-[10px] text-sm font-semibold text-[#4A4A4A] disabled:text-[#B5B0A7]'
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
        {scopeType === 'topic' && scopes.data ? (
          <>
            <label className="sr-only" htmlFor="exam-topic">
              Тақырып
            </label>
            <select
              id="exam-topic"
              value={topicId ?? ''}
              onChange={(event) => {
                setTopicId(event.target.value);
                setStartError(null);
              }}
              className="h-12 rounded-[14px] border border-[#E2E0DB] bg-white px-3 text-[15px]"
            >
              {scopes.data.topics.map((t) => (
                <option key={t.id} value={t.id}>
                  §{t.no} · {t.title}
                </option>
              ))}
            </select>
          </>
        ) : null}
        {scopeType === 'chapter' && scopes.data ? (
          <>
            <label className="sr-only" htmlFor="exam-chapter">
              Тарау
            </label>
            <select
              id="exam-chapter"
              value={chapterId ?? ''}
              onChange={(event) => {
                setChapterId(event.target.value);
                setStartError(null);
              }}
              className="h-12 rounded-[14px] border border-[#E2E0DB] bg-white px-3 text-[15px]"
            >
              {scopes.data.chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <Card className="flex flex-col gap-0.5 px-4 py-3.5">
          <span className="text-base font-semibold">{levels.data?.scope.title ?? ' '}</span>
          <span className="text-sm leading-snug text-[#5E5E5E]">
            {scopeType === 'topic'
              ? 'Бір параграф және оған байланысты ұғымдар'
              : scopeType === 'chapter'
                ? 'Тараудың әр параграфынан тапсырма'
                : 'Оқулықтың барлық параграфынан тең үлеспен'}
          </span>
        </Card>
      </section>

      <section className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-xl font-bold tracking-[-0.01em]">Деңгейді таңдаңыз</h2>
          <p className="m-0 text-sm text-[#5E5E5E]">Кез келген деңгейден бастауға болады</p>
        </div>
        {startError ? <Banner tone="warn">{startError}</Banner> : null}
        {levels.isLoading || scopes.isLoading || subjects.isLoading ? <LoadingBlock /> : null}
        {levels.isError ? <Banner tone="bad">{(levels.error as Error).message}</Banner> : null}
        {levels.data?.levels.map((card) => {
          const status = levelStatus(card);
          const enabled = card.available && card.bank_ready && !start.isPending;
          return (
            <button
              key={card.level}
              type="button"
              disabled={!enabled}
              onClick={() => {
                setStartError(null);
                start.mutate(card.level);
              }}
              className="flex items-start gap-3.5 rounded-2xl border border-[#E2E0DB] bg-white p-4 text-left text-[#111111] transition-colors hover:border-[#CFCBC3] disabled:cursor-default disabled:opacity-60 disabled:hover:border-[#E2E0DB]"
            >
              <span
                aria-hidden="true"
                className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-[#111111] text-lg font-bold text-white"
              >
                {card.level}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[17px] font-semibold">{card.title}</span>
                  <Chip tone={status.tone}>{status.text}</Chip>
                </span>
                <span className="text-sm leading-snug text-[#5E5E5E]">{card.formats.join(', ')}</span>
                <span className="text-[13px] text-[#5E5E5E]">
                  {card.available ? `${card.tasks} тапсырма · ≈${card.minutes} мин` : card.note}
                </span>
                {card.available && !card.bank_ready && card.note ? (
                  <span className="text-[13px] font-medium text-[#5C3A08]">{card.note}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </section>
    </ExamScreen>
  );
}
