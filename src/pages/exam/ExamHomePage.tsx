// Емтихан · деңгей таңдау (дизайн: Main.dc.html, ExamStates.dc.html «Аяқталмаған», «Тапсырма жоқ»).
// Оқулық пен § таңдау — бөлек бетте (/exam/picker, ExamPicker.dc.html).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import AppShell from '@/components/bl/AppShell';
import { ChevronDownIcon, LessonsIcon } from '@/components/bl/icons';
import {
  Badge,
  Banner,
  Button,
  ButtonLink,
  Card,
  ConfirmSheet,
  ErrorNote,
  LoadingBlock,
  Page,
  Section,
  Segmented,
} from '@/components/bl/ui';
import { useExamSelection } from '@/lib/exam-selection';
import { ExaminerApiError, type LevelCard, type ScopeType, useExaminerApi } from '@/lib/examiner-api';

const SCOPE_SUB: Record<ScopeType, string> = {
  topic: 'Бір параграф және оған байланысты ұғымдар',
  chapter: 'Тараудың әр параграфынан тапсырма',
  subject: 'Оқулықтың барлық параграфынан тең үлеспен',
};

function levelStatus(card: LevelCard): { text: string; tone: 'good' | 'neutral' } {
  const p = card.last.p;
  if (p === null) return { text: 'Өтпеді', tone: 'neutral' };
  const value = `${Math.round(p)}%`;
  return card.last.mastered ? { text: `Меңгерілді · ${value}`, tone: 'good' } : { text: value, tone: 'neutral' };
}

