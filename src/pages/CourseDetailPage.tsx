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
import ProgressBar from '@/components/ProgressBar';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState, ErrorState } from '@/components/common/DataState';
import {
  CourseTimelineSkeleton,
  SkeletonBlock,
} from '@/components/common/SkeletonBlocks';
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
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

const MAX_ID_CHARS = 180;
const MAX_TITLE_CHARS = 240;
const MAX_META_CHARS = 180;
const MAX_BODY_CHARS = 1_500;
const MAX_DATE_CHARS = 80;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_TITLE_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanMultilineText(value: unknown, limit = MAX_BODY_CHARS): string {
  return limitText(
    cleanRawText(value)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim(),
    limit,
  );
}

function cleanId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function buildLessonPath(lessonId: unknown): string {
  return `/lessons/${encodeURIComponent(cleanId(lessonId))}`;
}

function buildCourseEditPath(courseId: unknown): string {
  return `/teacher/courses/${encodeURIComponent(cleanId(courseId))}/edit`;
}

function formatNumber(value: unknown): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return 0;

  return Math.max(0, Math.round(numberValue));
}

function formatPercent(value: unknown): string {
  return `${Math.max(0, Math.min(100, formatNumber(value)))}%`;
}

function getStatusDotClass(status: CourseProgressLessonStatus) {
  if (status === 'completed') return 'bg-success';
  if (status === 'current') return 'bg-primary';
  if (status === 'locked') return 'bg-muted-foreground';

  return 'bg-secondary';
}

function getLockedReasonText(reason: CourseProgressLessonView['lockedReason']) {
  if (reason === 'course_access_required') return 'Курсқа қолжетімділік қажет.';
  if (reason === 'previous_lesson_required') return 'Алдыңғы сабақтан кейін ашылады.';
  if (reason === 'lesson_unpublished') return 'Сабақ жарияланбаған.';

  return '';
}

function formatDate(value: string | null | undefined) {
  const rawValue = cleanText(value, MAX_DATE_CHARS);

  if (!rawValue) return null;

  const date = new Date(rawValue);

  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString('kk-KZ', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(value: string | null | undefined) {
  const rawValue = cleanText(value, MAX_DATE_CHARS);

  if (!rawValue) return 'Шектеусіз';

  const date = new Date(rawValue);

  if (Number.isNaN(date.getTime())) return rawValue;

  return date.toLocaleString('kk-KZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeAnnouncementPriority(
  priority: CourseAnnouncementPriority | string | null | undefined,
): CourseAnnouncementPriority {
  if (priority === 'important' || priority === 'urgent' || priority === 'normal') {
    return priority;
  }

  return 'normal';
}

function getAnnouncementPriorityLabel(
  priority: CourseAnnouncementPriority | string | null | undefined,
) {
  const normalizedPriority = normalizeAnnouncementPriority(priority);

  const labels: Record<CourseAnnouncementPriority, string> = {
    normal: 'Қалыпты',
    important: 'Маңызды',
    urgent: 'Шұғыл',
  };

  return labels[normalizedPriority];
}

function getAnnouncementPriorityTone(
  priority: CourseAnnouncementPriority | string | null | undefined,
) {
  const normalizedPriority = normalizeAnnouncementPriority(priority);

  if (normalizedPriority === 'urgent') return 'danger' as const;
  if (normalizedPriority === 'important') return 'warning' as const;

  return 'secondary' as const;
}

function findNextLesson(
  modules: CourseProgressModuleView[],
  nextLessonId: string | null,
) {
  const lessons = modules.flatMap((module) => module.lessons || []);
  const safeNextLessonId = cleanId(nextLessonId);

  if (safeNextLessonId) {
    const byId = lessons.find((lesson) => cleanId(lesson.id) === safeNextLessonId);
    if (byId) return byId;
  }

  return (
    lessons.find((lesson) => lesson.status === 'current') ||
    lessons.find((lesson) => !lesson.isLocked && lesson.status !== 'completed') ||
    null
  );
}

function CourseStatCard({
  label,
  value,
  icon: Icon,
  tone = 'primary',
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: 'primary' | 'success' | 'warning' | 'secondary';
}) {
  const toneClassName = {
    primary: 'border-primary-muted bg-primary-soft text-primary',
    success: 'border-success-muted bg-success-soft text-success-foreground',
    warning: 'border-warning-muted bg-warning-soft text-warning-foreground',
    secondary: 'border-secondary-muted bg-secondary-soft text-secondary-foreground',
  }[tone];

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft',
            toneClassName,
          )}
        >
          <Icon size={16} />
        </span>

        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{cleanText(label, MAX_META_CHARS)}</p>
          <p className="mt-1 truncate text-xl font-semibold text-foreground">
            {value}
          </p>
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
      <StatusBadge tone="success">
        <CheckCircle2 size={12} />
        Аяқталған
      </StatusBadge>
    );
  }

  if (status === 'current') {
    return (
      <StatusBadge tone="primary">
        <PlayCircle size={12} />
        Келесі сабақ
      </StatusBadge>
    );
  }

  if (status === 'locked') {
    return (
      <StatusBadge tone="muted">
        <Lock size={12} />
        Құлыпталған
      </StatusBadge>
    );
  }

  return null;
}

