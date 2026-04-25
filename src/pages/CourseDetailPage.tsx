import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock,
  GraduationCap,
  Lock,
  Megaphone,
  Pin,
  PlayCircle,
  RotateCcw,
  Target,
  type LucideIcon,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState } from '@/components/common/DataState';
import { CourseTimelineSkeleton } from '@/components/common/SkeletonBlocks';
import {
  useCourseAnnouncements,
  useCourseProgressTimeline,
} from '@/hooks/use-platform-data';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  CourseAnnouncementPriority,
  CourseAnnouncementView,
  CourseProgressLessonStatus,
  CourseProgressLessonView,
  CourseProgressModuleView,
} from '@/lib/app-data-types';

function getStatusDotClass(status: CourseProgressLessonStatus) {
  if (status === 'completed') return 'bg-emerald-500';
  if (status === 'current') return 'bg-primary';
  if (status === 'locked') return 'bg-muted-foreground';
  return 'bg-blue-500';
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

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Шектеусіз';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('kk-KZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getAnnouncementPriorityLabel(priority: CourseAnnouncementPriority) {
  const map: Record<CourseAnnouncementPriority, string> = {
    normal: 'Қалыпты',
    important: 'Маңызды',
    urgent: 'Шұғыл',
  };

  return map[priority] || priority;
}

function getAnnouncementPriorityTone(priority: CourseAnnouncementPriority) {
  if (priority === 'urgent') return 'danger';
  if (priority === 'important') return 'warning';
  return 'info';
}

function findNextLesson(
  modules: CourseProgressModuleView[],
  nextLessonId: string | null
) {
  const lessons = modules.flatMap((module) => module.lessons || []);

  if (nextLessonId) {
    const byId = lessons.find((lesson) => lesson.id === nextLessonId);
    if (byId) return byId;
  }

  return (
    lessons.find((lesson) => lesson.status === 'current') ||
    lessons.find((lesson) => !lesson.isLocked && lesson.status !== 'completed') ||
    null
  );
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
  icon: LucideIcon;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-3 pt-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border bg-primary/10 text-primary">
          <Icon size={18} />
        </div>

        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LessonTimelineStatusBadge({
  status,
}: {
  status: CourseProgressLessonStatus;
}) {
  if (status === 'completed') {
    return (
      <StatusBadge tone="success" icon={<CheckCircle2 size={12} />}>
        Аяқталған
      </StatusBadge>
    );
  }

  if (status === 'current') {
    return (
      <StatusBadge tone="primary" icon={<PlayCircle size={12} />}>
        Келесі сабақ
      </StatusBadge>
    );
  }

  if (status === 'locked') {
    return (
      <StatusBadge tone="muted" icon={<Lock size={12} />}>
        Жабық
      </StatusBadge>
    );
  }

  return (
    <StatusBadge tone="info" icon={<CircleDot size={12} />}>
      Ашық
    </StatusBadge>
  );
}

function TimelineLegend() {
  const items = [
    {
      label: 'Аяқталған',
      className: 'bg-emerald-500',
    },
    {
      label: 'Келесі сабақ',
      className: 'bg-primary',
    },
    {
      label: 'Ашық',
      className: 'bg-blue-500',
    },
    {
      label: 'Жабық',
      className: 'bg-muted-foreground',
    },
  ];

  return (
    <Card>
      <CardContent className="flex flex-wrap gap-3 pt-5">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-xs">
            <span className={`h-2.5 w-2.5 rounded-full ${item.className}`} />
            <span className="text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CurrentLessonCard({
  lesson,
}: {
  lesson: CourseProgressLessonView | null;
}) {
  if (!lesson) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Келесі сабақ анықталмады</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Барлық ашық сабақ аяқталған немесе курс ішінде сабақ жоқ.
            </p>
          </div>

          <Button type="button" variant="outline" asChild>
            <Link to="/courses">
              Басқа курстарды қарау
              <ArrowRight size={15} className="ml-2" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/25 bg-primary/5">
      <CardContent className="flex flex-col gap-4 pt-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="primary" icon={<PlayCircle size={12} />}>
              Келесі қадам
            </StatusBadge>

            <LessonTimelineStatusBadge status={lesson.status} />
          </div>

          <h2 className="mt-3 line-clamp-2 text-base font-semibold">
            {lesson.title}
          </h2>

          <p className="mt-1 text-xs text-muted-foreground">
            {lesson.subjectName} · Сабақ #{lesson.sortOrder || 1}
          </p>
        </div>

        {lesson.isLocked ? (
          <Button type="button" variant="outline" disabled>
            <Lock size={14} className="mr-2" />
            Жабық
          </Button>
        ) : (
          <Button type="button" asChild>
            <Link to={`/lessons/${lesson.id}`}>
              Оқуды жалғастыру
              <ArrowRight size={15} className="ml-2" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function AnnouncementCard({
  announcement,
}: {
  announcement: CourseAnnouncementView;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        announcement.priority === 'urgent'
          ? 'border-destructive/30 bg-destructive/5'
          : announcement.priority === 'important'
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'bg-card'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge tone={getAnnouncementPriorityTone(announcement.priority)}>
              {getAnnouncementPriorityLabel(announcement.priority)}
            </StatusBadge>

            {announcement.isPinned ? (
              <StatusBadge tone="primary" icon={<Pin size={12} />}>
                Бекітілген
              </StatusBadge>
            ) : null}
          </div>

          <h3 className="text-sm font-semibold">{announcement.title}</h3>

          <p className="mt-2 whitespace-pre-line text-xs leading-5 text-muted-foreground">
            {announcement.body}
          </p>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span>Жарияланды: {formatDateTime(announcement.publishedAt)}</span>
            {announcement.expiresAt ? (
              <span>Мерзімі: {formatDateTime(announcement.expiresAt)}</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function CourseAnnouncementsPanel({
  announcements,
  isLoading,
  hasError,
}: {
  announcements: CourseAnnouncementView[];
  isLoading: boolean;
  hasError: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone size={16} />
            Хабарландырулар
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="rounded-xl border p-4">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="mt-3 h-3 w-4/5 rounded bg-muted" />
              <div className="mt-2 h-3 w-2/3 rounded bg-muted" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (hasError) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone size={16} />
            Хабарландырулар
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            Хабарландыруларды жүктеу мүмкін болмады.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (announcements.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone size={16} />
            Хабарландырулар
          </CardTitle>

          <StatusBadge tone="info">{announcements.length}</StatusBadge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {announcements.map((announcement) => (
          <AnnouncementCard key={announcement.id} announcement={announcement} />
        ))}
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
  const completedDate = formatDate(lesson.completedAt);
  const lockedReason = lesson.isLocked
    ? getLockedReasonText(lesson.lockedReason)
    : '';

  const isCurrent = lesson.status === 'current';
  const isCompleted = lesson.status === 'completed';

  return (
    <div className="relative flex gap-4">
      {!isLast ? (
        <div className="absolute left-[18px] top-9 h-full w-px bg-border" />
      ) : null}

      <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm">
        <span
          className={`h-2.5 w-2.5 rounded-full ${getStatusDotClass(lesson.status)}`}
        />
      </div>

      <div className="min-w-0 flex-1 pb-5">
        <div
          className={`rounded-xl border bg-card p-4 transition-colors ${
            isCurrent
              ? 'border-primary/30 bg-primary/5'
              : lesson.isLocked
                ? 'bg-muted/30'
                : ''
          }`}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Сабақ #{lesson.sortOrder || 1}
                </span>

                <LessonTimelineStatusBadge status={lesson.status} />
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
                <Button
                  type="button"
                  size="sm"
                  variant={isCompleted ? 'outline' : 'default'}
                  asChild
                >
                  <Link to={`/lessons/${lesson.id}`}>
                    {isCurrent
                      ? 'Жалғастыру'
                      : isCompleted
                        ? 'Қайта қарау'
                        : 'Сабақты ашу'}
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
  const isCompleted =
    module.totalLessons > 0 && module.completedLessons >= module.totalLessons;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{module.title}</CardTitle>

              {isCompleted ? (
                <StatusBadge tone="success" icon={<CheckCircle2 size={12} />}>
                  Модуль аяқталған
                </StatusBadge>
              ) : null}
            </div>

            <p className="mt-1 text-xs text-muted-foreground">
              {module.completedLessons}/{module.totalLessons} сабақ аяқталған
            </p>
          </div>

          <div className="min-w-[160px]">
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

  const {
    data: announcements = [],
    isLoading: announcementsLoading,
    error: announcementsError,
  } = useCourseAnnouncements(courseId, Boolean(courseId && !error));

  const nextLesson = timeline
    ? findNextLesson(timeline.modules, timeline.nextLessonId || null)
    : null;

  const remainingLessons = timeline
    ? Math.max(timeline.totalLessons - timeline.completedLessons, 0)
    : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          backAction={{
            label: 'Курстарға қайту',
            onClick: () => navigate('/courses'),
          }}
          eyebrow={
            <>
              <GraduationCap size={13} />
              Курс прогресі
            </>
          }
          icon={<GraduationCap size={20} />}
          title={timeline?.courseTitle || 'Курс'}
          description={
            timeline
              ? `${timeline.subjectName} · ${timeline.teacherName}`
              : 'Курс roadmap жүктелуде...'
          }
          actions={
            nextLesson && !nextLesson.isLocked ? (
              <Button type="button" asChild>
                <Link to={`/lessons/${nextLesson.id}`}>
                  Оқуды жалғастыру
                  <ArrowRight size={15} className="ml-2" />
                </Link>
              </Button>
            ) : null
          }
        />

        {isLoading ? <CourseTimelineSkeleton /> : null}

        {!isLoading && error ? (
          <ErrorState
            text="Курс прогресін жүктеу мүмкін болмады."
            action={
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.location.reload()}
                >
                  <RotateCcw size={15} className="mr-2" />
                  Қайта жүктеу
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate('/courses')}
                >
                  Курстарға қайту
                </Button>
              </div>
            }
          />
        ) : null}

        {!isLoading && !error && !timeline ? (
          <EmptyState
            title="Курс табылмады"
            text="Курс өшірілген немесе сізде оған кіру рұқсаты жоқ болуы мүмкін."
            action={
              <Button type="button" asChild>
                <Link to="/courses">
                  Курстарға өту
                  <ArrowRight size={15} className="ml-2" />
                </Link>
              </Button>
            }
          />
        ) : null}

        {!isLoading && !error && timeline ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CourseStatCard
                label="Жалпы прогресс"
                value={`${timeline.progressPct}%`}
                icon={Target}
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
                label="Қалған сабақ"
                value={remainingLessons}
                icon={Clock}
              />
            </div>

            <CourseAnnouncementsPanel
              announcements={announcements}
              isLoading={announcementsLoading}
              hasError={Boolean(announcementsError)}
            />

            <CurrentLessonCard lesson={nextLesson} />

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

            <TimelineLegend />

            {timeline.modules.length === 0 ? (
              <EmptyState
                title="Курста модуль жоқ"
                text="Мұғалім модуль және сабақ қосқаннан кейін roadmap осы жерде көрінеді."
                action={
                  <Button type="button" variant="outline" asChild>
                    <Link to="/courses">
                      Курстарға қайту
                      <ArrowRight size={15} className="ml-2" />
                    </Link>
                  </Button>
                }
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