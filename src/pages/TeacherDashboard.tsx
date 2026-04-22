import { useMemo } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import StatCard from '@/components/StatCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';
import { useTeacherDashboard } from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import {
  BookOpen,
  Users,
  ClipboardList,
  BarChart3,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

function buildCourseEditPath(courseId: string) {
  return `/create-course?courseId=${encodeURIComponent(courseId)}`;
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : `${value}%`;
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}

export default function TeacherDashboard() {
  const { user } = useAuth();
  const { data, isLoading, error } = useTeacherDashboard(user?.id || '', !!user?.id);

  const firstName = useMemo(
    () => user?.fullName?.trim().split(/\s+/)[0] || t('role.teacher'),
    [user?.fullName]
  );

  const courses = useMemo(() => data?.courses || [], [data?.courses]);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">
              {t('dashboard.welcome', { name: firstName })}!
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('page.teacher_dashboard.subtitle')}
            </p>
          </div>

          <Link to="/create-course">
            <Button size="sm" className="text-xs">
              <Plus size={14} className="mr-1.5" />
              {t('nav.create_course')}
            </Button>
          </Link>
        </div>

        {isLoading ? <LoadingState text={t('page.teacher_dashboard.loading')} /> : null}

        {error ? <ErrorState text={t('page.teacher_dashboard.error')} /> : null}

        {!isLoading && !error && !data ? (
          <EmptyState
            title={t('page.teacher_dashboard.empty.title')}
            text={t('page.teacher_dashboard.empty.text')}
          />
        ) : null}

        {!isLoading && !error && data ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label={t('dashboard.total_courses')}
                value={data.stats.totalCourses}
                icon={<BookOpen size={16} />}
              />
              <StatCard
                label={t('dashboard.total_students')}
                value={data.stats.totalStudents}
                icon={<Users size={16} />}
              />
              <StatCard
                label={t('dashboard.total_tests')}
                value={data.stats.totalTests}
                icon={<ClipboardList size={16} />}
              />
              <StatCard
                label={t('dashboard.avg_score')}
                value={formatPercent(data.stats.avgScore)}
                icon={<BarChart3 size={16} />}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-sm font-semibold">
                        {t('nav.my_courses')}
                      </CardTitle>

                      <Link
                        to="/my-courses"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {t('common.view')}
                        <ArrowRight size={12} />
                      </Link>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <div className="space-y-3">
                      {courses.length === 0 ? (
                        <EmptyState
                          title={t('page.teacher_dashboard.courses_empty.title')}
                          text={t('page.teacher_dashboard.courses_empty.text')}
                        />
                      ) : (
                        courses.map((course) => (
                          <Link
                            key={course.id}
                            to={buildCourseEditPath(course.id)}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 transition-shadow hover:bg-accent/30 hover:shadow-sm"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">{course.title}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {[
                                  course.subjectName,
                                  `${course.students} ${t('page.teacher_dashboard.students_label')}`,
                                  `${course.lessons} ${t('course.lessons_count')}`,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            </div>

                            <span
                              className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                              aria-label={t('common.edit')}
                            >
                              {t('common.edit')}
                              <ArrowRight size={14} />
                            </span>
                          </Link>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">
                      {t('page.teacher_dashboard.quick_actions')}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-2">
                    <Link
                      to="/create-course"
                      className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-xs transition-colors hover:bg-accent"
                    >
                      <Plus size={14} />
                      {t('page.teacher_dashboard.action.create_course')}
                    </Link>

                    <Link
                      to="/create-test"
                      className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-xs transition-colors hover:bg-accent"
                    >
                      <ClipboardList size={14} />
                      {t('page.teacher_dashboard.action.create_test')}
                    </Link>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">
                      {t('page.teacher_dashboard.summary_title')}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <SummaryRow
                      label={t('dashboard.total_courses')}
                      value={data.stats.totalCourses}
                    />
                    <SummaryRow
                      label={t('dashboard.total_students')}
                      value={data.stats.totalStudents}
                    />
                    <SummaryRow
                      label={t('dashboard.total_tests')}
                      value={data.stats.totalTests}
                    />
                    <SummaryRow
                      label={t('dashboard.avg_score')}
                      value={formatPercent(data.stats.avgScore)}
                    />
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