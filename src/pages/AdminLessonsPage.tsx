// Сабақ модерациясы (karta §5): әкімші мұғалім жариялаған сабақты жасырады не қайта ашады (content_reviews).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeOff, FileText, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LESSON_STATUS_TITLES, adminLessons, adminSetLessonStatus, platformKeys } from '@/lib/platform-api';
import { formatDateTime } from '@/lib/teacher-ui';

export default function AdminLessonsPage() {
  const queryClient = useQueryClient();
  const lessons = useQuery({ queryKey: platformKeys.adminLessons, queryFn: adminLessons });
  const change = useMutation({
    mutationFn: ({ id, status, feedback }: { id: string; status: 'published' | 'hidden'; feedback?: string }) =>
      adminSetLessonStatus(id, status, feedback),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.adminLessons });
      void queryClient.invalidateQueries({ queryKey: ['platform', 'lessons'] });
    },
  });

  const onHide = (id: string, title: string) => {
    const feedback = window.prompt(`«${title}» сабағы каталогтан жасырылады. Себебі (мұғалімге көрінеді):`, '');
    if (feedback === null) return;
    change.mutate({ id, status: 'hidden', feedback });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={<>Әкімші</>}
          icon={<FileText size={20} />}
          title="Сабақ модерациясы"
          actions={<StatusBadge tone="muted">{lessons.data?.length ?? 0}</StatusBadge>}
        />
        {lessons.isLoading ? <LoadingState text="Сабақтар жүктелуде…" /> : null}
        {lessons.isError ? <ErrorState text={(lessons.error as Error).message} /> : null}
        {change.isError ? <ErrorState text={(change.error as Error).message} /> : null}
        {lessons.data && lessons.data.length === 0 ? (
          <EmptyState title="Сабақ жоқ" text="Мұғалімдер жариялаған сабақ әлі жоқ." />
        ) : null}
        <div className="grid gap-3">
          {lessons.data?.map((lesson) => (
            <Card key={lesson.id} className="border-border bg-card">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link to={`/lessons/${lesson.id}`} className="truncate text-sm font-semibold hover:underline">
                    {lesson.title}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {lesson.author_name} · {formatDateTime(lesson.updated_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={lesson.status === 'published' ? 'success' : 'warning'}>
                    {LESSON_STATUS_TITLES[lesson.status]}
                  </StatusBadge>
                  {lesson.status === 'published' ? (
                    <Button type="button" variant="outline" size="sm" disabled={change.isPending}
                      onClick={() => onHide(lesson.id, lesson.title)}>
                      <EyeOff size={14} className="mr-1.5" />
                      Жасыру
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" size="sm" disabled={change.isPending}
                      onClick={() => change.mutate({ id: lesson.id, status: 'published' })}>
                      <RotateCcw size={14} className="mr-1.5" />
                      Қайта ашу
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
