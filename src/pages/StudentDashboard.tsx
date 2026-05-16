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
import {
  useAcceptParentLinkRequestMutation,
  useDeclineParentLinkRequestMutation,
  useIncomingParentLinkRequests,
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

function formatPercent(value: unknown): string {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return '0%';
  }

  return `${Math.max(0, Math.min(100, Math.round(numberValue)))}%`;
}

function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return '—';

  return `${Math.round(numberValue)}%`;
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
  const normalized = Number(score || 0);

  if (normalized >= 80) return 'success' as const;
  if (normalized >= 50) return 'warning' as const;
  return 'danger' as const;
}

type IncomingParentLinkRequestStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'cancelled';

type IncomingParentLinkRequestItem = {
  id: string;
  parentId: string;
  parentName: string | null;
  status: IncomingParentLinkRequestStatus;
  requestedAt: string | null;
  respondedAt: string | null;
  expiresAt: string | null;
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
  text,
  to,
  icon,
  tone = 'primary',
}: {
  title: string;
  text: string;
  to: string;
  icon: ReactNode;
  tone?: 'primary' | 'accent' | 'ai';
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
    ai: {
      card: 'hover:border-ai-border hover:bg-ai-soft/70',
      icon: 'border-ai-border bg-ai-soft text-primary',
    },
  }[tone];

  return (
    <Link
      to={to}
      className={cn(
        'group rounded-3xl border border-border bg-card p-4 shadow-soft transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-soft-md active:translate-y-0 active:scale-[0.99]',
        toneClassName.card,
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft',
            toneClassName.icon,
          )}
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
  if (snapshot.courses.some((course) => course.riskLevel === 'high')) return 'high';
  if (snapshot.courses.some((course) => course.riskLevel === 'medium')) return 'medium';
  return 'low';
}

