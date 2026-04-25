import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import StatCard from '@/components/StatCard';
import ProgressBar from '@/components/ProgressBar';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState } from '@/components/common/DataState';
import { SkeletonBlock } from '@/components/common/SkeletonBlocks';
import { useParentDashboard } from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  RotateCcw,
  Target,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import UserAvatar from '@/components/UserAvatar';

type ParentChildDashboardItem = {
  studentId: string;
  name: string;
  avatarUrl: string | null;
  summary: {
    stats: {
      avgScore: number | null;
      enrolledCourses: number;
      completedLessons: number;
      rank?: number | null;
      bestSubject?: string | null;
      weakSubject?: string | null;
      streakDays?: number | null;
    };
    recentAttempts: Array<{
      id: string;
      title: string;
      subjectName: string;
      score: number | null;
      completedAt?: string | null;
    }>;
  };
};

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : `${value}%`;
}

function safeText(value: string | null | undefined) {
  return value?.trim() || '—';
}

function getScoreTone(score: number | null | undefined) {
  const value = Number(score || 0);

  if (value >= 80) return 'success';
  if (value >= 50) return 'warning';
  return 'danger';
}

function getLearningStatus(avgScore: number | null | undefined, completedLessons: number) {
  const score = Number(avgScore || 0);

  if (score >= 80 && completedLessons >= 5) return 'Жақсы динамика';
  if (score >= 50 || completedLessons >= 3) return 'Орташа динамика';

  return 'Назар қажет';
}

