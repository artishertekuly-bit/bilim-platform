import { useMemo } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import StatCard from '@/components/StatCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import { useParentDashboard } from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { BookOpen, Target, Trophy, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import UserAvatar from '@/components/UserAvatar';

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : `${value}%`;
}

function safeText(value: string | null | undefined) {
  return value?.trim() || '—';
}

export default function ParentDashboard() {
  const { user } = useAuth();
  const { data, isLoading, error } = useParentDashboard(user?.id || '', !!user?.id);

  const child = useMemo(() => data?.[0] || null, [data]);
  const firstName = user?.fullName?.trim().split(/\s+/)[0] || 'Ата-ана';

  const recentAttempts = useMemo(() => child?.summary.recentAttempts || [], [child]);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-xl font-bold">
            {t('dashboard.welcome')}, {firstName}!
          </h2>
          <p className="text-sm text-muted-foreground">
            Балаңыздың оқу үлгерімін бақылаңыз
          </p>
        </div>

        {isLoading ? <LoadingState text="Ата-ана кабинеті жүктелуде..." /> : null}

        {error ? <ErrorState text={(error as Error).message} /> : null}

        {!isLoading && !error && !child ? (
          <EmptyState
            title="Бала байланыстырылмаған"
            text="parent_student_links кестесінде parent_id → student_id байланысын қосу керек."
          />
        ) : null}

        {!isLoading && !error && child ? (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <UserAvatar
                    name={child.name}
                    avatarUrl={child.avatarUrl}
                    className="h-10 w-10"
                    fallbackClassName="bg-accent text-sm font-semibold"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{child.name}</p>
                    <p className="text-[11px] text-muted-foreground">Linked student</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label={t('dashboard.avg_score')}
                value={formatPercent(child.summary.stats.avgScore)}
                icon={<Target size={16} />}
              />
              <StatCard
                label={t('dashboard.enrolled_courses')}
                value={child.summary.stats.enrolledCourses}
                icon={<BookOpen size={16} />}
              />
              <StatCard
                label={t('dashboard.completed')}
                value={`${child.summary.stats.completedLessons} сабақ`}
                icon={<CheckCircle size={16} />}
              />
              <StatCard
                label={t('dashboard.rank')}
                value={child.summary.stats.rank ? `#${child.summary.stats.rank}` : '—'}
                icon={<Trophy size={16} />}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">
                      Соңғы тест нәтижелері
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {recentAttempts.length === 0 ? (
                      <EmptyState
                        title="Тест нәтижесі жоқ"
                        text="Оқушы тест тапсырмаған."
                      />
                    ) : (
                      recentAttempts.map((test) => (
                        <div
                          key={test.id}
                          className="flex items-center justify-between rounded-lg border border-border p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{test.title}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {test.subjectName}
                            </p>
                          </div>

                          <span
                            className={`text-lg font-bold ${
                              (test.score || 0) >= 80 ? 'text-success' : 'text-warning'
                            }`}
                          >
                            {formatPercent(test.score)}
                          </span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">
                      Қысқаша талдау
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-2.5">
                    <div className="flex justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">
                        {t('dashboard.best_subject')}
                      </span>
                      <span className="text-right font-medium">
                        {safeText(child.summary.stats.bestSubject)}
                      </span>
                    </div>

                    <div className="flex justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">
                        {t('dashboard.weak_subject')}
                      </span>
                      <span className="text-right font-medium">
                        {safeText(child.summary.stats.weakSubject)}
                      </span>
                    </div>

                    <div className="flex justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">{t('dashboard.streak')}</span>
                      <span className="font-medium">
                        {child.summary.stats.streakDays} күн
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}