import { useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  ExternalLink,
  FileText,
  Lock,
  RotateCcw,
  Save,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <button
              onClick={() => navigate('/lessons')}
              className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={13} />
              {t('page.lesson_detail.back_to_lessons')}
            </button>

            <h2 className="text-xl font-bold">{t('page.lesson_detail.title')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('page.lesson_detail.subtitle')}
            </p>
          </div>

          {data?.isCompleted ? (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <CheckCircle2 size={14} />
              {t('lesson.status.completed')}
            </span>
          ) : null}
        </div>

        {isLoading ? <LoadingState text={t('page.lesson_detail.loading')} /> : null}

        {error ? <ErrorState text={t('page.lesson_detail.error')} /> : null}

        {!isLoading && !error && data?.isLocked ? (
          <EmptyState
            title={t('page.lesson_detail.locked_title')}
            text={t('page.lesson_detail.locked_text')}
          />
        ) : null}

        {!isLoading && !error && data ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">{data.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {[data.subjectName, data.courseTitle, data.moduleTitle]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </CardHeader>

                <CardContent className="space-y-4">
                  {data.contentBody ? (
                    <div className="whitespace-pre-wrap rounded-lg border bg-card p-4 text-sm leading-6">
                      {data.contentBody}
                    </div>
                  ) : (
                    <EmptyState
                      title={t('page.lesson_detail.empty_theory_title')}
                      text={t('page.lesson_detail.empty_theory_text')}
                    />
                  )}

                  {hasMedia ? (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">
                        {t('page.lesson_detail.media_title')}
                      </h3>

                      <div className="overflow-hidden rounded-lg border bg-black/5">
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
                            className="block p-4 text-sm underline"
                          >
                            {t('page.lesson_detail.open_media')}
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {data.practiceContent ? (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">
                        {t('page.lesson_detail.practice_title')}
                      </h3>
                      <div className="whitespace-pre-wrap rounded-lg border bg-card p-4 text-sm leading-6">
                        {data.practiceContent}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {hasLessonAttachments ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold">
                      Сабақ файлдары
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Мұғалім осы сабаққа қосқан қосымша материалдар.
                    </p>
                  </CardHeader>

                  <CardContent className="space-y-2">
                    {lessonAttachments.map((attachment) => {
                      const fileUrl = getFileUrl(attachment.file);
                      const sizeText = formatBytes(attachment.file.sizeBytes);

                      return (
                        <div
                          key={attachment.id}
                          className="flex items-start justify-between gap-3 rounded-lg border p-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <FileText size={15} className="text-muted-foreground" />
                              <p className="truncate text-sm font-medium">
                                {attachment.title}
                              </p>
                            </div>

                            {attachment.description ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {attachment.description}
                              </p>
                            ) : null}

                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {attachment.file.filename}
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
                          ) : null}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ) : null}

              {hasCourseAssets ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold">
                      Курс материалдары
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Бұл курсқа арналған жалпы қосымша материалдар.
                    </p>
                  </CardHeader>

                  <CardContent className="space-y-2">
                    {courseAssets.map((asset) => {
                      const fileUrl = getFileUrl(asset.file);
                      const sizeText = formatBytes(asset.file.sizeBytes);

                      return (
                        <div
                          key={asset.id}
                          className="flex items-start justify-between gap-3 rounded-lg border p-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <FileText size={15} className="text-muted-foreground" />
                              <p className="truncate text-sm font-medium">
                                {asset.title}
                              </p>
                            </div>

                            {asset.description ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {asset.description}
                              </p>
                            ) : null}

                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {asset.file.filename}
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
                          ) : null}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ) : null}
            </div>

            <div className="space-y-4">
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

              {isStudent && !data.isLocked ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">
                      Оқу құралдары
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {learningStateLoading ? (
                      <p className="text-xs text-muted-foreground">
                        Оқу құралдары жүктелуде...
                      </p>
                    ) : null}

                    {learningStateError ? (
                      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                        Оқу құралдарын жүктеу мүмкін болмады.
                      </div>
                    ) : null}

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
                  </CardContent>
                </Card>
              ) : null}

              {isStudent && !data.isLocked ? (
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

              {!hasMedia && !data.practiceContent && !data.contentBody ? (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Lock size={14} />
                      {t('page.lesson_detail.empty_content_note')}
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}