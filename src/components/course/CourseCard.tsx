import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  FileText,
  Loader2,
  Pencil,
  Users,
} from 'lucide-react';

import ProgressBar from '@/components/ProgressBar';
import { CourseStatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { CourseView } from '@/lib/app-data-types';
import t from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type CourseCardMode = 'student' | 'teacher' | 'admin';

export type CourseCardProps = {
  course: CourseView;
  mode?: CourseCardMode;
  pendingCourseId?: string | null;
  pendingBookmarkCourseId?: string | null;
  inviteCourseId?: string | null;
  inviteCode?: string;
  onBookmarkToggle?: (course: CourseView) => void;
  onStudentAction?: (course: CourseView) => void;
  onRedeemInvite?: (course: CourseView) => void;
  onInviteCodeChange?: (value: string) => void;
  onCloseInvite?: () => void;
};

const MAX_TITLE_CHARS = 180;
const MAX_DESCRIPTION_CHARS = 500;
const MAX_META_CHARS = 140;
const MAX_URL_CHARS = 2_048;

function cleanText(value: unknown, limit = MAX_TITLE_CHARS): string {
  return Array.from(String(value ?? ''))
    .filter((char) => char !== '\u0000')
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit)
    .trim();
}

function cleanId(value: unknown): string {
  return cleanText(value, 160);
}

