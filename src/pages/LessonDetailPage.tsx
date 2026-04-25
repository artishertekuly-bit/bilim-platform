import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileText,
  GraduationCap,
  HelpCircle,
  Lock,
  PlayCircle,
  RotateCcw,
  Save,
  Sparkles,
  StickyNote,
  Trash2,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState } from '@/components/common/DataState';
import { SkeletonBlock } from '@/components/common/SkeletonBlocks';
import {
  useDeleteLessonNoteMutation,
  useLessonDetail,
  useLessonLearningState,
  useToggleLessonBookmarkMutation,
  useToggleReviewLaterMutation,
  useUpsertLessonNoteMutation,
} from '@/hooks/use-platform-data';
import { markLessonComplete } from '@/lib/app-data';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { isYouTubeUrl, normalizeMediaUrl } from '@/lib/media-url';

function formatBytes(value: number | null | undefined) {
  if (!value || value <= 0) return null;

  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function getFileUrl(file: {
  externalUrl: string | null;
  storageBucket: string | null;
  storagePath: string | null;
}) {
  /**
   * MVP 2-де әзірге external URL арқылы жұмыс істейміз.
   * Supabase Storage public/signed URL логикасын кейін бөлек қосамыз.
   */
  return file.externalUrl || null;
}

function LessonDetailSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="space-y-2 pb-3">
            <SkeletonBlock className="h-5 w-2/3" />
            <SkeletonBlock className="h-3 w-1/2" />
          </CardHeader>

          <CardContent className="space-y-4">
            <SkeletonBlock className="h-52 w-full rounded-xl" />
            <SkeletonBlock className="h-40 w-full rounded-xl" />
            <SkeletonBlock className="h-28 w-full rounded-xl" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-2 pb-3">
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="h-3 w-72" />
          </CardHeader>
          <CardContent className="space-y-2">
            <SkeletonBlock className="h-16 w-full rounded-lg" />
            <SkeletonBlock className="h-16 w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <SkeletonBlock className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-5/6" />
            <SkeletonBlock className="h-10 w-full" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <SkeletonBlock className="h-5 w-36" />
          </CardHeader>
          <CardContent className="space-y-2">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <SkeletonBlock className="h-5 w-28" />
          </CardHeader>
          <CardContent>
            <SkeletonBlock className="h-36 w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReadingSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border bg-card text-primary">
          {icon}
        </div>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>

      {children}
    </section>
  );
}

