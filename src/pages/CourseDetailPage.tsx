import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  GraduationCap,
  Lock,
  PlayCircle,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/common/DataState';
import { useCourseProgressTimeline } from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  CourseProgressLessonStatus,
  CourseProgressLessonView,
  CourseProgressModuleView,
} from '@/lib/app-data-types';

function getStatusMeta(status: CourseProgressLessonStatus) {
  if (status === 'completed') {
    return {
      label: 'Аяқталған',
      icon: CheckCircle2,
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dotClassName: 'bg-emerald-500',
    };
  }

  if (status === 'current') {
    return {
      label: 'Қазір оқу',
      icon: PlayCircle,
      className: 'bg-primary/10 text-primary border-primary/20',
      dotClassName: 'bg-primary',
    };
  }

  if (status === 'locked') {
    return {
      label: 'Құлыпталған',
      icon: Lock,
      className: 'bg-muted text-muted-foreground border-border',
      dotClassName: 'bg-muted-foreground',
    };
  }

  return {
    label: 'Ашық',
    icon: Circle,
    className: 'bg-blue-50 text-blue-700 border-blue-200',
    dotClassName: 'bg-blue-500',
  };
}

function getLockedReasonText(reason: CourseProgressLessonView['lockedReason']) {
  if (reason === 'course_access_required') {
    return 'Бұл сабаққа кіру үшін курсқа access қажет.';
  }

  if (reason === 'previous_lesson_required') {
    return 'Алдыңғы сабақты аяқтағаннан кейін ашылады.';
  }

  if (reason === 'lesson_unpublished') {
    return 'Бұл сабақ әлі жарияланбаған.';
  }

  return '';
}

function formatDate(value: string | null) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString('kk-KZ', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function ProgressBar({ value }: { value: number }) {
  const normalizedValue = Math.min(100, Math.max(0, Math.round(value || 0)));

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${normalizedValue}%` }}
      />
    </div>
  );
}

function CourseStatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof BookOpen;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon size={18} />
        </div>

        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LessonTimelineItem({
  lesson,
  isLast,
}: {
  lesson: CourseProgressLessonView;
  isLast: boolean;
}) {
  const meta = getStatusMeta(lesson.status);
  const Icon = meta.icon;
  const completedDate = formatDate(lesson.completedAt);
  const lockedReason = lesson.isLocked
    ? getLockedReasonText(lesson.lockedReason)
    : '';

  return (
    <div className="relative flex gap-4">
      {!isLast ? (
        <div className="absolute left-[18px] top-9 h-full w-px bg-border" />
      ) : null}

      <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-background">
        <span className={`h-2.5 w-2.5 rounded-full ${meta.dotClassName}`} />
      </div>

      <div className="min-w-0 flex-1 pb-5">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Сабақ #{lesson.sortOrder || 1}
                </span>

                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${meta.className}`}
                >
                  <Icon size={12} />
                  {meta.label}
                </span>
              </div>

              <h3 className="mt-2 text-sm font-semibold">{lesson.title}</h3>

              <p className="mt-1 text-xs text-muted-foreground">
                {lesson.subjectName}
              </p>

              {completedDate ? (
                <p className="mt-2 flex items-center gap-1 text-xs text-emerald-700">
                  <CheckCircle2 size={13} />
                  {completedDate} аяқталды
                </p>
              ) : null}

              {lockedReason ? (
                <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock size={13} />
                  {lockedReason}
                </p>
              ) : null}
            </div>

            <div className="shrink-0">
              {lesson.isLocked ? (
                <Button type="button" variant="outline" size="sm" disabled>
                  <Lock size={14} className="mr-2" />
                  Жабық
                </Button>
              ) : (
                <Button type="button" size="sm" asChild>
                  <Link to={`/lessons/${lesson.id}`}>
                    Сабақты ашу
                    <ArrowRight size={14} className="ml-2" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModuleTimelineCard({ module }: { module: CourseProgressModuleView }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="text-base">{module.title}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {module.completedLessons}/{module.totalLessons} сабақ аяқталған
            </p>
          </div>

          <div className="min-w-[140px]">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Прогресс</span>
              <span className="font-medium">{module.progressPct}%</span>
            </div>
            <ProgressBar value={module.progressPct} />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {module.lessons.length === 0 ? (
          <EmptyState
            title="Бұл модульде сабақ жоқ"
            text="Мұғалім сабақ қосқаннан кейін timeline ішінде көрінеді."
          />
        ) : (
          <div>
            {module.lessons.map((lesson, index) => (
              <LessonTimelineItem
                key={lesson.id}
                lesson={lesson}
                isLast={index === module.lessons.length - 1}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CourseDetailPage() {
  const { courseId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const {
    data: timeline,
    isLoading,
    error,
  } = useCourseProgressTimeline(
    user?.id || '',
    courseId,
    Boolean(user?.id && courseId)
  );

  const nextLessonId = timeline?.nextLessonId || null;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 mb-2"
              onClick={() => navigate('/courses')}
            >
              <ArrowLeft size={15} className="mr-2" />
              Курстарға қайту
            </Button>

            <div className="mb-2 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
              <GraduationCap size={13} />
              Курс прогресі
            </div>

            <h2 className="text-xl font-bold">
              {timeline?.courseTitle || 'Курс'}
            </h2>

            <p className="text-sm text-muted-foreground">
              {timeline
                ? `${timeline.subjectName} · ${timeline.teacherName}`
                : 'Курс roadmap жүктелуде...'}
            </p>
          </div>

          {nextLessonId ? (
            <Button type="button" asChild>
              <Link to={`/lessons/${nextLessonId}`}>
                Оқуды жалғастыру
                <ArrowRight size={15} className="ml-2" />
              </Link>
            </Button>
          ) : null}
        </div>

        {isLoading ? (
          <LoadingState text="Курс прогресі жүктелуде..." />
        ) : null}

        {error ? (
          <ErrorState text="Курс прогресін жүктеу мүмкін болмады." />
        ) : null}

        {!isLoading && !error && !timeline ? (
          <EmptyState
            title="Курс табылмады"
            text="Курс өшірілген немесе сізде оған кіру рұқсаты жоқ болуы мүмкін."
          />
        ) : null}

        {timeline ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CourseStatCard
                label="Жалпы прогресс"
                value={`${timeline.progressPct}%`}
                icon={Clock}
              />
              <CourseStatCard
                label="Сабақ саны"
                value={timeline.totalLessons}
                icon={BookOpen}
              />
              <CourseStatCard
                label="Аяқталған"
                value={timeline.completedLessons}
                icon={CheckCircle2}
              />
              <CourseStatCard
                label="Модуль саны"
                value={timeline.modules.length}
                icon={GraduationCap}
              />
            </div>

            <Card>
              <CardContent className="pt-5">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">Курс бойынша оқу барысы</span>
                  <span className="text-muted-foreground">
                    {timeline.completedLessons}/{timeline.totalLessons}
                  </span>
                </div>

                <ProgressBar value={timeline.progressPct} />

                <p className="mt-2 text-xs text-muted-foreground">
                  Сабақтар ретімен ашылады. Алдыңғы сабақ аяқталмаса, келесі сабақ
                  уақытша құлыпталады.
                </p>
              </CardContent>
            </Card>

            {timeline.modules.length === 0 ? (
              <EmptyState
                title="Курста модуль жоқ"
                text="Мұғалім модуль және сабақ қосқаннан кейін roadmap осы жерде көрінеді."
              />
            ) : (
              <div className="space-y-4">
                {timeline.modules.map((module) => (
                  <ModuleTimelineCard key={module.id} module={module} />
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}