function formatDate(value?: string | null) {
  if (!value) return null;

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString('kk-KZ', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function PanelCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {action}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function QuickActionCard({
  title,
  text,
  to,
  icon,
}: {
  title: string;
  text: string;
  to: string;
  icon: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="group rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-primary/10 text-primary">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
        </div>

        <ArrowRight
          size={15}
          className="mt-1 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        />
      </div>
    </Link>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium">{value}</span>
    </div>
  );
}

function ParentDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <SkeletonBlock className="h-4 w-36" />
            <SkeletonBlock className="h-3 w-24" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-10 w-10 rounded-xl" />
              <div className="space-y-2">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="h-6 w-14" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-xl border bg-card p-4">
            <div className="flex items-start gap-3">
              <SkeletonBlock className="h-10 w-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <SkeletonBlock className="h-4 w-28" />
                <SkeletonBlock className="h-3 w-full" />
                <SkeletonBlock className="h-3 w-4/5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border bg-card p-5">
            <SkeletonBlock className="h-5 w-40" />

            <div className="mt-5 space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-2">
                      <SkeletonBlock className="h-4 w-48" />
                      <SkeletonBlock className="h-3 w-28" />
                    </div>

                    <SkeletonBlock className="h-7 w-14 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="rounded-xl border bg-card p-5">
              <SkeletonBlock className="h-5 w-36" />
              <div className="mt-4 space-y-3">
                <SkeletonBlock className="h-10 w-full rounded-lg" />
                <SkeletonBlock className="h-10 w-full rounded-lg" />
                <SkeletonBlock className="h-10 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ParentDashboard() {
  const { user } = useAuth();
  const { data, isLoading, error } = useParentDashboard(user?.id || '', !!user?.id);

  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  const children = useMemo(
    () => ((data || []) as ParentChildDashboardItem[]),
    [data]
  );

  useEffect(() => {
    if (selectedChildId) return;
    if (children.length === 0) return;

    setSelectedChildId(children[0].studentId);
  }, [children, selectedChildId]);

  const child = useMemo(() => {
    if (children.length === 0) return null;

    return (
      children.find((item) => item.studentId === selectedChildId) ||
      children[0] ||
      null
    );
  }, [children, selectedChildId]);

  const firstName = user?.fullName?.trim().split(/\s+/)[0] || 'Ата-ана';

  const recentAttempts = useMemo(() => child?.summary.recentAttempts || [], [child]);

  const learningStatus = child
    ? getLearningStatus(
        child.summary.stats.avgScore,
        Number(child.summary.stats.completedLessons || 0)
      )
    : '';

  const avgScore = Number(child?.summary.stats.avgScore || 0);
  const weakSubject = child?.summary.stats.weakSubject || null;
  const bestSubject = child?.summary.stats.bestSubject || null;
  const completedLessons = Number(child?.summary.stats.completedLessons || 0);
  const enrolledCourses = Number(child?.summary.stats.enrolledCourses || 0);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <LayoutDashboard size={13} />
              Ата-ана dashboard
            </>
          }
          icon={<Users size={20} />}
          title={`${t('dashboard.welcome')}, ${firstName}!`}
          description="Балаңыздың оқу үлгерімін бақылаңыз."
          actions={
            <Button type="button" asChild>
              <Link to="/children">
                Балалар беті
                <ArrowRight size={15} className="ml-2" />
              </Link>
            </Button>
          }
        />

        {isLoading ? <ParentDashboardSkeleton /> : null}

        {!isLoading && error ? (
          <ErrorState
            text={error instanceof Error ? error.message : 'Ата-ана кабинетін жүктеу мүмкін болмады.'}
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.reload()}
              >
                <RotateCcw size={15} className="mr-2" />
                Қайта жүктеу
              </Button>
            }
          />
        ) : null}

        {!isLoading && !error && !child ? (
          <EmptyState
            icon={<UserPlus size={18} />}
            title="Бала байланыстырылмаған"
            text="Оқушы өз профилінде ата-ана сұранысын қабылдағаннан кейін бұл жерде оқу үлгерімі көрінеді."
            action={
              <Button type="button" asChild>
                <Link to="/children">
                  Баланы байланыстыру бетіне өту
                  <ArrowRight size={15} className="ml-2" />
                </Link>
              </Button>
            }
          />
        ) : null}

        {!isLoading && !error && child ? (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      name={child.name}
                      avatarUrl={child.avatarUrl}
                      className="h-12 w-12"
                      fallbackClassName="bg-accent text-sm font-semibold"
                    />

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold">{child.name}</p>
                        <StatusBadge tone={getScoreTone(avgScore)} icon={<Target size={12} />}>
                          {formatPercent(child.summary.stats.avgScore)}
                        </StatusBadge>
                      </div>

                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Linked student · {learningStatus}
                      </p>
                    </div>
                  </div>

                  {children.length > 1 ? (
                    <div className="flex flex-wrap gap-2">
                      {children.map((item) => (
                        <Button
                          key={item.studentId}
                          type="button"
                          size="sm"
                          variant={item.studentId === child.studentId ? 'default' : 'outline'}
                          onClick={() => setSelectedChildId(item.studentId)}
                        >
                          {item.name}
                        </Button>
                      ))}
                    </div>
                  ) : null}
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
                value={enrolledCourses}
                icon={<BookOpen size={16} />}
              />
              <StatCard
                label={t('dashboard.completed')}
                value={`${completedLessons} сабақ`}
                icon={<CheckCircle size={16} />}
              />
              <StatCard
                label={t('dashboard.rank')}
                value={child.summary.stats.rank ? `#${child.summary.stats.rank}` : '—'}
                icon={<Trophy size={16} />}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <QuickActionCard
                title="Прогресс"
                text="Баланың оқу барысын толық аналитикадан қараңыз."
                to="/child-progress"
                icon={<BarChart3 size={18} />}
              />

              <QuickActionCard
                title="Тесттер"
                text="Соңғы тест нәтижелері мен балл динамикасын бақылаңыз."
                to="/child-tests"
                icon={<ClipboardList size={18} />}
              />

              <QuickActionCard
                title="Жетістіктер"
                text="Баланың марапаттары мен оқу белсенділігін көріңіз."
                to="/child-achievements"
                icon={<Trophy size={18} />}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <PanelCard
                  title="Соңғы тест нәтижелері"
                  action={
                    <Button type="button" variant="ghost" size="sm" asChild>
                      <Link to="/child-tests">
                        {t('common.view')}
                        <ArrowRight size={14} className="ml-1.5" />
                      </Link>
                    </Button>
                  }
                >
                  {recentAttempts.length === 0 ? (
                    <EmptyState
                      title="Тест нәтижесі жоқ"
                      text="Оқушы тест тапсырмаған."
                      action={
                        <Button type="button" variant="outline" asChild>
                          <Link to="/child-tests">
                            Тесттер бетіне өту
                            <ArrowRight size={15} className="ml-2" />
                          </Link>
                        </Button>
                      }
                      compact
                    />
                  ) : (
                    recentAttempts.slice(0, 5).map((test) => {
                      const dateText = formatDate(test.completedAt);

                      return (
                        <div
                          key={test.id}
                          className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{test.title}</p>
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {test.subjectName}
                              {dateText ? ` · ${dateText}` : ''}
                            </p>
                          </div>

                          <StatusBadge tone={getScoreTone(test.score)}>
                            {formatPercent(test.score)}
                          </StatusBadge>
                        </div>
                      );
                    })
                  )}
                </PanelCard>

                <PanelCard title="Оқу динамикасы">
                  <div className="space-y-4">
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">
                          Орташа балл
                        </span>
                        <span className="text-xs font-medium">{formatPercent(avgScore)}</span>
                      </div>
                      <ProgressBar value={avgScore} size="sm" />
                    </div>

                    <div className="rounded-lg border bg-muted/20 p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">
                          Аяқталған сабақтар
                        </span>
                        <span className="text-xs font-medium">{completedLessons}</span>
                      </div>
                      <ProgressBar
                        value={enrolledCourses > 0 ? Math.min(100, completedLessons * 10) : 0}
                        size="sm"
                      />
                    </div>

                    <div className="rounded-lg border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
                      Бұл блок баланың оқу белсенділігін тез бағалауға арналған. Толық
                      мәліметті “Прогресс” бетінде көруге болады.
                    </div>
                  </div>
                </PanelCard>
              </div>

              <div className="space-y-4">
                <PanelCard title="Қысқаша талдау">
                  <div className="space-y-3">
                    <SummaryRow
                      label={t('dashboard.best_subject')}
                      value={
                        <span className="flex items-center justify-end gap-1">
                          <CheckCircle size={12} className="text-emerald-600" />
                          {safeText(bestSubject)}
                        </span>
                      }
                    />

                    <SummaryRow
                      label={t('dashboard.weak_subject')}
                      value={safeText(weakSubject)}
                    />

                    <SummaryRow
                      label={t('dashboard.streak')}
                      value={`${child.summary.stats.streakDays || 0} күн`}
                    />

                    <SummaryRow
                      label="Оқу жағдайы"
                      value={
                        <StatusBadge tone={getScoreTone(avgScore)}>
                          {learningStatus}
                        </StatusBadge>
                      }
                    />
                  </div>
                </PanelCard>

                <PanelCard title="Ата-анаға кеңес">
                  <div className="space-y-3">
                    {weakSubject ? (
                      <div className="rounded-lg border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {weakSubject}
                        </span>{' '}
                        пәні бойынша қосымша қайталау қажет болуы мүмкін.
                      </div>
                    ) : (
                      <div className="rounded-lg border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
                        Қиын пән анықталмаған. Оқу динамикасын бақылауды жалғастырыңыз.
                      </div>
                    )}

                    {avgScore >= 80 ? (
                      <div className="rounded-lg border bg-emerald-50 p-3 text-xs leading-5 text-emerald-700">
                        Нәтиже жақсы. Осы оқу қарқынын сақтауға көмектесіңіз.
                      </div>
                    ) : (
                      <div className="rounded-lg border bg-amber-50 p-3 text-xs leading-5 text-amber-700">
                        Аптасына кемінде 2–3 рет қысқа қайталау жасаған дұрыс.
                      </div>
                    )}
                  </div>
                </PanelCard>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}