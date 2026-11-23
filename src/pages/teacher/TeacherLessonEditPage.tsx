// Сабақ редакторы (D20; api §5.1): жариялау шартын дерекқор да тексереді — атауы ≥ 5, мәтіні ≥ 20 таңба.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import SafeMarkdown from '@/components/common/SafeMarkdown';
import { Banner, Card, Chip, LoadingBlock, PrimaryButton } from '@/components/exam/ExamUi';
import TeacherScreen from '@/components/teacher/TeacherScreen';
import { useAuth } from '@/lib/auth-context';
import {
  LESSON_STATUS_TITLES,
  createLesson,
  deleteLesson,
  getLesson,
  platformKeys,
  updateLesson,
  type LessonDraft,
} from '@/lib/platform-api';
import { inputClass } from '@/lib/teacher-ui';
import { cn } from '@/lib/utils';

const MIN_TITLE = 5;
const MIN_BODY = 20;

export default function TeacherLessonEditPage() {
  const { lessonId } = useParams();
  const isNew = !lessonId;
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lesson = useQuery({
    queryKey: platformKeys.lesson(lessonId ?? 'new'),
    queryFn: () => getLesson(lessonId ?? ''),
    enabled: !isNew,
  });

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [media, setMedia] = useState('');
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (lesson.data) {
      setTitle(lesson.data.title);
      setBody(lesson.data.body_md ?? '');
      setMedia(lesson.data.media_url ?? '');
    }
  }, [lesson.data]);

  const status = lesson.data?.status ?? 'draft';
  const hidden = status === 'hidden';
  const canPublish = title.trim().length >= MIN_TITLE && body.trim().length >= MIN_BODY;
  const mediaValid = !media.trim() || /^https:\/\//i.test(media.trim());

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: platformKeys.teacherLessons });
    void queryClient.invalidateQueries({ queryKey: ['platform', 'lesson'] });
    void queryClient.invalidateQueries({ queryKey: ['platform', 'lessons'] });
  };

  const save = useMutation({
    mutationFn: async (nextStatus: LessonDraft['status'] | null) => {
      const draft: Partial<LessonDraft> = {
        title: title.trim(),
        body_md: body,
        media_url: media.trim() || null,
        ...(nextStatus && !hidden ? { status: nextStatus } : {}),
      };
      if (isNew) {
        return createLesson(user?.id ?? '', { status: 'draft', ...draft } as LessonDraft);
      }
      await updateLesson(lessonId, draft);
      return lessonId;
    },
    onSuccess: (id, nextStatus) => {
      refresh();
      setNotice(nextStatus === 'published' ? 'Сабақ жарияланды.' : nextStatus === 'draft' ? 'Сабақ жобаға қайтарылды.' : 'Сақталды.');
      if (isNew) navigate(`/teacher/lessons/${id}/edit`, { replace: true });
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteLesson(lessonId ?? ''),
    onSuccess: () => {
      refresh();
      navigate('/teacher/lessons', { replace: true });
    },
  });

  const busy = save.isPending || remove.isPending;
  const error = (save.error ?? remove.error) as Error | null;

  return (
    <TeacherScreen title={isNew ? 'Жаңа сабақ' : 'Сабақты өңдеу'} back="/teacher/lessons">
      {lesson.isLoading ? <LoadingBlock /> : null}
      {lesson.isError ? <Banner tone="bad">{(lesson.error as Error).message}</Banner> : null}
      {!isNew && lesson.data === null ? <Banner tone="bad">Сабақ табылмады.</Banner> : null}

      {isNew || lesson.data ? (
        <>
          {!isNew ? (
            <span className="flex items-center gap-2">
              <Chip tone={status === 'published' ? 'good' : 'muted'}>{LESSON_STATUS_TITLES[status]}</Chip>
              {status === 'published' ? (
                <Link to={`/lessons/${lessonId}`} className="text-sm font-semibold text-[#111111]">
                  Оқушы көзімен қарау
                </Link>
              ) : null}
            </span>
          ) : null}
          {hidden ? (
            <Banner tone="warn">
              Бұл сабақты әкімші жасырған. Мәтінді түзетуге болады, бірақ қайта ашуды тек әкімші шешеді.
            </Banner>
          ) : null}

          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Атауы
            <input className={inputClass} value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Бейне сілтемесі (міндетті емес, https://…)
            <input
              className={cn(inputClass, !mediaValid && 'border-[#B42323]')}
              value={media}
              maxLength={500}
              placeholder="https://"
              onChange={(event) => setMedia(event.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-1.5 rounded-[14px] bg-[#ECE9E3] p-1">
            {[false, true].map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={preview === value}
                onClick={() => setPreview(value)}
                className={cn('h-10 rounded-xl text-sm font-semibold', preview === value ? 'bg-white shadow-sm' : 'text-[#4A4A4A]')}
              >
                {value ? 'Алдын ала көру' : 'Мәтін'}
              </button>
            ))}
          </div>
          {preview ? (
            <Card className="px-4 py-4">
              <SafeMarkdown source={body || '_Мәтін әлі жоқ._'} />
            </Card>
          ) : (
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Мәтіні (markdown: ## тақырып, **қалың**, - тізім)
              <textarea
                value={body}
                rows={14}
                maxLength={50000}
                onChange={(event) => setBody(event.target.value)}
                className="rounded-[14px] border border-[#D9D6D0] bg-white px-4 py-3 font-mono text-[14px] font-normal leading-relaxed outline-none focus:border-[#111111]"
              />
            </label>
          )}
          <p className="m-0 text-xs text-[#5E5E5E]">
            Жариялау үшін атауы кемінде {MIN_TITLE}, мәтіні кемінде {MIN_BODY} таңба болсын. Қазір: {title.trim().length} /{' '}
            {body.trim().length}.
          </p>

          {error ? <Banner tone="bad">{error.message}</Banner> : null}
          {notice && !error ? <Banner tone="good">{notice}</Banner> : null}

          <div className="flex flex-col gap-2">
            {status === 'published' ? (
              <>
                <PrimaryButton disabled={busy || !canPublish || !mediaValid} onClick={() => save.mutate(null)}>
                  Өзгерісті сақтау
                </PrimaryButton>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => save.mutate('draft')}
                  className="h-12 rounded-[14px] border border-[#D9D6D0] bg-white text-[15px] font-semibold disabled:opacity-60"
                >
                  Жариялаудан алу
                </button>
              </>
            ) : (
              <>
                {!hidden ? (
                  <PrimaryButton disabled={busy || !canPublish || !mediaValid} onClick={() => save.mutate('published')}>
                    Жариялау
                  </PrimaryButton>
                ) : null}
                <button
                  type="button"
                  disabled={busy || !title.trim() || !mediaValid}
                  onClick={() => save.mutate(null)}
                  className="h-12 rounded-[14px] border border-[#D9D6D0] bg-white text-[15px] font-semibold disabled:opacity-60"
                >
                  {save.isPending ? 'Сақталуда…' : 'Жоба ретінде сақтау'}
                </button>
              </>
            )}
            {!isNew ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Сабақ біржола өшіріледі: оқушылардың сақтауы мен жазбалары да өшеді. Жалғастырамыз ба?')) {
                    remove.mutate();
                  }
                }}
                className="h-11 rounded-[14px] text-[15px] font-semibold text-[#B42323] hover:bg-[#FBEAEA] disabled:opacity-60"
              >
                Сабақты өшіру
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </TeacherScreen>
  );
}