export default function ExamHomePage() {
  const api = useExaminerApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sel, update] = useExamSelection();
  const [startError, setStartError] = useState<string | null>(null);
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  const subjects = useQuery({ queryKey: ['examiner', 'subjects'], queryFn: api.subjects });
  const books = useMemo(
    () => (subjects.data ?? []).flatMap((s) => s.books.map((b) => ({ ...b, subject: s.title }))),
    [subjects.data],
  );

  useEffect(() => {
    if (books.length && (!sel.book || !books.some((b) => b.book === sel.book))) update({ book: books[0].book });
  }, [books, sel.book, update]);

  const scopes = useQuery({
    queryKey: ['examiner', 'scopes', sel.book],
    queryFn: () => api.scopes(sel.book as string),
    enabled: Boolean(sel.book),
  });

  useEffect(() => {
    const data = scopes.data;
    if (!data) return;
    const patch: Parameters<typeof update>[0] = {};
    if (!sel.topicId || !data.topics.some((t) => t.id === sel.topicId)) patch.topicId = data.topics[0]?.id ?? null;
    if (!sel.chapterId || !data.chapters.some((c) => c.id === sel.chapterId)) patch.chapterId = data.chapters[0]?.id ?? null;
    if (sel.scopeType === 'chapter' && !data.book.has_chapters) patch.scopeType = 'topic';
    if (Object.keys(patch).length) update(patch);
  }, [scopes.data, sel.topicId, sel.chapterId, sel.scopeType, update]);

  const scopeId = sel.scopeType === 'topic' ? sel.topicId : sel.scopeType === 'chapter' ? sel.chapterId : sel.book;
  const levels = useQuery({
    queryKey: ['examiner', 'levels', sel.scopeType, scopeId],
    queryFn: () => api.levels(sel.scopeType, scopeId as string),
    enabled: Boolean(scopeId),
  });
  const active = useQuery({ queryKey: ['examiner', 'active'], queryFn: api.active });

  const start = useMutation({
    mutationFn: (level: number) => api.start(sel.scopeType, scopeId as string, level),
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

  const abandon = useMutation({
    mutationFn: (sessionId: string) => api.abandon(sessionId),
    onSuccess: async () => {
      setConfirmAbandon(false);
      await queryClient.invalidateQueries({ queryKey: ['examiner'] });
    },
  });

  const currentBook = books.find((b) => b.book === sel.book);
  const hasChapters = scopes.data ? scopes.data.book.has_chapters : false;
  const allEmpty = levels.data ? levels.data.levels.every((l) => !l.available) : false;
  const loading = subjects.isLoading || scopes.isLoading || levels.isLoading;

  return (
    <AppShell>
      <Page className="gap-[22px] pt-6">
        {/* Ноутбукта (дизайн: DesktopStudent.dc.html) тақырып пен көлем бір жолда, деңгейлер екі бағанда. */}
        <div className="flex flex-col gap-[22px] lg:flex-row lg:flex-wrap lg:items-end lg:justify-between lg:gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-bold leading-[1.15] tracking-[-0.02em]">Емтихан</h1>
          <Link
            to="/exam/picker"
            aria-label={currentBook ? `Оқулықты ауыстыру: ${currentBook.subject}, ${currentBook.grade}-сынып` : 'Оқулықты таңдау'}
            className="flex min-h-8 items-center gap-1 self-start text-[15px] text-bl-ink2 no-underline"
          >
            {currentBook ? `${currentBook.subject} · ${currentBook.grade}-сынып` : 'Оқулықты таңдаңыз'}
            {levels.data?.scope.title ? <span className="hidden lg:inline">&nbsp;· {levels.data.scope.title}</span> : null}
            <ChevronDownIcon size={16} />
          </Link>
        </div>

        {active.data ? (
          <Card className="flex flex-col gap-3 p-4 lg:order-last lg:basis-full">
            <div className="flex items-center gap-3.5">
              <span aria-hidden="true" className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-bl-ink text-lg font-bold text-white">
                {active.data.level}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[17px] font-semibold">Аяқталмаған сессия бар</span>
                <span className="truncate text-sm text-bl-ink2">{active.data.scope.title}</span>
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[13px] text-bl-ink2">
                <span>Орындалды</span>
                <span className="font-semibold text-bl-ink">
                  {active.data.progress.answered} / {active.data.progress.total}
                </span>
              </div>
              <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-bl-line">
                <div
                  className="h-full rounded-full bg-bl-ink"
                  style={{ width: `${active.data.progress.total ? (active.data.progress.answered / active.data.progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
            <ButtonLink to={`/exam/session/${active.data.session_id}`}>Жалғастыру</ButtonLink>
            <Button variant="secondary" size="md" onClick={() => setConfirmAbandon(true)}>
              Аяқтап, жаңасын бастау
            </Button>
          </Card>
        ) : null}

        {subjects.isError ? (
          <div className="lg:order-last lg:basis-full">
            <ErrorNote error={subjects.error} onRetry={() => subjects.refetch()} />
          </div>
        ) : null}

        <div className="lg:w-[360px] lg:[&_h2]:sr-only">
        <Section label="Емтихан көлемі">
          <Segmented
            label="Емтихан көлемі"
            value={sel.scopeType}
            onChange={(id) => {
              update({ scopeType: id });
              setStartError(null);
            }}
            options={[
              { id: 'topic', label: 'Тақырып' },
              { id: 'chapter', label: 'Тарау', disabled: !hasChapters },
              { id: 'subject', label: 'Пән' },
            ]}
          />
          <Link
            to="/exam/picker"
            className="flex flex-col gap-0.5 rounded-2xl border border-bl-line bg-white px-4 py-3.5 text-bl-ink no-underline hover:border-bl-field lg:hidden"
          >
            <span className="text-base font-semibold">{levels.data?.scope.title ?? ' '}</span>
            <span className="text-sm leading-[1.4] text-bl-ink2">{SCOPE_SUB[sel.scopeType]}</span>
          </Link>
        </Section>
        </div>
        </div>

        <section className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-0.5">
            <h2 className="m-0 text-xl font-bold tracking-[-0.01em]">Деңгейді таңдаңыз</h2>
            <p className="m-0 text-sm text-bl-ink2">Кез келген деңгейден бастауға болады</p>
          </div>
          {startError ? <Banner tone="warn">{startError}</Banner> : null}
          {loading ? <LoadingBlock rows={4} /> : null}
          {levels.isError ? <ErrorNote error={levels.error} onRetry={() => levels.refetch()} /> : null}

          {allEmpty ? (
            <div className="flex flex-col gap-4">
              <section className="flex flex-col items-center gap-3 rounded-[20px] border border-bl-line bg-white px-5 py-7 text-center">
                <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-bl-soft">
                  <LessonsIcon size={26} />
                </span>
                <h3 className="m-0 text-[22px] font-bold">Бұл тақырыптың тапсырмалары әлі дайын емес</h3>
                <p className="m-0 text-[15px] leading-normal text-bl-ink3">
                  {levels.data?.scope.title} бойынша жеткілікті тапсырма жоқ. Басқа тақырып таңдаңыз.
                </p>
              </section>
              <ButtonLink to="/exam/picker">Тақырыпты ауыстыру</ButtonLink>
              <ButtonLink to="/ai-tutor" variant="secondary" size="md">
                Тьютормен қайталау
              </ButtonLink>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(300px,1fr))] lg:gap-4">
            {levels.data?.levels.map((card) => {
              const status = levelStatus(card);
              const enabled = card.available && card.availability !== 'unavailable' && !start.isPending;
              return (
                <button
                  key={card.level}
                  type="button"
                  disabled={!enabled}
                  onClick={() => {
                    setStartError(null);
                    start.mutate(card.level);
                  }}
                  className="flex items-start gap-3.5 rounded-2xl border border-bl-line bg-white p-4 text-left text-bl-ink transition-colors hover:border-bl-field disabled:cursor-default disabled:opacity-60 disabled:hover:border-bl-line"
                >
                  <span aria-hidden="true" className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-bl-ink text-lg font-bold text-white">
                    {card.level}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[17px] font-semibold">{card.title}</span>
                      <Badge tone={status.tone}>{status.text}</Badge>
                    </span>
                    <span className="text-sm leading-[1.4] text-bl-ink2">{card.formats.join(', ')}</span>
                    <span className="text-[13px] text-bl-ink2">
                      {card.available ? `${card.tasks} тапсырма · ≈${card.minutes} мин` : card.note}
                    </span>
                    {card.available && card.availability === 'unavailable' && card.note ? (
                      <span className="text-[13px] font-medium text-bl-warntext">{card.note}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
            </div>
          )}
        </section>
      </Page>

      <ConfirmSheet
        open={confirmAbandon}
        onClose={() => setConfirmAbandon(false)}
        title="Сессияны аяқтайсыз ба?"
        description="Тасталған сессия профильге балл бермейді. Көрген тапсырмаларыңыз келесі сессияларда біраз уақыт қайталанбайды."
        cancelLabel="Жалғастыру"
        confirmLabel="Аяқтау"
        busy={abandon.isPending}
        onConfirm={() => active.data && abandon.mutate(active.data.session_id)}
      />
    </AppShell>
  );
}
