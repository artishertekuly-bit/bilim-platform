import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle,
  ClipboardList,
  LayoutDashboard,
  RotateCcw,
  Target,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import ProgressBar from '@/components/ProgressBar';
import StatCard from '@/components/StatCard';
import UserAvatar from '@/components/UserAvatar';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState } from '@/components/common/DataState';
import { SkeletonBlock } from '@/components/common/SkeletonBlocks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useParentDashboard } from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';

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

  if (value >= 80) return 'success' as const;
  if (value >= 50) return 'warning' as const;
  return 'danger' as const;
}

function getLearningStatus(
  avgScore: number | null | undefined,
  completedLessons: number
) {
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
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {action}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 p-4 sm:p-5">{children}</CardContent>
    </Card>
  );
}

function QuickActionCard({
  title,
  text,
  to,
  icon,
  tone = 'primary',
}: {
  title: string;
  text: string;
  to: string;
  icon: ReactNode;
  tone?: 'primary' | 'accent' | 'success';
}) {
  const toneClassName = {
    primary: {
      card: 'hover:border-primary-muted hover:bg-primary-soft/60',
      icon: 'border-primary-muted bg-primary-soft text-primary',
    },
    accent: {
      card: 'hover:border-accent-muted hover:bg-accent-soft/60',
      icon: 'border-accent-muted bg-accent-soft text-accent-foreground',
    },
    success: {
      card: 'hover:border-success-muted hover:bg-success-soft/60',
      icon: 'border-success-muted bg-success-soft text-success-foreground',
    },
  }[tone];

  return (
    <Link
      to={to}
      className={`group rounded-3xl border border-border bg-card p-4 shadow-soft transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-soft-md active:translate-y-0 active:scale-[0.99] ${toneClassName.card}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft ${toneClassName.icon}`}
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
        </div>

        <ArrowRight
          size={15}
          className="mt-1 shrink-0 text-muted-foreground transition-transform duration-200 ease-soft group-hover:translate-x-0.5 group-hover:text-primary"
        />
      </div>
    </Link>
  );
}

