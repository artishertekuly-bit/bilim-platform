// Сабақ редакторы (дизайн: TeacherLessonEditor.dc.html; D20, api §5.1): жариялау шартын дерекқор да тексереді —
// атауы ≥ 5, мәтіні ≥ 20 таңба. Сабақта тест, балл және прогресс жоқ.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Badge, Banner, BareScreen, Button, ConfirmSheet, ErrorNote, Field, LoadingBlock, Segmented, StateCard, ButtonLink, TextArea, TextInput, TopBar } from '@/components/bl/ui';
import SafeMarkdown from '@/components/common/SafeMarkdown';
import { useAuth } from '@/lib/auth-context';
import { LESSON_STATUS_TITLES, createLesson, deleteLesson, getLesson, platformKeys, updateLesson, type LessonDraft } from '@/lib/platform-api';

const MIN_TITLE = 5;
const MIN_BODY = 20;
const MAX_TITLE = 200;

export default function TeacherLessonEditPage() {
  const { lessonId } = useParams();
  const isNew = !lessonId;
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lesson = useQuery({ queryKey: platformKeys.lesson(lessonId ?? 'new'), queryFn: () => getLesson(lessonId ?? ''), enabled: !isNew });

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [media, setMedia] = useState('');
  const [view, setView] = useState<'text' | 'preview'>('text');
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      if (isNew) return createLesson(user?.id ?? '', { status: 'draft', ...draft } as LessonDraft);
      await updateLesson(lessonId, draft);
      return lessonId;
    },
    onSuccess: (id, nextStatus) => {
      refresh();
      setNotice(
        nextStatus === 'published' ? 'Жарияланды. Оқушылар оны каталогтан көреді.' : nextStatus === 'draft' ? 'Сабақ жобаға қайтарылды.' : 'Сақталды.',
      );
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

  const footer =
    isNew || lesson.data ? (
      status === 'published' ? (
        <>
          <Button onClick={() => save.mutate(null)} disabled={!canPublish || !mediaValid} loading={save.isPending}>
            Өзгерісті сақтау
          </Button>
          <Button variant="ghost" size="sm" onClick={() => save.mutate('draft')} disabled={busy}>
            Жариялаудан алу
          </Button>
        </>
      ) : (
        <>
          {!hidden ? (
            <Button onClick={() => save.mutate('published')} disabled={!canPublish || !mediaValid} loading={save.isPending && save.variables === 'published'}>
              Жариялау
            </Button>
          ) : null}
          <Button variant={hidden ? 'primary' : 'ghost'} size={hidden ? 'lg' : 'sm'} onClick={() => save.mutate(null)} disabled={busy || !title.trim() || !mediaValid}>
            {save.isPending && save.variables === null ? 'Сақталуда…' : hidden ? 'Сақтау' : 'Жоба ретінде сақтау'}
          </Button>
        </>
      )
    ) : null;

  return (
    <BareScreen header={<TopBar back="/teacher/lessons" backLabel="Сабақтарға оралу" title={isNew ? 'Жаңа сабақ' : 'Сабақты өңдеу'} />} footer={footer}>
      <div className="flex flex-col gap-4 px-4 pb-5 pt-2">
        {lesson.isLoading ? <LoadingBlock rows={3} /> : null}
        {lesson.isError ? <ErrorNote error={lesson.error} onRetry={() => lesson.refetch()} /> : null}
        {!isNew && lesson.data === null ? (
          <StateCard mark="404" title="Сабақ табылмады">
            <ButtonLink to="/teacher/lessons">Сабақтарға оралу</ButtonLink>
          </StateCard>
        ) : null}

        {isNew || lesson.data ? (
          <>
            {!isNew ? (
              <span className="flex items-center gap-2">
                <Badge tone={status === 'published' ? 'good' : status === 'hidden' ? 'warn' : 'muted'}>{LESSON_STATUS_TITLES[status]}</Badge>
                {status === 'published' ? (
                  <Link to={`/lessons/${lessonId}`} className="text-sm font-semibold text-bl-ink">
                    Оқушы көзімен қарау
                  </Link>
                ) : null}
              </span>
            ) : null}
            {hidden ? <Banner tone="warn">Бұл сабақты әкімші жасырған. Мәтінді түзетуге болады, бірақ қайта ашуды тек әкімші шешеді.</Banner> : null}

            <div className="flex flex-col gap-2">
              <label htmlFor="lesson-title" className="text-sm font-semibold">
                Тақырыбы
              </label>
              <TextInput
                id="lesson-title"
                value={title}
                maxLength={MAX_TITLE}
                placeholder="Мысалы: Апталық бюджетті жоспарлау"
                onChange={(e) => setTitle(e.target.value)}
              />
              <span className="self-end text-[13px] text-bl-ink2">
                {title.length} / {MAX_TITLE}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="lesson-body" className="text-sm font-semibold">
                  Мазмұны
                </label>
                <div className="w-[200px]">
                  <Segmented<'text' | 'preview'>
                    label="Көрініс"
                    size="sm"
                    value={view}
                    onChange={setView}
                    options={[
                      { id: 'text', label: 'Мәтін' },
                      { id: 'preview', label: 'Көру' },
                    ]}
                  />
                </div>
              </div>
              {view === 'preview' ? (
                <div className="min-h-[260px] rounded-[14px] border border-bl-line bg-white px-4 py-3.5 text-base leading-[1.6]">
                  <SafeMarkdown source={body || '_Мәтін әлі жоқ._'} />
                </div>
              ) : (
                <TextArea
                  id="lesson-body"
                  value={body}
                  maxLength={50000}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Сабақтың мәтіні: түсінікті, қысқа бөлімдерге бөлінген. ## — бөлім атауы, - — тізім."
                  className="min-h-[260px] resize-y leading-normal"
                />
              )}
              <span className="text-[13px] text-bl-ink2">
                Жариялау үшін атауы кемінде {MIN_TITLE}, мәтіні кемінде {MIN_BODY} таңба. Қазір: {title.trim().length} / {body.trim().length}.
              </span>
            </div>

            <Field label="Бейне сілтемесі" htmlFor="lesson-media" hint="Міндетті емес. Тек https:// сілтемесі." error={!mediaValid ? 'Сілтеме https:// деп басталсын' : undefined}>
              <TextInput
                id="lesson-media"
                type="url"
                inputMode="url"
                value={media}
                maxLength={500}
                placeholder="https://"
                aria-invalid={!mediaValid || undefined}
                onChange={(e) => setMedia(e.target.value)}
              />
            </Field>

            <div className="flex gap-2.5 rounded-[14px] border border-bl-line bg-white px-4 py-3.5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px flex-none text-bl-ink3">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5" />
                <path d="M12 7.5v.01" />
              </svg>
              <p className="m-0 text-sm leading-[1.45] text-bl-ink3">Сабақта тест, балл және прогресс жоқ. Ол емтихан нәтижесіне әсер етпейді.</p>
            </div>

            {save.isError || remove.isError ? <ErrorNote error={save.error ?? remove.error} /> : null}
            {notice && !save.isError ? <Banner tone="good">{notice}</Banner> : null}

            {!isNew ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className="h-11 self-start border-0 bg-transparent p-0 text-[15px] font-semibold text-bl-danger disabled:opacity-60"
              >
                Сабақты өшіру
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Сабақты өшіресіз бе?"
        description="Сабақ біржола өшіріледі: оқушылардың сақтауы мен жеке жазбалары да өшеді. Мұны қайтару мүмкін емес."
        confirmLabel="Иә, өшіру"
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </BareScreen>
  );
}
