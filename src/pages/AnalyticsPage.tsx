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
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

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

const MAX_ID_CHARS = 180;
const MAX_LABEL_CHARS = 180;
const MAX_TITLE_CHARS = 240;
const MAX_DETAIL_CHARS = 420;
const MAX_DATE_CHARS = 80;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_LABEL_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function getMode(role?: string): AnalyticsMode {
  if (role === 'teacher') return 'teacher';
  if (role === 'parent') return 'parent';
  if (role === 'admin') return 'admin';

  return 'student';
}

function toNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function toCount(value: unknown): number {
  return Math.max(0, Math.round(toNumber(value)));
}

function clampPercent(value: unknown): number {
  return Math.max(0, Math.min(100, Math.round(toNumber(value))));
}

function normalizeTrend(value: unknown): SubjectPerformanceItem['trend'] | undefined {
  if (value === 'up' || value === 'down') return value;

  return undefined;
}

function formatDate(value?: string | null): string {
  const rawValue = cleanText(value, MAX_DATE_CHARS);

  if (!rawValue) return t('page.analytics.not_available');

  const parsed = new Date(rawValue);

  if (Number.isNaN(parsed.getTime())) {
    return t('page.analytics.not_available');
  }

  const locale = getLocale() === 'ru' ? 'ru-RU' : 'kk-KZ';

  return parsed.toLocaleDateString(locale);
}

function getScoreTone(score: number): ScoreTone {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';

  return 'danger';
}

function getScoreBadgeLabel(score: number): string {
  const normalizedScore = clampPercent(score);

  if (normalizedScore >= 80) return 'Жақсы';
  if (normalizedScore >= 50) return 'Орташа';

  return 'Назар қажет';
}

function normalizeSubjectPerformanceItems(
  items: unknown,
): SubjectPerformanceItem[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const row = item as Partial<SubjectPerformanceItem>;
      const name = cleanText(row.name, MAX_TITLE_CHARS);

      if (!name) return null;

      return {
        name,
        score: clampPercent(row.score),
        tests: toCount(row.tests),
        trend: normalizeTrend(row.trend),
      } satisfies SubjectPerformanceItem;
    })
    .filter((item): item is SubjectPerformanceItem => Boolean(item));
}

function normalizeWeakTopicItems(items: unknown): WeakTopicItem[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const row = item as Partial<WeakTopicItem>;
      const subject = cleanText(row.subject, MAX_TITLE_CHARS);
      const topic = cleanText(row.topic, MAX_DETAIL_CHARS);

      if (!subject && !topic) return null;

      return {
        subject: subject || t('page.analytics.not_available'),
        topic: topic || t('page.analytics.not_available'),
        score: clampPercent(row.score),
      } satisfies WeakTopicItem;
    })
    .filter((item): item is WeakTopicItem => Boolean(item));
}

function normalizeRecentActivityItems(items: unknown): RecentActivityItem[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const row = item as Partial<RecentActivityItem>;
      const action = cleanText(row.action, MAX_TITLE_CHARS);
      const detail = cleanText(row.detail, MAX_DETAIL_CHARS);
      const score = cleanText(row.score, 40);

      if (!action && !detail) return null;

      return {
        action: action || t('page.analytics.not_available'),
        detail: detail || t('page.analytics.not_available'),
        date: cleanText(row.date, MAX_DATE_CHARS) || t('page.analytics.not_available'),
        score: score || null,
      } satisfies RecentActivityItem;
    })
    .filter((item): item is RecentActivityItem => Boolean(item));
}

function normalizeDisplayAnalyticsData(
  input?: Partial<DisplayAnalyticsData> | null,
): DisplayAnalyticsData | null {
  if (!input) return null;

  return {
    subjectPerformance: normalizeSubjectPerformanceItems(input.subjectPerformance),
    weakTopics: normalizeWeakTopicItems(input.weakTopics),
    recentActivity: normalizeRecentActivityItems(input.recentActivity),
    stats: {
      ...EMPTY_DISPLAY_ANALYTICS.stats,
      ...(input.stats || {}),
      avgScore: clampPercent(input.stats?.avgScore),
      testsTaken: toCount(input.stats?.testsTaken),
      lessonsCompleted: toCount(input.stats?.lessonsCompleted),
      courses: toCount(input.stats?.courses),
      streak: toCount(input.stats?.streak),
    },
  };
}