function SummaryRow({
  label,
  value,
  icon,
  emphasized = false,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 ${
        emphasized
          ? 'border-primary-muted bg-primary-soft/70'
          : 'border-border bg-surface-soft/60'
      }`}
    >
      <span className="inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border ${
            emphasized
              ? 'border-primary-muted bg-card text-primary'
              : 'border-border bg-card text-muted-foreground'
          }`}
        >
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </span>

      <span className="text-right text-xs font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

function ParentDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-12 w-12 rounded-2xl" />
          <div className="space-y-2">
            <SkeletonBlock className="h-4 w-36" />
            <SkeletonBlock className="h-3 w-24" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-3xl border border-border bg-card p-5 shadow-soft"
          >
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-10 w-10 rounded-2xl" />
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
          <div
            key={index}
            className="rounded-3xl border border-border bg-card p-4 shadow-soft"
          >
            <div className="flex items-start gap-3">
              <SkeletonBlock className="h-10 w-10 rounded-2xl" />
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
          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <SkeletonBlock className="h-5 w-40" />

            <div className="mt-5 space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-3xl border border-border p-3"
                >
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
            <div
              key={index}
              className="rounded-3xl border border-border bg-card p-5 shadow-soft"
            >
              <SkeletonBlock className="h-5 w-36" />
              <div className="mt-4 space-y-3">
                <SkeletonBlock className="h-10 w-full rounded-2xl" />
                <SkeletonBlock className="h-10 w-full rounded-2xl" />
                <SkeletonBlock className="h-10 w-full rounded-2xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChildSelector({
  child,
  children,
  onSelect,
}: {
  child: ParentChildDashboardItem;
  children: ParentChildDashboardItem[];
  onSelect: (studentId: string) => void;
}) {
  return (
    <Card className="overflow-hidden border-primary-muted bg-primary-soft/35">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <UserAvatar
              name={child.name}
              avatarUrl={child.avatarUrl}
              className="h-12 w-12"
              fallbackClassName="bg-primary-soft text-sm font-semibold text-primary"
            />

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold text-foreground">
                  {child.name}
                </p>

                <StatusBadge tone={getScoreTone(child.summary.stats.avgScore)}>
                  <Target size={12} />
                  {formatPercent(child.summary.stats.avgScore)}
                </StatusBadge>
              </div>

              <p className="mt-1 text-[11px] text-muted-foreground">
                Linked student ·{' '}
                {getLearningStatus(
                  child.summary.stats.avgScore,
                  Number(child.summary.stats.completedLessons || 0)
                )}
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
                  onClick={() => onSelect(item.studentId)}
                >
                  {item.name}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
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
            text={
              error instanceof Error
                ? error.message
                : 'Ата-ана кабинетін жүктеу мүмкін болмады.'
            }
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
            <ChildSelector
              child={child}
              children={children}
              onSelect={setSelectedChildId}
            />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label={t('dashboard.avg_score')}
                value={formatPercent(child.summary.stats.avgScore)}
                icon={<Target size={16} />}
                tone="success"
              />
              <StatCard
                label={t('dashboard.enrolled_courses')}
                value={enrolledCourses}
                icon={<BookOpen size={16} />}
                tone="primary"
              />
              <StatCard
                label={t('dashboard.completed')}
                value={`${completedLessons} сабақ`}
                icon={<CheckCircle size={16} />}
                tone="secondary"
              />
              <StatCard
                label={t('dashboard.rank')}
                value={child.summary.stats.rank ? `#${child.summary.stats.rank}` : '—'}
                icon={<Trophy size={16} />}
                tone="accent"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <QuickActionCard
                title="Прогресс"
                text="Баланың оқу барысын толық аналитикадан қараңыз."
                to="/child-progress"
                icon={<BarChart3 size={18} />}
                tone="primary"
              />

              <QuickActionCard
                title="Тесттер"
                text="Соңғы тест нәтижелері мен балл динамикасын бақылаңыз."
                to="/child-tests"
                icon={<ClipboardList size={18} />}
                tone="accent"
              />

              <QuickActionCard
                title="Жетістіктер"
                text="Баланың марапаттары мен оқу белсенділігін көріңіз."
                to="/child-achievements"
                icon={<Trophy size={18} />}
                tone="success"
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
                    <div className="space-y-3">
                      {recentAttempts.slice(0, 5).map((test) => {
                        const dateText = formatDate(test.completedAt);

                        return (
                          <div
                            key={test.id}
                            className="flex items-center justify-between gap-3 rounded-3xl border border-border bg-card p-4 shadow-soft transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:border-primary-muted hover:bg-primary-soft/50 hover:shadow-soft-md"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {test.title}
                              </p>
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
                      })}
                    </div>
                  )}
                </PanelCard>

                <PanelCard title="Оқу динамикасы">
                  <div className="space-y-4">
                    <div className="rounded-3xl border border-border bg-surface-soft/60 p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">
                          Орташа балл
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          {formatPercent(avgScore)}
                        </span>
                      </div>
                      <ProgressBar
                        value={avgScore}
                        size="sm"
                        tone={getScoreTone(avgScore)}
                      />
                    </div>

                    <div className="rounded-3xl border border-border bg-surface-soft/60 p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">
                          Аяқталған сабақтар
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          {completedLessons}
                        </span>
                      </div>
                      <ProgressBar
                        value={enrolledCourses > 0 ? Math.min(100, completedLessons * 10) : 0}
                        size="sm"
                        tone="primary"
                      />
                    </div>

                    <div className="rounded-3xl border border-ai-border bg-ai-soft/65 p-4 text-xs leading-5 text-muted-foreground">
                      Бұл блок баланың оқу белсенділігін тез бағалауға арналған.
                      Толық мәліметті “Прогресс” бетінде көруге болады.
                    </div>
                  </div>
                </PanelCard>
              </div>

              <div className="space-y-4">
                <PanelCard title="Қысқаша талдау">
                  <div className="space-y-3">
                    <SummaryRow
                      label={t('dashboard.best_subject')}
                      icon={<CheckCircle size={13} />}
                      value={
                        <span className="flex items-center justify-end gap-1">
                          {safeText(bestSubject)}
                        </span>
                      }
                    />

                    <SummaryRow
                      label={t('dashboard.weak_subject')}
                      icon={<Target size={13} />}
                      value={safeText(weakSubject)}
                    />

                    <SummaryRow
                      label={t('dashboard.streak')}
                      icon={<Trophy size={13} />}
                      value={`${child.summary.stats.streakDays || 0} күн`}
                    />

                    <SummaryRow
                      label="Оқу жағдайы"
                      icon={<BarChart3 size={13} />}
                      emphasized
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
                      <div className="rounded-3xl border border-warning-muted bg-warning-soft/65 p-4 text-xs leading-5 text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {weakSubject}
                        </span>{' '}
                        пәні бойынша қосымша қайталау қажет болуы мүмкін.
                      </div>
                    ) : (
                      <div className="rounded-3xl border border-success-muted bg-success-soft/65 p-4 text-xs leading-5 text-muted-foreground">
                        Қиын пән анықталмаған. Оқу динамикасын бақылауды жалғастырыңыз.
                      </div>
                    )}

                    {avgScore >= 80 ? (
                      <div className="rounded-3xl border border-success-muted bg-success-soft/65 p-4 text-xs leading-5 text-success-foreground">
                        Нәтиже жақсы. Осы оқу қарқынын сақтауға көмектесіңіз.
                      </div>
                    ) : (
                      <div className="rounded-3xl border border-warning-muted bg-warning-soft/65 p-4 text-xs leading-5 text-warning-foreground">
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