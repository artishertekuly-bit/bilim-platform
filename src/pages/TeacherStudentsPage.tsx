import { useMemo } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/lib/auth-context';
import { useTeacherDashboard } from '@/hooks/use-platform-data';
import t, { getLocale } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import ProgressBar from '@/components/ProgressBar';
import UserAvatar from '@/components/UserAvatar';

function formatDate(value?: string | null) {
  if (!value) return t('page.teacher_students.not_available');

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return t('page.teacher_students.not_available');
  }

  const locale = getLocale() === 'ru' ? 'ru-RU' : 'kk-KZ';
  return parsed.toLocaleDateString(locale);
}

function safeText(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export default function TeacherStudentsPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useTeacherDashboard(user?.id || '', !!user?.id);

  const students = useMemo(
    () =>
      [...(data?.students || [])].sort((a, b) => {
        const courseDiff = safeText(a.courseTitle, '').localeCompare(
          safeText(b.courseTitle, ''),
          getLocale() === 'ru' ? 'ru' : 'kk'
        );
        if (courseDiff !== 0) return courseDiff;

        const progressDiff = (b.progressPct || 0) - (a.progressPct || 0);
        if (progressDiff !== 0) return progressDiff;

        return safeText(a.studentName, '').localeCompare(
          safeText(b.studentName, ''),
          getLocale() === 'ru' ? 'ru' : 'kk'
        );
      }),
    [data?.students]
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-xl font-bold">{t('nav.students')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('page.teacher_students.subtitle')}
          </p>
        </div>

        {isLoading ? <LoadingState text={t('page.teacher_students.loading')} /> : null}

        {error ? <ErrorState text={t('page.teacher_students.error')} /> : null}

        {!isLoading && !error && students.length === 0 ? (
          <EmptyState
            title={t('page.teacher_students.empty.title')}
            text={t('page.teacher_students.empty.text')}
          />
        ) : null}

        {!isLoading && !error && students.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {students.map((row) => {
              const studentName = safeText(
                row.studentName,
                t('page.teacher_students.not_available')
              );
              const courseTitle = safeText(
                row.courseTitle,
                t('page.teacher_students.not_available')
              );

              return (
                <Card key={`${row.courseId}-${row.studentId}`}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        name={studentName}
                        avatarUrl={row.avatarUrl}
                        className="h-10 w-10"
                        fallbackClassName="bg-accent text-sm font-semibold"
                      />

                      <div className="min-w-0">
                        <CardTitle className="truncate text-sm font-semibold">
                          {studentName}
                        </CardTitle>
                        <p className="truncate text-xs text-muted-foreground">
                          {courseTitle}
                        </p>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 text-sm">
                    <InfoRow
                      label={t('page.teacher_students.field.progress')}
                      value={`${row.progressPct}%`}
                    />

                    <ProgressBar value={row.progressPct} size="sm" />

                    <InfoRow
                      label={t('page.teacher_students.field.completed_lessons')}
                      value={`${row.completedLessons}/${row.totalLessons}`}
                    />

                    <InfoRow
                      label={t('page.teacher_students.field.enrolled_at')}
                      value={formatDate(row.enrolledAt)}
                    />

                    <InfoRow
                      label={t('page.teacher_students.field.last_activity')}
                      value={formatDate(row.lastCompletedAt)}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}