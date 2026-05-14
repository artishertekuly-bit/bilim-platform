import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Bookmark, Clock, KeyRound, Users } from 'lucide-react';

import ProgressBar from '@/components/ProgressBar';
import { CourseAccessBadge, CourseStatusBadge, OrderStatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  const accessType = String(course.accessType ?? course.access?.accessType ?? 'public_free');
  if (accessType === 'subscription_only') return 'paid';
  if (accessType === 'school_only' || accessType === 'closed') return 'private_invite';
  if (accessType === 'open') return 'public_free';
  return accessType;
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
      return 'Кіру кодын енгізу';
    case 'request_paid_access':
      return 'Қолжетімділік сұрау';
    case 'subscribe':
      return 'Ақылы қолжетімділік қажет';
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

function CourseCover({ course }: { course: CourseView }) {
  const thumbnailUrl = (course as CourseView & { thumbnailUrl?: string | null }).thumbnailUrl;

  if (thumbnailUrl) {
    return (
      <img
        src={thumbnailUrl}
        alt="Курс мұқабасы"
        className="h-36 w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
        loading="lazy"
      />
    );
  }

  return (
    <div className="flex h-36 items-center justify-center bg-slate-100 dark:bg-card-soft">
      <div className="flex h-14 w-14 items-center justify-center rounded-3xl border border-primary-muted bg-card text-primary shadow-soft">
        <BookOpen size={25} />
      </div>
    </div>
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
    isStudentView && inviteCourseId === course.id && course.access?.unlockAction === 'redeem_invite';

  const courseDetailPath = buildCourseDetailPath(course.id);
  const courseEditPath = buildCourseEditPath(course.id);
  const primaryPath = isTeacherView ? courseEditPath : courseDetailPath;
  const cardCanOpen = isTeacherView || (isStudentView && canOpenCourseDetail(course));

  const content = (
    <>
      <div className="relative overflow-hidden rounded-t-3xl">
        <CourseCover course={course} />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <CourseAccessBadge accessType={getNormalizedCatalogAccessType(course)} />
          {isTeacherView || isAdminView ? <CourseStatusBadge status={course.status} /> : null}
        </div>
        {course.access?.pendingOrderId ? <OrderStatusBadge status="pending" className="absolute bottom-3 left-3" /> : null}
      </div>

      <CardContent className="space-y-4 p-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate font-semibold">{course.subjectName || 'Жалпы курс'}</span>
            <span className="shrink-0 rounded-full border border-border bg-surface-soft px-2 py-1 font-semibold">
              {formatCoursePrice(course)}
            </span>
          </div>

          <h3 className="line-clamp-2 text-base font-semibold leading-6 text-foreground transition-colors group-hover:text-primary">
            {course.title}
          </h3>

          <p className="line-clamp-2 min-h-[40px] text-sm leading-5 text-muted-foreground">
            {course.description || t('page.course_catalog.no_description')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-soft px-2.5 py-1">
            <Users size={12} /> {course.students} оқушы
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-soft px-2.5 py-1">
            <Clock size={12} /> {course.lessons} сабақ
          </span>
        </div>

        <div className="rounded-2xl border border-border bg-surface-soft/70 px-3 py-2 text-xs text-muted-foreground">
          Мұғалім: <span className="font-semibold text-foreground">{course.teacherName || 'Көрсетілмеген'}</span>
        </div>
      </CardContent>
    </>
  );

  return (
    <Card className="group overflow-hidden rounded-3xl border-border/80 bg-card/95 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft-md">
      <div className="relative">
        {cardCanOpen ? (
          <Link to={primaryPath} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35">
            {content}
          </Link>
        ) : (
          <div>{content}</div>
        )}

        {isStudentView ? (
          <Button
            type="button"
            variant={course.bookmarked ? 'default' : 'outline'}
            size="icon-sm"
            disabled={pendingBookmarkCourseId === course.id}
            className="absolute right-3 top-3 z-10 bg-card/90 backdrop-blur"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onBookmarkToggle?.(course);
            }}
            aria-label={course.bookmarked ? 'Сақталғаннан алып тастау' : 'Курсты сақтау'}
          >
            <Bookmark size={14} fill={course.bookmarked ? 'currentColor' : 'none'} />
          </Button>
        ) : null}

        <div className="space-y-3 px-4 pb-4">
          {isStudentView && course.enrolled ? (
            <div className="space-y-3 rounded-2xl border border-border bg-surface-soft/70 p-3">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span>Прогресс</span>
                <span>{Math.round(course.progress || 0)}%</span>
              </div>
              <ProgressBar value={course.progress} size="sm" tone="success" />
              <Button type="button" size="sm" className="w-full" asChild>
                <Link to={courseDetailPath}>
                  {t('course.continue')}
                  <ArrowRight size={13} />
                </Link>
              </Button>
            </div>
          ) : isStudentView ? (
            <>
              {showInviteInput ? (
                <div className="space-y-3 rounded-2xl border border-primary-muted bg-primary-soft/70 p-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-primary" htmlFor={`invite-${course.id}`}>
                    <KeyRound size={13} /> Кіру коды
                  </label>
                  <Input
                    id={`invite-${course.id}`}
                    value={inviteCode}
                    onChange={(event) => onInviteCodeChange?.(event.target.value)}
                    placeholder="ABC123XYZ"
                    className="h-10 rounded-2xl text-xs uppercase"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={onCloseInvite}>Жабу</Button>
                    <Button type="button" size="sm" disabled={pendingCourseId === course.id} onClick={() => onRedeemInvite?.(course)}>Қабылдау</Button>
                  </div>
                </div>
              ) : null}

              <Button
                type="button"
                size="sm"
                variant={course.access?.unlockAction === 'request_paid_access' ? 'default' : 'outline'}
                className="w-full"
                onClick={() => onStudentAction?.(course)}
                disabled={actionDisabled}
              >
                {pendingCourseId === course.id ? t('page.course_catalog.enrolling') : actionLabel}
              </Button>
            </>
          ) : isTeacherView ? (
            <Button type="button" size="sm" className="w-full" asChild>
              <Link to={courseEditPath}>Өңдеу <ArrowRight size={13} /></Link>
            </Button>
          ) : isAdminView ? (
            <Button type="button" variant="outline" size="sm" className="w-full" asChild>
              <Link to={courseEditPath}>Басқару <ArrowRight size={13} /></Link>
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