function normalizeParentAttempt(value: unknown): ParentAttempt | null {
  if (!value || typeof value !== 'object') return null;

  const row = value as Partial<ParentAttempt>;
  const id = cleanId(row.id);
  const title = cleanText(row.title, MAX_TITLE_CHARS);
  const subjectName = cleanText(row.subjectName, MAX_TITLE_CHARS);
  const score = row.score === null || row.score === undefined ? null : clampPercent(row.score);
  const completedAt = cleanText(row.completedAt, MAX_DATE_CHARS) || null;

  if (!title && !subjectName && score === null) return null;

  return {
    id,
    title: title || t('page.analytics.not_available'),
    subjectName: subjectName || t('page.analytics.not_available'),
    score,
    completedAt,
  };
}

function normalizeParentChild(value: unknown): ParentChildItem | null {
  if (!value || typeof value !== 'object') return null;

  const row = value as ParentChildItem;
  const stats = row.summary?.stats;

  if (!stats) return null;

  const recentAttempts = Array.isArray(row.summary?.recentAttempts)
    ? row.summary.recentAttempts
        .map(normalizeParentAttempt)
        .filter((attempt): attempt is ParentAttempt => Boolean(attempt))
    : [];

  return {
    studentId: cleanId(row.studentId),
    name: cleanText(row.name, MAX_TITLE_CHARS) || t('page.analytics.not_available'),
    avatarUrl: cleanText(row.avatarUrl, 2_000) || null,
    summary: {
      stats: {
        avgScore: clampPercent(stats.avgScore),
        totalTests: toCount(stats.totalTests),
        completedLessons: toCount(stats.completedLessons),
        enrolledCourses: toCount(stats.enrolledCourses),
        streakDays: toCount(stats.streakDays),
        weakSubject: cleanText(stats.weakSubject, MAX_TITLE_CHARS) || null,
      },
      recentAttempts,
    },
  };
}

