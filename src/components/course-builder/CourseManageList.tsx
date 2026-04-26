import {
  BookOpen,
  CheckCircle2,
  FileText,
  KeyRound,
  Tag,
  Users,
} from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/DataState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CourseAccessType, TeacherCourseWorkspace } from '@/lib/app-data-types';
import t from '@/lib/i18n';
import {
  formatPrice,
  getAccessTypeLabel,
  shouldShowCoursePricing,
  type CourseStatus,
} from '@/lib/course-creator/course-builder-utils';

function getAccessTone(accessType: CourseAccessType) {
  const normalized = String(accessType || '');

  if (normalized === 'paid' || normalized === 'subscription_only') {
    return 'important' as const;
  }

  if (
    normalized === 'private_invite' ||
    normalized === 'school_only' ||
    normalized === 'closed' ||
    normalized === 'invite_only'
  ) {
    return 'primary' as const;
  }

  return 'success' as const;
}

function getStatusTone(status: CourseStatus) {
  if (status === 'published') return 'active' as const;
  if (status === 'archived') return 'muted' as const;
  return 'completed' as const;
}

function CourseMetaPill({
  icon,
  children,
  emphasized = false,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  emphasized?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
        emphasized
          ? 'border-accent-muted bg-accent-soft text-accent-foreground'
          : 'border-border bg-muted/70 text-muted-foreground'
      }`}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function CourseManageList({
  courses,
  selectedCourseId,
  courseStatusLabels,
  onSelectCourse,
}: {
  courses: TeacherCourseWorkspace['courses'];
  selectedCourseId: string | null;
  courseStatusLabels: Record<CourseStatus, string>;
  onSelectCourse: (courseId: string) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold">
              {t('page.teacher_course_builder.section.manage_courses')}
            </CardTitle>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Бұрын құрылған курсты таңдап, параметрлерін, модульдерін және
              сабақтарын өңдеңіз.
            </p>
          </div>

          <StatusBadge tone="muted">
            <BookOpen size={12} />
            {courses.length}
          </StatusBadge>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5">
        <div className="max-h-[620px] space-y-3 overflow-auto pr-1">
          {courses.length === 0 ? (
            <EmptyState
              title={t('page.teacher_course_builder.empty.courses_title')}
              text={t('page.teacher_course_builder.empty.courses_text')}
              compact
            />
          ) : (
            courses.map((course) => {
              const accessType = (course.accessType || 'public_free') as CourseAccessType;
              const isPaid = shouldShowCoursePricing(accessType);
              const priceLabel = isPaid
                ? formatPrice(Number(course.price || 0), course.currency || 'KZT')
                : 'Тегін';
              const selected = selectedCourseId === course.id;
              const status = course.status as CourseStatus;

              return (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => onSelectCourse(course.id)}
                  aria-pressed={selected}
                  className={`group w-full rounded-3xl border p-4 text-left transition-all duration-200 ease-soft active:translate-y-0 active:scale-[0.99] ${
                    selected
                      ? 'border-primary-muted bg-primary-soft shadow-soft-md'
                      : 'border-border bg-card hover:-translate-y-0.5 hover:border-primary-muted hover:bg-primary-soft/60 hover:shadow-soft-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft ${
                            selected
                              ? 'border-primary-muted bg-card text-primary'
                              : 'border-border bg-muted/70 text-muted-foreground group-hover:border-primary-muted group-hover:bg-card group-hover:text-primary'
                          }`}
                        >
                          <BookOpen size={16} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {course.title}
                          </p>

                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <StatusBadge tone={getStatusTone(status)}>
                              <CheckCircle2 size={12} />
                              {courseStatusLabels[status] || course.status}
                            </StatusBadge>

                            <StatusBadge tone={getAccessTone(accessType)}>
                              <KeyRound size={12} />
                              {getAccessTypeLabel(accessType)}
                            </StatusBadge>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {course.subjectName ? (
                          <CourseMetaPill icon={<FileText size={11} />}>
                            {course.subjectName}
                          </CourseMetaPill>
                        ) : null}

                        <CourseMetaPill icon={<Tag size={11} />} emphasized={isPaid}>
                          {priceLabel}
                        </CourseMetaPill>

                        <CourseMetaPill icon={<BookOpen size={11} />}>
                          {course.lessons} {t('course.lessons_count')}
                        </CourseMetaPill>

                        <CourseMetaPill icon={<Users size={11} />}>
                          {course.students}{' '}
                          {t('page.teacher_course_builder.students_label')}
                        </CourseMetaPill>
                      </div>
                    </div>

                    <span
                      className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ease-soft ${
                        selected
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground/30 bg-card'
                      }`}
                    >
                      {selected ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                      ) : null}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}