function getSafeThumbnailUrl(value: unknown): string | null {
  const rawUrl = cleanText(value, MAX_URL_CHARS);

  if (!rawUrl) return null;

  if (rawUrl.startsWith('/') && !rawUrl.startsWith('//')) {
    return rawUrl;
  }

  try {
    const parsed = new URL(rawUrl);

    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function formatNumber(value: unknown): number {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return 0;

  return Math.max(0, Math.round(numericValue));
}

function clampProgress(value: unknown): number {
  return Math.max(0, Math.min(100, formatNumber(value)));
}

function hasCourseAccess(course: CourseView): boolean {
  return Boolean(
    course.enrolled ||
      course.access?.hasEntitlement ||
      course.access?.canAccess,
  );
}

function getStudentActionLabel(course: CourseView) {
  if (hasCourseAccess(course)) {
    return t('course.continue');
  }

  return t('course.enroll');
}

function MetricItem({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-card/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

export default function CourseCard({
  course,
  mode = 'student',
  pendingCourseId = null,
  pendingBookmarkCourseId = null,
  onBookmarkToggle,
  onStudentAction,
}: CourseCardProps) {
  const isStudentMode = mode === 'student';
  const isTeacherMode = mode === 'teacher';
  const isAdminMode = mode === 'admin';

  const courseId = cleanId(course.id);
  const title = cleanText(course.title, MAX_TITLE_CHARS) || 'Атаусыз курс';
  const description = cleanText(course.description, MAX_DESCRIPTION_CHARS);
  const subjectBadge =
    cleanText(course.subjectName, MAX_META_CHARS) ||
    'Жалпы бағыт';

  const thumbnailUrl = getSafeThumbnailUrl(
    (course as CourseView & { thumbnailUrl?: string | null }).thumbnailUrl,
  );
  const lessonsCount = formatNumber(course.lessons);
  const studentsCount = formatNumber(course.students);
  const progressValue =
    course.progress !== undefined && course.progress !== null
      ? clampProgress(course.progress)
      : null;

  const isPendingAction = Boolean(courseId && pendingCourseId === courseId);
  const isPendingBookmark = Boolean(
    courseId && pendingBookmarkCourseId === courseId,
  );

  const courseDetailPath = courseId
    ? `/courses/${encodeURIComponent(courseId)}`
    : '/courses';

  const courseEditPath = courseId
    ? `/teacher/courses/${encodeURIComponent(courseId)}/edit`
    : '/manage-courses';

  const canNavigateToCourse = Boolean(courseId);

  return (
    <Card className="group flex h-full flex-col overflow-hidden transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:border-primary-muted hover:shadow-soft-md">
      <div className="relative h-40 overflow-hidden border-b border-border/80 bg-gradient-to-br from-primary-soft via-card to-secondary-soft p-4">
        {thumbnailUrl ? (
          <>
            <img
              src={thumbnailUrl}
              alt={title}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/35 to-slate-950/15" />
          </>
        ) : (
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
        )}

        <div className="relative z-10 flex h-full flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  'max-w-[200px] truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm',
                  thumbnailUrl
                    ? 'border-white/20 bg-slate-950/55 text-white'
                    : 'border-border bg-card/85 text-foreground shadow-inner-soft',
                )}
              >
                {subjectBadge}
              </span>

              {(isTeacherMode || isAdminMode) && course.status ? (
                <CourseStatusBadge status={course.status} />
              ) : null}
            </div>

            {isStudentMode && onBookmarkToggle ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={
                  course.bookmarked
                    ? 'Бетбелгіден алып тастау'
                    : 'Бетбелгіге сақтау'
                }
                aria-pressed={Boolean(course.bookmarked)}
                disabled={isPendingBookmark || !canNavigateToCourse}
                onClick={() => onBookmarkToggle(course)}
                className={cn(
                  'h-9 w-9 shrink-0 rounded-2xl backdrop-blur-sm',
                  thumbnailUrl
                    ? 'border-white/20 bg-slate-950/55 text-white hover:bg-slate-950/75 hover:text-white'
                    : 'bg-card/85',
                )}
              >
                {isPendingBookmark ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Bookmark
                    size={15}
                    className={cn(
                      course.bookmarked
                        ? 'fill-primary text-primary'
                        : thumbnailUrl
                          ? 'text-white'
                          : 'text-muted-foreground',
                    )}
                  />
                )}
              </Button>
            ) : null}
          </div>

          <div className="flex items-end justify-between gap-3">
            {!thumbnailUrl ? (
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary-muted bg-card/90 text-primary shadow-inner-soft">
                <BookOpen size={20} />
              </span>
            ) : (
              <span />
            )}
          </div>
        </div>
      </div>

      <CardContent className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="min-w-0">
          {canNavigateToCourse ? (
            <Link
              to={courseDetailPath}
              className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
            >
              <h3 className="line-clamp-2 text-base font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">
                {title}
              </h3>
            </Link>
          ) : (
            <h3 className="line-clamp-2 text-base font-semibold leading-snug tracking-tight text-foreground">
              {title}
            </h3>
          )}

          {description ? (
            <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          ) : (
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              Курс сипаттамасы жақында толықтырылады.
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          <MetricItem
            icon={<FileText size={11} />}
            label={`${lessonsCount} ${t('course.lessons_count')}`}
          />

          <MetricItem
            icon={<Users size={11} />}
            label={`${studentsCount} оқушы`}
          />
        </div>

        {isStudentMode && course.enrolled && progressValue !== null ? (
          <div className="mt-4 rounded-2xl border border-border bg-muted/35 p-3">
            <ProgressBar
              value={progressValue}
              label="Оқу барысы"
              size="sm"
              tone={progressValue >= 80 ? 'success' : 'primary'}
            />
          </div>
        ) : null}

        <div className="mt-auto space-y-2.5 pt-4">
          {isStudentMode ? (
            <Button
              type="button"
              variant={
                hasCourseAccess(course)
                  ? 'default'
                  : 'outline'
              }
              className="w-full justify-between"
              disabled={!canNavigateToCourse || isPendingAction}
              onClick={() => onStudentAction?.(course)}
            >
              <span className="truncate">{getStudentActionLabel(course)}</span>

              {isPendingAction ? (
                <Loader2 size={15} className="shrink-0 animate-spin" />
              ) : (
                <ArrowRight size={15} className="shrink-0" />
              )}
            </Button>
          ) : null}

          {isTeacherMode ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {canNavigateToCourse ? (
                <>
                  <Button type="button" size="sm" asChild>
                    <Link to={courseEditPath}>
                      <Pencil size={13} className="mr-1.5" />
                      Курсты өңдеу
                    </Link>
                  </Button>

                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link to={courseDetailPath}>
                      Курсты ашу
                      <ArrowRight size={13} className="ml-1.5" />
                    </Link>
                  </Button>
                </>
              ) : (
                <Button type="button" size="sm" variant="outline" disabled>
                  Курс қолжетімсіз
                </Button>
              )}
            </div>
          ) : null}

          {isAdminMode ? (
            canNavigateToCourse ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-between"
                asChild
              >
                <Link to={courseDetailPath}>
                  <span>Толығырақ көру</span>
                  <ArrowRight size={14} />
                </Link>
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled
              >
                Курс қолжетімсіз
              </Button>
            )
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
