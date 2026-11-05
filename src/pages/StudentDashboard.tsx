import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle,
  CheckCircle2,
  Flame,
  GraduationCap,
  LayoutDashboard,
  Lock,
  MessageCircle,
  PlayCircle,
  RotateCcw,
  Star,
  Target,
  Trophy,
  Users,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import ProgressBar from '@/components/ProgressBar';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import { SkeletonBlock } from '@/components/common/SkeletonBlocks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useStudentDashboard,
  useStudentLearningSnapshot,
} from '@/hooks/use-platform-data';
import type {
  LearningRiskLevel,
  StudentLearningSnapshot,
} from '@/lib/app-data-types';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

const MAX_ID_CHARS = 160;
const MAX_TITLE_CHARS = 240;
const MAX_META_CHARS = 180;
const MAX_NAME_CHARS = 120;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_TITLE_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function formatCount(value: unknown): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return 0;

  return Math.max(0, Math.round(numberValue));
}

function clampPercentNumber(value: unknown): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return 0;

  return Math.max(0, Math.min(100, Math.round(numberValue)));
}

function formatPercent(value: unknown): string {
  return `${clampPercentNumber(value)}%`;
}

function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';

  return `${clampPercentNumber(value)}%`;
}

function buildEntityPath(basePath: '/lessons' | '/courses', value: unknown): string | null {
  const id = cleanId(value);

  if (!id) return null;

  return `${basePath}/${encodeURIComponent(id)}`;
}

function buildLessonPath(value: unknown): string | null {
  return buildEntityPath('/lessons', value);
}

function buildCoursePath(value: unknown): string | null {
  return buildEntityPath('/courses', value);
}

function getStudyStatus(avgScore: number, completedLessons: number) {
  if (avgScore >= 80 && completedLessons >= 5) {
    return t('page.student_dashboard.status.excellent');
  }

  if (avgScore >= 60 || completedLessons >= 3) {
    return t('page.student_dashboard.status.good');
  }

  return t('page.student_dashboard.status.attention');
}

function getScoreTone(score: number | null | undefined) {
  const normalized = clampPercentNumber(score);

  if (normalized >= 80) return 'success' as const;
  if (normalized >= 50) return 'warning' as const;
  return 'danger' as const;
}



type DashboardLessonPreview = {
  id?: string | null;
  title?: string | null;
  subjectName?: string | null;
  courseTitle?: string | null;
  isLocked?: boolean | null;
};

