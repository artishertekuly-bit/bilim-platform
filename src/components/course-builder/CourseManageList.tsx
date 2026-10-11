import { useMemo, useState, type ReactNode } from 'react';
import { BookOpen, FileText, KeyRound, Search, Tag, Users } from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/DataState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type {
  CourseAccessType,
  TeacherCourseWorkspace,
} from '@/lib/app-data-types';
import {
  formatPrice,
  getAccessTypeLabel,
  getCourseStatusTone,
  shouldShowCoursePricing,
  type CourseStatus,
} from '@/lib/course-creator/course-builder-utils';
import t from '@/lib/i18n';

const MAX_SEARCH_CHARS = 160;

function normalizeText(value: string | null | undefined) {
  return (value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeAccessType(value: unknown): CourseAccessType {
  if (
    value === 'public_free' ||
    value === 'private_invite' ||
    value === 'paid' ||
    value === 'subscription_only' ||
    value === 'school_only'
  ) {
    return value;
  }

  if (value === 'open') return 'public_free';
  if (value === 'closed') return 'private_invite';

  return 'public_free';
}

function normalizeCourseStatus(value: unknown): CourseStatus {
  if (value === 'published' || value === 'archived' || value === 'draft') {
    return value;
  }

  return 'draft';
}

function getAccessTone(accessType: CourseAccessType) {
  if (accessType === 'paid' || accessType === 'subscription_only') {
    return 'warning' as const;
  }

  if (accessType === 'private_invite' || accessType === 'school_only') {
    return 'primary' as const;
  }

  return 'success' as const;
}

function getPriceLabel(course: TeacherCourseWorkspace['courses'][number]) {
  const accessType = normalizeAccessType(course.accessType);
  const isPaid = shouldShowCoursePricing(accessType);

  if (!isPaid) return 'Тегін';

  return formatPrice(Number(course.price || 0), course.currency || 'KZT');
}

function CourseMetaPill({
  icon,
  children,
  emphasized = false,
}: {
  icon: ReactNode;
  children: ReactNode;
  emphasized?: boolean;
}) {
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        emphasized
          ? 'border-warning-muted bg-warning-soft text-warning-foreground'
          : 'border-border bg-muted/55 text-muted-foreground'
      }`}
    >
      <span className="shrink-0">{icon}</span>
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
  const [search, setSearch] = useState('');

  const filteredCourses = useMemo(() => {
    const query = normalizeText(search);

    if (!query) return courses;

    return courses.filter((course) => {
      const haystack = normalizeText(
        `${course.title} ${course.subjectName || ''} ${course.status || ''}`,
      );

      return haystack.includes(query);
    });
  }, [courses, search]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">
            {t('page.teacher_course_builder.section.manage_courses')}
          </CardTitle>

          <StatusBadge tone="muted">
            <BookOpen size={12} />
            {courses.length}
          </StatusBadge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-5">
        {courses.length > 4 ? (
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />

            <Input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value.slice(0, MAX_SEARCH_CHARS))
              }
              placeholder="Курс немесе пән бойынша іздеу..."
              className="pl-9"
            />
          </div>
        ) : null}

        <div className="max-h-[620px] space-y-3 overflow-auto pr-1">
          {courses.length === 0 ? (
            <EmptyState
              title={t('page.teacher_course_builder.empty.courses_title')}
              text={t('page.teacher_course_builder.empty.courses_text')}
              compact
            />
          ) : filteredCourses.length === 0 ? (
            <EmptyState
              title="Курс табылмады"
              text="Іздеу мәтінін өзгертіп көріңіз."
              compact
            />
          ) : (
            filteredCourses.map((course) => {
              const accessType = normalizeAccessType(course.accessType);
              const status = normalizeCourseStatus(course.status);
              const isPaid = shouldShowCoursePricing(accessType);
              const selected = selectedCourseId === course.id;
              const priceLabel = getPriceLabel(course);

              return (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => onSelectCourse(course.id)}
                  aria-pressed={selected}
                  className={`w-full rounded-3xl border p-4 text-left transition-colors active:scale-[0.99] ${
                    selected
                      ? 'border-primary-muted bg-primary-soft'
                      : 'border-border bg-card hover:border-primary-muted hover:bg-primary-soft/35'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft ${
                        selected
                          ? 'border-primary-muted bg-card text-primary'
                          : 'border-border bg-muted/55 text-muted-foreground'
                      }`}
                    >
                      <BookOpen size={16} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-semibold text-foreground">
                            {course.title}
                          </p>

                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <StatusBadge tone={getCourseStatusTone(status)}>
                              {courseStatusLabels[status] || status}
                            </StatusBadge>

                            <StatusBadge tone={getAccessTone(accessType)}>
                              <KeyRound size={12} />
                              {getAccessTypeLabel(accessType)}
                            </StatusBadge>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition shadow-xs ${
                            selected
                              ? 'bg-foreground text-background'
                              : 'bg-muted/50 text-foreground hover:bg-foreground hover:text-background'
                          }`}
                        >
                          Өңдеу
                        </span>
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