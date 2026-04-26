import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import StatCard from '@/components/StatCard';
import ProgressBar from '@/components/ProgressBar';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import { SkeletonBlock } from '@/components/common/SkeletonBlocks';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
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
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle,
  CheckCircle2,
  ClipboardList,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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

  if (normalized >= 80) return 'success';
  if (normalized >= 50) return 'warning';
  return 'danger';
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
  if (!value) return '—';

  const date = new Date(value);

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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border bg-card p-5">
            <SkeletonBlock className="h-5 w-40" />

            <div className="mt-5 rounded-xl border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <SkeletonBlock className="h-3 w-24" />
                  <SkeletonBlock className="h-5 w-72 max-w-full" />
                  <SkeletonBlock className="h-3 w-56 max-w-full" />
                  <SkeletonBlock className="h-3 w-80 max-w-full" />
                </div>

                <SkeletonBlock className="h-9 w-28" />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <SkeletonBlock className="h-5 w-32" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-2 rounded-lg border p-3">
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
            <div key={index} className="rounded-xl border bg-card p-5">
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
}: {
  title: string;
  text: string;
  to: string;
  icon: React.ReactNode;
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

function PanelCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
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



function getRiskLevelLabel(riskLevel: LearningRiskLevel) {
  if (riskLevel === 'high') return 'Жоғары назар';
  if (riskLevel === 'medium') return 'Орташа назар';
  return 'Тұрақты';
}

function getRiskLevelTone(riskLevel: LearningRiskLevel) {
  if (riskLevel === 'high') return 'danger';
  if (riskLevel === 'medium') return 'warning';
  return 'success';
}

function resolveOverallRisk(snapshot: StudentLearningSnapshot): LearningRiskLevel {
  if (snapshot.courses.some((course) => course.riskLevel === 'high')) return 'high';
  if (snapshot.courses.some((course) => course.riskLevel === 'medium')) return 'medium';
  return 'low';
}

function formatNullablePercent(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return `${value}%`;
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
      <PanelCard title="Оқу аналитикасы">
        <div className="space-y-3">
          <SkeletonBlock className="h-16 w-full rounded-lg" />
          <SkeletonBlock className="h-16 w-full rounded-lg" />
          <SkeletonBlock className="h-20 w-full rounded-lg" />
        </div>
      </PanelCard>
    );
  }

  if (hasError) {
    return (
      <PanelCard title="Оқу аналитикасы">
        <ErrorState
          text="Оқу аналитикасын жүктеу мүмкін болмады."
          hint="Бұл бөлім тек оқу нәтижелері мен progress деректері бойынша есептеледі."
          compact
        />
      </PanelCard>
    );
  }

  if (!snapshot) {
    return (
      <PanelCard title="Оқу аналитикасы">
        <EmptyState
          title="Аналитика әзірге жоқ"
          text="Сабақ аяқталуы, mini quiz немесе тест нәтижелері пайда болғаннан кейін бұл жерде ұсыныстар көрінеді."
          compact
        />
      </PanelCard>
    );
  }

  const overallRisk = resolveOverallRisk(snapshot);
  const primaryRecommendation = snapshot.recommendations[0] || null;
  const weakLessons = snapshot.weakLessons.slice(0, 3);

  return (
    <PanelCard
      title="Оқу аналитикасы"
      action={
        <StatusBadge tone={getRiskLevelTone(overallRisk)}>
          {getRiskLevelLabel(overallRisk)}
        </StatusBadge>
      }
    >
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-card text-primary">
            <Brain size={16} />
          </div>

          <div className="min-w-0">
            <p className="text-xs font-medium">Нәтижеге негізделген snapshot</p>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              Бұл блок click/time tracking қолданбайды. Тек progress, mini quiz, тест,
              сақталған және қайталау белгіленген сабақтар бойынша есептеледі.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">Жалпы прогресс</p>
          <p className="mt-1 text-lg font-semibold">{snapshot.totals.progressPct}%</p>
        </div>

        <div className="rounded-lg border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">Mini quiz орташа</p>
          <p className="mt-1 text-lg font-semibold">
            {formatNullablePercent(snapshot.totals.miniQuizAvgScore)}
          </p>
        </div>

        <div className="rounded-lg border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">Қайталау керек</p>
          <p className="mt-1 text-lg font-semibold">{snapshot.totals.reviewLaterItems}</p>
        </div>

        <div className="rounded-lg border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">Сақталған сабақ</p>
          <p className="mt-1 text-lg font-semibold">{snapshot.totals.savedLessons}</p>
        </div>
      </div>

      {primaryRecommendation ? (
        <div className="rounded-lg border bg-primary/5 p-3">
          <div className="mb-2 flex items-center gap-2">
            <StatusBadge tone={getRiskLevelTone(primaryRecommendation.priority)}>
              Ұсыныс
            </StatusBadge>
          </div>

          <p className="text-sm font-medium">{primaryRecommendation.title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {primaryRecommendation.description}
          </p>

          {primaryRecommendation.lessonId ? (
            <Button type="button" variant="outline" size="sm" className="mt-3" asChild>
              <Link to={`/lessons/${primaryRecommendation.lessonId}`}>
                Сабақты ашу
                <ArrowRight size={13} className="ml-1.5" />
              </Link>
            </Button>
          ) : primaryRecommendation.courseId ? (
            <Button type="button" variant="outline" size="sm" className="mt-3" asChild>
              <Link to={`/courses/${primaryRecommendation.courseId}`}>
                Курсты ашу
                <ArrowRight size={13} className="ml-1.5" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {weakLessons.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium">
            <AlertTriangle size={13} className="text-amber-600" />
            Қайталауға ұсынылатын сабақтар
          </div>

          {weakLessons.map((lesson) => (
            <Link
              key={lesson.lessonId}
              to={`/lessons/${lesson.lessonId}`}
              className="block rounded-lg border p-3 text-xs transition-colors hover:bg-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-1 font-medium">{lesson.lessonTitle}</p>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                    {lesson.courseTitle}
                  </p>
                </div>

                <StatusBadge tone={lesson.failedAttempts > 0 ? 'warning' : 'info'}>
                  {lesson.failedAttempts > 0
                    ? `${lesson.failedAttempts} failed`
                    : 'review'}
                </StatusBadge>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </PanelCard>
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
            new Date(a.requestedAt || 0).getTime()
        ),
    [incomingParentRequestsData]
  );

  const firstName = user?.fullName?.trim().split(/\s+/)[0] || 'оқушы';

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
              Оқушы dashboard
            </>
          }
          icon={<GraduationCap size={20} />}
          title={`Қош келдіңіз, ${firstName}!`}
          description={t('page.student_dashboard.greeting_subtitle')}
          actions={
            <Button type="button" asChild>
              <Link to={nextLesson && !nextLesson.isLocked ? `/lessons/${nextLesson.id}` : '/courses'}>
                Оқуды жалғастыру
                <ArrowRight size={15} className="ml-2" />
              </Link>
            </Button>
          }
        />

        {isLoading ? <StudentDashboardSkeleton /> : null}

        {!isLoading && error ? (
          <ErrorState
            text="Оқушы панеліндегі мәліметтерді жүктеу мүмкін болмады."
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
            title="Оқу деректері әзірге қолжетімді емес"
            text="Мәліметтер жаңартылғаннан кейін бұл бөлімде сіздің оқу барысыңыз көрсетіледі."
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
              />
              <StatCard
                label={t('dashboard.avg_score')}
                value={`${data.stats.avgScore}%`}
                icon={<Target size={16} />}
              />
              <StatCard
                label={t('dashboard.streak')}
                value={`${data.stats.streakDays} ${t('common.days')}`}
                icon={<Flame size={16} />}
              />
              <StatCard
                label={t('dashboard.points')}
                value={data.stats.points}
                icon={<Star size={16} />}
                subtitle={`${t('dashboard.rank')} ${data.stats.rank ? `#${data.stats.rank}` : '—'}`}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <QuickActionCard
                title="Курстар"
                text="Жаңа курстарды қарап, оқуды жалғастырыңыз."
                to="/courses"
                icon={<BookOpen size={18} />}
              />
              <QuickActionCard
                title="Сақталған сабақтар"
                text="Кейін оқуға белгілеген сабақтарыңыз."
                to="/saved-lessons"
                icon={<Star size={18} />}
              />
              <QuickActionCard
                title="AI tutor"
                text="Түсінбеген тақырып бойынша көмек алыңыз."
                to="/ai-tutor"
                icon={<MessageCircle size={18} />}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <PanelCard title={t('dashboard.continue_learning')}>
                  {!nextLesson ? (
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
                  ) : (
                    <>
                      <div className="rounded-xl border bg-primary/5 p-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge tone="primary" icon={<PlayCircle size={12} />}>
                                {t('page.student_dashboard.next_step')}
                              </StatusBadge>

                              {nextLesson.isLocked ? (
                                <StatusBadge tone="muted" icon={<Lock size={12} />}>
                                  {t('common.locked')}
                                </StatusBadge>
                              ) : (
                                <StatusBadge tone="success" icon={<CheckCircle2 size={12} />}>
                                  Ашық
                                </StatusBadge>
                              )}
                            </div>

                            <h3 className="mt-3 line-clamp-2 text-base font-semibold">
                              {nextLesson.title}
                            </h3>

                            <p className="mt-1 text-xs text-muted-foreground">
                              {nextLesson.subjectName} · {nextLesson.courseTitle}
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
                              <Link to={`/lessons/${nextLesson.id}`}>
                                {t('course.continue')}
                                <ArrowRight size={14} className="ml-2" />
                              </Link>
                            </Button>
                          )}
                        </div>
                      </div>

                      {upcomingLessons.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium">
                            {t('page.student_dashboard.next_lessons')}
                          </p>

                          {upcomingLessons.map((lesson) =>
                            lesson.isLocked ? (
                              <div
                                key={lesson.id}
                                className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3 opacity-75"
                              >
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-card">
                                  <Lock size={14} className="text-muted-foreground" />
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium">{lesson.title}</p>
                                  <p className="truncate text-[11px] text-muted-foreground">
                                    {lesson.subjectName} · {lesson.courseTitle}
                                  </p>
                                </div>

                                <StatusBadge tone="muted">{t('common.locked')}</StatusBadge>
                              </div>
                            ) : (
                              <Link
                                key={lesson.id}
                                to={`/lessons/${lesson.id}`}
                                className="flex items-center gap-3 rounded-lg border p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm"
                              >
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-primary text-primary-foreground">
                                  <ArrowRight size={14} />
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium">{lesson.title}</p>
                                  <p className="truncate text-[11px] text-muted-foreground">
                                    {lesson.subjectName} · {lesson.courseTitle}
                                  </p>
                                </div>
                              </Link>
                            )
                          )}
                        </div>
                      ) : null}
                    </>
                  )}
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
                    data.enrolledCourses.map((course) => (
                      <Link
                        key={course.id}
                        to={`/courses/${course.id}`}
                        className="block rounded-lg border p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm"
                      >
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="line-clamp-1 text-sm font-medium">{course.title}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {[
                                course.subjectName,
                                `${course.lessons} ${t('course.lessons_count')}`,
                                course.teacherName,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>

                          <StatusBadge tone={getScoreTone(course.progress)}>
                            {course.progress}%
                          </StatusBadge>
                        </div>

                        <ProgressBar value={course.progress} size="sm" />
                      </Link>
                    ))
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
                    <LoadingState text="Сұраныстар жүктеліп жатыр..." compact />
                  ) : null}

                  {incomingParentRequestsError ? (
                    <ErrorState text="Ата-ана сұраныстарын жүктеу мүмкін болмады." compact />
                  ) : null}

                  {!isIncomingParentRequestsLoading &&
                  !incomingParentRequestsError &&
                  pendingParentRequests.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-xs leading-5 text-muted-foreground">
                      Әзірге ата-ана тарапынан жаңа сұраныстар жоқ.
                    </div>
                  ) : null}

                  {!isIncomingParentRequestsLoading &&
                  !incomingParentRequestsError &&
                  pendingParentRequests.length > 0
                    ? pendingParentRequests.map((request) => (
                        <div key={request.id} className="rounded-lg border p-3">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium">
                                {request.parentName?.trim() || 'Ата-ана профилі'}
                              </p>
                              <StatusBadge tone="warning" icon={<Users size={12} />}>
                                Pending
                              </StatusBadge>
                            </div>

                            <p className="text-[11px] text-muted-foreground">
                              Сұраныс жіберілген уақыт: {formatDateTime(request.requestedAt)}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Жарамдылық мерзімі: {formatDateTime(request.expiresAt)}
                            </p>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                acceptParentLinkRequestMutation.mutate({
                                  requestId: request.id,
                                })
                              }
                              disabled={parentRequestPending}
                            >
                              {acceptParentLinkRequestMutation.isPending
                                ? 'Қабылданып жатыр...'
                                : 'Қабылдау'}
                            </Button>

                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                declineParentLinkRequestMutation.mutate({
                                  requestId: request.id,
                                })
                              }
                              disabled={parentRequestPending}
                            >
                              {declineParentLinkRequestMutation.isPending
                                ? 'Бас тартылып жатыр...'
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
                    data.recentAttempts.slice(0, 4).map((test) => (
                      <Link
                        key={test.id}
                        to="/tests"
                        className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{test.title}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {test.subjectName}
                          </p>
                        </div>

                        <StatusBadge tone={getScoreTone(test.score)}>
                          {test.score ?? '—'}
                          {test.score !== null ? '%' : ''}
                        </StatusBadge>
                      </Link>
                    ))
                  )}
                </PanelCard>

                <PanelCard title={t('page.student_dashboard.progress_overview')}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
                      <span className="text-xs text-muted-foreground">
                        {t('page.student_dashboard.learning_pace')}
                      </span>
                      <span className="text-xs font-medium">{studyStatus}</span>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
                      <span className="text-xs text-muted-foreground">
                        {t('dashboard.best_subject')}
                      </span>
                      <span className="flex items-center gap-1 text-xs font-medium">
                        <CheckCircle size={12} className="text-emerald-600" />
                        {data.stats.bestSubject || t('common.not_defined_yet')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
                      <span className="text-xs text-muted-foreground">
                        {t('page.student_dashboard.attention_subject')}
                      </span>
                      <span className="text-xs font-medium">
                        {data.stats.weakSubject || t('common.not_defined_yet')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
                      <span className="text-xs text-muted-foreground">
                        {t('dashboard.total_tests')}
                      </span>
                      <span className="text-xs font-medium">{data.stats.totalTests}</span>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
                      <span className="text-xs text-muted-foreground">
                        {t('page.student_dashboard.completed_lessons')}
                      </span>
                      <span className="text-xs font-medium">
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
                    className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3 transition-colors hover:bg-accent"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border bg-card text-amber-600">
                      <Trophy size={18} />
                    </div>

                    <div>
                      <p className="text-sm font-semibold">
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