function CurrentLessonCard({
  lesson,
}: {
  lesson: CourseProgressLessonView | null;
}) {
  if (!lesson) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="text-sm font-semibold text-foreground">
            Келесі сабақ жоқ
          </p>

          <Button type="button" variant="outline" asChild>
            <Link to="/courses">
              Курстарға өту
              <ArrowRight size={15} className="ml-2" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const lessonId = cleanId(lesson.id);
  const lessonTitle = cleanText(lesson.title) || 'Сабақ';
  const subjectName = cleanText(lesson.subjectName, MAX_META_CHARS) || 'Пән';
  const sortOrder = formatNumber(lesson.sortOrder || 1) || 1;

  return (
    <Card className="border-primary-muted bg-primary-soft/55">
      <CardContent className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="primary">
              <PlayCircle size={12} />
              Келесі қадам
            </StatusBadge>

            <LessonTimelineStatusBadge status={lesson.status} />
          </div>

          <h2 className="mt-3 line-clamp-2 text-lg font-semibold tracking-tight text-foreground">
            {lessonTitle}
          </h2>

          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {subjectName} · Сабақ #{sortOrder}
          </p>
        </div>

        {lesson.isLocked || !lessonId ? (
          <Button type="button" variant="outline" disabled>
            <Lock size={14} className="mr-2" />
            Құлыпталған
          </Button>
        ) : (
          <Button type="button" asChild>
            <Link to={buildLessonPath(lessonId)}>
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
  const priority = normalizeAnnouncementPriority(announcement.priority);
  const tone = getAnnouncementPriorityTone(priority);
  const isUrgent = priority === 'urgent';
  const isImportant = priority === 'important';
  const title = cleanText(announcement.title) || 'Хабарландыру';
  const body = cleanMultilineText(announcement.body);

  return (
    <div
      className={cn(
        'rounded-3xl border p-4',
        isUrgent
          ? 'border-destructive-muted bg-destructive-soft/55'
          : isImportant
            ? 'border-warning-muted bg-warning-soft/55'
            : 'border-border bg-card',
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <StatusBadge tone={tone}>
          {getAnnouncementPriorityLabel(priority)}
        </StatusBadge>

        {announcement.isPinned ? (
          <StatusBadge tone="primary">
            <Pin size={12} />
            Бекітілген
          </StatusBadge>
        ) : null}
      </div>

      <h3 className="text-sm font-semibold text-foreground">
        {title}
      </h3>

      {body ? (
        <p className="mt-2 whitespace-pre-line text-xs leading-5 text-muted-foreground">
          {body}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-2.5 py-1">
          <CalendarClock size={11} />
          {formatDateTime(announcement.publishedAt)}
        </span>

        {announcement.expiresAt ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-2.5 py-1">
            <Clock size={11} />
            {formatDateTime(announcement.expiresAt)}
          </span>
        ) : null}
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
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/70 bg-card pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone size={16} />
            Хабарландырулар
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3 p-4 sm:p-5">
          {Array.from({ length: 2 }).map((_, index) => (
            <div
              key={index}
              className="rounded-3xl border border-border bg-card p-4"
            >
              <SkeletonBlock className="h-4 w-32 rounded-full" />
              <SkeletonBlock className="mt-3 h-3 w-4/5 rounded-full" />
              <SkeletonBlock className="mt-2 h-3 w-2/3 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (hasError) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/70 bg-card pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone size={16} />
            Хабарландырулар
          </CardTitle>
        </CardHeader>

        <CardContent className="p-4 sm:p-5">
          <div className="rounded-3xl border border-warning-muted bg-warning-soft/70 p-4 text-xs leading-5 text-warning-foreground">
            Хабарландыруларды жүктеу мүмкін болмады.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (announcements.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone size={16} />
            Хабарландырулар
          </CardTitle>

          <StatusBadge tone="secondary">{announcements.length}</StatusBadge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 p-4 sm:p-5">
        {announcements.map((announcement, index) => (
          <AnnouncementCard
            key={cleanId(announcement.id) || `${cleanText(announcement.title)}-${index}`}
            announcement={announcement}
          />
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
  const lessonId = cleanId(lesson.id);
  const lessonTitle = cleanText(lesson.title) || 'Сабақ';
  const subjectName = cleanText(lesson.subjectName, MAX_META_CHARS) || 'Пән';
  const sortOrder = formatNumber(lesson.sortOrder || 1) || 1;

  const completedDate = formatDate(lesson.completedAt);
  const lockedReason = lesson.isLocked
    ? getLockedReasonText(lesson.lockedReason)
    : '';

  const isCurrent = lesson.status === 'current';
  const isCompleted = lesson.status === 'completed';

  return (
    <div className="relative flex gap-4">
      {!isLast ? (
        <div className="absolute left-[18px] top-10 h-full w-px bg-border" />
      ) : null}

      <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-border bg-card">
        <span
          className={cn('h-2.5 w-2.5 rounded-full', getStatusDotClass(lesson.status))}
        />
      </div>

      <div className="min-w-0 flex-1 pb-5">
        <div
          className={cn(
            'rounded-3xl border p-4 transition-colors',
            isCurrent
              ? 'border-primary-muted bg-primary-soft'
              : lesson.isLocked
                ? 'border-border bg-muted/55'
                : 'border-border bg-card hover:border-primary-muted hover:bg-primary-soft/20',
          )}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border bg-card/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  Сабақ #{sortOrder}
                </span>

                <LessonTimelineStatusBadge status={lesson.status} />
              </div>

              <h3 className="mt-2 text-sm font-semibold text-foreground">
                {lessonTitle}
              </h3>

              <p className="mt-1 text-xs text-muted-foreground">
                {subjectName}
              </p>

              {completedDate ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-success-foreground">
                  <CheckCircle2 size={13} />
                  {completedDate} аяқталды
                </p>
              ) : null}

              {lockedReason ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock size={13} />
                  {lockedReason}
                </p>
              ) : null}
            </div>

            <div className="shrink-0">
              {lesson.isLocked || !lessonId ? (
                <Button type="button" variant="outline" size="sm" disabled>
                  <Lock size={14} className="mr-2" />
                  Құлыпталған
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant={isCompleted ? 'outline' : 'default'}
                  asChild
                >
                  <Link to={buildLessonPath(lessonId)}>
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
  const title = cleanText(module.title) || 'Модуль';
  const totalLessons = formatNumber(module.totalLessons);
  const completedLessons = Math.min(formatNumber(module.completedLessons), totalLessons);
  const progressPct = Math.max(0, Math.min(100, formatNumber(module.progressPct)));

  const lessons = module.lessons || [];
  const isCompleted = totalLessons > 0 && completedLessons >= totalLessons;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{title}</CardTitle>

              {isCompleted ? (
                <StatusBadge tone="success">
                  <CheckCircle2 size={12} />
                  Аяқталған
                </StatusBadge>
              ) : null}
            </div>

            <p className="mt-1 text-xs text-muted-foreground">
              {completedLessons}/{totalLessons} сабақ
            </p>
          </div>

          <div className="min-w-[180px] rounded-2xl border border-border bg-muted/35 p-3">
            <ProgressBar
              value={progressPct}
              label="Оқу барысы"
              size="sm"
              tone={isCompleted ? 'success' : 'primary'}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5">
        {lessons.length === 0 ? (
          <EmptyState
            title="Сабақ жоқ"
            text="Сабақ қосылғаннан кейін көрінеді."
            compact
          />
        ) : (
          <div>
            {lessons.map((lesson, index) => (
              <LessonTimelineItem
                key={cleanId(lesson.id) || `${cleanText(lesson.title)}-${index}`}
                lesson={lesson}
                isLast={index === lessons.length - 1}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TeacherAdminCourseNotice({
  courseId,
}: {
  role?: string | undefined;
  courseId: string;
}) {
  const safeCourseId = cleanId(courseId);
  const manageHref = safeCourseId
    ? buildCourseEditPath(safeCourseId)
    : '/manage-courses';
  const listHref = '/manage-courses';

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap size={16} />
          Админ режимі
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:p-5">
        <Button type="button" asChild>
          <Link to={manageHref}>
            Курсты басқару
            <ArrowRight size={15} className="ml-2" />
          </Link>
        </Button>

        <Button type="button" variant="outline" asChild>
          <Link to={listHref}>Курстар тізімі</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function CourseDetailPage() {
  const { courseId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const safeCourseId = cleanId(courseId);
  const safeUserId = cleanId(user?.id);

  const isStudent = user?.role === 'student';
  const isTeacherOrAdmin = user?.role === 'admin';

  const backHref = user?.role === 'admin' ? '/manage-courses' : '/courses';

  const {
    data: timeline,
    isLoading,
    error,
  } = useCourseProgressTimeline(
    safeUserId,
    safeCourseId,
    Boolean(isStudent && safeUserId && safeCourseId),
  );

  const {
    data: announcements = [],
    isLoading: announcementsLoading,
    error: announcementsError,
  } = useCourseAnnouncements(safeCourseId, Boolean(safeCourseId && safeUserId));

  const nextLesson = timeline
    ? findNextLesson(timeline.modules || [], timeline.nextLessonId || null)
    : null;

  const remainingLessons = timeline
    ? Math.max(formatNumber(timeline.totalLessons) - formatNumber(timeline.completedLessons), 0)
    : 0;

  const courseTitle = cleanText(timeline?.courseTitle) || 'Курс';
  const courseSubjectName = cleanText(timeline?.subjectName, MAX_META_CHARS);
  const courseTeacherName = cleanText(timeline?.teacherName, MAX_META_CHARS);
  const courseDescription =
    timeline && (courseSubjectName || courseTeacherName)
      ? [courseSubjectName, courseTeacherName].filter(Boolean).join(' · ')
      : undefined;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          backAction={{
            label: 'Курстарға қайту',
            onClick: () => navigate(backHref),
          }}
          eyebrow={
            <>
              <GraduationCap size={13} />
              {isStudent ? 'Курс барысы' : 'Курс'}
            </>
          }
          icon={<GraduationCap size={20} />}
          title={courseTitle}
          description={courseDescription}
          actions={
            isStudent && nextLesson && !nextLesson.isLocked && cleanId(nextLesson.id) ? (
              <Button type="button" asChild>
                <Link to={buildLessonPath(nextLesson.id)}>
                  Оқуды жалғастыру
                  <ArrowRight size={15} className="ml-2" />
                </Link>
              </Button>
            ) : isTeacherOrAdmin ? (
              <Button type="button" variant="outline" asChild>
                <Link
                  to={
                    safeCourseId
                      ? buildCourseEditPath(safeCourseId)
                      : '/manage-courses'
                  }
                >
                  Курсты басқару
                  <ArrowRight size={15} className="ml-2" />
                </Link>
              </Button>
            ) : null
          }
        />

        {!user ? (
          <EmptyState
            title="Аккаунт анықталмады"
            text="Курс деректерін көру үшін жүйеге кіріңіз."
          />
        ) : null}

        {isStudent && isLoading ? <CourseTimelineSkeleton /> : null}

        {isStudent && !isLoading && error ? (
          <ErrorState
            text="Курс барысын жүктеу мүмкін болмады."
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

        {user && isTeacherOrAdmin ? (
          <>
            <TeacherAdminCourseNotice role={user.role} courseId={safeCourseId} />

            <CourseAnnouncementsPanel
              announcements={announcements}
              isLoading={announcementsLoading}
              hasError={Boolean(announcementsError)}
            />
          </>
        ) : null}

        {user && isStudent && !isLoading && !error && !timeline ? (
          <EmptyState
            title="Курс табылмады"
            text="Курс өшірілген немесе кіру рұқсаты жоқ болуы мүмкін."
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

        {user && isStudent && !isLoading && !error && timeline ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CourseStatCard
                label="Жалпы оқу барысы"
                value={formatPercent(timeline.progressPct)}
                icon={Target}
                tone="primary"
              />

              <CourseStatCard
                label="Сабақ саны"
                value={formatNumber(timeline.totalLessons)}
                icon={BookOpen}
                tone="secondary"
              />

              <CourseStatCard
                label="Аяқталған"
                value={formatNumber(timeline.completedLessons)}
                icon={CheckCircle2}
                tone="success"
              />

              <CourseStatCard
                label="Қалған сабақ"
                value={remainingLessons}
                icon={Clock}
                tone="warning"
              />
            </div>

            <CourseAnnouncementsPanel
              announcements={announcements}
              isLoading={announcementsLoading}
              hasError={Boolean(announcementsError)}
            />

            <CurrentLessonCard lesson={nextLesson} />

            <Card>
              <CardContent className="p-4 sm:p-5">
                <ProgressBar
                  value={formatNumber(timeline.progressPct)}
                  label="Курс бойынша оқу барысы"
                  size="md"
                  tone="primary"
                />
              </CardContent>
            </Card>

            {(timeline.modules || []).length === 0 ? (
              <EmptyState
                title="Курста модуль жоқ"
                text="Модуль және сабақ қосылғаннан кейін көрінеді."
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
                {(timeline.modules || []).map((module, index) => (
                  <ModuleTimelineCard
                    key={cleanId(module.id) || `${cleanText(module.title)}-${index}`}
                    module={module}
                  />
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}