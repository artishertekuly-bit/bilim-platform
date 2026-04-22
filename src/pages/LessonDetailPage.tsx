import { useEffect, useRef } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import { useLessonDetail } from '@/hooks/use-platform-data';
import { markLessonComplete } from '@/lib/app-data';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Lock } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { isYouTubeUrl, normalizeMediaUrl } from '@/lib/media-url';

export default function LessonDetailPage() {
  const { lessonId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const autoCompletedRef = useRef(false);

  const isStudent = user?.role === 'student';

  const { data, isLoading, error } = useLessonDetail(
    lessonId,
    isStudent ? user?.id : undefined,
    !!lessonId && !!user?.id
  );

  const normalizedMediaUrl = normalizeMediaUrl(data?.mediaUrl);
  const hasMedia = Boolean(normalizedMediaUrl);
  const isYoutubeMedia = Boolean(
    normalizedMediaUrl && isYouTubeUrl(normalizedMediaUrl)
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
  }, [isStudent, user?.id, lessonId, data, completeMutation]);

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
                    <span>{data.courseTitle}</span>
                  </div>

                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">
                      {t('page.lesson_detail.field.module')}
                    </span>
                    <span>{data.moduleTitle}</span>
                  </div>

                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">
                      {t('page.lesson_detail.field.subject')}
                    </span>
                    <span>{data.subjectName}</span>
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