function buildParentAnalytics(
  children: ParentChildItem[] | undefined,
): DisplayAnalyticsData | null {
  if (!children || children.length === 0) return null;

  const validChildren = children
    .map(normalizeParentChild)
    .filter((child): child is ParentChildItem => Boolean(child));

  if (validChildren.length === 0) return null;

  const scoredAttempts = validChildren
    .flatMap((child) => child.summary.recentAttempts)
    .filter((attempt) => attempt.score !== null);

  const allAttempts = validChildren.flatMap((child) => child.summary.recentAttempts);

  const subjectMap = new Map<string, { totalScore: number; tests: number }>();

  scoredAttempts.forEach((attempt) => {
    const subjectName = cleanText(attempt.subjectName, MAX_TITLE_CHARS) ||
      t('page.analytics.not_available');
    const score = clampPercent(attempt.score);

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
    subjectMap.entries(),
  ).map(([name, value]) => ({
    name,
    score: value.tests > 0 ? clampPercent(value.totalScore / value.tests) : 0,
    tests: value.tests,
  }));

  const weakCounts = new Map<string, number>();

  validChildren.forEach((child) => {
    const weakSubject = cleanText(child.summary.stats.weakSubject, MAX_TITLE_CHARS);

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
        score: clampPercent(performance?.score),
      };
    },
  );

  const recentActivityDraft: ParentActivityDraft[] = allAttempts.map((attempt) => ({
    action: t('page.analytics.parent_recent_test_action'),
    detail: cleanText(attempt.title, MAX_DETAIL_CHARS),
    rawDate: cleanText(attempt.completedAt, MAX_DATE_CHARS) || null,
    score:
      attempt.score !== null && attempt.score !== undefined
        ? `${clampPercent(attempt.score)}%`
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
      detail: item.detail || t('page.analytics.not_available'),
      date: formatDate(item.rawDate),
      score: item.score,
    }))
    .slice(0, 5);

  const totalChildren = validChildren.length;
  const totalAvgScore = validChildren.reduce(
    (acc, child) => acc + clampPercent(child.summary.stats.avgScore),
    0,
  );

  const testsTaken = validChildren.reduce(
    (acc, child) => acc + toCount(child.summary.stats.totalTests),
    0,
  );

  const lessonsCompleted = validChildren.reduce(
    (acc, child) => acc + toCount(child.summary.stats.completedLessons),
    0,
  );

  const courses = validChildren.reduce(
    (acc, child) => acc + toCount(child.summary.stats.enrolledCourses),
    0,
  );

  const streak = validChildren.reduce(
    (acc, child) => Math.max(acc, toCount(child.summary.stats.streakDays)),
    0,
  );

  return {
    subjectPerformance,
    weakTopics,
    recentActivity,
    stats: {
      avgScore: totalChildren > 0 ? clampPercent(totalAvgScore / totalChildren) : 0,
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
  const safeTitle = cleanText(title, MAX_TITLE_CHARS);
  const safeDescription = cleanText(description, MAX_DETAIL_CHARS);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          {icon ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
              {icon}
            </span>
          ) : null}
          {safeTitle}
        </CardTitle>

        {safeDescription ? (
          <p className="text-xs leading-5 text-muted-foreground">
            {safeDescription}
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4 p-5">{children}</CardContent>
    </Card>
  );
}

function SubjectPerformanceList({ items }: { items: SubjectPerformanceItem[] }) {
  const safeItems = normalizeSubjectPerformanceItems(items);

  if (safeItems.length === 0) {
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
      {safeItems.map((subject, index) => (
        <div
          key={`${subject.name}-${index}`}
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
  const safeItems = normalizeWeakTopicItems(items);

  if (safeItems.length === 0) {
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
      {safeItems.map((topic, index) => (
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
  const safeItems = normalizeRecentActivityItems(items);

  if (safeItems.length === 0) {
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
      {safeItems.map((item, index) => (
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
      {courses.map((course, index) => {
        const value =
          metric === 'avgProgress'
            ? clampPercent(course.avgProgress)
            : clampPercent(course.completionPct);

        const courseTitle = cleanText(course.courseTitle, MAX_TITLE_CHARS) || 'Курс';
        const subjectName = cleanText(course.subjectName, MAX_TITLE_CHARS) ||
          t('page.analytics.not_available');
        const courseId = cleanId(course.courseId) || `${courseTitle}-${index}`;

        return (
          <div
            key={courseId}
            className="space-y-2 rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-soft"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="line-clamp-1 text-sm font-semibold text-foreground">
                  {courseTitle}
                </span>

                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {[
                    subjectName,
                    `${toCount(course.students)} ${t('page.analytics.students_short')}`,
                    `${toCount(course.lessons)} ${t('course.lessons_count')}`,
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
      {subjects.map((subject, index) => {
        const avgScore = clampPercent(subject.avgScore);
        const subjectName = cleanText(subject.name, MAX_TITLE_CHARS) ||
          t('page.analytics.not_available');

        return (
          <div
            key={`${subjectName}-${index}`}
            className="space-y-2 rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-soft"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="line-clamp-1 text-sm font-semibold text-foreground">
                  {subjectName}
                </span>

                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {[
                    `${toCount(subject.courses)} ${t('dashboard.total_courses')}`,
                    `${toCount(subject.lessons)} ${t('course.lessons_count')}`,
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
      <span className="text-sm text-muted-foreground">
        {cleanText(label, MAX_TITLE_CHARS)}
      </span>
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
            Кабинетке қайту
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
  const safeUserId = cleanId(user?.id);

  const analytics = useAnalytics(safeUserId, Boolean(safeUserId && mode === 'student'));
  const parent = useParentDashboard(safeUserId, Boolean(safeUserId && mode === 'parent'));
  const teacher = useTeacherDashboard(safeUserId, Boolean(safeUserId && mode === 'teacher'));
  const admin = useAdminDashboard(Boolean(safeUserId && mode === 'admin'));

  const parentAnalytics = useMemo(
    () => buildParentAnalytics(parent.data as ParentChildItem[] | undefined),
    [parent.data],
  );

  const studentAnalytics = useMemo(
    () =>
      normalizeDisplayAnalyticsData(
        analytics.data as Partial<DisplayAnalyticsData> | null | undefined,
      ),
    [analytics.data],
  );

  const teacherStats = useMemo(
    () => ({
      totalCourses: toCount(teacher.data?.stats?.totalCourses),
      totalStudents: toCount(teacher.data?.stats?.totalStudents),
      totalTests: toCount(teacher.data?.stats?.totalTests),
      avgCourseProgress: clampPercent(teacher.data?.stats?.avgCourseProgress),
      completedLessons: toCount(teacher.data?.stats?.completedLessons),
    }),
    [teacher.data],
  );

  const teacherCourseProgress = useMemo<TeacherCourseProgressItem[]>(
    () =>
      ((teacher.data?.courseProgress || []) as TeacherCourseProgressItem[])
        .map((course) => ({
          courseId: cleanId(course.courseId),
          courseTitle: cleanText(course.courseTitle, MAX_TITLE_CHARS) || 'Курс',
          subjectName:
            cleanText(course.subjectName, MAX_TITLE_CHARS) ||
            t('page.analytics.not_available'),
          students: toCount(course.students),
          lessons: toCount(course.lessons),
          avgProgress: clampPercent(course.avgProgress),
          completionPct: clampPercent(course.completionPct),
        }))
        .filter((course) => course.courseId || course.courseTitle),
    [teacher.data],
  );

  const adminStats = useMemo(
    () => ({
      totalStudents: toCount(admin.data?.stats?.totalStudents),
      totalCourses: toCount(admin.data?.stats?.totalCourses),
      totalLessons: toCount(admin.data?.stats?.totalLessons),
      totalTests: toCount(admin.data?.stats?.totalTests),
      published: toCount(admin.data?.contentStatus?.published),
    }),
    [admin.data],
  );

  const adminSubjectStats = useMemo(
    () =>
      (admin.data?.subjectStats || [])
        .map((subject) => ({
          name: cleanText(subject.name, MAX_TITLE_CHARS) ||
            t('page.analytics.not_available'),
          courses: toCount(subject.courses),
          lessons: toCount(subject.lessons),
          avgScore: clampPercent(subject.avgScore),
        }))
        .filter((subject) => subject.name),
    [admin.data],
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
                Әкімші аналитикасы
              </>
            }
            icon={<BarChart3 size={20} />}
            title={t('page.analytics.title.admin')}
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
                    icon={<GraduationCap size={15} />}
                  >
                    <AdminSubjectStatsList subjects={adminSubjectStats} />
                  </AnalyticsPanel>
                </div>

                <div className="space-y-4">
                  <AnalyticsPanel
                    title={t('page.analytics.weak_topics_title')}
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
                  icon={<TrendingUp size={15} />}
                >
                  <SubjectPerformanceList items={data.subjectPerformance} />
                </AnalyticsPanel>

                <AnalyticsPanel
                  title={t('dashboard.recent_activity')}
                  icon={<ClipboardList size={15} />}
                >
                  <RecentActivityList items={data.recentActivity} />
                </AnalyticsPanel>
              </div>

              <div className="space-y-4">
                <AnalyticsPanel
                  title={t('page.analytics.weak_topics_title')}
                  icon={<AlertTriangle size={15} />}
                >
                  <WeakTopicsList items={data.weakTopics} />
                </AnalyticsPanel>

                <AnalyticsPanel title="Қысқа қорытынды" icon={<Target size={15} />}>
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
                      label="Оқу сериясы"
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
