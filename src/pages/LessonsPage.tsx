import DashboardLayout from '@/components/DashboardLayout';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import { useLessons } from '@/hooks/use-platform-data';
import { markLessonComplete } from '@/lib/app-data';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { platformKeys } from '@/hooks/use-platform-data';
import { CheckCircle2, Lock, PlayCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function getLessonStatusLabel(isCompleted: boolean, isLocked: boolean) {
  if (isCompleted) return t('lesson.status.completed');
  if (isLocked) return t('common.locked');
  return t('lesson.status.available');
}

export default function LessonsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [activeSubject, setActiveSubject] = useState('all');

  const isStudent = user?.role === 'student';

  const { data, isLoading, error } = useLessons(isStudent ? user?.id : undefined, !!user);

  const completeMutation = useMutation({
    mutationFn: async (lessonId: string) => {
      if (!user?.id) {
        throw new Error('User not found');
      }

      return markLessonComplete(user.id, lessonId);
    },
    onSuccess: async () => {
      if (!user?.id) return;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lessons'] }),
        queryClient.invalidateQueries({ queryKey: ['lesson-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['courses'] }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.studentDashboard(user.id),
        }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.analytics(user.id),
        }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.achievements(user.id),
        }),
        queryClient.invalidateQueries({
          queryKey: platformKeys.leaderboard,
        }),
        queryClient.invalidateQueries({
          queryKey: ['parent-dashboard'],
        }),
      ]);

      toast({
        title: t('lesson.toast.complete_title'),
        description: t('lesson.toast.complete_text'),
      });
    },
    onError: () => {
      toast({
        title: t('lesson.toast.error_title'),
        description: t('lesson.toast.error_text'),
        variant: 'destructive',
      });
    },
  });

  const subjects = useMemo(
    () => [
      'all',
      ...Array.from(new Set((data || []).map((item) => item.subjectName).filter(Boolean))),
    ],
    [data]
  );

  const filtered = useMemo(
    () =>
      (data || []).filter(
        (item) => activeSubject === 'all' || item.subjectName === activeSubject
      ),
    [activeSubject, data]
  );

  const pageTitle = isStudent
    ? t('page.lessons.title.student')
    : t('page.lessons.title.admin');

  const pageDescription = isStudent
    ? t('page.lessons.description.student')
    : t('page.lessons.description.admin');

  const emptyTitle = isStudent
    ? t('page.lessons.empty.title.student')
    : t('page.lessons.empty.title.admin');

  const emptyText = isStudent
    ? t('page.lessons.empty.text.student')
    : t('page.lessons.empty.text.admin');

  const listTitle = isStudent
    ? t('page.lessons.list_title.student')
    : t('page.lessons.list_title.admin');

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-xl font-bold">{pageTitle}</h2>
          <p className="text-sm text-muted-foreground">{pageDescription}</p>
        </div>

        {isLoading ? <LoadingState text={t('page.lessons.loading')} /> : null}

        {error ? <ErrorState text={t('page.lessons.error')} /> : null}

        {!isLoading && !error ? (
          <div className="flex flex-wrap gap-1.5">
            {subjects.map((subject) => (
              <button
                key={subject}
                onClick={() => setActiveSubject(subject)}
                className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
                  activeSubject === subject
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-accent'
                }`}
              >
                {subject === 'all' ? t('common.all') : subject}
              </button>
            ))}
          </div>
        ) : null}

        {!isLoading && !error && (!data || data.length === 0) ? (
          <EmptyState title={emptyTitle} text={emptyText} />
        ) : null}

        {!isLoading && !error && data && data.length > 0 && filtered.length === 0 ? (
          <EmptyState
            title={t('page.lessons.empty.title.filtered')}
            text={t('page.lessons.empty.text.filtered')}
          />
        ) : null}

        {!isLoading && !error && filtered.length > 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">{listTitle}</CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {filtered.map((lesson) => {
                const statusLabel = getLessonStatusLabel(
                  lesson.isCompleted,
                  lesson.isLocked
                );

                return (
                  <div
                    key={lesson.id}
                    className={`flex items-center gap-3 rounded-lg border p-4 ${
                      lesson.isLocked ? 'opacity-60' : ''
                    } ${!lesson.isLocked ? 'cursor-pointer transition-shadow hover:shadow-sm' : ''}`}
                    onClick={() => {
                      if (!lesson.isLocked) {
                        navigate(`/lessons/${lesson.id}`);
                      }
                    }}
                  >
                    {lesson.isCompleted ? (
                      <CheckCircle2 size={18} className="shrink-0 text-success" />
                    ) : lesson.isLocked ? (
                      <Lock size={18} className="shrink-0 text-muted-foreground" />
                    ) : (
                      <PlayCircle size={18} className="shrink-0 text-primary" />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{lesson.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {[lesson.subjectName, lesson.courseTitle, lesson.moduleTitle]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>

                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {statusLabel}
                        </span>
                      </div>
                    </div>

                    {!lesson.isCompleted && !lesson.isLocked && isStudent ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          completeMutation.mutate(lesson.id);
                        }}
                        disabled={completeMutation.isPending}
                      >
                        {t('lesson.action.complete')}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </DashboardLayout>
  );
}