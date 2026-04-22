import DashboardLayout from '@/components/DashboardLayout';
import StatCard from '@/components/StatCard';
import ProgressBar from '@/components/ProgressBar';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import {
  useAcceptParentLinkRequestMutation,
  useDeclineParentLinkRequestMutation,
  useIncomingParentLinkRequests,
  useStudentDashboard,
} from '@/hooks/use-platform-data';
import {
  BookOpen,
  Trophy,
  Flame,
  Star,
  Target,
  ArrowRight,
  Lock,
  CheckCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';

function getStudyStatus(avgScore: number, completedLessons: number) {
  if (avgScore >= 80 && completedLessons >= 5) {
    return t('page.student_dashboard.status.excellent');
  }

  if (avgScore >= 60 || completedLessons >= 3) {
    return t('page.student_dashboard.status.good');
  }

  return t('page.student_dashboard.status.attention');
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

export default function StudentDashboard() {
  const { user } = useAuth();

  const { data, isLoading, error } = useStudentDashboard(user?.id || '', !!user?.id);

  const {
    data: incomingParentRequestsData,
    isLoading: isIncomingParentRequestsLoading,
    error: incomingParentRequestsError,
  } = useIncomingParentLinkRequests(user?.id || '', !!user?.id);

  const acceptParentLinkRequestMutation = useAcceptParentLinkRequestMutation(user?.id || '');
  const declineParentLinkRequestMutation = useDeclineParentLinkRequestMutation(user?.id || '');

  const pendingParentRequests =
    ((incomingParentRequestsData as IncomingParentLinkRequestItem[] | undefined) || [])
      .filter((request) => request.status === 'pending')
      .sort(
        (a, b) =>
          new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime()
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

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="space-y-1">
          <h2 className="text-xl font-bold">Қош келдіңіз, {firstName}!</h2>
          <p className="text-sm text-muted-foreground">
            {t('page.student_dashboard.greeting_subtitle')}
          </p>
        </div>

        {isLoading ? <LoadingState text="Оқу деректері жүктеліп жатыр..." /> : null}

        {error ? (
          <ErrorState text="Оқушы панеліндегі мәліметтерді жүктеу мүмкін болмады." />
        ) : null}

        {!isLoading && !error && !data ? (
          <EmptyState
            title="Оқу деректері әзірге қолжетімді емес"
            text="Мәліметтер жаңартылғаннан кейін бұл бөлімде сіздің оқу барысыңыз көрсетіледі."
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

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">
                      {t('dashboard.continue_learning')}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {!nextLesson ? (
                      <EmptyState
                        title={t('page.student_dashboard.empty.next_lesson_title')}
                        text={t('page.student_dashboard.empty.next_lesson_text')}
                      />
                    ) : (
                      <>
                        <div className="rounded-xl border bg-card p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                                {t('page.student_dashboard.next_step')}
                              </p>
                              <h3 className="mt-1 text-sm font-semibold truncate">
                                {nextLesson.title}
                              </h3>
                              <p className="mt-1 text-xs text-muted-foreground truncate">
                                {nextLesson.subjectName} · {nextLesson.courseTitle}
                              </p>
                              <p className="mt-3 text-xs text-muted-foreground">
                                {nextLesson.isLocked
                                  ? t('page.student_dashboard.lesson_locked_hint')
                                  : t('page.student_dashboard.lesson_continue_hint')}
                              </p>
                            </div>

                            {nextLesson.isLocked ? (
                              <div className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                                <Lock size={12} />
                                {t('common.locked')}
                              </div>
                            ) : (
                              <Link
                                to={`/lessons/${nextLesson.id}`}
                                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground hover:opacity-90"
                              >
                                {t('course.continue')}
                                <ArrowRight size={12} />
                              </Link>
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
                                  className="flex items-center gap-3 rounded-lg border border-border p-3 opacity-60"
                                >
                                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
                                    <Lock size={13} className="text-muted-foreground" />
                                  </div>

                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{lesson.title}</p>
                                    <p className="truncate text-[11px] text-muted-foreground">
                                      {lesson.subjectName} · {lesson.courseTitle}
                                    </p>
                                  </div>

                                  <span className="ml-auto text-[10px] text-muted-foreground">
                                    {t('common.locked')}
                                  </span>
                                </div>
                              ) : (
                                <Link
                                  key={lesson.id}
                                  to={`/lessons/${lesson.id}`}
                                  className="flex items-center gap-3 rounded-lg border border-border p-3 transition-shadow hover:shadow-sm"
                                >
                                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                                    <ArrowRight size={13} className="text-primary-foreground" />
                                  </div>

                                  <div className="min-w-0">
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
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">
                        {t('page.student_dashboard.my_courses')}
                      </CardTitle>
                      <Link
                        to="/courses"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {t('common.view')} <ArrowRight size={12} />
                      </Link>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {data.enrolledCourses.length === 0 ? (
                      <EmptyState
                        title={t('page.student_dashboard.empty.courses_title')}
                        text={t('page.student_dashboard.empty.courses_text')}
                      />
                    ) : (
                      data.enrolledCourses.map((course) => (
                        <div
                          key={course.id}
                          className="rounded-lg border border-border p-3 transition-shadow hover:shadow-sm"
                        >
                          <div className="mb-2 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{course.title}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {[
                                  course.subjectName,
                                  `${course.lessons} ${t('course.lessons_count')}`,
                                  course.teacherName,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            </div>
                            <span className="text-[11px] text-muted-foreground">
                              {course.progress}%
                            </span>
                          </div>

                          <ProgressBar value={course.progress} size="sm" />
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">Ата-ана сұраныстары</CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {isIncomingParentRequestsLoading ? (
                      <LoadingState text="Сұраныстар жүктеліп жатыр..." />
                    ) : null}

                    {incomingParentRequestsError ? (
                      <ErrorState text="Ата-ана сұраныстарын жүктеу мүмкін болмады." />
                    ) : null}

                    {!isIncomingParentRequestsLoading &&
                    !incomingParentRequestsError &&
                    pendingParentRequests.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                        Әзірге ата-ана тарапынан жаңа сұраныстар жоқ.
                      </div>
                    ) : null}

                    {!isIncomingParentRequestsLoading &&
                    !incomingParentRequestsError &&
                    pendingParentRequests.length > 0
                      ? pendingParentRequests.map((request) => (
                          <div key={request.id} className="rounded-lg border p-3">
                            <div className="space-y-1">
                              <p className="text-sm font-medium">
                                {request.parentName?.trim() || 'Ата-ана профилі'}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                Сұраныс жіберілген уақыт: {formatDateTime(request.requestedAt)}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                Жарамдылық мерзімі: {formatDateTime(request.expiresAt)}
                              </p>
                            </div>

                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  acceptParentLinkRequestMutation.mutate({
                                    requestId: request.id,
                                  })
                                }
                                disabled={
                                  acceptParentLinkRequestMutation.isPending ||
                                  declineParentLinkRequestMutation.isPending
                                }
                                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
                              >
                                {acceptParentLinkRequestMutation.isPending
                                  ? 'Қабылданып жатыр...'
                                  : 'Қабылдау'}
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  declineParentLinkRequestMutation.mutate({
                                    requestId: request.id,
                                  })
                                }
                                disabled={
                                  acceptParentLinkRequestMutation.isPending ||
                                  declineParentLinkRequestMutation.isPending
                                }
                                className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-xs font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                              >
                                {declineParentLinkRequestMutation.isPending
                                  ? 'Бас тартылып жатыр...'
                                  : 'Бас тарту'}
                              </button>
                            </div>
                          </div>
                        ))
                      : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">
                        {t('page.student_dashboard.recent_tests')}
                      </CardTitle>
                      <Link
                        to="/tests"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {t('common.view')} <ArrowRight size={12} />
                      </Link>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {data.recentAttempts.length === 0 ? (
                      <EmptyState
                        title={t('page.student_dashboard.empty.tests_title')}
                        text={t('page.student_dashboard.empty.tests_text')}
                      />
                    ) : (
                      data.recentAttempts.slice(0, 4).map((test) => (
                        <div
                          key={test.id}
                          className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{test.title}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {test.subjectName}
                            </p>
                          </div>

                          <span
                            className={`shrink-0 text-sm font-semibold ${
                              (test.score || 0) >= 80 ? 'text-success' : 'text-warning'
                            }`}
                          >
                            {test.score ?? '—'}
                            {test.score !== null ? '%' : ''}
                          </span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">
                      {t('page.student_dashboard.progress_overview')}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        {t('page.student_dashboard.learning_pace')}
                      </span>
                      <span className="text-xs font-medium">{studyStatus}</span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        {t('dashboard.best_subject')}
                      </span>
                      <span className="flex items-center gap-1 text-xs font-medium">
                        <CheckCircle size={12} className="text-success" />
                        {data.stats.bestSubject || t('common.not_defined_yet')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        {t('page.student_dashboard.attention_subject')}
                      </span>
                      <span className="text-xs font-medium">
                        {data.stats.weakSubject || t('common.not_defined_yet')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        {t('dashboard.total_tests')}
                      </span>
                      <span className="text-xs font-medium">{data.stats.totalTests}</span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        {t('page.student_dashboard.completed_lessons')}
                      </span>
                      <span className="text-xs font-medium">
                        {data.stats.completedLessons} {t('course.lessons_count')}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">
                        {t('nav.leaderboard')}
                      </CardTitle>
                      <Link
                        to="/leaderboard"
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        <ArrowRight size={12} />
                      </Link>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <div className="flex items-center gap-3">
                      <Trophy size={18} className="text-warning" />
                      <div>
                        <p className="text-sm font-semibold">
                          {data.stats.rank ? `#${data.stats.rank}` : '—'}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {t('page.student_dashboard.rank_label')}
                        </p>
                      </div>
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