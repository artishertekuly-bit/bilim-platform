// Сабақтар (дизайн: Lessons.dc.html; karta §3.2, D19, D21; api §5.1): іздеу, «Барлығы / Сақталғандар», бетбелгі.
// Сабақта тест, балл және прогресс жоқ: бұл — өмірлік дағдылар туралы дербес сабақтар.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import AppShell from '@/components/bl/AppShell';
import { BookmarkGlyph, SearchIcon } from '@/components/bl/icons';
import { EmptyNote, ErrorNote, LoadingBlock, Page, PageTitle, Segmented } from '@/components/bl/ui';
import { useAuth } from '@/lib/auth-context';
import { platformKeys, savedLessons, searchLessons, setBookmark, type LessonCard } from '@/lib/platform-api';

function LessonRow({ lesson, saved, onToggle, busy }: { lesson: LessonCard; saved: boolean; onToggle: () => void; busy: boolean }) {
  return (
    <article className="flex items-start gap-2 rounded-2xl border border-bl-line bg-white py-3.5 pl-4 pr-2">
      <Link to={`/lessons/${lesson.lesson_id}`} className="flex min-w-0 flex-1 flex-col gap-1.5 text-bl-ink no-underline">
        <span className="text-base font-semibold leading-[1.35]">{lesson.title}</span>
        <span className="text-[13px] text-bl-ink2">{lesson.author_name}</span>
      </Link>
      <button
        type="button"
        aria-pressed={saved}
        aria-label={saved ? 'Сақталғандардан алу' : 'Сақтау'}
        disabled={busy}
        onClick={onToggle}
        className="flex h-11 w-11 flex-none items-center justify-center rounded-xl border-0 bg-transparent text-bl-ink hover:bg-bl-soft disabled:opacity-60"
      >
        <BookmarkGlyph on={saved} />
      </button>
    </article>
  );
}

export default function LessonsCatalogPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'saved' ? 'saved' : 'all';
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(input.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [input]);

  const all = useQuery({ queryKey: platformKeys.lessons(query), queryFn: () => searchLessons(query, 40, 0), enabled: tab === 'all' });
  const saved = useQuery({ queryKey: platformKeys.saved, queryFn: savedLessons });
  const savedIds = useMemo(() => new Set((saved.data ?? []).map((l) => l.lesson_id)), [saved.data]);

  const toggle = useMutation({
    mutationFn: (lessonId: string) => setBookmark(user!.id, lessonId, !savedIds.has(lessonId)),
    onSuccess: (_, lessonId) => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.saved });
      void queryClient.invalidateQueries({ queryKey: platformKeys.bookmark(lessonId) });
    },
  });

  const q = query.toLowerCase();
  const items =
    tab === 'all' ? all.data?.items : saved.data?.filter((l) => !q || l.title.toLowerCase().includes(q));
  const active = tab === 'all' ? all : saved;

  return (
    <AppShell>
      <Page className="gap-4">
        <PageTitle title="Сабақтар" subtitle="Өмірде керек дағдылар туралы қысқа сабақтар" />

        <div className="relative">
          <label htmlFor="lessons-q" className="sr-only">
            Сабақ іздеу
          </label>
          <SearchIcon className="pointer-events-none absolute left-3.5 top-3.5 text-bl-ink2" />
          <input
            id="lessons-q"
            type="search"
            placeholder="Іздеу"
            maxLength={120}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="box-border h-12 w-full rounded-[14px] border border-bl-field bg-white pl-11 pr-3.5 text-base text-bl-ink placeholder:text-bl-mute focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-bl-ink"
          />
        </div>

        <Segmented
          label="Сабақтар тізімі"
          value={tab}
          onChange={(id) => setParams(id === 'saved' ? { tab: 'saved' } : {}, { replace: true })}
          options={[
            { id: 'all', label: 'Барлығы' },
            { id: 'saved', label: 'Сақталғандар' },
          ]}
        />

        <div className="flex flex-col gap-2.5">
          {active.isLoading ? <LoadingBlock rows={4} /> : null}
          {active.isError ? <ErrorNote error={active.error} onRetry={() => active.refetch()} /> : null}
          {toggle.isError ? <ErrorNote error={toggle.error} /> : null}
          {items?.map((lesson) => (
            <LessonRow
              key={lesson.lesson_id}
              lesson={lesson}
              saved={savedIds.has(lesson.lesson_id)}
              busy={toggle.isPending && toggle.variables === lesson.lesson_id}
              onToggle={() => toggle.mutate(lesson.lesson_id)}
            />
          ))}
          {items && items.length === 0 ? (
            <EmptyNote>{tab === 'saved' && !q ? 'Сақталған сабақ әзірге жоқ' : q ? 'Ештеңе табылмады' : 'Әзірге жарияланған сабақ жоқ'}</EmptyNote>
          ) : null}
          {tab === 'all' && all.data && all.data.total > all.data.items.length ? (
            <p className="m-0 text-center text-xs text-bl-ink2">
              Алғашқы {all.data.items.length} сабақ көрсетілді ({all.data.total}). Іздеуді нақтылаңыз.
            </p>
          ) : null}
        </div>
      </Page>
    </AppShell>
  );
}
