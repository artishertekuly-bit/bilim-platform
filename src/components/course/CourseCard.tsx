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

function buildCourseEditPath(courseId: string) {
  return `/create-course?courseId=${encodeURIComponent(courseId)}`;
}

function buildCourseDetailPath(courseId: string) {
  return `/courses/${encodeURIComponent(courseId)}`;
}

function normalizeCatalogAccessType(
  accessType: CourseAccessType | LegacyCourseAccessType | string | null | undefined,
): CourseAccessType {
  switch (accessType) {
    case 'public_free':
    case 'private_invite':
    case 'paid':
    case 'subscription_only':
    case 'school_only':
      return accessType;

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
  const currency = course.currency ?? course.access?.currency ?? 'KZT';

  if (accessType === 'public_free') return 'Тегін';
  if (accessType === 'private_invite') return 'Кодпен';
  if (accessType === 'subscription_only') return 'Жазылым';
  if (accessType === 'school_only') return 'Мектеп';

  if (!price) return 'Ақылы';

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

  if (pendingCourseId === course.id) return true;
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
      className={`inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none ${
        emphasized
          ? 'border-accent-muted bg-accent-soft text-accent-foreground'
          : 'border-border bg-muted/55 text-muted-foreground'
      }`}
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
  return (
    <>
      <div className="border-b border-border bg-muted/25 p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-card text-primary shadow-inner-soft">
            <BookOpen size={20} />
          </span>

          <div className="flex flex-wrap justify-end gap-2">
            <CourseAccessBadge accessType={accessType} />

            {course.access?.pendingOrderId ? (
              <OrderStatusBadge status="pending" />
            ) : null}
          </div>
        </div>
      </div>

      <CardContent className="space-y-4 p-4">
        <div>
          <span className="inline-flex max-w-full items-center rounded-full border border-border bg-muted/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <span className="truncate">{course.subjectName || 'Жалпы курс'}</span>
          </span>

          <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-foreground">
            {course.title}
          </h3>

          {course.description ? (
            <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {course.description}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MetricItem icon={<Users size={11} />} label={course.students} />

          <MetricItem
            icon={<Clock size={11} />}
            label={`${course.lessons} ${t('course.lessons_count')}`}
          />

          <MetricItem
            emphasized
            icon={<Tag size={11} />}
            label={formatCoursePrice(course)}
          />
        </div>

        {course.access?.accessState === 'enrollment_closed' ? (
          <div className="flex items-center gap-2 rounded-2xl border border-warning-muted bg-warning-soft/55 px-3 py-2 text-[11px] font-medium text-warning-foreground">
            <Lock size={12} />
            Жазылу жабық
          </div>
        ) : null}

        <TeacherProfileCard
          compact
          teacher={{
            id: course.teacherId,
            fullName: course.teacherName,
            avatarUrl: course.teacherAvatarUrl,
            bio: course.teacherBio,
            coursesCount: course.teacherCoursesCount,
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

  const accessType = getCourseAccessType(course);
  const actionLabel = getStudentActionLabel(course);
  const actionDisabled = getStudentActionDisabled(course, pendingCourseId);

  const showInviteInput =
    isStudentView &&
    inviteCourseId === course.id &&
    course.access?.unlockAction === 'redeem_invite';

  const courseDetailPath = buildCourseDetailPath(course.id);
  const courseEditPath = buildCourseEditPath(course.id);

  const courseBody = <CourseBody course={course} accessType={accessType} />;

  return (
    <Card className="overflow-hidden border-border bg-card transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-md">
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
            disabled={pendingBookmarkCourseId === course.id}
            className={`absolute right-3 top-3 z-10 rounded-2xl border p-2 transition-colors disabled:pointer-events-none disabled:opacity-60 ${
              course.bookmarked
                ? 'border-primary-muted bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:border-primary-muted hover:bg-primary-soft hover:text-primary'
            }`}
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
            <div className="space-y-3 rounded-3xl border border-border bg-muted/35 p-3">
              <ProgressBar value={course.progress} size="sm" tone="success" />

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
                    value={inviteCode}
                    onChange={(event) => onInviteCodeChange?.(event.target.value)}
                    placeholder="Код"
                    className="h-9 text-xs uppercase"
                    autoComplete="off"
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
                      disabled={pendingCourseId === course.id || !inviteCode.trim()}
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
                {pendingCourseId === course.id ? t('common.loading') : actionLabel}
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