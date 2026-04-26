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
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState } from '@/components/common/DataState';
import { SkeletonBlock } from '@/components/common/SkeletonBlocks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useAdminDashboard,
  useAnalytics,
  useParentDashboard,
  useTeacherDashboard,
} from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import t, { getLocale } from '@/lib/i18n';

type AnalyticsMode = 'student' | 'parent' | 'teacher' | 'admin';
type ScoreTone = 'success' | 'warning' | 'danger';

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

type TeacherCourseProgressItem = {
  courseId: string;
  courseTitle: string;
  subjectName: string;
  students: number;
  lessons: number;
  avgProgress: number;
  completionPct: number;
};

type ParentAttempt = {
  id: string;
  title: string;
  subjectName: string;
  score: number | null;
  completedAt: string | null;
};

type ParentChildSummaryStats = {
  avgScore: number;
  totalTests: number;
  completedLessons: number;
  enrolledCourses: number;
  streakDays?: number;
  weakSubject?: string | null;
};

type ParentChildSummary = {
  stats: ParentChildSummaryStats;
  recentAttempts: ParentAttempt[];
};

type ParentChildItem = {
  studentId: string;
  name: string;
  avatarUrl: string | null;
  summary: ParentChildSummary;
};

type ParentActivityDraft = {
  action: string;
  detail: string;
  rawDate: string | null;
  score: string | null;
};

const EMPTY_DISPLAY_ANALYTICS: DisplayAnalyticsData = {
  subjectPerformance: [],
  weakTopics: [],
  recentActivity: [],
  stats: {
    avgScore: 0,
    testsTaken: 0,
    lessonsCompleted: 0,
    courses: 0,
    streak: 0,
  },
};

function getMode(role?: string): AnalyticsMode {
  if (role === 'teacher') return 'teacher';
  if (role === 'parent') return 'parent';
  if (role === 'admin') return 'admin';
  return 'student';
}

function toNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function clampPercent(value: unknown) {
  return Math.max(0, Math.min(100, Math.round(toNumber(value))));
}

function formatDate(value?: string | null) {
  if (!value) return t('page.analytics.not_available');

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return t('page.analytics.not_available');

  const locale = getLocale() === 'ru' ? 'ru-RU' : 'kk-KZ';
  return parsed.toLocaleDateString(locale);
}

