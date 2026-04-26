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
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { CourseView } from '@/lib/app-data-types';
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

function buildCourseEditPath(courseId: string) {
  return `/create-course?courseId=${encodeURIComponent(courseId)}`;
}

function buildCourseDetailPath(courseId: string) {
  return `/courses/${encodeURIComponent(courseId)}`;
}

function getNormalizedCatalogAccessType(course: CourseView) {
  const accessType = course.accessType ?? course.access?.accessType ?? 'public_free';

  if (accessType === 'subscription_only') return 'paid';
  if (accessType === 'school_only') return 'private_invite';

  return accessType;
}

function getCourseAccessLabel(course: CourseView) {
  const accessType = getNormalizedCatalogAccessType(course);

  if (accessType === 'public_free') return 'Ашық';
  if (accessType === 'private_invite') return 'Жабық';
  if (accessType === 'paid') return 'Ақылы';

  return 'Белгісіз';
}

function formatCoursePrice(course: CourseView) {
  const accessType = getNormalizedCatalogAccessType(course);
  const price = Number(course.price ?? course.access?.price ?? 0);
  const currency = course.currency ?? course.access?.currency ?? 'KZT';

  if (accessType !== 'paid') return 'Тегін';
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
      return 'Invite code енгізу';
    case 'request_paid_access':
      return 'Access сұрау';
    case 'subscribe':
      return 'Ақылы access қажет';
    case 'request_school_access':
      return 'Жабық курс';
    case 'manage_course':
      return t('common.edit');
    default:
      if (access.accessState === 'draft_or_unpublished') return 'Жарияланбаған';
      if (access.accessState === 'enrollment_closed') return 'Жазылу жабық';
      return 'Қолжетімсіз';
  }
}

function getStudentActionDisabled(course: CourseView, pendingCourseId?: string | null) {
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
  icon: React.ReactNode;
  label: React.ReactNode;
  emphasized?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
        emphasized
          ? 'border-accent-muted bg-accent-soft text-accent-foreground'
          : 'border-border bg-muted/70 text-muted-foreground'
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </span>
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

  const actionLabel = getStudentActionLabel(course);
  const actionDisabled = getStudentActionDisabled(course, pendingCourseId);
  const showInviteInput =
    isStudentView &&
    inviteCourseId === course.id &&
    course.access?.unlockAction === 'redeem_invite';

  const courseDetailPath = buildCourseDetailPath(course.id);
  const courseEditPath = buildCourseEditPath(course.id);

  const cardBody = (
    <>
      <div className="relative flex h-32 items-center justify-center overflow-hidden border-b border-border bg-surface-soft">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-12 -top-12 h-32 w-32 rounded-full bg-primary-soft blur-2xl" />
          <div className="absolute -right-12 top-4 h-32 w-32 rounded-full bg-secondary-soft blur-2xl" />
          <div className="absolute bottom-0 left-1/3 h-24 w-24 rounded-full bg-accent-soft blur-2xl" />
        </div>

        <div className="relative flex h-14 w-14 items-center justify-center rounded-3xl border border-primary-muted bg-card/80 text-primary shadow-soft transition-transform duration-200 ease-soft group-hover:scale-[1.03]">
          <BookOpen size={26} />
        </div>

        <CourseAccessBadge
          accessType={getNormalizedCatalogAccessType(course)}
          className="absolute left-3 top-3"
        />

        {course.access?.pendingOrderId ? (
          <OrderStatusBadge status="pending" className="absolute bottom-3 left-3" />
        ) : null}
      </div>

      <CardContent className="space-y-4 p-4">
        <div>
          <span className="inline-flex max-w-full items-center rounded-full border border-border bg-muted/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span className="truncate">{course.subjectName || 'Жалпы курс'}</span>
          </span>

          <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-foreground transition-colors group-hover:text-primary">
            {course.title}
          </h3>

          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {course.description || t('page.course_catalog.no_description')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <MetricItem
            icon={<Users size={11} />}
            label={course.students}
          />

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
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/70 px-3 py-2 text-[11px] text-muted-foreground">
            <Lock size={12} />
            Курсқа жазылу уақытша жабық
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

  return (
    <Card
      interactive
      className="group overflow-hidden border-border/80 bg-card/95"
    >
      <div className="relative">
        {isStudentView && canOpenCourseDetail(course) ? (
          <Link to={courseDetailPath} className="block">
            {cardBody}
          </Link>
        ) : isTeacherView ? (
          <Link to={courseEditPath} className="block">
            {cardBody}
          </Link>
        ) : (
          <div className="block">{cardBody}</div>
        )}

        {isStudentView ? (
          <button
            type="button"
            disabled={pendingBookmarkCourseId === course.id}
            className={`absolute right-3 top-3 z-10 rounded-2xl border p-2 shadow-soft backdrop-blur transition-all duration-200 ease-soft hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 ${
              course.bookmarked
                ? 'border-primary-muted bg-primary text-primary-foreground'
                : 'border-border bg-card/85 text-muted-foreground hover:border-primary-muted hover:bg-primary-soft hover:text-primary'
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
            <div className="space-y-3 rounded-3xl border border-border bg-surface-soft/60 p-3">
              <ProgressBar value={course.progress} size="sm" />

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
                <div className="space-y-3 rounded-3xl border border-primary-muted bg-primary-soft/70 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <KeyRound size={13} />
                    Invite code
                  </div>

                  <Input
                    value={inviteCode}
                    onChange={(event) => onInviteCodeChange?.(event.target.value)}
                    placeholder="Мысалы: ABC123XYZ"
                    className="h-9 text-xs uppercase"
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
                      disabled={pendingCourseId === course.id}
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
                {pendingCourseId === course.id
                  ? t('page.course_catalog.enrolling')
                  : actionLabel}
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
            <div className="space-y-3 rounded-3xl border border-border bg-surface-soft/60 p-3 text-[11px] text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <CourseStatusBadge status={course.status} />
                <CourseAccessBadge accessType={getNormalizedCatalogAccessType(course)} />
              </div>

              <div className="rounded-2xl border border-border bg-card/70 px-3 py-2">
                Access: {getCourseAccessLabel(course)} · {formatCoursePrice(course)}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}