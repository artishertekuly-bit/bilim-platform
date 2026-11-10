import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Flame,
  GraduationCap,
  LineChart,
  RefreshCcw,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import ProgressBar from '@/components/ProgressBar';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState } from '@/components/common/DataState';
import { Button } from '@/components/ui/button';
import {
  useAdminDashboard,
  useAnalytics,
  useTeacherDashboard,
} from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

type SubjectPerformanceItem = {
  name: string;
  score: number;
  tests: number;
  trend?: 'up' | 'down';
};

type WeakTopicItem = {
  subject: string;
  topic: string;
  score: number;
};

type RecentActivityItem = {
  action: string;
  detail: string;
  date: string;
  score: string | null;
};

type DisplayAnalyticsData = {
  subjectPerformance: SubjectPerformanceItem[];
  weakTopics: WeakTopicItem[];
  recentActivity: RecentActivityItem[];
  stats: {
    avgScore: number;
    testsTaken: number;
    lessonsCompleted: number;
    courses: number;
    streak: number;
  };
};

const MAX_TITLE_CHARS = 240;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_TITLE_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function toCount(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.round(num) : 0;
}

function clampPercent(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function getScoreTone(score: number) {
  if (score >= 80) return 'success' as const;
  if (score >= 50) return 'warning' as const;
  return 'danger' as const;
}

function AnalyticsCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs">
      <div className="mb-3.5 flex items-center gap-2">
        {icon ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-foreground">
            {icon}
          </span>
        ) : null}
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const safeUserId = cleanText(user?.id);

  const analytics = useAnalytics(safeUserId, Boolean(safeUserId && !isAdmin));
  const admin = useAdminDashboard(Boolean(safeUserId && isAdmin));
  const teacher = useTeacherDashboard(safeUserId, Boolean(safeUserId && isAdmin));

  const data = useMemo<DisplayAnalyticsData>(() => {
    const raw = (analytics.data as Partial<DisplayAnalyticsData>) || {};
    return {
      subjectPerformance: (raw.subjectPerformance || []).map((s) => ({
        name: cleanText(s.name),
        score: clampPercent(s.score),
        tests: toCount(s.tests),
        trend: s.trend,
      })),
      weakTopics: (raw.weakTopics || []).map((w) => ({
        subject: cleanText(w.subject),
        topic: cleanText(w.topic),
        score: clampPercent(w.score),
      })),
      recentActivity: (raw.recentActivity || []).map((a) => ({
        action: cleanText(a.action),
        detail: cleanText(a.detail),
        date: cleanText(a.date),
        score: a.score ? cleanText(a.score) : null,
      })),
      stats: {
        avgScore: clampPercent(raw.stats?.avgScore),
        testsTaken: toCount(raw.stats?.testsTaken),
        lessonsCompleted: toCount(raw.stats?.lessonsCompleted),
        courses: toCount(raw.stats?.courses),
        streak: toCount(raw.stats?.streak),
      },
    };
  }, [analytics.data]);

  const adminStats = useMemo(
    () => ({
      totalStudents: toCount(admin.data?.stats?.totalStudents),
      totalCourses: toCount(admin.data?.stats?.totalCourses),
      totalLessons: toCount(admin.data?.stats?.totalLessons),
      totalTests: toCount(admin.data?.stats?.totalTests),
    }),
    [admin.data],
  );

  const isLoading = isAdmin ? admin.isLoading : analytics.isLoading;
  const isError = isAdmin ? Boolean(admin.error) : Boolean(analytics.error);

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-2 rounded-3xl border border-border/80 bg-gradient-to-r from-muted/50 via-card to-card p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-foreground text-background shadow-xs">
                <BarChart3 size={18} />
              </div>
              <div>
                <h1 className="text-base font-black tracking-tight text-foreground sm:text-lg">
                  {isAdmin ? 'Платформа аналитикасы' : 'Оқу нәтижелері'}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {isAdmin ? 'Жүйелік көрсеткіштер мен үлгерім' : 'Жеке үлгерім динамикасы'}
                </p>
              </div>
            </div>

            <Button size="sm" variant="outline" className="rounded-full text-xs font-semibold" asChild>
              <Link to="/courses">
                Курстарға өту
                <ArrowRight size={13} className="ml-1.5" />
              </Link>
            </Button>
          </div>
        </div>

        {isError ? (
          <ErrorState
            text="Аналитиканы жүктеу мүмкін болмады."
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => window.location.reload()}
              >
                <RefreshCcw size={13} className="mr-1.5" />
                Қайта жүктеу
              </Button>
            }
          />
        ) : null}

        {isLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 rounded-2xl bg-muted/40 p-3" />
              ))}
            </div>
            <div className="h-48 rounded-3xl bg-muted/40" />
          </div>
        ) : null}

        {!isLoading && !isError && (
          <>
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {isAdmin ? (
                <>
                  <div className="rounded-2xl border border-border/80 bg-card p-3 shadow-xs">
                    <span className="text-[11px] font-medium text-muted-foreground">Оқушылар</span>
                    <p className="mt-1 text-lg font-black text-foreground">{adminStats.totalStudents}</p>
                  </div>
                  <div className="rounded-2xl border border-border/80 bg-card p-3 shadow-xs">
                    <span className="text-[11px] font-medium text-muted-foreground">Курстар</span>
                    <p className="mt-1 text-lg font-black text-foreground">{adminStats.totalCourses}</p>
                  </div>
                  <div className="rounded-2xl border border-border/80 bg-card p-3 shadow-xs">
                    <span className="text-[11px] font-medium text-muted-foreground">Сабақтар</span>
                    <p className="mt-1 text-lg font-black text-foreground">{adminStats.totalLessons}</p>
                  </div>
                  <div className="rounded-2xl border border-border/80 bg-card p-3 shadow-xs">
                    <span className="text-[11px] font-medium text-muted-foreground">Тесттер</span>
                    <p className="mt-1 text-lg font-black text-foreground">{adminStats.totalTests}</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-2xl border border-border/80 bg-card p-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-muted-foreground">Орташа балл</span>
                      <Target size={13} className="text-success-foreground" />
                    </div>
                    <p className="mt-1 text-lg font-black text-foreground">{data.stats.avgScore}%</p>
                  </div>
                  <div className="rounded-2xl border border-border/80 bg-card p-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-muted-foreground">Тапсырылған</span>
                      <ClipboardList size={13} className="text-muted-foreground" />
                    </div>
                    <p className="mt-1 text-lg font-black text-foreground">{data.stats.testsTaken} тест</p>
                  </div>
                  <div className="rounded-2xl border border-border/80 bg-card p-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-muted-foreground">Аяқталған</span>
                      <CheckCircle2 size={13} className="text-muted-foreground" />
                    </div>
                    <p className="mt-1 text-lg font-black text-foreground">{data.stats.lessonsCompleted} сабақ</p>
                  </div>
                  <div className="rounded-2xl border border-border/80 bg-card p-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-muted-foreground">Оқу сериясы</span>
                      <Flame size={13} className="text-warning-foreground" />
                    </div>
                    <p className="mt-1 text-lg font-black text-foreground">{data.stats.streak} күн</p>
                  </div>
                </>
              )}
            </div>

            {/* Content Cards */}
            <div className="grid gap-3.5 sm:grid-cols-2">
              {/* Subject Performance */}
              <AnalyticsCard title="Пән бойынша көрсеткіш" icon={<GraduationCap size={15} />}>
                {data.subjectPerformance.length === 0 ? (
                  <EmptyState title="Дерек әзірге жоқ" text="Тесттерді тапсырғаннан кейін пән көрсеткіштері шығады." compact />
                ) : (
                  <div className="space-y-3">
                    {data.subjectPerformance.map((item) => (
                      <div key={item.name} className="space-y-1.5 rounded-2xl bg-muted/20 p-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-foreground">{item.name}</span>
                          <StatusBadge tone={getScoreTone(item.score)}>
                            {item.score}%
                          </StatusBadge>
                        </div>
                        <ProgressBar value={item.score} size="sm" />
                      </div>
                    ))}
                  </div>
                )}
              </AnalyticsCard>

              {/* Weak Topics to Review */}
              <AnalyticsCard title="Қайталауға арналған тақырыптар" icon={<AlertTriangle size={15} />}>
                {data.weakTopics.length === 0 ? (
                  <EmptyState title="Қайталайтын тақырып жоқ" text="Барлық тапсырмалар жақсы нәтижемен тапсырылған!" compact />
                ) : (
                  <div className="space-y-2">
                    {data.weakTopics.map((topic, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2.5 rounded-2xl bg-muted/20 p-2.5 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{topic.topic || topic.subject}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{topic.subject}</p>
                        </div>
                        <StatusBadge tone={getScoreTone(topic.score)}>
                          {topic.score}%
                        </StatusBadge>
                      </div>
                    ))}
                  </div>
                )}
              </AnalyticsCard>
            </div>

            {/* Recent Activity Stream */}
            {data.recentActivity.length > 0 ? (
              <AnalyticsCard title="Соңғы оқу белсенділігі" icon={<ClipboardList size={15} />}>
                <div className="space-y-2">
                  {data.recentActivity.slice(0, 5).map((act, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-muted/25 p-2.5 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{act.action}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{act.detail}</p>
                      </div>
                      <span className="shrink-0 text-[11px] font-bold text-muted-foreground">
                        {act.score || act.date}
                      </span>
                    </div>
                  ))}
                </div>
              </AnalyticsCard>
            ) : null}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
