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
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">
            {t('page.teacher_course_builder.section.manage_courses')}
          </CardTitle>
          <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
            {courses.length}
          </span>
        </div>
      </CardHeader>

      <CardContent>
        <div className="max-h-[620px] space-y-2 overflow-auto pr-1">
          {courses.length === 0 ? (
            <EmptyState
              title={t('page.teacher_course_builder.empty.courses_title')}
              text={t('page.teacher_course_builder.empty.courses_text')}
            />
          ) : (
            courses.map((course) => {
              const accessType = course.accessType || 'public_free';
              const isPaid = shouldShowCoursePricing(accessType as CourseAccessType);

              return (
                <button
                  key={course.id}
                  onClick={() => onSelectCourse(course.id)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    selectedCourseId === course.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{course.title}</p>
                      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                        {[
                          course.subjectName,
                          getAccessTypeLabel(accessType),
                          isPaid
                            ? formatPrice(Number(course.price || 0), course.currency || 'KZT')
                            : 'Тегін',
                          `${course.lessons} ${t('course.lessons_count')}`,
                          `${course.students} ${t('page.teacher_course_builder.students_label')}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>

                    <span className="whitespace-nowrap rounded-full border px-2 py-1 text-[10px]">
                      {courseStatusLabels[course.status as CourseStatus] || course.status}
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
