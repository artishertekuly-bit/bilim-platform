import { useMemo } from 'react';
import { BookOpen, FileText, Layers3, Users } from 'lucide-react';

import { EmptyState } from '@/components/common/DataState';
import StatusBadge from '@/components/common/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CourseView, SubjectRow } from '@/lib/app-data-types';
import {
  courseStatusLabels,
  type CourseStatus,
} from '@/lib/course-creator/course-builder-utils';
import t from '@/lib/i18n';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

type CourseManageListProps = {
  courses: CourseView[];
  subjectOptions: SubjectRow[];
  selectedCourseId: string;
  onSelectCourse: (courseId: string) => void;
};

const MAX_ID_CHARS = 160;
const MAX_TITLE_CHARS = 180;
const MAX_SUBJECT_CHARS = 120;

function cleanText(value: unknown, limit = MAX_TITLE_CHARS): string {
  return limitText(
    removeNullCharacters(String(value ?? '')).replace(/\s+/g, ' ').trim(),
    limit,
  );
}

function cleanId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function formatCount(value: unknown): number {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return 0;

  return Math.max(0, Math.round(numericValue));
}

function getStatusTone(status: CourseStatus) {
  if (status === 'published') return 'active' as const;
  if (status === 'archived') return 'muted' as const;

  return 'completed' as const;
}

export function CourseManageList({
  courses,
  subjectOptions,
  selectedCourseId,
  onSelectCourse,
}: CourseManageListProps) {
  const safeSelectedCourseId = cleanId(selectedCourseId);

  const subjectNameById = useMemo(() => {
    const map = new Map<string, string>();

    for (const subject of subjectOptions) {
      const id = cleanId(subject.id);
      const name = cleanText(subject.name_kk, MAX_SUBJECT_CHARS);

      if (id && name) {
        map.set(id, name);
      }
    }

    return map;
  }, [subjectOptions]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
              <Layers3 size={17} />
            </span>

            <CardTitle className="text-base font-semibold">
              {t('page.teacher_course_builder.section.manage_course')}
            </CardTitle>
          </div>

          <StatusBadge tone="secondary">
            <BookOpen size={12} />
            {courses.length} курс
          </StatusBadge>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5">
        {courses.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={18} />}
            title={t('page.teacher_course_builder.empty.no_courses')}
            text="Алдымен жаңа курс жасаңыз."
            compact
          />
        ) : (
          <div className="space-y-2.5">
            {courses.map((course, index) => {
              const courseId = cleanId(course.id);
              const isSelected = Boolean(
                courseId && courseId === safeSelectedCourseId,
              );
              const status = (course.status || 'draft') as CourseStatus;
              const subjectName =
                subjectNameById.get(cleanId(course.subjectId)) ||
                cleanText(course.subjectName || course.subject, MAX_SUBJECT_CHARS) ||
                'Пән';

              const lessonsCount = formatCount(course.lessons);
              const studentsCount = formatCount(course.students);
              const courseTitle = cleanText(course.title) || 'Атаусыз курс';

              return (
                <button
                  key={courseId || `${courseTitle}-${index}`}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={!courseId}
                  onClick={() => {
                    if (courseId) {
                      onSelectCourse(courseId);
                    }
                  }}
                  className={cn(
                    'w-full rounded-3xl border p-4 text-left transition-all duration-200 ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
                    isSelected
                      ? 'border-primary-muted bg-primary-soft shadow-soft'
                      : 'border-border bg-card hover:-translate-y-0.5 hover:border-primary-muted hover:bg-primary-soft/20',
                    !courseId && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold text-foreground">
                        {courseTitle}
                      </p>

                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {subjectName}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <StatusBadge tone={getStatusTone(status)}>
                        {courseStatusLabels[status]}
                      </StatusBadge>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card/85 px-2.5 py-1">
                      <FileText size={11} />
                      {lessonsCount} сабақ
                    </span>

                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card/85 px-2.5 py-1">
                      <Users size={11} />
                      {studentsCount} оқушы
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