function formatDateTime(value: string | null | undefined) {
  const rawValue = cleanText(value, 80);

  if (!rawValue) return '—';

  const date = new Date(rawValue);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('kk-KZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function StudentDashboardSkeleton() {
  return (
    <div className="space-y-6">
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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <SkeletonBlock className="h-5 w-40" />

            <div className="mt-5 rounded-3xl border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <SkeletonBlock className="h-3 w-24" />
                  <SkeletonBlock className="h-5 w-72 max-w-full" />
                  <SkeletonBlock className="h-3 w-56 max-w-full" />
                  <SkeletonBlock className="h-3 w-80 max-w-full" />
                </div>

                <SkeletonBlock className="h-9 w-28 rounded-2xl" />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-14 w-full rounded-2xl" />
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <SkeletonBlock className="h-5 w-32" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="space-y-2 rounded-3xl border border-border p-3"
                >
                  <div className="flex justify-between gap-3">
                    <div className="space-y-2">
                      <SkeletonBlock className="h-4 w-48" />
                      <SkeletonBlock className="h-3 w-64" />
                    </div>
                    <SkeletonBlock className="h-4 w-10" />
                  </div>
                  <SkeletonBlock className="h-2 w-full rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="rounded-3xl border border-border bg-card p-5 shadow-soft"
            >
              <SkeletonBlock className="h-5 w-36" />
              <div className="mt-4 space-y-3">
                <SkeletonBlock className="h-4 w-full" />
                <SkeletonBlock className="h-4 w-5/6" />
                <SkeletonBlock className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuickActionCard({
  title,
  to,
  icon,
  tone = 'primary',
}: {
  title: string;
  to: string;
  icon: ReactNode;
  tone?: 'primary' | 'accent' | 'ai';
}) {
  const toneClassName = {
    primary: {
      card: 'hover:bg-primary-soft/50',
      icon: 'bg-primary-soft text-primary',
    },
    accent: {
      card: 'hover:bg-accent-soft/50',
      icon: 'bg-accent-soft text-accent-foreground',
    },
    ai: {
      card: 'hover:bg-ai-soft/50',
      icon: 'bg-ai-soft text-primary',
    },
  }[tone];

  return (
    <Link
      to={to}
      className={cn(
        'group flex items-center justify-between gap-3 rounded-2xl bg-card p-3.5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.99]',
        toneClassName.card,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            toneClassName.icon,
          )}
        >
          {icon}
        </div>
        <p className="truncate text-xs font-bold text-foreground">{title}</p>
      </div>

      <ArrowRight
        size={14}
        className="shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
      />
    </Link>
  );
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
    <Card className="overflow-hidden bg-card shadow-xs">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-bold text-foreground">{title}</CardTitle>
          {action}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 p-4 sm:p-5 pt-1">{children}</CardContent>
    </Card>
  );
}

function getRiskLevelLabel(riskLevel: LearningRiskLevel) {
  if (riskLevel === 'high') return 'Жоғары назар';
  if (riskLevel === 'medium') return 'Орташа назар';
  return 'Тұрақты';
}

function getRiskLevelTone(riskLevel: LearningRiskLevel) {
  if (riskLevel === 'high') return 'danger' as const;
  if (riskLevel === 'medium') return 'warning' as const;
  return 'success' as const;
}

function resolveOverallRisk(snapshot: StudentLearningSnapshot): LearningRiskLevel {
  const courses = snapshot.courses || [];

  if (courses.some((course) => course.riskLevel === 'high')) return 'high';
  if (courses.some((course) => course.riskLevel === 'medium')) return 'medium';

  return 'low';
}

function formatNullablePercent(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';

  return `${clampPercentNumber(value)}%`;
}

function MiniMetric({
  label,
  value,
  icon,
  tone = 'primary',
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  tone?: 'primary' | 'success' | 'warning' | 'ai';
}) {
  const toneClassName = {
    primary: 'bg-primary-soft text-primary',
    success: 'bg-success-soft text-success-foreground',
    warning: 'bg-warning-soft text-warning-foreground',
    ai: 'bg-ai-soft text-primary',
  }[tone];

  return (
    <div className="rounded-2xl bg-muted/40 p-3">
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
            toneClassName,
          )}
        >
          {icon}
        </div>

        <div className="min-w-0">
          <p className="truncate text-[11px] text-muted-foreground">{label}</p>
          <p className="text-base font-bold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

function LearningAnalyticsPanel({
  snapshot,
  isLoading,
  hasError,
}: {
  snapshot: StudentLearningSnapshot | undefined;
  isLoading: boolean;
  hasError: boolean;
}) {
  if (isLoading) {
    return (
      <PanelCard title="Оқу талдауы">
        <div className="space-y-3">
          <SkeletonBlock className="h-16 w-full rounded-2xl" />
          <SkeletonBlock className="h-16 w-full rounded-2xl" />
        </div>
      </PanelCard>
    );
  }

  if (hasError) {
    return (
      <PanelCard title="Оқу талдауы">
        <ErrorState text="Оқу талдауын жүктеу мүмкін болмады." compact />
      </PanelCard>
    );
  }

  if (!snapshot) {
    return (
      <PanelCard title="Оқу талдауы">
        <EmptyState
          title="Талдау әзірге жоқ"
          text="Нәтижелер жинақталғанда көрсетіледі."
          compact
          tone="ai"
        />
      </PanelCard>
    );
  }

  const overallRisk = resolveOverallRisk(snapshot);
  const primaryRecommendation = (snapshot.recommendations || [])[0] || null;
  const weakLessons = (snapshot.weakLessons || [])
    .map((lesson) => ({
      ...lesson,
      lessonId: cleanId(lesson.lessonId),
      lessonTitle: cleanText(lesson.lessonTitle),
      courseTitle: cleanText(lesson.courseTitle),
      failedAttempts: formatCount(lesson.failedAttempts),
    }))
    .filter((lesson) => lesson.lessonId)
    .slice(0, 3);

  return (
    <PanelCard
      title="Оқу талдауы"
      action={
        <StatusBadge tone={getRiskLevelTone(overallRisk)}>
          {getRiskLevelLabel(overallRisk)}
        </StatusBadge>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <MiniMetric
          label="Жалпы нәтиже"
          value={formatPercent(snapshot.totals?.progressPct)}
          icon={<Target size={14} />}
          tone="success"
        />

        <MiniMetric
          label="Шағын тест"
          value={formatNullablePercent(snapshot.totals?.miniQuizAvgScore)}
          icon={<Brain size={14} />}
          tone="ai"
        />

        <MiniMetric
          label="Қайталау"
          value={formatCount(snapshot.totals?.reviewLaterItems)}
          icon={<RotateCcw size={14} />}
          tone="warning"
        />

        <MiniMetric
          label="Сақталған"
          value={formatCount(snapshot.totals?.savedLessons)}
          icon={<Star size={14} />}
          tone="primary"
        />
      </div>

      {primaryRecommendation ? (
        <div className="rounded-2xl bg-primary-soft/50 p-3.5">
          <div className="mb-1.5 flex items-center gap-2">
            <StatusBadge tone={getRiskLevelTone(primaryRecommendation.priority)}>
              <Target size={12} />
              Ұсыныс
            </StatusBadge>
          </div>

          <p className="text-xs font-bold text-foreground">
            {cleanText(primaryRecommendation.title)}
          </p>

          {buildLessonPath(primaryRecommendation.lessonId) ? (
            <Button type="button" variant="outline" size="sm" className="mt-2.5 text-xs h-7" asChild>
              <Link to={buildLessonPath(primaryRecommendation.lessonId) || '/lessons'}>
                Сабақты ашу
                <ArrowRight size={12} className="ml-1" />
              </Link>
            </Button>
          ) : buildCoursePath(primaryRecommendation.courseId) ? (
            <Button type="button" variant="outline" size="sm" className="mt-2.5 text-xs h-7" asChild>
              <Link to={buildCoursePath(primaryRecommendation.courseId) || '/courses'}>
                Курсты ашу
                <ArrowRight size={12} className="ml-1" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {weakLessons.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-foreground">
            Қайталауға ұсынылады
          </p>

          {weakLessons.map((lesson) => (
            <Link
              key={lesson.lessonId}
              to={buildLessonPath(lesson.lessonId) || '/lessons'}
              className="flex items-center justify-between gap-3 rounded-2xl bg-muted/35 p-2.5 text-xs transition-colors hover:bg-muted/60"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">
                  {lesson.lessonTitle || "Сабақ"}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {lesson.courseTitle || "Курс"}
                </p>
              </div>

              <StatusBadge tone={lesson.failedAttempts > 0 ? 'warning' : 'primary'}>
                {lesson.failedAttempts > 0
                  ? `${formatCount(lesson.failedAttempts)} қате`
                  : 'Қайталау'}
              </StatusBadge>
            </Link>
          ))}
        </div>
      ) : null}
    </PanelCard>
  );
}

function NextLessonCard({
  nextLesson,
  upcomingLessons,
}: {
  nextLesson: DashboardLessonPreview | null;
  upcomingLessons: DashboardLessonPreview[];
}) {
  if (!nextLesson) {
    return (
      <EmptyState
        title={t('page.student_dashboard.empty.next_lesson_title')}
        text={t('page.student_dashboard.empty.next_lesson_text')}
        action={
          <Button type="button" asChild>
            <Link to="/courses">
              Курстарды қарау
              <ArrowRight size={15} className="ml-2" />
            </Link>
          </Button>
        }
        compact
      />
    );
  }

  const nextLessonPath = buildLessonPath(nextLesson.id);

  return (
    <>
      <div className="rounded-2xl bg-primary-soft/50 p-4 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge tone="primary">
                <PlayCircle size={12} />
                Келесі қадам
              </StatusBadge>

              {nextLesson.isLocked ? (
                <StatusBadge tone="muted">
                  <Lock size={12} />
                  {t('common.locked')}
                </StatusBadge>
              ) : null}
            </div>

            <h3 className="mt-2 line-clamp-1 text-sm font-bold text-foreground sm:text-base">
              {cleanText(nextLesson.title)}
            </h3>

            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {cleanText(nextLesson.subjectName, MAX_META_CHARS)} ·{' '}
              {cleanText(nextLesson.courseTitle, MAX_META_CHARS)}
            </p>
          </div>

          {nextLesson.isLocked ? (
            <Button type="button" variant="outline" size="sm" disabled>
              <Lock size={13} className="mr-1.5" />
              {t('common.locked')}
            </Button>
          ) : (
            <Button type="button" size="sm" asChild>
              <Link to={nextLessonPath || '/lessons'}>
                {t('course.continue')}
                <ArrowRight size={13} className="ml-1.5" />
              </Link>
            </Button>
          )}
        </div>
      </div>

      {upcomingLessons.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground">
            {t('page.student_dashboard.next_lessons')}
          </p>

          {upcomingLessons.map((lesson, index) => {
            const lessonId = cleanId(lesson.id);
            const lessonPath = buildLessonPath(lessonId);

            return lesson.isLocked || !lessonPath ? (
              <div
                key={lessonId || `${cleanText(lesson.title)}-${index}`}
                className="flex items-center gap-3 rounded-3xl border border-border bg-muted/45 p-3 opacity-80"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-border bg-card">
                  <Lock size={14} className="text-muted-foreground" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {cleanText(lesson.title)}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {cleanText(lesson.subjectName, MAX_META_CHARS)} ·{' '}
                    {cleanText(lesson.courseTitle, MAX_META_CHARS)}
                  </p>
                </div>

                <StatusBadge tone="muted">{t('common.locked')}</StatusBadge>
              </div>
            ) : (
              <Link
                key={lessonId || `${cleanText(lesson.title)}-${index}`}
                to={lessonPath}
                className="flex items-center gap-3 rounded-3xl border border-border bg-card p-3 shadow-soft transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:border-primary-muted hover:bg-primary-soft/55 hover:shadow-soft-md"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
                  <ArrowRight size={14} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {cleanText(lesson.title)}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {cleanText(lesson.subjectName, MAX_META_CHARS)} ·{' '}
                    {cleanText(lesson.courseTitle, MAX_META_CHARS)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const safeUserId = cleanId(user?.id);

  const { data, isLoading, error } = useStudentDashboard(safeUserId, Boolean(safeUserId));

  const {
    data: learningSnapshot,
    isLoading: learningSnapshotLoading,
    error: learningSnapshotError,
  } = useStudentLearningSnapshot(safeUserId, Boolean(safeUserId));



  const firstName =
    cleanText(user?.fullName, MAX_NAME_CHARS).split(/\s+/)[0] ||
    cleanText(user?.email?.split('@')[0], MAX_NAME_CHARS) ||
    'оқушы';

  const safeStats = useMemo(
    () => ({
      enrolledCourses: formatCount(data?.stats?.enrolledCourses),
      avgScore: clampPercentNumber(data?.stats?.avgScore),
      streakDays: formatCount(data?.stats?.streakDays),
      points: formatCount(data?.stats?.points),
      rank: formatCount(data?.stats?.rank),
      totalTests: formatCount(data?.stats?.totalTests),
      completedLessons: formatCount(data?.stats?.completedLessons),
      bestSubject: cleanText(data?.stats?.bestSubject, MAX_META_CHARS),
      weakSubject: cleanText(data?.stats?.weakSubject, MAX_META_CHARS),
    }),
    [data],
  );

  const enrolledCourses = data?.enrolledCourses || [];
  const recentAttempts = data?.recentAttempts || [];
  const nextLessons = data?.nextLessons || [];

  const nextLesson =
    nextLessons.find((lesson) => !lesson.isLocked) ||
    nextLessons[0] ||
    null;

  const nextLessonPath = nextLesson && !nextLesson.isLocked ? buildLessonPath(nextLesson.id) : null;

  const upcomingLessons =
    nextLessons
      .filter((lesson) => cleanId(lesson.id) !== cleanId(nextLesson?.id))
      .slice(0, 3);

  const studyStatus = data
    ? getStudyStatus(safeStats.avgScore, safeStats.completedLessons)
    : '';

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <LayoutDashboard size={13} />
              Оқушы кабинеті
            </>
          }
          icon={<GraduationCap size={20} />}
          title={`Қош келдіңіз, ${firstName}!`}
          actions={
            <Button type="button" asChild>
              <Link
                to={nextLessonPath || '/courses'}
              >
                Оқуды жалғастыру
                <ArrowRight size={15} className="ml-2" />
              </Link>
            </Button>
          }
        />

        {isLoading ? <StudentDashboardSkeleton /> : null}

        {!isLoading && error ? (
          <ErrorState
            text="Оқушы мәліметтерін жүктеу мүмкін болмады."
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

        {!isLoading && !error && !data ? (
          <EmptyState
            icon={<BookOpen size={18} />}
            title="Оқу деректері жоқ"
            text="Курсқа жазылғаннан кейін оқу барысы көрсетіледі."
            action={
              <Button type="button" asChild>
                <Link to="/courses">
                  Курстарды қарау
                  <ArrowRight size={15} className="ml-2" />
                </Link>
              </Button>
            }
          />
        ) : null}

        {!isLoading && !error && data ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label={t('page.student_dashboard.my_courses')}
                value={safeStats.enrolledCourses}
                icon={<BookOpen size={16} />}
                tone="primary"
              />
              <StatCard
                label={t('dashboard.avg_score')}
                value={formatPercent(safeStats.avgScore)}
                icon={<Target size={16} />}
                tone="success"
              />
              <StatCard
                label={t('dashboard.streak')}
                value={`${safeStats.streakDays} ${t('common.days')}`}
                icon={<Flame size={16} />}
                tone="warning"
              />
              <StatCard
                label={t('dashboard.points')}
                value={safeStats.points}
                icon={<Star size={16} />}
                subtitle={`${t('dashboard.rank')} ${
                  safeStats.rank ? `#${safeStats.rank}` : '—'
                }`}
                tone="accent"
              />
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="grid w-full max-w-sm grid-cols-3">
                <TabsTrigger value="overview">Шолу</TabsTrigger>
                <TabsTrigger value="courses">Курстар</TabsTrigger>
                <TabsTrigger value="analytics">Нәтижелер</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-4">
                    <PanelCard title={t('dashboard.continue_learning')}>
                      <NextLessonCard
                        nextLesson={nextLesson}
                        upcomingLessons={upcomingLessons}
                      />
                    </PanelCard>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <QuickActionCard
                        title="Курстар"
                        to="/courses"
                        icon={<BookOpen size={16} />}
                        tone="primary"
                      />
                      <QuickActionCard
                        title="Сақталған"
                        to="/saved-lessons"
                        icon={<Star size={16} />}
                        tone="accent"
                      />
                      <QuickActionCard
                        title="AI Тьютор"
                        to="/ai-tutor"
                        icon={<MessageCircle size={16} />}
                        tone="ai"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <LearningAnalyticsPanel
                      snapshot={learningSnapshot}
                      isLoading={learningSnapshotLoading}
                      hasError={Boolean(learningSnapshotError)}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="courses" className="space-y-4">
                <PanelCard
                  title={t('page.student_dashboard.my_courses')}
                  action={
                    <Button type="button" variant="ghost" size="sm" asChild>
                      <Link to="/courses">
                        {t('common.view')}
                        <ArrowRight size={14} className="ml-1.5" />
                      </Link>
                    </Button>
                  }
                >
                  {enrolledCourses.length === 0 ? (
                    <EmptyState
                      title={t('page.student_dashboard.empty.courses_title')}
                      text={t('page.student_dashboard.empty.courses_text')}
                      action={
                        <Button type="button" asChild>
                          <Link to="/courses">
                            Курстарды қарау
                            <ArrowRight size={15} className="ml-2" />
                          </Link>
                        </Button>
                      }
                      compact
                    />
                  ) : (
                    <div className="space-y-2.5">
                      {enrolledCourses.map((course, index) => {
                        const courseId = cleanId(course.id);
                        const coursePath = buildCoursePath(courseId);

                        return (
                          <Link
                            key={courseId || `${cleanText(course.title)}-${index}`}
                            to={coursePath || '/courses'}
                            className="block rounded-2xl bg-muted/40 p-3.5 transition-colors hover:bg-muted/65"
                          >
                            <div className="mb-2.5 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="line-clamp-1 text-sm font-bold text-foreground">
                                  {cleanText(course.title)}
                                </p>
                                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                  {[
                                    cleanText(course.subjectName, MAX_META_CHARS),
                                    `${formatCount(course.lessons)} ${t('course.lessons_count')}`,
                                    cleanText(course.teacherName, MAX_META_CHARS),
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              </div>

                              <StatusBadge tone={getScoreTone(course.progress)}>
                                {formatPercent(course.progress)}
                              </StatusBadge>
                            </div>

                            <ProgressBar value={clampPercentNumber(course.progress)} size="sm" />
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </PanelCard>
              </TabsContent>

              <TabsContent value="analytics" className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <PanelCard
                    title={t('page.student_dashboard.recent_tests')}
                    action={
                      <Button type="button" variant="ghost" size="sm" asChild>
                        <Link to="/tests">
                          {t('common.view')}
                          <ArrowRight size={14} className="ml-1.5" />
                        </Link>
                      </Button>
                    }
                  >
                    {recentAttempts.length === 0 ? (
                      <EmptyState
                        title={t('page.student_dashboard.empty.tests_title')}
                        text={t('page.student_dashboard.empty.tests_text')}
                        action={
                          <Button type="button" variant="outline" asChild>
                            <Link to="/tests">
                              Тесттерге өту
                              <ArrowRight size={15} className="ml-2" />
                            </Link>
                          </Button>
                        }
                        compact
                      />
                    ) : (
                      <div className="space-y-2">
                        {recentAttempts.slice(0, 5).map((test, index) => (
                          <Link
                            key={cleanId(test.id) || `${cleanText(test.title)}-${index}`}
                            to="/tests"
                            className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 p-2.5 transition-colors hover:bg-muted/65"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-foreground">
                                {cleanText(test.title)}
                              </p>
                              <p className="truncate text-[10px] text-muted-foreground">
                                {cleanText(test.subjectName, MAX_META_CHARS)}
                              </p>
                            </div>

                            <StatusBadge tone={getScoreTone(test.score)}>
                              {formatScore(test.score)}
                            </StatusBadge>
                          </Link>
                        ))}
                      </div>
                    )}
                  </PanelCard>

                  <div className="space-y-4">
                    <PanelCard title={t('page.student_dashboard.progress_overview')}>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 p-2.5">
                          <span className="text-xs text-muted-foreground">
                            {t('page.student_dashboard.learning_pace')}
                          </span>
                          <span className="text-xs font-bold text-foreground">
                            {studyStatus}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 p-2.5">
                          <span className="text-xs text-muted-foreground">
                            {t('dashboard.best_subject')}
                          </span>
                          <span className="flex items-center gap-1 text-xs font-bold text-foreground">
                            <CheckCircle size={12} className="text-success-foreground" />
                            {safeStats.bestSubject || t('common.not_defined_yet')}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 p-2.5">
                          <span className="text-xs text-muted-foreground">
                            {t('page.student_dashboard.attention_subject')}
                          </span>
                          <span className="text-xs font-bold text-foreground">
                            {safeStats.weakSubject || t('common.not_defined_yet')}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 p-2.5">
                          <span className="text-xs text-muted-foreground">
                            {t('dashboard.total_tests')}
                          </span>
                          <span className="text-xs font-bold text-foreground">
                            {safeStats.totalTests}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 p-2.5">
                          <span className="text-xs text-muted-foreground">
                            {t('page.student_dashboard.completed_lessons')}
                          </span>
                          <span className="text-xs font-bold text-foreground">
                            {safeStats.completedLessons} {t('course.lessons_count')}
                          </span>
                        </div>
                      </div>
                    </PanelCard>

                    <PanelCard
                      title={t('nav.leaderboard')}
                      action={
                        <Button type="button" variant="ghost" size="sm" asChild>
                          <Link to="/leaderboard">
                            <ArrowRight size={14} />
                          </Link>
                        </Button>
                      }
                    >
                      <Link
                        to="/leaderboard"
                        className="flex items-center gap-3 rounded-2xl bg-accent-soft/60 p-3.5 transition-colors hover:bg-accent-soft"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-card text-accent-foreground shadow-xs">
                          <Trophy size={16} />
                        </div>

                        <div>
                          <p className="text-sm font-bold text-foreground">
                            {safeStats.rank ? `#${safeStats.rank}` : '—'}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {t('page.student_dashboard.rank_label')}
                          </p>
                        </div>
                      </Link>
                    </PanelCard>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}