function ResourceListCard({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: Array<{
    id: string;
    title: string;
    description: string | null;
    file: {
      filename: string;
      sizeBytes: number | null;
      externalUrl: string | null;
      storageBucket: string | null;
      storagePath: string | null;
    };
  }>;
}) {
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <FileText size={16} />
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>

      <CardContent className="space-y-2">
        {items.map((item) => {
          const fileUrl = getFileUrl(item.file);
          const sizeText = formatBytes(item.file.sizeBytes);

          return (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText size={15} className="shrink-0 text-muted-foreground" />
                  <p className="truncate text-sm font-medium">{item.title}</p>
                </div>

                {item.description ? (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {item.description}
                  </p>
                ) : null}

                <p className="mt-1 text-[11px] text-muted-foreground">
                  {item.file.filename}
                  {sizeText ? ` · ${sizeText}` : ''}
                </p>
              </div>

              {fileUrl ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={fileUrl} target="_blank" rel="noreferrer">
                    Ашу
                    <ExternalLink size={13} className="ml-1.5" />
                  </a>
                </Button>
              ) : (
                <StatusBadge tone="muted" icon={<Lock size={12} />}>
                  URL жоқ
                </StatusBadge>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function MiniQuizPlaceholder() {
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <HelpCircle size={16} />
          Lesson Mini Quiz
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Сабақ соңындағы қысқа тексеріс осы блокта ашылады.
        </p>
      </CardHeader>

      <CardContent>
        <div className="rounded-xl border bg-muted/30 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Мини тест әзірге placeholder</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Келесі MVP қадамында осы жерге 3–5 сұрақтан тұратын сабақтық quiz
                қосамыз: бір дұрыс жауап, түсіндірме, нәтиже және қайталау ұсынысы.
              </p>
            </div>

            <Button type="button" variant="outline" disabled>
              Жақында қосылады
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LessonDetailPage() {
  const { lessonId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const autoCompletedRef = useRef(false);

  const isStudent = user?.role === 'student';

  const [noteDraft, setNoteDraft] = useState('');
  const [noteSeededForLessonId, setNoteSeededForLessonId] = useState('');

  const { data, isLoading, error } = useLessonDetail(
    lessonId,
    isStudent ? user?.id : undefined,
    !!lessonId && !!user?.id
  );

  const {
    data: learningState,
    isLoading: learningStateLoading,
    error: learningStateError,
  } = useLessonLearningState(
    user?.id || '',
    lessonId,
    Boolean(isStudent && user?.id && lessonId && data && !data.isLocked)
  );

  const upsertNoteMutation = useUpsertLessonNoteMutation();
  const deleteNoteMutation = useDeleteLessonNoteMutation();
  const toggleBookmarkMutation = useToggleLessonBookmarkMutation();
  const toggleReviewLaterMutation = useToggleReviewLaterMutation();

  const normalizedMediaUrl = normalizeMediaUrl(data?.mediaUrl);
  const hasMedia = Boolean(normalizedMediaUrl);
  const isYoutubeMedia = Boolean(
    normalizedMediaUrl && isYouTubeUrl(normalizedMediaUrl)
  );

  const courseId = learningState?.courseId || '';
  const lessonAttachments = learningState?.attachments || data?.attachments || [];
  const courseAssets = learningState?.courseAssets || data?.courseAssets || [];

  const hasLessonAttachments = lessonAttachments.length > 0;
  const hasCourseAssets = courseAssets.length > 0;
  const hasAnyLessonContent = Boolean(
    data?.contentBody || hasMedia || data?.practiceContent
  );

  const noteChanged = useMemo(
    () => noteDraft !== (learningState?.noteContent || ''),
    [learningState?.noteContent, noteDraft]
  );

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) {
        throw new Error('User not found');
      }

      if (!lessonId) {
        throw new Error('Lesson not found');
      }

      return markLessonComplete(user.id, lessonId);
    },
    onSuccess: async () => {
      if (!user?.id) return;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lessons'] }),
        queryClient.invalidateQueries({ queryKey: ['lesson-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['lesson-learning-state'] }),
        queryClient.invalidateQueries({ queryKey: ['courses'] }),
        queryClient.invalidateQueries({ queryKey: ['course-progress'] }),
        queryClient.invalidateQueries({ queryKey: ['student-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['analytics'] }),
        queryClient.invalidateQueries({ queryKey: ['achievements'] }),
        queryClient.invalidateQueries({ queryKey: ['leaderboard'] }),
        queryClient.invalidateQueries({ queryKey: ['parent-dashboard'] }),
      ]);

      toast({
        title: t('lesson.toast.complete_title'),
        description: t('lesson.toast.complete_text'),
      });
    },
    onError: () =>
      toast({
        title: t('lesson.toast.error_title'),
        description: t('lesson.toast.error_text'),
        variant: 'destructive',
      }),
  });

  useEffect(() => {
    autoCompletedRef.current = false;
  }, [lessonId]);

  useEffect(() => {
    if (!learningState) return;
    if (!lessonId) return;
    if (noteSeededForLessonId === lessonId) return;

    setNoteDraft(learningState.noteContent || '');
    setNoteSeededForLessonId(lessonId);
  }, [learningState, lessonId, noteSeededForLessonId]);

  useEffect(() => {
    if (!isStudent) return;
    if (!user?.id) return;
    if (!lessonId) return;
    if (!data) return;
    if (data.isLocked) return;
    if (data.isCompleted) return;
    if (completeMutation.isPending) return;
    if (autoCompletedRef.current) return;

    const timer = window.setTimeout(() => {
      autoCompletedRef.current = true;
      completeMutation.mutate();
    }, 20000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    isStudent,
    user?.id,
    lessonId,
    data,
    completeMutation.isPending,
    completeMutation.mutate,
  ]);

  const handleSaveNote = async () => {
    if (!user?.id || !lessonId || !courseId) {
      toast({
        title: 'Жазбаны сақтау мүмкін болмады',
        description: 'Сабақ немесе курс дерегі толық емес.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await upsertNoteMutation.mutateAsync({
        studentId: user.id,
        lessonId,
        courseId,
        content: noteDraft,
      });

      toast({
        title: 'Жазба сақталды',
        description: 'Сіздің жеке жазбаңыз осы сабаққа бекітілді.',
      });
    } catch (noteError) {
      toast({
        title: 'Жазбаны сақтау мүмкін болмады',
        description:
          noteError instanceof Error ? noteError.message : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteNote = async () => {
    if (!user?.id || !lessonId) return;

    try {
      await deleteNoteMutation.mutateAsync({
        studentId: user.id,
        lessonId,
        courseId,
      });

      setNoteDraft('');

      toast({
        title: 'Жазба өшірілді',
      });
    } catch (noteError) {
      toast({
        title: 'Жазбаны өшіру мүмкін болмады',
        description:
          noteError instanceof Error ? noteError.message : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const handleToggleBookmark = async () => {
    if (!user?.id || !lessonId || !courseId) {
      toast({
        title: 'Сақтау мүмкін болмады',
        description: 'Сабақ немесе курс дерегі толық емес.',
        variant: 'destructive',
      });
      return;
    }

    const nextBookmarked = !learningState?.bookmarked;

    try {
      await toggleBookmarkMutation.mutateAsync({
        studentId: user.id,
        lessonId,
        courseId,
        bookmarked: nextBookmarked,
      });

      toast({
        title: nextBookmarked ? 'Сабақ сақталды' : 'Сабақ сақтаудан алынды',
      });
    } catch (bookmarkError) {
      toast({
        title: 'Сабақты сақтау мүмкін болмады',
        description:
          bookmarkError instanceof Error
            ? bookmarkError.message
            : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  const handleToggleReviewLater = async () => {
    if (!user?.id || !lessonId || !courseId || !data) {
      toast({
        title: 'Кейін қайталауға қосу мүмкін болмады',
        description: 'Сабақ немесе курс дерегі толық емес.',
        variant: 'destructive',
      });
      return;
    }

    const nextReviewLater = !learningState?.reviewLater;

    try {
      await toggleReviewLaterMutation.mutateAsync({
        studentId: user.id,
        itemType: 'lesson',
        itemId: lessonId,
        lessonId,
        courseId,
        title: data.title,
        note: null,
        reviewLater: nextReviewLater,
      });

      toast({
        title: nextReviewLater
          ? 'Кейін қайталауға қосылды'
          : 'Кейін қайталаудан алынды',
      });
    } catch (reviewError) {
      toast({
        title: 'Әрекет орындалмады',
        description:
          reviewError instanceof Error
            ? reviewError.message
            : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          backAction={{
            label: t('page.lesson_detail.back_to_lessons'),
            onClick: () => navigate('/lessons'),
          }}
          eyebrow={
            <>
              <BookOpen size={13} />
              Сабақ оқу режимі
            </>
          }
          icon={<GraduationCap size={20} />}
          title={data?.title || t('page.lesson_detail.title')}
          description={
            data
              ? [data.subjectName, data.courseTitle, data.moduleTitle]
                  .filter(Boolean)
                  .join(' · ')
              : t('page.lesson_detail.subtitle')
          }
          actions={
            data?.isCompleted ? (
              <StatusBadge tone="success" icon={<CheckCircle2 size={12} />}>
                {t('lesson.status.completed')}
              </StatusBadge>
            ) : data?.isLocked ? (
              <StatusBadge tone="muted" icon={<Lock size={12} />}>
                Құлыпталған
              </StatusBadge>
            ) : null
          }
        />

        {isLoading ? <LessonDetailSkeleton /> : null}

        {!isLoading && error ? (
          <ErrorState
            text={t('page.lesson_detail.error')}
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Қайта жүктеу
              </Button>
            }
            secondaryAction={
              <Button type="button" variant="ghost" onClick={() => navigate('/lessons')}>
                Сабақтарға қайту
              </Button>
            }
          />
        ) : null}

        {!isLoading && !error && data?.isLocked ? (
          <EmptyState
            icon={<Lock size={18} />}
            title={t('page.lesson_detail.locked_title')}
            text={t('page.lesson_detail.locked_text')}
            action={
              <Button type="button" variant="outline" asChild>
                <Link to="/courses">
                  Курстарға өту
                  <ArrowRight size={15} className="ml-2" />
                </Link>
              </Button>
            }
          />
        ) : null}

        {!isLoading && !error && data && !data.isLocked ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone="info" icon={<BookOpen size={12} />}>
                      {data.subjectName}
                    </StatusBadge>

                    {data.isCompleted ? (
                      <StatusBadge tone="success" icon={<CheckCircle2 size={12} />}>
                        {t('lesson.status.completed')}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="warning" icon={<PlayCircle size={12} />}>
                        {t('page.lesson_detail.status.in_progress')}
                      </StatusBadge>
                    )}
                  </div>

                  <CardTitle className="pt-2 text-lg font-semibold">
                    {data.title}
                  </CardTitle>

                  <p className="text-xs text-muted-foreground">
                    {[data.courseTitle, data.moduleTitle].filter(Boolean).join(' · ')}
                  </p>
                </CardHeader>

                <CardContent className="space-y-6">
                  {data.contentBody ? (
                    <ReadingSection
                      title="Теория"
                      icon={<FileText size={15} />}
                    >
                      <article className="prose prose-sm max-w-none whitespace-pre-wrap rounded-xl border bg-card p-5 leading-7 dark:prose-invert">
                        {data.contentBody}
                      </article>
                    </ReadingSection>
                  ) : null}

                  {hasMedia ? (
                    <ReadingSection
                      title={t('page.lesson_detail.media_title')}
                      icon={<PlayCircle size={15} />}
                    >
                      <div className="overflow-hidden rounded-xl border bg-black/5">
                        {isYoutubeMedia && normalizedMediaUrl ? (
                          <iframe
                            src={normalizedMediaUrl}
                            className="aspect-video w-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            title={data.title}
                            loading="lazy"
                            referrerPolicy="strict-origin-when-cross-origin"
                          />
                        ) : normalizedMediaUrl ? (
                          <a
                            href={normalizedMediaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between gap-3 p-4 text-sm underline"
                          >
                            {t('page.lesson_detail.open_media')}
                            <ExternalLink size={14} />
                          </a>
                        ) : null}
                      </div>
                    </ReadingSection>
                  ) : null}

                  {data.practiceContent ? (
                    <ReadingSection
                      title={t('page.lesson_detail.practice_title')}
                      icon={<Sparkles size={15} />}
                    >
                      <div className="whitespace-pre-wrap rounded-xl border bg-muted/20 p-5 text-sm leading-7">
                        {data.practiceContent}
                      </div>
                    </ReadingSection>
                  ) : null}

                  {!hasAnyLessonContent ? (
                    <EmptyState
                      title={t('page.lesson_detail.empty_theory_title')}
                      text={t('page.lesson_detail.empty_theory_text')}
                      compact
                    />
                  ) : null}
                </CardContent>
              </Card>

              <ResourceListCard
                title="Сабақ файлдары"
                description="Мұғалім осы сабаққа қосқан қосымша материалдар."
                items={lessonAttachments}
              />

              <ResourceListCard
                title="Курс материалдары"
                description="Бұл курсқа арналған жалпы қосымша материалдар."
                items={courseAssets}
              />

              {!hasLessonAttachments && !hasCourseAssets ? (
                <Card className="border-dashed">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText size={14} />
                      Бұл сабаққа қосымша файлдар тіркелмеген.
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <MiniQuizPlaceholder />

              <Card>
                <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold">Сабақты аяқтау</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Сабақты аяқтағаннан кейін прогресс course timeline ішінде жаңарады.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="button" variant="outline" asChild>
                      <Link to={`/courses/${courseId || data.courseId || ''}`}>
                        Курс roadmap
                        <ArrowRight size={15} className="ml-2" />
                      </Link>
                    </Button>

                    {isStudent && !data.isCompleted ? (
                      <Button
                        type="button"
                        onClick={() => completeMutation.mutate()}
                        disabled={completeMutation.isPending}
                      >
                        {completeMutation.isPending
                          ? t('common.loading')
                          : t('lesson.action.complete')}
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" disabled>
                        <CheckCircle2 size={15} className="mr-2" />
                        {t('lesson.status.completed')}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">
                    {t('page.lesson_detail.status_title')}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">
                      {t('page.lesson_detail.field.course')}
                    </span>
                    <span className="text-right">{data.courseTitle}</span>
                  </div>

                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">
                      {t('page.lesson_detail.field.module')}
                    </span>
                    <span className="text-right">{data.moduleTitle}</span>
                  </div>

                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">
                      {t('page.lesson_detail.field.subject')}
                    </span>
                    <span className="text-right">{data.subjectName}</span>
                  </div>

                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">
                      {t('page.lesson_detail.field.status')}
                    </span>
                    <span>
                      {data.isCompleted
                        ? t('lesson.status.completed')
                        : t('page.lesson_detail.status.in_progress')}
                    </span>
                  </div>

                  {!data.isCompleted && isStudent ? (
                    <Button
                      className="w-full"
                      onClick={() => completeMutation.mutate()}
                      disabled={completeMutation.isPending}
                    >
                      {completeMutation.isPending
                        ? t('common.loading')
                        : t('lesson.action.complete')}
                    </Button>
                  ) : !isStudent ? (
                    <div className="rounded-md border p-3 text-xs text-muted-foreground">
                      {t('page.lesson_detail.teacher_review_note')}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {isStudent ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">
                      Оқу құралдары
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Сабақты сақтау, кейін қайталау және жеке жазба.
                    </p>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {learningStateLoading ? (
                      <div className="space-y-2">
                        <SkeletonBlock className="h-9 w-full" />
                        <SkeletonBlock className="h-9 w-full" />
                      </div>
                    ) : null}

                    {learningStateError ? (
                      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                        Оқу құралдарын жүктеу мүмкін болмады.
                      </div>
                    ) : null}

                    {!learningStateLoading ? (
                      <>
                        <Button
                          variant={learningState?.bookmarked ? 'default' : 'outline'}
                          className="w-full justify-start"
                          onClick={handleToggleBookmark}
                          disabled={
                            !learningState ||
                            toggleBookmarkMutation.isPending ||
                            learningStateLoading
                          }
                        >
                          <Bookmark
                            size={14}
                            className="mr-2"
                            fill={learningState?.bookmarked ? 'currentColor' : 'none'}
                          />
                          {learningState?.bookmarked
                            ? 'Сақталған сабақ'
                            : 'Сабақты сақтау'}
                        </Button>

                        <Button
                          variant={learningState?.reviewLater ? 'default' : 'outline'}
                          className="w-full justify-start"
                          onClick={handleToggleReviewLater}
                          disabled={
                            !learningState ||
                            toggleReviewLaterMutation.isPending ||
                            learningStateLoading
                          }
                        >
                          <RotateCcw size={14} className="mr-2" />
                          {learningState?.reviewLater
                            ? 'Қайталау тізімінде'
                            : 'Кейін қайталау'}
                        </Button>
                      </>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              {isStudent ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <StickyNote size={14} />
                      Менің жазбам
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Бұл жазба тек сізге көрінеді.
                    </p>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <Textarea
                      rows={8}
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      placeholder="Осы сабақ бойынша өз ойыңызды, формулаларды немесе түсінбеген жерлерді жазыңыз..."
                      disabled={!learningState || learningStateLoading}
                    />

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={handleSaveNote}
                        disabled={
                          !learningState ||
                          !noteChanged ||
                          upsertNoteMutation.isPending ||
                          learningStateLoading
                        }
                      >
                        <Save size={14} className="mr-1.5" />
                        Сақтау
                      </Button>

                      {learningState?.note ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleDeleteNote}
                          disabled={deleteNoteMutation.isPending}
                        >
                          <Trash2 size={14} className="mr-1.5" />
                          Өшіру
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {!hasAnyLessonContent ? (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Lock size={14} />
                      {t('page.lesson_detail.empty_content_note')}
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </aside>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}