import { useMemo } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import StatCard from '@/components/StatCard';
import ProgressBar from '@/components/ProgressBar';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import {
  useAdminDashboard,
  useAnalytics,
  useParentDashboard,
  useTeacherDashboard,
} from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import t, { getLocale } from '@/lib/i18n';
import {
  Target,
  BookOpen,
  ClipboardList,
  Flame,
  TrendingUp,
  TrendingDown,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type AnalyticsMode = 'student' | 'parent' | 'teacher' | 'admin';

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

function getMode(role?: string): AnalyticsMode {
  if (role === 'teacher') return 'teacher';
  if (role === 'parent') return 'parent';
  if (role === 'admin') return 'admin';
  return 'student';
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return t('page.analytics.not_available');

  const locale = getLocale() === 'ru' ? 'ru-RU' : 'kk-KZ';
  return parsed.toLocaleDateString(locale);
}

function buildParentAnalytics(children: ParentChildItem[] | undefined): DisplayAnalyticsData | null {
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

    const current = subjectMap.get(subjectName) || { totalScore: 0, tests: 0 };

    subjectMap.set(subjectName, {
      totalScore: current.totalScore + score,
      tests: current.tests + 1,
    });
  });

  const subjectPerformance: SubjectPerformanceItem[] = Array.from(subjectMap.entries()).map(
    ([name, value]) => ({
      name,
      score: value.tests > 0 ? Math.round(value.totalScore / value.tests) : 0,
      tests: value.tests,
    })
  );

  const weakCounts = new Map<string, number>();
  validChildren.forEach((child) => {
    const weakSubject = child.summary?.stats?.weakSubject;
    if (weakSubject) {
      weakCounts.set(weakSubject, (weakCounts.get(weakSubject) || 0) + 1);
    }
  });

  const weakTopics: WeakTopicItem[] = Array.from(weakCounts.entries()).map(([subject, count]) => {
    const performance = subjectPerformance.find((item) => item.name === subject);

    return {
      subject,
      topic: t('page.analytics.parent_attention_count', { count }),
      score: performance?.score || 0,
    };
  });

  const recentActivityDraft: ParentActivityDraft[] = allAttempts.map((attempt) => ({
    action: t('page.analytics.parent_recent_test_action'),
    detail: attempt.title,
    rawDate: attempt.completedAt,
    score: attempt.score !== null && attempt.score !== undefined ? `${attempt.score}%` : null,
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
      date: item.rawDate ? formatDate(item.rawDate) : t('page.analytics.not_available'),
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

export default function AnalyticsPage() {
  const { user } = useAuth();
  const mode = getMode(user?.role);

  const analytics = useAnalytics(user?.id || '', !!user?.id && mode === 'student');
  const parent = useParentDashboard(user?.id || '', !!user?.id && mode === 'parent');
  const teacher = useTeacherDashboard(user?.id || '', !!user?.id && mode === 'teacher');
  const admin = useAdminDashboard(!!user?.id && mode === 'admin');

  const parentAnalytics = useMemo(() => buildParentAnalytics(parent.data), [parent.data]);

  if (mode === 'teacher') {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <div>
            <h2 className="text-xl font-bold">{t('page.analytics.title.teacher')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('page.analytics.description.teacher')}
            </p>
          </div>

          {teacher.isLoading ? <LoadingState text={t('page.analytics.loading')} /> : null}

          {teacher.error ? <ErrorState text={t('page.analytics.error')} /> : null}

          {!teacher.isLoading && !teacher.error && !teacher.data ? (
            <EmptyState
              title={t('page.analytics.empty.title')}
              text={t('page.analytics.empty.text')}
            />
          ) : null}

          {!teacher.isLoading && !teacher.error && teacher.data ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <StatCard
                  label={t('dashboard.total_courses')}
                  value={teacher.data.stats.totalCourses}
                  icon={<BookOpen size={16} />}
                />
                <StatCard
                  label={t('dashboard.total_students')}
                  value={teacher.data.stats.totalStudents}
                  icon={<Users size={16} />}
                />
                <StatCard
                  label={t('dashboard.total_tests')}
                  value={teacher.data.stats.totalTests}
                  icon={<ClipboardList size={16} />}
                />
                <StatCard
                  label={t('page.analytics.avg_course_progress')}
                  value={`${teacher.data.stats.avgCourseProgress}%`}
                  icon={<Target size={16} />}
                />
                <StatCard
                  label={t('page.analytics.completed_lessons')}
                  value={teacher.data.stats.completedLessons}
                  icon={<Flame size={16} />}
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-2">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">
                        {t('page.analytics.teacher.course_progress_title')}
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {teacher.data.courseProgress.length === 0 ? (
                        <EmptyState
                          title={t('page.analytics.teacher.course_progress_empty.title')}
                          text={t('page.analytics.teacher.course_progress_empty.text')}
                        />
                      ) : (
                        teacher.data.courseProgress.map((course) => (
                          <div key={course.courseId} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <span className="text-sm font-medium">{course.courseTitle}</span>
                                <p className="text-[11px] text-muted-foreground">
                                  {[
                                    course.subjectName,
                                    `${course.students} ${t('page.analytics.students_short')}`,
                                    `${course.lessons} ${t('course.lessons_count')}`,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {t('page.analytics.average_short')} {course.avgProgress}%
                              </span>
                            </div>
                            <ProgressBar value={course.avgProgress} size="sm" />
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
                        {t('page.analytics.teacher.completion_title')}
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      {teacher.data.courseProgress.length === 0 ? (
                        <EmptyState
                          title={t('page.analytics.teacher.completion_empty.title')}
                          text={t('page.analytics.teacher.completion_empty.text')}
                        />
                      ) : (
                        teacher.data.courseProgress.map((course) => (
                          <div key={course.courseId} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium">{course.courseTitle}</span>
                              <span className="text-xs">{course.completionPct}%</span>
                            </div>
                            <ProgressBar value={course.completionPct} size="sm" />
                          </div>
                        ))
                      )}
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

  if (mode === 'admin') {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <div>
            <h2 className="text-xl font-bold">{t('page.analytics.title.admin')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('page.analytics.description.admin')}
            </p>
          </div>

          {admin.isLoading ? <LoadingState text={t('page.analytics.loading')} /> : null}

          {admin.error ? <ErrorState text={t('page.analytics.error')} /> : null}

          {!admin.isLoading && !admin.error && !admin.data ? (
            <EmptyState
              title={t('page.analytics.empty.title')}
              text={t('page.analytics.empty.text')}
            />
          ) : null}

          {!admin.isLoading && !admin.error && admin.data ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <StatCard
                  label={t('dashboard.total_students')}
                  value={admin.data.stats.totalStudents}
                  icon={<Users size={16} />}
                />
                <StatCard
                  label={t('dashboard.total_courses')}
                  value={admin.data.stats.totalCourses}
                  icon={<BookOpen size={16} />}
                />
                <StatCard
                  label={t('page.analytics.completed_lessons')}
                  value={admin.data.stats.totalLessons}
                  icon={<BookOpen size={16} />}
                />
                <StatCard
                  label={t('dashboard.total_tests')}
                  value={admin.data.stats.totalTests}
                  icon={<ClipboardList size={16} />}
                />
                <StatCard
                  label={t('course.status.published')}
                  value={admin.data.contentStatus.published}
                  icon={<Target size={16} />}
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-2">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">
                        {t('page.analytics.subject_performance_title')}
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {admin.data.subjectStats.length === 0 ? (
                        <EmptyState
                          title={t('page.analytics.subject_performance_empty.title')}
                          text={t('page.analytics.subject_performance_empty.text')}
                        />
                      ) : (
                        admin.data.subjectStats.map((subject) => (
                          <div key={subject.name} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <span className="text-sm font-medium">{subject.name}</span>
                                <p className="text-[11px] text-muted-foreground">
                                  {[
                                    `${subject.courses} ${t('dashboard.total_courses')}`,
                                    `${subject.lessons} ${t('course.lessons_count')}`,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              </div>

                              <span className="text-xs text-muted-foreground">
                                {subject.avgScore}%
                              </span>
                            </div>

                            <ProgressBar value={subject.avgScore} size="sm" />
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
                        {t('page.analytics.weak_topics_title')}
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      {admin.data.subjectStats.length === 0 ? (
                        <EmptyState
                          title={t('page.analytics.weak_topics_empty.title')}
                          text={t('page.analytics.weak_topics_empty.text')}
                        />
                      ) : (
                        [...admin.data.subjectStats]
                          .sort((a, b) => a.avgScore - b.avgScore)
                          .slice(0, 3)
                          .map((subject) => (
                            <div key={subject.name} className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium">{subject.name}</span>
                                <span className="text-xs text-warning">{subject.avgScore}%</span>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                {t('page.analytics.not_available')}
                              </p>
                              <ProgressBar value={subject.avgScore} size="sm" />
                            </div>
                          ))
                      )}
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

  const data = mode === 'parent' ? parentAnalytics : analytics.data;
  const isLoading = mode === 'parent' ? parent.isLoading : analytics.isLoading;
  const error = mode === 'parent' ? parent.error : analytics.error;

  const pageTitle =
    mode === 'parent'
      ? t('page.analytics.title.parent')
      : t('nav.analytics');

  const pageDescription =
    mode === 'parent'
      ? t('page.analytics.description.parent')
      : t('page.analytics.description.student');

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-xl font-bold">{pageTitle}</h2>
          <p className="text-sm text-muted-foreground">{pageDescription}</p>
        </div>

        {isLoading ? <LoadingState text={t('page.analytics.loading')} /> : null}

        {error ? <ErrorState text={t('page.analytics.error')} /> : null}

        {!isLoading && !error && !data ? (
          <EmptyState
            title={t('page.analytics.empty.title')}
            text={t('page.analytics.empty.text')}
          />
        ) : null}

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
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">
                      {t('page.analytics.subject_performance_title')}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {data.subjectPerformance.length === 0 ? (
                      <EmptyState
                        title={t('page.analytics.subject_performance_empty.title')}
                        text={t('page.analytics.subject_performance_empty.text')}
                      />
                    ) : (
                      data.subjectPerformance.map((subject) => (
                        <div key={subject.name} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{subject.name}</span>

                              {subject.trend === 'up' ? (
                                <TrendingUp size={13} className="text-success" />
                              ) : subject.trend === 'down' ? (
                                <TrendingDown size={13} className="text-warning" />
                              ) : null}
                            </div>

                            <span className="text-xs text-muted-foreground">
                              {subject.score}% · {subject.tests} {t('page.analytics.tests_short')}
                            </span>
                          </div>

                          <ProgressBar value={subject.score} size="sm" />
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">
                      {t('dashboard.recent_activity')}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {data.recentActivity.length === 0 ? (
                      <EmptyState
                        title={t('page.analytics.recent_activity_empty.title')}
                        text={t('page.analytics.recent_activity_empty.text')}
                      />
                    ) : (
                      data.recentActivity.map((item, index) => (
                        <div
                          key={`${item.detail}-${index}`}
                          className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0"
                        >
                          <div>
                            <p className="text-sm font-medium">{item.action}</p>
                            <p className="text-[11px] text-muted-foreground">{item.detail}</p>
                          </div>

                          <span className="text-xs text-muted-foreground">
                            {item.score || item.date || t('page.analytics.not_available')}
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
                      {t('page.analytics.weak_topics_title')}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {data.weakTopics.length === 0 ? (
                      <EmptyState
                        title={t('page.analytics.weak_topics_empty.title')}
                        text={t('page.analytics.weak_topics_empty.text')}
                      />
                    ) : (
                      data.weakTopics.map((topic, index) => (
                        <div key={`${topic.subject}-${index}`} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">{topic.subject}</span>
                            <span className="text-xs text-warning">{topic.score}%</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">{topic.topic}</p>
                          <ProgressBar value={topic.score} size="sm" />
                        </div>
                      ))
                    )}
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