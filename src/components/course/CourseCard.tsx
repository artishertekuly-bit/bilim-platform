import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Clock,
  KeyRound,
  Lock,
  Tag,
  Users,
} from 'lucide-react';

import ProgressBar from '@/components/ProgressBar';
import TeacherProfileCard from '@/components/TeacherProfileCard';
import {
  CourseAccessBadge,
  CourseStatusBadge,
  OrderStatusBadge,
} from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { CourseAccessType, CourseView } from '@/lib/app-data-types';
import t from '@/lib/i18n';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

export type CourseCardMode = 'student' | 'teacher' | 'admin';

type CourseCardProps = {
  course: CourseView;
  mode: CourseCardMode;

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

type LegacyCourseAccessType = 'open' | 'closed';

const MAX_ID_CHARS = 180;
const MAX_TITLE_CHARS = 240;
const MAX_DESCRIPTION_CHARS = 500;
const MAX_SUBJECT_CHARS = 160;
const MAX_TEACHER_NAME_CHARS = 160;
const MAX_TEACHER_BIO_CHARS = 700;
const MAX_URL_CHARS = 2_000;
const MAX_INVITE_CODE_CHARS = 120;
const MAX_CURRENCY_CHARS = 12;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_TITLE_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanMultilineText(value: unknown, limit = MAX_DESCRIPTION_CHARS): string {
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

function normalizeKey(value: unknown): string {
  return cleanText(value, 80).toLowerCase();
}

function cleanInviteCode(value: unknown): string {
  return cleanText(value, MAX_INVITE_CODE_CHARS);
}

function buildCourseEditPath(courseId: string) {
  return `/teacher/courses/${encodeURIComponent(cleanId(courseId))}/edit`;
}

function buildCourseDetailPath(courseId: string) {
  return `/courses/${encodeURIComponent(cleanId(courseId))}`;
}

function normalizeCatalogAccessType(
  accessType: CourseAccessType | LegacyCourseAccessType | string | null | undefined,
): CourseAccessType {
  const normalized = normalizeKey(accessType);

  switch (normalized) {
    case 'public_free':
    case 'private_invite':
    case 'paid':
    case 'subscription_only':
    case 'school_only':
      return normalized as CourseAccessType;

    case 'open':
      return 'public_free';

    case 'closed':
      return 'private_invite';

    default:
      return 'public_free';
  }
}

function getCourseAccessType(course: CourseView): CourseAccessType {
  return normalizeCatalogAccessType(
    course.accessType ?? course.access?.accessType ?? 'public_free',
  );
}

function getCourseAccessLabel(course: CourseView) {
  const accessType = getCourseAccessType(course);

  switch (accessType) {
    case 'public_free':
      return 'Ашық';
    case 'private_invite':
      return 'Шақырумен';
    case 'paid':
      return 'Ақылы';
    case 'subscription_only':
      return 'Жазылым';
    case 'school_only':
      return 'Мектеп арқылы';
    default:
      return 'Ашық';
  }
}

function formatCoursePrice(course: CourseView) {
  const accessType = getCourseAccessType(course);
  const price = Number(course.price ?? course.access?.price ?? 0);
  const currency =
    cleanText(course.currency ?? course.access?.currency, MAX_CURRENCY_CHARS) || 'KZT';

  if (accessType === 'public_free') return 'Тегін';
  if (accessType === 'private_invite') return 'Кодпен';
  if (accessType === 'subscription_only') return 'Жазылым';
  if (accessType === 'school_only') return 'Мектеп';

  if (!Number.isFinite(price) || price <= 0) return 'Ақылы';

  return `${price.toLocaleString('kk-KZ')} ${currency}`;
}

function getStudentActionLabel(course: CourseView) {
  const access = course.access;

  if (course.enrolled) return t('course.continue');
  if (!access) return t('course.enroll');
  if (access.pendingOrderId) return 'Сұраныс қаралуда';

  switch (access.unlockAction) {
    case 'open_course':
      return 'Курсты ашу';
    case 'enroll':
      return 'Курсты бастау';
    case 'redeem_invite':
      return 'Шақыру кодын енгізу';
    case 'request_paid_access':
      return 'Қолжетімділік сұрау';
    case 'subscribe':
      return 'Жазылым қажет';
    case 'request_school_access':
      return 'Мектеп арқылы кіру';
    case 'manage_course':
      return t('common.edit');
    case 'none':
      if (access.accessState === 'draft_or_unpublished') return 'Жарияланбаған';
      if (access.accessState === 'enrollment_closed') return 'Жазылу жабық';
      return 'Қолжетімсіз';
    default:
      return 'Қолжетімсіз';
  }
}

function getStudentActionDisabled(
  course: CourseView,
  pendingCourseId?: string | null,
) {
  const access = course.access;
  const courseId = cleanId(course.id);

  if (cleanId(pendingCourseId) === courseId) return true;
  if (course.enrolled) return false;
  if (!access) return false;
  if (access.pendingOrderId) return true;

  return (
    access.unlockAction === 'none' ||
    access.unlockAction === 'subscribe' ||
    access.unlockAction === 'request_school_access'
  );
}

function canOpenCourseDetail(course: CourseView) {
  if (course.enrolled) return true;
  if (!course.access) return false;

  return course.access.canAccess || course.access.unlockAction === 'open_course';
}

function formatNumber(value: unknown): number {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
}

function MetricItem({
  icon,
  label,
  emphasized = false,
}: {
  icon: ReactNode;
  label: ReactNode;
  emphasized?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium leading-none',
        emphasized
          ? 'bg-accent-soft text-accent-foreground font-semibold'
          : 'bg-muted/60 text-muted-foreground',
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function CourseBody({
  course,
  accessType,
}: {
  course: CourseView;
  accessType: CourseAccessType;
}) {
  const title = cleanText(course.title) || 'Курс';
  const subjectName = cleanText(course.subjectName, MAX_SUBJECT_CHARS) || 'Жалпы курс';
  const teacherId = cleanId(course.teacherId);
  const teacherName = cleanText(course.teacherName, MAX_TEACHER_NAME_CHARS);
  const teacherAvatarUrl = cleanText(course.teacherAvatarUrl, MAX_URL_CHARS) || undefined;
  const teacherBio = cleanMultilineText(course.teacherBio, MAX_TEACHER_BIO_CHARS);

  return (
    <>
      <div className="p-4 pb-0">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BookOpen size={18} />
          </span>

          <div className="flex flex-wrap justify-end gap-1.5">
            <CourseAccessBadge accessType={accessType} />

            {course.access?.pendingOrderId ? (
              <OrderStatusBadge status="pending" />
            ) : null}
          </div>
        </div>
      </div>

      <CardContent className="space-y-3 p-4">
        <div>
          <span className="inline-flex max-w-full items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <span className="truncate">{subjectName}</span>
          </span>

          <h3 className="mt-1.5 line-clamp-2 text-sm font-bold leading-5 text-foreground">
            {title}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <MetricItem
            icon={<Users size={11} />}
            label={formatNumber(course.students)}
          />

          <MetricItem
            icon={<Clock size={11} />}
            label={`${formatNumber(course.lessons)} ${t('course.lessons_count')}`}
          />

          <MetricItem
            emphasized
            icon={<Tag size={11} />}
            label={formatCoursePrice(course)}
          />
        </div>

        {course.access?.accessState === 'enrollment_closed' ? (
          <div className="flex items-center gap-2 rounded-2xl bg-warning-soft/60 px-3 py-1.5 text-[11px] font-medium text-warning-foreground">
            <Lock size={12} />
            Жазылу жабық
          </div>
        ) : null}

        <TeacherProfileCard
          compact
          teacher={{
            id: teacherId,
            fullName: teacherName,
            avatarUrl: teacherAvatarUrl,
            bio: teacherBio,
            coursesCount: formatNumber(course.teacherCoursesCount),
          }}
        />
      </CardContent>
    </>
  );
}

export default function CourseCard({
  course,
  mode,
  pendingCourseId = null,
  pendingBookmarkCourseId = null,
  inviteCourseId = null,
  inviteCode = '',
  onBookmarkToggle,
  onStudentAction,
  onRedeemInvite,
  onInviteCodeChange,
  onCloseInvite,
}: CourseCardProps) {
  const isStudentView = mode === 'student';
  const isTeacherView = mode === 'teacher';
  const isAdminView = mode === 'admin';

  const courseId = cleanId(course.id);
  const safePendingCourseId = cleanId(pendingCourseId);
  const safePendingBookmarkCourseId = cleanId(pendingBookmarkCourseId);
  const safeInviteCourseId = cleanId(inviteCourseId);
  const safeInviteCode = cleanInviteCode(inviteCode);

  const accessType = getCourseAccessType(course);
  const actionLabel = getStudentActionLabel(course);
  const actionDisabled = getStudentActionDisabled(course, safePendingCourseId);

  const showInviteInput =
    isStudentView &&
    safeInviteCourseId === courseId &&
    course.access?.unlockAction === 'redeem_invite';

  const courseDetailPath = buildCourseDetailPath(courseId);
  const courseEditPath = buildCourseEditPath(courseId);

  const courseBody = <CourseBody course={course} accessType={accessType} />;

  return (
    <Card className="overflow-hidden bg-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
      <div className="relative">
        {isStudentView && canOpenCourseDetail(course) ? (
          <Link to={courseDetailPath} className="block">
            {courseBody}
          </Link>
        ) : isTeacherView ? (
          <Link to={courseEditPath} className="block">
            {courseBody}
          </Link>
        ) : (
          <div>{courseBody}</div>
        )}

        {isStudentView ? (
          <button
            type="button"
            disabled={safePendingBookmarkCourseId === courseId}
            className={cn(
              'absolute right-3 top-3 z-10 rounded-2xl p-2 transition-colors disabled:pointer-events-none disabled:opacity-60',
              course.bookmarked
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-card/85 text-muted-foreground shadow-xs backdrop-blur-xs hover:bg-card hover:text-primary',
            )}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onBookmarkToggle?.(course);
            }}
            aria-label={
              course.bookmarked
                ? t('page.course_catalog.bookmark.remove')
                : t('page.course_catalog.bookmark.add')
            }
          >
            <Bookmark
              size={14}
              fill={course.bookmarked ? 'currentColor' : 'none'}
            />
          </button>
        ) : null}

        <div className="space-y-3 px-4 pb-4">
          {isStudentView && course.enrolled ? (
            <div className="space-y-2.5 rounded-2xl bg-muted/40 p-3">
              <ProgressBar
                value={formatNumber(course.progress)}
                size="sm"
                tone="success"
              />

              <Button type="button" size="sm" className="w-full text-xs" asChild>
                <Link to={courseDetailPath}>
                  {t('course.continue')}
                  <ArrowRight size={12} className="ml-1" />
                </Link>
              </Button>
            </div>
          ) : isStudentView ? (
            <>
              {showInviteInput ? (
                <div className="space-y-3 rounded-3xl border border-primary-muted bg-primary-soft/60 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <KeyRound size={13} />
                    Шақыру коды
                  </div>

                  <Input
                    value={safeInviteCode}
                    onChange={(event) =>
                      onInviteCodeChange?.(cleanInviteCode(event.target.value))
                    }
                    placeholder="Код"
                    className="h-9 text-xs uppercase"
                    autoComplete="off"
                    maxLength={MAX_INVITE_CODE_CHARS}
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={onCloseInvite}
                    >
                      Жабу
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      className="text-xs"
                      disabled={safePendingCourseId === courseId || !safeInviteCode}
                      onClick={() => onRedeemInvite?.(course)}
                    >
                      Қабылдау
                    </Button>
                  </div>
                </div>
              ) : null}

              <Button
                type="button"
                size="sm"
                variant={
                  course.access?.unlockAction === 'request_paid_access'
                    ? 'default'
                    : 'outline'
                }
                className="w-full text-xs"
                onClick={() => onStudentAction?.(course)}
                disabled={actionDisabled}
              >
                {safePendingCourseId === courseId ? t('common.loading') : actionLabel}
              </Button>
            </>
          ) : isTeacherView ? (
            <Button type="button" size="sm" className="w-full text-xs" asChild>
              <Link to={courseEditPath}>
                {t('common.edit')}
                <ArrowRight size={12} className="ml-1" />
              </Link>
            </Button>
          ) : isAdminView ? (
            <div className="space-y-3 rounded-3xl border border-border bg-muted/35 p-3 text-[11px] text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <CourseStatusBadge status={course.status} />
                <CourseAccessBadge accessType={accessType} />
              </div>

              <div className="rounded-2xl border border-border bg-card px-3 py-2 text-xs leading-5">
                Қолжетімділік: {getCourseAccessLabel(course)} · {formatCoursePrice(course)}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-xs"
                asChild
              >
                <Link to={courseEditPath}>
                  Басқару
                  <ArrowRight size={12} className="ml-1" />
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}