function getScoreTone(score: number): ScoreTone {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

function getScoreBadgeLabel(score: number) {
  if (score >= 80) return 'Жақсы';
  if (score >= 50) return 'Орташа';
  return 'Назар қажет';
}

function normalizeDisplayAnalyticsData(
  input?: Partial<DisplayAnalyticsData> | null
): DisplayAnalyticsData | null {
  if (!input) return null;

  return {
    subjectPerformance: input.subjectPerformance || [],
    weakTopics: input.weakTopics || [],
    recentActivity: input.recentActivity || [],
    stats: {
      ...EMPTY_DISPLAY_ANALYTICS.stats,
      ...(input.stats || {}),
      avgScore: clampPercent(input.stats?.avgScore),
      testsTaken: toNumber(input.stats?.testsTaken),
      lessonsCompleted: toNumber(input.stats?.lessonsCompleted),
      courses: toNumber(input.stats?.courses),
      streak: toNumber(input.stats?.streak),
    },
  };
}

function buildParentAnalytics(
  children: ParentChildItem[] | undefined
): DisplayAnalyticsData | null {
  if (!children || children.length === 0) return null;

  const validChildren = children.filter((child) => child?.summary?.stats);
  if (validChildren.length === 0) return null;

  const scoredAttempts = validChildren
    .flatMap((child) => child.summary?.recentAttempts || [])
    .filter((attempt) => attempt && attempt.score !== null);

  const allAttempts = validChildren
    .flatMap((child) => child.summary?.recentAttempts || [])
    .filter(Boolean);

  const subjectMap = new Map<string, { totalScore: number; tests: number }>();

  scoredAttempts.forEach((attempt) => {
    const subjectName = attempt.subjectName || t('page.analytics.not_available');
    const score = Number(attempt.score);

    const current = subjectMap.get(subjectName) || {
      totalScore: 0,
      tests: 0,
    };

    subjectMap.set(subjectName, {
      totalScore: current.totalScore + score,
      tests: current.tests + 1,
    });
  });

  const subjectPerformance: SubjectPerformanceItem[] = Array.from(
    subjectMap.entries()
  ).map(([name, value]) => ({
    name,
    score: value.tests > 0 ? Math.round(value.totalScore / value.tests) : 0,
    tests: value.tests,
  }));

  const weakCounts = new Map<string, number>();

  validChildren.forEach((child) => {
    const weakSubject = child.summary?.stats?.weakSubject;

    if (weakSubject) {
      weakCounts.set(weakSubject, (weakCounts.get(weakSubject) || 0) + 1);
    }
  });

  const weakTopics: WeakTopicItem[] = Array.from(weakCounts.entries()).map(
    ([subject, count]) => {
      const performance = subjectPerformance.find((item) => item.name === subject);

      return {
        subject,
        topic: t('page.analytics.parent_attention_count', { count }),
        score: performance?.score || 0,
      };
    }
  );

  const recentActivityDraft: ParentActivityDraft[] = allAttempts.map((attempt) => ({
    action: t('page.analytics.parent_recent_test_action'),
    detail: attempt.title,
    rawDate: attempt.completedAt,
    score:
      attempt.score !== null && attempt.score !== undefined
        ? `${attempt.score}%`
        : null,
  }));

  const recentActivity: RecentActivityItem[] = recentActivityDraft
    .sort((a, b) => {
      const da = a.rawDate ? new Date(a.rawDate).getTime() : 0;
      const db = b.rawDate ? new Date(b.rawDate).getTime() : 0;
      return db - da;
    })
    .map((item) => ({
      action: item.action,
      detail: item.detail,
      date: formatDate(item.rawDate),
      score: item.score,
    }))
    .slice(0, 5);

  const totalChildren = validChildren.length;
  const totalAvgScore = validChildren.reduce(
    (acc, child) => acc + Number(child.summary.stats.avgScore || 0),
    0
  );

  const testsTaken = validChildren.reduce(
    (acc, child) => acc + Number(child.summary.stats.totalTests || 0),
    0
  );

  const lessonsCompleted = validChildren.reduce(
    (acc, child) => acc + Number(child.summary.stats.completedLessons || 0),
    0
  );

  const courses = validChildren.reduce(
    (acc, child) => acc + Number(child.summary.stats.enrolledCourses || 0),
    0
  );

  const streak = validChildren.reduce(
    (acc, child) => Math.max(acc, Number(child.summary.stats.streakDays || 0)),
    0
  );

  return {
    subjectPerformance,
    weakTopics,
    recentActivity,
    stats: {
      avgScore: totalChildren > 0 ? Math.round(totalAvgScore / totalChildren) : 0,
      testsTaken,
      lessonsCompleted,
      courses,
      streak,
    },
  };
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="rounded-3xl border border-border bg-card p-5 shadow-soft"
          >
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-11 w-11 rounded-2xl" />
              <div className="space-y-2">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-6 w-12" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <SkeletonBlock className="h-5 w-48" />

            <div className="mt-5 space-y-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <SkeletonBlock className="h-4 w-40" />
                    <SkeletonBlock className="h-3 w-16" />
                  </div>
                  <SkeletonBlock className="h-2 w-full rounded-full" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <SkeletonBlock className="h-5 w-40" />

            <div className="mt-5 space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="space-y-2">
                    <SkeletonBlock className="h-4 w-36" />
                    <SkeletonBlock className="h-3 w-56" />
                  </div>
                  <SkeletonBlock className="h-4 w-12" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <SkeletonBlock className="h-5 w-36" />

          <div className="mt-5 space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <SkeletonBlock className="h-4 w-28" />
                  <SkeletonBlock className="h-3 w-10" />
                </div>
                <SkeletonBlock className="h-3 w-44" />
                <SkeletonBlock className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsPanel({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          {icon ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
              {icon}
            </span>
          ) : null}
          {title}
        </CardTitle>

        {description ? (
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4 p-5">{children}</CardContent>
    </Card>
  );
}

function SubjectPerformanceList({ items }: { items: SubjectPerformanceItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={t('page.analytics.subject_performance_empty.title')}
        text={t('page.analytics.subject_performance_empty.text')}
        compact
      />
    );
  }

  return (
    <div className="space-y-4">
      {items.map((subject) => (
        <div
          key={subject.name}
          className="space-y-2 rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-soft"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">
                  {subject.name}
                </span>

                {subject.trend === 'up' ? (
                  <TrendingUp
                    size={13}
                    className="shrink-0 text-success-foreground"
                  />
                ) : subject.trend === 'down' ? (
                  <TrendingDown
                    size={13}
                    className="shrink-0 text-warning-foreground"
                  />
                ) : null}
              </div>

              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {subject.tests} {t('page.analytics.tests_short')}
              </p>
            </div>

            <StatusBadge tone={getScoreTone(subject.score)}>
              <Target size={12} />
              {subject.score}%
            </StatusBadge>
          </div>

          <ProgressBar value={subject.score} size="sm" />
        </div>
      ))}
    </div>
  );
}

function WeakTopicsList({ items }: { items: WeakTopicItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={t('page.analytics.weak_topics_empty.title')}
        text={t('page.analytics.weak_topics_empty.text')}
        compact
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((topic, index) => (
        <div
          key={`${topic.subject}-${index}`}
          className="space-y-2 rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-soft"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-xs font-semibold text-foreground">
              {topic.subject}
            </span>

            <StatusBadge tone={getScoreTone(topic.score)}>
              {topic.score}%
            </StatusBadge>
          </div>

          <p className="text-[11px] leading-5 text-muted-foreground">
            {topic.topic}
          </p>

          <ProgressBar value={topic.score} size="sm" />
        </div>
      ))}
    </div>
  );
}

function RecentActivityList({ items }: { items: RecentActivityItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={t('page.analytics.recent_activity_empty.title')}
        text={t('page.analytics.recent_activity_empty.text')}
        compact
      />
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={`${item.detail}-${index}`}
          className="flex items-start justify-between gap-3 rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-soft"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{item.action}</p>
            <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
              {item.detail}
            </p>
          </div>

          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {item.score || item.date || t('page.analytics.not_available')}
          </span>
        </div>
      ))}
    </div>
  );
}