function formatNullablePercent(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return '—';

  return `${Math.round(numberValue)}%`;
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
    primary: 'border-primary-muted bg-primary-soft text-primary',
    success: 'border-success-muted bg-success-soft text-success-foreground',
    warning: 'border-warning-muted bg-warning-soft text-warning-foreground',
    ai: 'border-ai-border bg-ai-soft text-primary',
  }[tone];

  return (
    <div className="rounded-3xl border border-border bg-card p-3 shadow-soft">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft',
            toneClassName,
          )}
        >
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-lg font-semibold text-foreground">{value}</p>
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
          <SkeletonBlock className="h-16 w-full rounded-3xl" />
          <SkeletonBlock className="h-16 w-full rounded-3xl" />
          <SkeletonBlock className="h-20 w-full rounded-3xl" />
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
          text="Сабақ немесе тест нәтижесі шыққанда көрсетіледі."
          compact
          tone="ai"
        />
      </PanelCard>
    );
  }

  const overallRisk = resolveOverallRisk(snapshot);
  const primaryRecommendation = snapshot.recommendations[0] || null;
  const weakLessons = snapshot.weakLessons.slice(0, 3);

  return (
    <PanelCard
      title="Оқу талдауы"
      action={
        <StatusBadge tone={getRiskLevelTone(overallRisk)}>
          {getRiskLevelLabel(overallRisk)}
        </StatusBadge>
      }
    >
      <div className="rounded-3xl border border-ai-border bg-ai-soft/70 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-ai-border bg-card text-primary shadow-inner-soft">
            <Brain size={16} />
          </div>

          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Нәтиже талдауы
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Сабақ, шағын тест және жалпы нәтиже бойынша есептеледі.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MiniMetric
          label="Жалпы нәтиже"
          value={formatPercent(snapshot.totals.progressPct)}
          icon={<Target size={14} />}
          tone="success"
        />

        <MiniMetric
          label="Шағын тест"
          value={formatNullablePercent(snapshot.totals.miniQuizAvgScore)}
          icon={<Brain size={14} />}
          tone="ai"
        />

        <MiniMetric
          label="Қайталау"
          value={snapshot.totals.reviewLaterItems}
          icon={<RotateCcw size={14} />}
          tone="warning"
        />

        <MiniMetric
          label="Сақталған"
          value={snapshot.totals.savedLessons}
          icon={<Star size={14} />}
          tone="primary"
        />
      </div>

      {primaryRecommendation ? (
        <div className="rounded-3xl border border-primary-muted bg-primary-soft/65 p-4">
          <div className="mb-2 flex items-center gap-2">
            <StatusBadge tone={getRiskLevelTone(primaryRecommendation.priority)}>
              <Target size={12} />
              Ұсыныс
            </StatusBadge>
          </div>

          <p className="text-sm font-semibold text-foreground">
            {cleanText(primaryRecommendation.title)}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {cleanText(primaryRecommendation.description, 500)}
          </p>

          {primaryRecommendation.lessonId ? (
            <Button type="button" variant="outline" size="sm" className="mt-3" asChild>
              <Link to={`/lessons/${cleanId(primaryRecommendation.lessonId)}`}>
                Сабақты ашу
                <ArrowRight size={13} className="ml-1.5" />
              </Link>
            </Button>
          ) : primaryRecommendation.courseId ? (
            <Button type="button" variant="outline" size="sm" className="mt-3" asChild>
              <Link to={`/courses/${cleanId(primaryRecommendation.courseId)}`}>
                Курсты ашу
                <ArrowRight size={13} className="ml-1.5" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {weakLessons.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <AlertTriangle size={13} className="text-warning-foreground" />
            Қайталауға ұсынылатын сабақтар
          </div>

          {weakLessons.map((lesson) => (
            <Link
              key={cleanId(lesson.lessonId)}
              to={`/lessons/${cleanId(lesson.lessonId)}`}
              className="block rounded-3xl border border-border bg-card p-3 text-xs shadow-soft transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:border-warning-muted hover:bg-warning-soft/50 hover:shadow-soft-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-1 font-semibold text-foreground">
                    {cleanText(lesson.lessonTitle)}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                    {cleanText(lesson.courseTitle)}
                  </p>
                </div>

                <StatusBadge tone={lesson.failedAttempts > 0 ? 'warning' : 'primary'}>
                  {lesson.failedAttempts > 0
                    ? `${lesson.failedAttempts} қате`
                    : 'Қайталау'}
                </StatusBadge>
              </div>
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
  nextLesson: any;
  upcomingLessons: any[];
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

  const nextLessonId = cleanId(nextLesson.id);

  return (
    <>
      <div className="rounded-3xl border border-primary-muted bg-primary-soft/65 p-4 shadow-soft">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="primary">
                <PlayCircle size={12} />
                {t('page.student_dashboard.next_step')}
              </StatusBadge>

              {nextLesson.isLocked ? (
                <StatusBadge tone="muted">
                  <Lock size={12} />
                  {t('common.locked')}
                </StatusBadge>
              ) : (
                <StatusBadge tone="success">
                  <CheckCircle2 size={12} />
                  Ашық
                </StatusBadge>
              )}
            </div>

            <h3 className="mt-3 line-clamp-2 text-base font-semibold text-foreground">
              {cleanText(nextLesson.title)}
            </h3>

            <p className="mt-1 text-xs text-muted-foreground">
              {cleanText(nextLesson.subjectName, MAX_META_CHARS)} ·{' '}
              {cleanText(nextLesson.courseTitle, MAX_META_CHARS)}
            </p>

            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              {nextLesson.isLocked
                ? t('page.student_dashboard.lesson_locked_hint')
                : t('page.student_dashboard.lesson_continue_hint')}
            </p>
          </div>

          {nextLesson.isLocked ? (
            <Button type="button" variant="outline" disabled>
              <Lock size={14} className="mr-2" />
              {t('common.locked')}
            </Button>
          ) : (
            <Button type="button" asChild>
              <Link to={`/lessons/${nextLessonId}`}>
                {t('course.continue')}
                <ArrowRight size={14} className="ml-2" />
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

          {upcomingLessons.map((lesson) => {
            const lessonId = cleanId(lesson.id);

            return lesson.isLocked ? (
              <div
                key={lessonId}
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
                key={lessonId}
                to={`/lessons/${lessonId}`}
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

  const { data, isLoading, error } = useStudentDashboard(user?.id || '', !!user?.id);

  const {
    data: learningSnapshot,
    isLoading: learningSnapshotLoading,
    error: learningSnapshotError,
  } = useStudentLearningSnapshot(user?.id || '', !!user?.id);

  const {
    data: incomingParentRequestsData,
    isLoading: isIncomingParentRequestsLoading,
    error: incomingParentRequestsError,
  } = useIncomingParentLinkRequests(user?.id || '', !!user?.id);

  const acceptParentLinkRequestMutation = useAcceptParentLinkRequestMutation(user?.id || '');
  const declineParentLinkRequestMutation = useDeclineParentLinkRequestMutation(user?.id || '');

  const pendingParentRequests = useMemo(
    () =>
      ((incomingParentRequestsData as IncomingParentLinkRequestItem[] | undefined) || [])
        .filter((request) => request.status === 'pending')
        .sort(
          (a, b) =>
            new Date(b.requestedAt || 0).getTime() -
            new Date(a.requestedAt || 0).getTime(),
        ),
    [incomingParentRequestsData],
  );

  const firstName =
    cleanText(user?.fullName, MAX_NAME_CHARS).split(/\s+/)[0] ||
    cleanText(user?.email?.split('@')[0], MAX_NAME_CHARS) ||
    'оқушы';

  const nextLesson =
    data?.nextLessons?.find((lesson) => !lesson.isLocked) ||
    data?.nextLessons?.[0] ||
    null;

  const upcomingLessons =
    data?.nextLessons?.filter((lesson) => lesson.id !== nextLesson?.id).slice(0, 3) || [];

  const studyStatus = data
    ? getStudyStatus(Number(data.stats.avgScore || 0), Number(data.stats.completedLessons || 0))
    : '';

  const parentRequestPending =
    acceptParentLinkRequestMutation.isPending ||
    declineParentLinkRequestMutation.isPending;

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
                to={
                  nextLesson && !nextLesson.isLocked
                    ? `/lessons/${cleanId(nextLesson.id)}`
                    : '/courses'
                }
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
                value={data.stats.enrolledCourses}
                icon={<BookOpen size={16} />}
                tone="primary"
              />
              <StatCard
                label={t('dashboard.avg_score')}
                value={formatPercent(data.stats.avgScore)}
                icon={<Target size={16} />}
                tone="success"
              />
              <StatCard
                label={t('dashboard.streak')}
                value={`${Number(data.stats.streakDays || 0)} ${t('common.days')}`}
                icon={<Flame size={16} />}
                tone="warning"
              />
              <StatCard
                label={t('dashboard.points')}
                value={data.stats.points}
                icon={<Star size={16} />}
                subtitle={`${t('dashboard.rank')} ${
                  data.stats.rank ? `#${data.stats.rank}` : '—'
                }`}
                tone="accent"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <QuickActionCard
                title="Курстар"
                text="Курстарды қарап, оқуды жалғастырыңыз."
                to="/courses"
                icon={<BookOpen size={18} />}
                tone="primary"
              />
              <QuickActionCard
                title="Сақталған сабақтар"
                text="Кейін оқуға белгіленген сабақтар."
                to="/saved-lessons"
                icon={<Star size={18} />}
                tone="accent"
              />
              <QuickActionCard
                title="ЖИ көмекші"
                text="Түсінбеген тақырып бойынша көмек алыңыз."
                to="/ai-tutor"
                icon={<MessageCircle size={18} />}
                tone="ai"
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <PanelCard title={t('dashboard.continue_learning')}>
                  <NextLessonCard
                    nextLesson={nextLesson}
                    upcomingLessons={upcomingLessons}
                  />
                </PanelCard>

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
                  {data.enrolledCourses.length === 0 ? (
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
                    <div className="space-y-3">
                      {data.enrolledCourses.map((course) => {
                        const courseId = cleanId(course.id);

                        return (
                          <Link
                            key={courseId}
                            to={`/courses/${courseId}`}
                            className="block rounded-3xl border border-border bg-card p-4 shadow-soft transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:border-primary-muted hover:bg-primary-soft/55 hover:shadow-soft-md"
                          >
                            <div className="mb-3 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="line-clamp-1 text-sm font-semibold text-foreground">
                                  {cleanText(course.title)}
                                </p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  {[
                                    cleanText(course.subjectName, MAX_META_CHARS),
                                    `${Number(course.lessons || 0)} ${t(
                                      'course.lessons_count',
                                    )}`,
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

                            <ProgressBar value={Number(course.progress || 0)} size="sm" />
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </PanelCard>
              </div>

              <div className="space-y-4">
                <LearningAnalyticsPanel
                  snapshot={learningSnapshot}
                  isLoading={learningSnapshotLoading}
                  hasError={Boolean(learningSnapshotError)}
                />

                <PanelCard title="Ата-ана сұраныстары">
                  {isIncomingParentRequestsLoading ? (
                    <LoadingState text="Сұраныстар жүктелуде..." compact />
                  ) : null}

                  {incomingParentRequestsError ? (
                    <ErrorState text="Ата-ана сұраныстарын жүктеу мүмкін болмады." compact />
                  ) : null}

                  {!isIncomingParentRequestsLoading &&
                  !incomingParentRequestsError &&
                  pendingParentRequests.length === 0 ? (
                    <EmptyState
                      title="Жаңа сұраныс жоқ"
                      text="Әзірге жаңа сұраныс жоқ."
                      compact
                    />
                  ) : null}

                  {!isIncomingParentRequestsLoading &&
                  !incomingParentRequestsError &&
                  pendingParentRequests.length > 0
                    ? pendingParentRequests.map((request) => (
                        <div
                          key={cleanId(request.id)}
                          className="rounded-3xl border border-border bg-card p-4 shadow-soft"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-foreground">
                                {cleanText(request.parentName, MAX_NAME_CHARS) ||
                                  'Ата-ана'}
                              </p>
                              <StatusBadge tone="warning">
                                <Users size={12} />
                                Күтуде
                              </StatusBadge>
                            </div>

                            <p className="text-[11px] text-muted-foreground">
                              Жіберілді: {formatDateTime(request.requestedAt)}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Мерзімі: {formatDateTime(request.expiresAt)}
                            </p>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                acceptParentLinkRequestMutation.mutate({
                                  requestId: cleanId(request.id),
                                })
                              }
                              disabled={parentRequestPending}
                            >
                              {acceptParentLinkRequestMutation.isPending
                                ? 'Қабылдануда...'
                                : 'Қабылдау'}
                            </Button>

                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                declineParentLinkRequestMutation.mutate({
                                  requestId: cleanId(request.id),
                                })
                              }
                              disabled={parentRequestPending}
                            >
                              {declineParentLinkRequestMutation.isPending
                                ? 'Бас тартылуда...'
                                : 'Бас тарту'}
                            </Button>
                          </div>
                        </div>
                      ))
                    : null}
                </PanelCard>

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
                  {data.recentAttempts.length === 0 ? (
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
                      {data.recentAttempts.slice(0, 4).map((test) => (
                        <Link
                          key={cleanId(test.id)}
                          to="/tests"
                          className="flex items-center justify-between gap-3 rounded-3xl border border-border bg-card p-3 shadow-soft transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:border-primary-muted hover:bg-primary-soft/50 hover:shadow-soft-md"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-foreground">
                              {cleanText(test.title)}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">
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

                <PanelCard title={t('page.student_dashboard.progress_overview')}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-soft/60 p-3">
                      <span className="text-xs text-muted-foreground">
                        {t('page.student_dashboard.learning_pace')}
                      </span>
                      <span className="text-xs font-semibold text-foreground">
                        {studyStatus}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-soft/60 p-3">
                      <span className="text-xs text-muted-foreground">
                        {t('dashboard.best_subject')}
                      </span>
                      <span className="flex items-center gap-1 text-xs font-semibold text-foreground">
                        <CheckCircle size={12} className="text-success-foreground" />
                        {cleanText(data.stats.bestSubject, MAX_META_CHARS) ||
                          t('common.not_defined_yet')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-soft/60 p-3">
                      <span className="text-xs text-muted-foreground">
                        {t('page.student_dashboard.attention_subject')}
                      </span>
                      <span className="text-xs font-semibold text-foreground">
                        {cleanText(data.stats.weakSubject, MAX_META_CHARS) ||
                          t('common.not_defined_yet')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-soft/60 p-3">
                      <span className="text-xs text-muted-foreground">
                        {t('dashboard.total_tests')}
                      </span>
                      <span className="text-xs font-semibold text-foreground">
                        {data.stats.totalTests}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-soft/60 p-3">
                      <span className="text-xs text-muted-foreground">
                        {t('page.student_dashboard.completed_lessons')}
                      </span>
                      <span className="text-xs font-semibold text-foreground">
                        {data.stats.completedLessons} {t('course.lessons_count')}
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
                    className="flex items-center gap-3 rounded-3xl border border-accent-muted bg-accent-soft/65 p-4 shadow-soft transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:bg-card hover:shadow-soft-md"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent-muted bg-card text-accent-foreground shadow-inner-soft">
                      <Trophy size={18} />
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {data.stats.rank ? `#${data.stats.rank}` : '—'}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {t('page.student_dashboard.rank_label')}
                      </p>
                    </div>
                  </Link>
                </PanelCard>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}