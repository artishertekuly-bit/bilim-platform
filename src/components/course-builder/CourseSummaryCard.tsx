import { BookOpen, FileText, Layers3, Users } from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CourseView } from '@/lib/app-data-types';
import {
  courseStatusLabels,
  type CourseStatus,
} from '@/lib/course-creator/course-builder-utils';
import { limitText, removeNullCharacters } from '@/lib/utils';

type CourseSummaryCardProps = {
  selectedCourse: CourseView | null;
  selectedSubjectName: string;
  selectedCoursePrice?: string;
  totalModules: number;
  totalLessons: number;
};

const MAX_TITLE_CHARS = 180;
const MAX_META_CHARS = 120;

function cleanText(value: unknown, limit = MAX_TITLE_CHARS): string {
  return limitText(
    removeNullCharacters(String(value ?? '')).replace(/\s+/g, ' ').trim(),
    limit,
  );
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

export function CourseSummaryCard({
  selectedCourse,
  selectedSubjectName,
  totalModules,
  totalLessons,
}: CourseSummaryCardProps) {
  const status = (selectedCourse?.status || 'draft') as CourseStatus;
  const courseTitle = cleanText(selectedCourse?.title) || 'Курс таңдалмаған';
  const subjectLabel = cleanText(selectedSubjectName, MAX_META_CHARS) || 'Пән';
  const studentsCount = formatCount(selectedCourse?.students);
  const safeTotalModules = formatCount(totalModules);
  const safeTotalLessons = formatCount(totalLessons);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
              <BookOpen size={17} />
            </span>

            <CardTitle className="truncate text-base font-semibold">
              {courseTitle}
            </CardTitle>
          </div>

          {selectedCourse ? (
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={getStatusTone(status)}>
                {courseStatusLabels[status]}
              </StatusBadge>
            </div>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-5">
        <p className="text-xs text-muted-foreground">{subjectLabel}</p>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-border bg-muted/40 p-3">
            <p className="text-[11px] text-muted-foreground">Модульдер</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Layers3 size={14} className="text-primary" />
              {safeTotalModules}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 p-3">
            <p className="text-[11px] text-muted-foreground">Сабақтар</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <FileText size={14} className="text-primary" />
              {safeTotalLessons}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 p-3">
            <p className="text-[11px] text-muted-foreground">Оқушылар</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Users size={14} className="text-primary" />
              {studentsCount}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