function TeacherCourseProgressList({
  courses,
  metric,
}: {
  courses: TeacherCourseProgressItem[];
  metric: 'avgProgress' | 'completionPct';
}) {
  if (courses.length === 0) {
    return (
      <EmptyState
        title={
          metric === 'avgProgress'
            ? t('page.analytics.teacher.course_progress_empty.title')
            : t('page.analytics.teacher.completion_empty.title')
        }
        text={
          metric === 'avgProgress'
            ? t('page.analytics.teacher.course_progress_empty.text')
            : t('page.analytics.teacher.completion_empty.text')
        }
        compact
      />
    );
  }

  return (
    <div className="space-y-4">
      {courses.map((course) => {
        const value =
          metric === 'avgProgress'
            ? clampPercent(course.avgProgress)
            : clampPercent(course.completionPct);

        return (
          <div
            key={course.courseId}
            className="space-y-2 rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-soft"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="line-clamp-1 text-sm font-semibold text-foreground">
                  {course.courseTitle}
                </span>

                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {[
                    course.subjectName,
                    `${toNumber(course.students)} ${t('page.analytics.students_short')}`,
                    `${toNumber(course.lessons)} ${t('course.lessons_count')}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>

              <StatusBadge tone={getScoreTone(value)}>{value}%</StatusBadge>
            </div>

            <ProgressBar value={value} size="sm" />
          </div>
        );
      })}
    </div>
  );
}

function AdminSubjectStatsList({
  subjects,
}: {
  subjects: Array<{
    name: string;
    courses: number;
    lessons: number;
    avgScore: number;
  }>;
}) {
  if (subjects.length === 0) {
    return (
      <EmptyState
        title={t('page.analytics.subject_performance_empty.title')}
        text={t('page.analytics.subject_performance_empty.text')}
        compact
      />
    );
  }

  return (
    <div className="space-y-4">
      {subjects.map((subject) => {
        const avgScore = clampPercent(subject.avgScore);

        return (
          <div
            key={subject.name}
            className="space-y-2 rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-soft"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="line-clamp-1 text-sm font-semibold text-foreground">
                  {subject.name}
                </span>

                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {[
                    `${toNumber(subject.courses)} ${t('dashboard.total_courses')}`,
                    `${toNumber(subject.lessons)} ${t('course.lessons_count')}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>

              <StatusBadge tone={getScoreTone(avgScore)}>{avgScore}%</StatusBadge>
            </div>

            <ProgressBar value={avgScore} size="sm" />
          </div>
        );
      })}
    </div>
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
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-soft/60 px-3 py-2.5 shadow-inner-soft">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

function PageErrorState() {
  return (
    <ErrorState
      text={t('page.analytics.error')}
      action={
        <Button
          type="button"
          variant="outline"
          onClick={() => window.location.reload()}
        >
          <RefreshCcw size={15} className="mr-2" />
          Қайта жүктеу
        </Button>
      }
    />
  );
}

function PageEmptyState() {
  return (
    <EmptyState
      icon={<BarChart3 size={18} />}
      title={t('page.analytics.empty.title')}
      text={t('page.analytics.empty.text')}
      action={
        <Button type="button" variant="outline" asChild>
          <Link to="/dashboard">
            Dashboard-қа қайту
            <ArrowRight size={15} className="ml-2" />
          </Link>
        </Button>
      }
    />
  );
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const mode = getMode(user?.role);

  const analytics = useAnalytics(user?.id || '', !!user?.id && mode === 'student');
  const parent = useParentDashboard(user?.id || '', !!user?.id && mode === 'parent');
  const teacher = useTeacherDashboard(user?.id || '', !!user?.id && mode === 'teacher');
  const admin = useAdminDashboard(!!user?.id && mode === 'admin');

  const parentAnalytics = useMemo(
    () => buildParentAnalytics(parent.data as ParentChildItem[] | undefined),
    [parent.data]
  );

  const studentAnalytics = useMemo(
    () =>
      normalizeDisplayAnalyticsData(
        analytics.data as Partial<DisplayAnalyticsData> | null | undefined
      ),
    [analytics.data]
  );

  const teacherStats = useMemo(
    () => ({
      totalCourses: toNumber(teacher.data?.stats?.totalCourses),
      totalStudents: toNumber(teacher.data?.stats?.totalStudents),
      totalTests: toNumber(teacher.data?.stats?.totalTests),
      avgCourseProgress: clampPercent(teacher.data?.stats?.avgCourseProgress),
      completedLessons: toNumber(teacher.data?.stats?.completedLessons),
    }),
    [teacher.data]
  );

  const teacherCourseProgress = useMemo<TeacherCourseProgressItem[]>(
    () =>
      ((teacher.data?.courseProgress || []) as TeacherCourseProgressItem[]).map(
        (course) => ({
          courseId: course.courseId,
          courseTitle: course.courseTitle || 'Курс',
          subjectName: course.subjectName || t('page.analytics.not_available'),
          students: toNumber(course.students),
          lessons: toNumber(course.lessons),
          avgProgress: clampPercent(course.avgProgress),
          completionPct: clampPercent(course.completionPct),
        })
      ),
    [teacher.data]
  );

  const adminStats = useMemo(
    () => ({
      totalStudents: toNumber(admin.data?.stats?.totalStudents),
      totalCourses: toNumber(admin.data?.stats?.totalCourses),
      totalLessons: toNumber(admin.data?.stats?.totalLessons),
      totalTests: toNumber(admin.data?.stats?.totalTests),
      published: toNumber(admin.data?.contentStatus?.published),
    }),
    [admin.data]
  );

  const adminSubjectStats = useMemo(
    () =>
      (admin.data?.subjectStats || []).map((subject) => ({
        name: subject.name || t('page.analytics.not_available'),
        courses: toNumber(subject.courses),
        lessons: toNumber(subject.lessons),
        avgScore: clampPercent(subject.avgScore),
      })),
    [admin.data]
  );

  if (mode === 'teacher') {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <PageHeader
            eyebrow={
              <>
                <LineChart size={13} />
                Мұғалім аналитикасы
              </>
            }
            icon={<BarChart3 size={20} />}
            title={t('page.analytics.title.teacher')}
            description={t('page.analytics.description.teacher')}
            actions={
              <Button type="button" asChild>
                <Link to="/my-courses">
                  Курстарға өту
                  <ArrowRight size={15} className="ml-2" />
                </Link>
              </Button>
            }
          />

          {teacher.isLoading ? <AnalyticsSkeleton /> : null}
          {!teacher.isLoading && teacher.error ? <PageErrorState /> : null}

          {!teacher.isLoading && !teacher.error ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <StatCard
                  label={t('dashboard.total_courses')}
                  value={teacherStats.totalCourses}
                  icon={<BookOpen size={16} />}
                />
                <StatCard
                  label={t('dashboard.total_students')}
                  value={teacherStats.totalStudents}
                  icon={<Users size={16} />}
                />
                <StatCard
                  label={t('dashboard.total_tests')}
                  value={teacherStats.totalTests}
                  icon={<ClipboardList size={16} />}
                />
                <StatCard
                  label={t('page.analytics.avg_course_progress')}
                  value={`${teacherStats.avgCourseProgress}%`}
                  icon={<Target size={16} />}
                />
                <StatCard
                  label={t('page.analytics.completed_lessons')}
                  value={teacherStats.completedLessons}
                  icon={<Flame size={16} />}
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-2">
                  <AnalyticsPanel
                    title={t('page.analytics.teacher.course_progress_title')}
                    description="Курстар бойынша оқушылардың орташа прогресі."
                    icon={<TrendingUp size={15} />}
                  >
                    <TeacherCourseProgressList
                      courses={teacherCourseProgress}
                      metric="avgProgress"
                    />
                  </AnalyticsPanel>
                </div>

                <div className="space-y-4">
                  <AnalyticsPanel
                    title={t('page.analytics.teacher.completion_title')}
                    description="Курстар бойынша аяқталу пайызы."
                    icon={<CheckCircle2 size={15} />}
                  >
                    <TeacherCourseProgressList
                      courses={teacherCourseProgress}
                      metric="completionPct"
                    />
                  </AnalyticsPanel>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </DashboardLayout>
    );
  }

  if (mode === 'admin') {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <PageHeader
            eyebrow={
              <>
                <LineChart size={13} />
                Admin analytics
              </>
            }
            icon={<BarChart3 size={20} />}
            title={t('page.analytics.title.admin')}
            description={t('page.analytics.description.admin')}
            actions={
              <Button type="button" asChild>
                <Link to="/manage-users">
                  Қолданушылар
                  <ArrowRight size={15} className="ml-2" />
                </Link>
              </Button>
            }
          />

          {admin.isLoading ? <AnalyticsSkeleton /> : null}
          {!admin.isLoading && admin.error ? <PageErrorState /> : null}

          {!admin.isLoading && !admin.error ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <StatCard
                  label={t('dashboard.total_students')}
                  value={adminStats.totalStudents}
                  icon={<Users size={16} />}
                />
                <StatCard
                  label={t('dashboard.total_courses')}
                  value={adminStats.totalCourses}
                  icon={<BookOpen size={16} />}
                />
                <StatCard
                  label={t('page.analytics.completed_lessons')}
                  value={adminStats.totalLessons}
                  icon={<BookOpen size={16} />}
                />
                <StatCard
                  label={t('dashboard.total_tests')}
                  value={adminStats.totalTests}
                  icon={<ClipboardList size={16} />}
                />
                <StatCard
                  label={t('course.status.published')}
                  value={adminStats.published}
                  icon={<Target size={16} />}
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-2">
                  <AnalyticsPanel
                    title={t('page.analytics.subject_performance_title')}
                    description="Пәндер бойынша курс, сабақ және орташа нәтиже."
                    icon={<GraduationCap size={15} />}
                  >
                    <AdminSubjectStatsList subjects={adminSubjectStats} />
                  </AnalyticsPanel>
                </div>

                <div className="space-y-4">
                  <AnalyticsPanel
                    title={t('page.analytics.weak_topics_title')}
                    description="Орташа көрсеткіші төмен пәндер."
                    icon={<AlertTriangle size={15} />}
                  >
                    {adminSubjectStats.length === 0 ? (
                      <EmptyState
                        title={t('page.analytics.weak_topics_empty.title')}
                        text={t('page.analytics.weak_topics_empty.text')}
                        compact
                      />
                    ) : (
                      <WeakTopicsList
                        items={[...adminSubjectStats]
                          .sort((a, b) => a.avgScore - b.avgScore)
                          .slice(0, 3)
                          .map((subject) => ({
                            subject: subject.name,
                            topic: t('page.analytics.not_available'),
                            score: subject.avgScore,
                          }))}
                      />
                    )}
                  </AnalyticsPanel>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </DashboardLayout>
    );
  }

  const data = mode === 'parent' ? parentAnalytics : studentAnalytics;
  const isLoading = mode === 'parent' ? parent.isLoading : analytics.isLoading;
  const error = mode === 'parent' ? parent.error : analytics.error;

  const pageTitle =
    mode === 'parent' ? t('page.analytics.title.parent') : t('nav.analytics');

  const pageDescription =
    mode === 'parent'
      ? t('page.analytics.description.parent')
      : t('page.analytics.description.student');

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <LineChart size={13} />
              {mode === 'parent' ? 'Ата-ана аналитикасы' : 'Оқу аналитикасы'}
            </>
          }
          icon={<BarChart3 size={20} />}
          title={pageTitle}
          description={pageDescription}
          actions={
            mode === 'parent' ? (
              <Button type="button" asChild>
                <Link to="/children">
                  Балалар беті
                  <ArrowRight size={15} className="ml-2" />
                </Link>
              </Button>
            ) : (
              <Button type="button" asChild>
                <Link to="/courses">
                  Курстарға өту
                  <ArrowRight size={15} className="ml-2" />
                </Link>
              </Button>
            )
          }
        />

        {isLoading ? <AnalyticsSkeleton /> : null}
        {!isLoading && error ? <PageErrorState /> : null}
        {!isLoading && !error && !data ? <PageEmptyState /> : null}

        {!isLoading && !error && data ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <StatCard
                label={t('dashboard.avg_score')}
                value={`${data.stats.avgScore}%`}
                icon={<Target size={16} />}
              />
              <StatCard
                label={t('dashboard.total_tests')}
                value={data.stats.testsTaken}
                icon={<ClipboardList size={16} />}
              />
              <StatCard
                label={t('page.analytics.completed_lessons')}
                value={data.stats.lessonsCompleted}
                icon={<BookOpen size={16} />}
              />
              <StatCard
                label={t('dashboard.enrolled_courses')}
                value={data.stats.courses}
                icon={<BookOpen size={16} />}
              />
              <StatCard
                label={t('dashboard.streak')}
                value={`${data.stats.streak} ${t('common.days')}`}
                icon={<Flame size={16} />}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <AnalyticsPanel
                  title={t('page.analytics.subject_performance_title')}
                  description="Пәндер бойынша тест нәтижелері мен жалпы динамика."
                  icon={<TrendingUp size={15} />}
                >
                  <SubjectPerformanceList items={data.subjectPerformance} />
                </AnalyticsPanel>

                <AnalyticsPanel
                  title={t('dashboard.recent_activity')}
                  description="Соңғы тесттер, әрекеттер және нәтижелер."
                  icon={<ClipboardList size={15} />}
                >
                  <RecentActivityList items={data.recentActivity} />
                </AnalyticsPanel>
              </div>

              <div className="space-y-4">
                <AnalyticsPanel
                  title={t('page.analytics.weak_topics_title')}
                  description="Қосымша қайталауды қажет ететін бағыттар."
                  icon={<AlertTriangle size={15} />}
                >
                  <WeakTopicsList items={data.weakTopics} />
                </AnalyticsPanel>

                <AnalyticsPanel
                  title="Қысқа қорытынды"
                  description="Оқу көрсеткіштері бойынша автоматты UI summary."
                  icon={<Target size={15} />}
                >
                  <div className="space-y-3 text-sm">
                    <SummaryRow
                      label="Орташа нәтиже"
                      value={
                        <StatusBadge tone={getScoreTone(data.stats.avgScore)}>
                          {getScoreBadgeLabel(data.stats.avgScore)}
                        </StatusBadge>
                      }
                    />

                    <SummaryRow
                      label="Аяқталған сабақ"
                      value={data.stats.lessonsCompleted}
                    />

                    <SummaryRow
                      label="Оқу streak"
                      value={`${data.stats.streak} ${t('common.days')}`}
                    />
                  </div>
                </AnalyticsPanel>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}