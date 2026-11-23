// Сабақ беті (дизайн: LessonDetail.dc.html; karta §3.2, D21, D29): мәтін қауіпсіз көрсетіледі,
// оқушы сақтай алады және өзіне ғана көрінетін жазба қалдырады. Балл мен прогресс жоқ.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { BareScreen, Badge, ButtonLink, ErrorNote, LoadingBlock, StateCard, TopBar } from '@/components/bl/ui';
import SafeMarkdown from '@/components/common/SafeMarkdown';
import { useAuth } from '@/lib/auth-context';
import { LESSON_STATUS_TITLES, getLesson, getNote, isBookmarked, platformKeys, saveNote, setBookmark } from '@/lib/platform-api';
import { BookmarkGlyph } from '@/components/bl/icons';

const SAFE_MEDIA = /^https:\/\//i;

function readingMinutes(body: string | null): number {
  const words = (body ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

function NoteBox({ lessonId, studentId }: { lessonId: string; studentId: string }) {
  const note = useQuery({ queryKey: platformKeys.note(lessonId), queryFn: () => getNote(lessonId) });
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (note.data) setText(note.data.content);
  }, [note.data]);

  const save = useMutation({
    mutationFn: () => saveNote(studentId, lessonId, text),
    onSuccess: () => setStatus('Сақталды'),
  });

  return (
    <section className="mt-2 flex flex-col gap-2 rounded-2xl border border-bl-line bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="lesson-note" className="text-[15px] font-semibold">
          Жеке жазба
        </label>
        <span className="flex items-center gap-1 text-xs text-bl-ink3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          Тек сіз көресіз
        </span>
      </div>
      <textarea
        id="lesson-note"
        value={text}
        maxLength={10000}
        onChange={(e) => {
          setText(e.target.value);
          if (status) setStatus('');
        }}
        placeholder="Өзіңізге маңызды ойды жазып қойыңыз"
        className="box-border min-h-[100px] w-full resize-none rounded-xl border border-bl-field bg-bl-bg px-3.5 py-3 text-base leading-normal text-bl-ink focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-bl-ink"
      />
      {save.isError ? <ErrorNote error={save.error} /> : null}
      <div className="flex items-center justify-between">
        <span role="status" className="text-[13px] font-semibold text-bl-oktext">
          {status}
        </span>
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="h-11 rounded-xl border-0 bg-bl-btn px-[18px] text-[15px] font-semibold text-white disabled:opacity-60"
        >
          {save.isPending ? 'Сақталуда…' : 'Сақтау'}
        </button>
      </div>
    </section>
  );
}

export default function LessonViewPage() {
  const { lessonId = '' } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const lesson = useQuery({ queryKey: platformKeys.lesson(lessonId), queryFn: () => getLesson(lessonId), enabled: !!lessonId });
  const isStudent = user?.role === 'student';
  const bookmark = useQuery({ queryKey: platformKeys.bookmark(lessonId), queryFn: () => isBookmarked(lessonId), enabled: isStudent && !!lessonId });
  const toggle = useMutation({
    mutationFn: () => setBookmark(user!.id, lessonId, !bookmark.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.bookmark(lessonId) });
      void queryClient.invalidateQueries({ queryKey: platformKeys.saved });
    },
  });

  const data = lesson.data;
  const back = user?.role === 'teacher' ? '/teacher/lessons' : user?.role === 'admin' ? '/manage-lessons' : '/lessons';

  return (
    <BareScreen
      header={
        <TopBar
          back={back}
          backLabel="Сабақтарға оралу"
          right={
            isStudent && data ? (
              <button
                type="button"
                aria-pressed={Boolean(bookmark.data)}
                aria-label={bookmark.data ? 'Сақталғандардан алу' : 'Сақтау'}
                disabled={toggle.isPending || bookmark.isLoading}
                onClick={() => toggle.mutate()}
                className="-mr-2 flex h-11 w-11 items-center justify-center rounded-xl border-0 bg-transparent text-bl-ink hover:bg-bl-soft disabled:opacity-60"
              >
                <BookmarkGlyph on={Boolean(bookmark.data)} />
              </button>
            ) : user?.role === 'teacher' && data && data.author_id === user.id ? (
              <ButtonLink to={`/teacher/lessons/${data.id}/edit`} size="sm" full={false}>
                Өңдеу
              </ButtonLink>
            ) : undefined
          }
        />
      }
    >
      <article className="flex flex-col gap-3.5 px-5 pb-6 pt-1">
        {lesson.isLoading ? <LoadingBlock rows={4} /> : null}
        {lesson.isError ? <ErrorNote error={lesson.error} onRetry={() => lesson.refetch()} /> : null}
        {lesson.data === null ? (
          <StateCard mark="404" title="Сабақ табылмады" text="Сабақ жойылған, жасырылған немесе әлі жарияланбаған.">
            <ButtonLink to={back}>Сабақтарға оралу</ButtonLink>
          </StateCard>
        ) : null}
        {toggle.isError ? <ErrorNote error={toggle.error} /> : null}

        {data ? (
          <>
            <div className="flex flex-col gap-1.5">
              <h1 className="m-0 text-[26px] font-bold leading-[1.25] tracking-[-0.02em]">{data.title}</h1>
              <span className="flex flex-wrap items-center gap-1.5 text-sm text-bl-ink2">
                {data.author_name} · {readingMinutes(data.body_md)} мин
                {data.status !== 'published' ? <Badge tone="muted">{LESSON_STATUS_TITLES[data.status]}</Badge> : null}
              </span>
            </div>
            {data.media_url && SAFE_MEDIA.test(data.media_url) ? (
              <a
                href={data.media_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex h-12 items-center justify-center rounded-[14px] border border-bl-field bg-white text-[15px] font-semibold text-bl-ink no-underline"
              >
                Бейнені ашу ↗
              </a>
            ) : null}
            <div className="text-base leading-[1.6] [&_h2]:mb-0 [&_h2]:mt-1.5 [&_h2]:text-lg [&_h2]:font-bold [&_li]:leading-[1.55] [&_p]:m-0 [&_ul]:pl-5">
              <SafeMarkdown source={data.body_md ?? ''} />
            </div>
            {isStudent && user ? <NoteBox lessonId={data.id} studentId={user.id} /> : null}
          </>
        ) : null}
      </article>
    </BareScreen>
  );
}
