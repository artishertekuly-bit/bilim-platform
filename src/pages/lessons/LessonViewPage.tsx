// Сабақ беті (karta §3.2, D21, D29; api §5.1): мәтін қауіпсіз көрсетіледі, оқушы сақтай алады және
// өзіне ғана көрінетін жазба қалдырады. Балл мен прогресс жоқ.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import SafeMarkdown from '@/components/common/SafeMarkdown';
import { Banner, Card, Chip, ExamScreen, LoadingBlock, SectionLabel, SimpleHeader } from '@/components/exam/ExamUi';
import { useAuth } from '@/lib/auth-context';
import {
  LESSON_STATUS_TITLES,
  getLesson,
  getNote,
  isBookmarked,
  platformKeys,
  saveNote,
  setBookmark,
} from '@/lib/platform-api';
import { formatDateTime } from '@/lib/teacher-ui';

const SAFE_MEDIA = /^https:\/\//i;

function StudentTools({ lessonId, studentId }: { lessonId: string; studentId: string }) {
  const queryClient = useQueryClient();
  const bookmark = useQuery({ queryKey: platformKeys.bookmark(lessonId), queryFn: () => isBookmarked(lessonId) });
  const note = useQuery({ queryKey: platformKeys.note(lessonId), queryFn: () => getNote(lessonId) });
  const [text, setText] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (note.data) setText(note.data.content);
  }, [note.data]);

  const toggle = useMutation({
    mutationFn: () => setBookmark(studentId, lessonId, !bookmark.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.bookmark(lessonId) });
      void queryClient.invalidateQueries({ queryKey: platformKeys.saved });
    },
  });
  const save = useMutation({
    mutationFn: () => saveNote(studentId, lessonId, text),
    onSuccess: () => setSavedAt(new Date().toISOString()),
  });

  return (
    <>
      <button
        type="button"
        disabled={toggle.isPending || bookmark.isLoading}
        onClick={() => toggle.mutate()}
        className="h-12 rounded-[14px] border border-[#D9D6D0] bg-white text-[15px] font-semibold disabled:opacity-60"
      >
        {bookmark.data ? 'Сақталғандардан алу' : 'Сақтау'}
      </button>
      {toggle.isError ? <Banner tone="bad">{(toggle.error as Error).message}</Banner> : null}

      <section className="flex flex-col gap-2">
        <SectionLabel>Жеке жазбам</SectionLabel>
        <p className="m-0 text-xs text-[#5E5E5E]">Бұл жазбаны тек сіз көресіз: мұғалім де, әкімші де көрмейді.</p>
        <textarea
          value={text}
          rows={5}
          maxLength={10000}
          onChange={(event) => setText(event.target.value)}
          className="rounded-[14px] border border-[#D9D6D0] bg-white px-4 py-3 text-[15px] outline-none focus:border-[#111111]"
          placeholder="Ойыңызды жазып қойыңыз…"
        />
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate()}
          className="h-11 rounded-[14px] bg-[#121212] text-[15px] font-semibold text-white disabled:opacity-60"
        >
          {save.isPending ? 'Сақталуда…' : 'Жазбаны сақтау'}
        </button>
        {save.isError ? <Banner tone="bad">{(save.error as Error).message}</Banner> : null}
        {savedAt ? <span className="text-xs text-[#1F6B3F]">Сақталды · {formatDateTime(savedAt)}</span> : null}
      </section>
    </>
  );
}

export default function LessonViewPage() {
  const { lessonId = '' } = useParams();
  const { user } = useAuth();
  const lesson = useQuery({ queryKey: platformKeys.lesson(lessonId), queryFn: () => getLesson(lessonId), enabled: !!lessonId });
  const data = lesson.data;
  const back = user?.role === 'teacher' ? '/teacher/lessons' : user?.role === 'admin' ? '/manage-lessons' : '/lessons';

  return (
    <ExamScreen header={<SimpleHeader title="Сабақ" to={back} />}>
      {lesson.isLoading ? <LoadingBlock /> : null}
      {lesson.isError ? <Banner tone="bad">{(lesson.error as Error).message}</Banner> : null}
      {lesson.data === null ? <Banner tone="bad">Сабақ табылмады немесе әлі жарияланбаған.</Banner> : null}
      {data ? (
        <>
          <section className="flex flex-col gap-1.5">
            <h1 className="m-0 text-2xl font-bold leading-tight">{data.title}</h1>
            <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-[#5E5E5E]">
              {data.author_name}
              {data.published_at ? ` · ${formatDateTime(data.published_at)}` : ''}
              {data.status !== 'published' ? <Chip tone="muted">{LESSON_STATUS_TITLES[data.status]}</Chip> : null}
            </span>
          </section>
          {data.media_url && SAFE_MEDIA.test(data.media_url) ? (
            <a
              href={data.media_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex h-11 items-center justify-center rounded-[14px] border border-[#D9D6D0] bg-white text-[15px] font-semibold text-[#111111] no-underline"
            >
              Бейнені ашу ↗
            </a>
          ) : null}
          <Card className="px-4 py-4">
            <SafeMarkdown source={data.body_md ?? ''} />
          </Card>
          {user?.role === 'student' ? <StudentTools lessonId={data.id} studentId={user.id} /> : null}
          {user?.role === 'teacher' && data.author_id === user.id ? (
            <Link
              to={`/teacher/lessons/${data.id}/edit`}
              className="flex h-12 items-center justify-center rounded-[14px] bg-[#121212] text-[15px] font-semibold text-white no-underline"
            >
              Өңдеу
            </Link>
          ) : null}
        </>
      ) : null}
    </ExamScreen>
  );
}
