import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CourseAccessType, TeacherCourseWorkspace } from '@/lib/app-data-types';
import {
  getAccessTypeLabel,
  shouldShowCoursePricing,
} from '@/lib/course-creator/course-builder-utils';

export function CourseSummaryCard({
  selectedCourse,
  moduleCount,
  lessonCount,
  accessType,
  selectedCoursePrice,
}: {
  selectedCourse: TeacherCourseWorkspace['courses'][number];
  moduleCount: number;
  lessonCount: number;
  accessType: CourseAccessType;
  selectedCoursePrice: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Қысқаша мәлімет</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <span className="text-muted-foreground">Модульдер</span>
          <span className="font-medium">{moduleCount}</span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <span className="text-muted-foreground">Сабақтар</span>
          <span className="font-medium">{lessonCount}</span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <span className="text-muted-foreground">Студенттер</span>
          <span className="font-medium">{selectedCourse.students}</span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <span className="text-muted-foreground">Access</span>
          <span className="text-right text-xs font-medium">
            {getAccessTypeLabel(accessType)}
          </span>
        </div>
        {shouldShowCoursePricing(accessType) ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <span className="text-muted-foreground">Баға</span>
            <span className="font-medium">{selectedCoursePrice}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
