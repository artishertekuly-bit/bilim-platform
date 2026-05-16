import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
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
  Target,
  Users,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState } from '@/components/common/DataState';
import { SkeletonBlock } from '@/components/common/SkeletonBlocks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTeacherDashboard } from '@/hooks/use-platform-data';
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

function buildCourseEditPath(courseId: string) {
  return `/create-course?courseId=${encodeURIComponent(cleanId(courseId))}`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return '—';

  return `${Math.max(0, Math.min(100, Math.round(numberValue)))}%`;
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

  if (avgScore >= 80) return 'Жақсы';
  if (avgScore >= 50) return 'Орташа';

  return 'Назар керек';
}

function getTeacherHealthTone(stats: {
  totalCourses: number;
  totalStudents: number;
  totalTests: number;
  avgScore: number | null;
}) {
  if (stats.totalCourses === 0 || stats.totalStudents === 0 || stats.totalTests === 0) {
    return 'warning' as const;
  }

  const avgScore = Number(stats.avgScore || 0);

  if (avgScore >= 80) return 'success' as const;
  if (avgScore >= 50) return 'important' as const;

  return 'danger' as const;
}

function SummaryRow({
  label,
  value,
  icon,
  emphasized = false,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  emphasized?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5',
        emphasized
          ? 'border-primary-muted bg-primary-soft/70'
          : 'border-border bg-surface-soft/60',
      )}
    >
      <span className="inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border',
            emphasized
              ? 'border-primary-muted bg-card text-primary'
              : 'border-border bg-card text-muted-foreground',
          )}
        >
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </span>

      <span className="shrink-0 text-right text-sm font-semibold text-foreground">
        {value}
      </span>
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

function CourseListItem({
  course,
}: {
  course: {
    id: string;
    title: string;
    subjectName?: string | null;
    students: number;
    lessons: number;
  };
}) {
  const courseId = cleanId(course.id);
  const title = cleanText(course.title);
  const subjectName = cleanText(course.subjectName, MAX_META_CHARS);

  return (
    <Link
      to={buildCourseEditPath(courseId)}
      className="group block rounded-3xl border border-border bg-card p-4 shadow-soft transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:border-primary-muted hover:bg-primary-soft/55 hover:shadow-soft-md active:translate-y-0 active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
              <BookOpen size={16} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="line-clamp-1 text-sm font-semibold text-foreground">
                  {title || 'Курс'}
                </p>

                {subjectName ? (
                  <StatusBadge tone="primary">
                    <BookOpen size={12} />
                    {subjectName}
                  </StatusBadge>
                ) : null}
              </div>

              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                {[
                  `${Number(course.students || 0)} ${t('page.teacher_dashboard.students_label')}`,
                  `${Number(course.lessons || 0)} ${t('course.lessons_count')}`,
                ].join(' · ')}
              </p>
            </div>
          </div>
        </div>

        <span className="flex shrink-0 items-center gap-1 rounded-2xl border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-all duration-200 ease-soft group-hover:border-primary-muted group-hover:text-primary">
          {t('common.edit')}
          <ArrowRight size={14} />
        </span>
      </div>
    </Link>
  );
}

function TeacherDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-3xl border border-border bg-card p-5 shadow-soft">
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

      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-3xl border border-border bg-card p-4 shadow-soft">
            <div className="flex items-start gap-3">
              <SkeletonBlock className="h-10 w-10 rounded-2xl" />
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
          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <SkeletonBlock className="h-5 w-32" />

            <div className="mt-5 space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="rounded-3xl border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-2">
                      <SkeletonBlock className="h-4 w-52" />
                      <SkeletonBlock className="h-3 w-72 max-w-full" />
                    </div>

                    <SkeletonBlock className="h-8 w-20 rounded-2xl" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="rounded-3xl border border-border bg-card p-5 shadow-soft">
              <SkeletonBlock className="h-5 w-36" />
              <div className="mt-4 space-y-3">
                <SkeletonBlock className="h-10 w-full rounded-2xl" />
                <SkeletonBlock className="h-10 w-full rounded-2xl" />
                <SkeletonBlock className="h-10 w-full rounded-2xl" />
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
    () =>
      cleanText(user?.fullName, MAX_NAME_CHARS).split(/\s+/)[0] ||
      cleanText(user?.email?.split('@')[0], MAX_NAME_CHARS) ||
      t('role.teacher'),
    [user?.email, user?.fullName],
  );

  const courses = useMemo(() => data?.courses || [], [data?.courses]);
  const healthStatus = data ? getTeacherHealthStatus(data.stats) : '';
  const healthTone = data ? getTeacherHealthTone(data.stats) : 'muted';

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <GraduationCap size={13} />
              Мұғалім кабинеті
            </>
          }
          icon={<GraduationCap size={20} />}
          title={`${t('dashboard.welcome', { name: firstName })}!`}
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
                text="Жаңа курс ашып, сабақтарды қосыңыз."
                to="/create-course"
                icon={<Plus size={18} />}
                tone="primary"
              />

              <QuickActionCard
                title="Тест құру"
                text="Оқушыларға арналған тест жасаңыз."
                to="/create-test"
                icon={<ClipboardList size={18} />}
                tone="accent"
              />

              <QuickActionCard
                title="ЖИ сұрақ құрастыру"
                text="ЖИ арқылы сұрақтар дайындаңыз."
                to="/ai-question-builder"
                icon={<Sparkles size={18} />}
                tone="ai"
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
                    <div className="space-y-3">
                      {courses.map((course) => (
                        <CourseListItem key={cleanId(course.id)} course={course} />
                      ))}
                    </div>
                  )}
                </PanelCard>
              </div>

              <div className="space-y-4">
                <PanelCard title={t('page.teacher_dashboard.quick_actions')}>
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start"
                      asChild
                    >
                      <Link to="/create-course">
                        <Plus size={14} className="mr-2" />
                        {t('page.teacher_dashboard.action.create_course')}
                      </Link>
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start"
                      asChild
                    >
                      <Link to="/create-test">
                        <ClipboardList size={14} className="mr-2" />
                        {t('page.teacher_dashboard.action.create_test')}
                      </Link>
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start"
                      asChild
                    >
                      <Link to="/students">
                        <Users size={14} className="mr-2" />
                        Оқушыларды қарау
                      </Link>
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start"
                      asChild
                    >
                      <Link to="/analytics">
                        <LineChart size={14} className="mr-2" />
                        Талдауды ашу
                      </Link>
                    </Button>
                  </div>
                </PanelCard>

                <PanelCard title={t('page.teacher_dashboard.summary_title')}>
                  <div className="space-y-3">
                    <SummaryRow
                      label={t('dashboard.total_courses')}
                      value={data.stats.totalCourses}
                      icon={<BookOpen size={13} />}
                    />
                    <SummaryRow
                      label={t('dashboard.total_students')}
                      value={data.stats.totalStudents}
                      icon={<Users size={13} />}
                    />
                    <SummaryRow
                      label={t('dashboard.total_tests')}
                      value={data.stats.totalTests}
                      icon={<ClipboardList size={13} />}
                    />
                    <SummaryRow
                      label={t('dashboard.avg_score')}
                      value={formatPercent(data.stats.avgScore)}
                      icon={<BarChart3 size={13} />}
                      emphasized
                    />
                  </div>
                </PanelCard>

                <PanelCard title="Жалпы жағдай">
                  <div className="rounded-3xl border border-border bg-surface-soft/60 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
                        <Target size={16} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">
                            Статус
                          </p>

                          <StatusBadge tone={healthTone}>
                            <CheckCircle2 size={12} />
                            {healthStatus}
                          </StatusBadge>
                        </div>

                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          Курс, оқушы және тест саны бойынша есептеледі.
                        </p>
                      </div>
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