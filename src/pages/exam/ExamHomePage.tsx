// Емтихан · деңгей таңдау (дизайн: Main.dc.html, ExamStates.dc.html «Аяқталмаған»).
// Пән мен тақырып — бөлек бетте (/exam/picker, D93): оқушы тақырыпты өзі жазады.
// Барлық деңгей ашық: банкте сұрақ жетпесе, деңгей басталғанда олар осы тақырыпқа құрылады (D93).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import AppShell from '@/components/bl/AppShell';
import { ChevronDownIcon, LessonsIcon } from '@/components/bl/icons';
import { Badge, Banner, Button, ButtonLink, Card, ConfirmSheet, ErrorNote, LoadingBlock, Page } from '@/components/bl/ui';
import { useExamSelection } from '@/lib/exam-selection';
import { ExaminerApiError, type LevelCard, useExaminerApi } from '@/lib/examiner-api';

const SCOPE_SUB: Record<string, string> = {
  topic: 'Тақырыпты ауыстыру',
  chapter: 'Тараудың әр бөлімінен тапсырма',
  subject: 'Оқулықтың барлық бөлімінен тең үлеспен',
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
  const [sel] = useExamSelection();
  const [startError, setStartError] = useState<string | null>(null);
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  const subjects = useQuery({ queryKey: ['examiner', 'subjects'], queryFn: api.subjects });
  const subjectTitle = useMemo(() => {
    const list = subjects.data ?? [];
    const subject = list.find((s) => s.subject_id === sel.subjectId) ?? list.find((s) => s.books.some((b) => b.book === sel.book));
    return subject?.title ?? null;
  }, [subjects.data, sel.subjectId, sel.book]);

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

  const scopeTitle = levels.data?.scope.title ?? null;
  const preparing = active.data?.status === 'preparing';

  return (
    <AppShell>
      <Page className="gap-[22px] pt-6">
        <div className="flex flex-col gap-[22px] lg:flex-row lg:flex-wrap lg:items-end lg:justify-between lg:gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-[28px] font-bold leading-[1.15] tracking-[-0.02em]">Емтихан</h1>
            <Link
              to="/exam/picker"
              aria-label={scopeId ? `Пән мен тақырыпты ауыстыру: ${subjectTitle ?? ''} ${scopeTitle ?? ''}` : 'Пән мен тақырыпты таңдау'}
              className="flex min-h-8 items-center gap-1 self-start text-[15px] text-bl-ink2 no-underline"
            >
              {scopeId ? subjectTitle ?? 'Пән' : 'Пән мен тақырыпты таңдаңыз'}
              {scopeId && scopeTitle ? <span className="hidden lg:inline">&nbsp;· {scopeTitle}</span> : null}
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
                  <span className="text-[17px] font-semibold">{preparing ? 'Тапсырмалар дайындалып жатыр' : 'Аяқталмаған сессия бар'}</span>
                  <span className="truncate text-sm text-bl-ink2">{active.data.scope.title}</span>
                </span>
              </div>
              {preparing ? null : (
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
              )}
              <ButtonLink to={`/exam/session/${active.data.session_id}`}>{preparing ? 'Ашу' : 'Жалғастыру'}</ButtonLink>
              <Button variant="secondary" size="md" onClick={() => setConfirmAbandon(true)}>
                {preparing ? 'Тоқтату' : 'Аяқтап, жаңасын бастау'}
              </Button>
            </Card>
          ) : null}

          {subjects.isError ? (
            <div className="lg:order-last lg:basis-full">
              <ErrorNote error={subjects.error} onRetry={() => subjects.refetch()} />
            </div>
          ) : null}

          {scopeId ? (
            <Link
              to="/exam/picker"
              className="flex flex-col gap-0.5 rounded-2xl border border-bl-line bg-white px-4 py-3.5 text-bl-ink no-underline hover:border-bl-field lg:hidden"
            >
              <span className="text-base font-semibold">{scopeTitle ?? ' '}</span>
              <span className="text-sm leading-[1.4] text-bl-ink2">{SCOPE_SUB[sel.scopeType]}</span>
            </Link>
          ) : null}
        </div>

        {scopeId ? (
          <section className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-0.5">
              <h2 className="m-0 text-xl font-bold tracking-[-0.01em]">Деңгейді таңдаңыз</h2>
              <p className="m-0 text-sm text-bl-ink2">Кез келген деңгейден бастауға болады</p>
            </div>
            {startError ? <Banner tone="warn">{startError}</Banner> : null}
            {levels.isLoading ? <LoadingBlock rows={4} /> : null}
            {levels.isError ? <ErrorNote error={levels.error} onRetry={() => levels.refetch()} /> : null}

            <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(300px,1fr))] lg:gap-4">
              {levels.data?.levels.map((card) => {
                const status = levelStatus(card);
                return (
                  <button
                    key={card.level}
                    type="button"
                    disabled={start.isPending}
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
                        {card.tasks} тапсырма · ≈{card.minutes} мин
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : subjects.isLoading ? (
          <LoadingBlock rows={3} />
        ) : (
          <section className="flex flex-col items-center gap-3 rounded-[20px] border border-bl-line bg-white px-5 py-7 text-center">
            <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-bl-soft">
              <LessonsIcon size={26} />
            </span>
            <h2 className="m-0 text-[22px] font-bold">Не бойынша тапсырасыз?</h2>
            <p className="m-0 text-[15px] leading-normal text-bl-ink3">Пәнді таңдап, тақырыпты өзіңіз жазыңыз.</p>
            <ButtonLink to="/exam/picker" full={false} className="px-6">
              Пән мен тақырыпты таңдау
            </ButtonLink>
          </section>
        )}
      </Page>

      <ConfirmSheet
        open={confirmAbandon}
        onClose={() => setConfirmAbandon(false)}
        title={preparing ? 'Дайындауды тоқтатасыз ба?' : 'Сессияны аяқтайсыз ба?'}
        description={
          preparing
            ? 'Сессия тоқтатылады. Құрылып жатқан тапсырмалар банкте қалады, оларды кейін бастай аласыз.'
            : 'Тасталған сессия профильге балл бермейді. Көрген тапсырмаларыңыз келесі сессияларда біраз уақыт қайталанбайды.'
        }
        cancelLabel={preparing ? 'Күту' : 'Жалғастыру'}
        confirmLabel={preparing ? 'Тоқтату' : 'Аяқтау'}
        busy={abandon.isPending}
        onConfirm={() => active.data && abandon.mutate(active.data.session_id)}
      />
    </AppShell>
  );
}
