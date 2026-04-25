import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState } from '@/components/common/DataState';
import { SkeletonBlock } from '@/components/common/SkeletonBlocks';
import { useTeacherDashboard } from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  LineChart,
  Plus,
  RotateCcw,
  Sparkles,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function buildCourseEditPath(courseId: string) {
  return `/create-course?courseId=${encodeURIComponent(courseId)}`;
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : `${value}%`;
}

function getTeacherHealthStatus(stats: {
  totalCourses: number;
  totalStudents: number;
  totalTests: number;
  avgScore: number | null;
}) {
  if (stats.totalCourses === 0) return 'Курс құру керек';
  if (stats.totalStudents === 0) return 'Оқушы қосу керек';
  if (stats.totalTests === 0) return 'Тест қосу керек';

  const avgScore = Number(stats.avgScore || 0);

  if (avgScore >= 80) return 'Жақсы динамика';
  if (avgScore >= 50) return 'Орташа динамика';

  return 'Қосымша бақылау керек';
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
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

function QuickActionCard({
  title,
  text,
  to,
  icon,
}: {
  title: string;
  text: string;
  to: string;
  icon: ReactNode;
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

function TeacherDashboardSkeleton() {
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

      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-xl border bg-card p-4">
            <div className="flex items-start gap-3">
              <SkeletonBlock className="h-10 w-10 rounded-xl" />
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
          <div className="rounded-xl border bg-card p-5">
            <SkeletonBlock className="h-5 w-32" />

            <div className="mt-5 space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-2">
                      <SkeletonBlock className="h-4 w-52" />
                      <SkeletonBlock className="h-3 w-72 max-w-full" />
                    </div>

                    <SkeletonBlock className="h-8 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="rounded-xl border bg-card p-5">
              <SkeletonBlock className="h-5 w-36" />
              <div className="mt-4 space-y-3">
                <SkeletonBlock className="h-10 w-full rounded-lg" />
                <SkeletonBlock className="h-10 w-full rounded-lg" />
                <SkeletonBlock className="h-10 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
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

  const healthStatus = data ? getTeacherHealthStatus(data.stats) : '';

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <GraduationCap size={13} />
              Мұғалім dashboard
            </>
          }
          icon={<GraduationCap size={20} />}
          title={`${t('dashboard.welcome', { name: firstName })}!`}
          description={t('page.teacher_dashboard.subtitle')}
          actions={
            <Button type="button" asChild>
              <Link to="/create-course">
                <Plus size={15} className="mr-2" />
                {t('nav.create_course')}
              </Link>
            </Button>
          }
        />

        {isLoading ? <TeacherDashboardSkeleton /> : null}

        {!isLoading && error ? (
          <ErrorState
            text={t('page.teacher_dashboard.error')}
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
            title={t('page.teacher_dashboard.empty.title')}
            text={t('page.teacher_dashboard.empty.text')}
            action={
              <Button type="button" asChild>
                <Link to="/create-course">
                  <Plus size={15} className="mr-2" />
                  Курс құру
                </Link>
              </Button>
            }
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

            <div className="grid gap-3 md:grid-cols-3">
              <QuickActionCard
                title="Курс құру"
                text="Жаңа курс ашып, модульдер мен сабақтарды қосыңыз."
                to="/create-course"
                icon={<Plus size={18} />}
              />

              <QuickActionCard
                title="Тест құру"
                text="Оқушыларға арналған бақылау немесе жаттығу тестін жасаңыз."
                to="/create-test"
                icon={<ClipboardList size={18} />}
              />

              <QuickActionCard
                title="AI question builder"
                text="AI арқылы сұрақтар мен емтихан материалдарын дайындаңыз."
                to="/ai-question-builder"
                icon={<Sparkles size={18} />}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <PanelCard
                  title={t('nav.my_courses')}
                  action={
                    <Button type="button" variant="ghost" size="sm" asChild>
                      <Link to="/my-courses">
                        {t('common.view')}
                        <ArrowRight size={14} className="ml-1.5" />
                      </Link>
                    </Button>
                  }
                >
                  {courses.length === 0 ? (
                    <EmptyState
                      title={t('page.teacher_dashboard.courses_empty.title')}
                      text={t('page.teacher_dashboard.courses_empty.text')}
                      action={
                        <Button type="button" asChild>
                          <Link to="/create-course">
                            <Plus size={15} className="mr-2" />
                            Курс құру
                          </Link>
                        </Button>
                      }
                      compact
                    />
                  ) : (
                    courses.map((course) => (
                      <Link
                        key={course.id}
                        to={buildCourseEditPath(course.id)}
                        className="block rounded-lg border p-3 transition-all hover:-translate-y-0.5 hover:bg-accent/30 hover:shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="line-clamp-1 text-sm font-medium">
                                {course.title}
                              </p>

                              <StatusBadge tone="info" icon={<BookOpen size={12} />}>
                                {course.subjectName}
                              </StatusBadge>
                            </div>

                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {[
                                `${course.students} ${t('page.teacher_dashboard.students_label')}`,
                                `${course.lessons} ${t('course.lessons_count')}`,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>

                          <span className="flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground">
                            {t('common.edit')}
                            <ArrowRight size={14} />
                          </span>
                        </div>
                      </Link>
                    ))
                  )}
                </PanelCard>
              </div>

              <div className="space-y-4">
                <PanelCard title={t('page.teacher_dashboard.quick_actions')}>
                  <div className="space-y-2">
                    <Button type="button" variant="outline" className="w-full justify-start" asChild>
                      <Link to="/create-course">
                        <Plus size={14} className="mr-2" />
                        {t('page.teacher_dashboard.action.create_course')}
                      </Link>
                    </Button>

                    <Button type="button" variant="outline" className="w-full justify-start" asChild>
                      <Link to="/create-test">
                        <ClipboardList size={14} className="mr-2" />
                        {t('page.teacher_dashboard.action.create_test')}
                      </Link>
                    </Button>

                    <Button type="button" variant="outline" className="w-full justify-start" asChild>
                      <Link to="/students">
                        <Users size={14} className="mr-2" />
                        Оқушыларды қарау
                      </Link>
                    </Button>

                    <Button type="button" variant="outline" className="w-full justify-start" asChild>
                      <Link to="/analytics">
                        <LineChart size={14} className="mr-2" />
                        Аналитиканы ашу
                      </Link>
                    </Button>
                  </div>
                </PanelCard>

                <PanelCard title={t('page.teacher_dashboard.summary_title')}>
                  <div className="space-y-3">
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
                  </div>
                </PanelCard>

                <PanelCard title="Жалпы жағдай">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
                      <span className="text-xs text-muted-foreground">
                        Статус
                      </span>

                      <StatusBadge
                        tone={
                          data.stats.totalCourses > 0 &&
                          data.stats.totalStudents > 0
                            ? 'success'
                            : 'warning'
                        }
                        icon={<CheckCircle2 size={12} />}
                      >
                        {healthStatus}
                      </StatusBadge>
                    </div>

                    <div className="rounded-lg border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
                      Курстар, тесттер және оқушылар саны көбейген сайын бұл dashboard
                      мұғалімге нақты оқу динамикасын көрсетеді.
                    </div>
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