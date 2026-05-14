import type { ReactNode } from 'react';
import {
  BookOpen,
  FileText,
  KeyRound,
  Tag,
  Users,
} from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CourseAccessType, TeacherCourseWorkspace } from '@/lib/app-data-types';
import {
  getAccessTypeLabel,
  shouldShowCoursePricing,
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

function SummaryRow({
  label,
  value,
  icon,
  emphasized = false,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 ${
        emphasized
          ? 'border-accent-muted bg-accent-soft/70'
          : 'border-border bg-muted/30'
      }`}
    >
      <span className="inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border ${
            emphasized
              ? 'border-accent-muted bg-card text-accent-foreground'
              : 'border-border bg-card text-muted-foreground'
          }`}
        >
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </span>

      <span className="shrink-0 text-right text-sm font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

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
  const pricingVisible = shouldShowCoursePricing(accessType);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold">
            Қысқаша мәлімет
          </CardTitle>

          <StatusBadge tone={getAccessTone(accessType)}>
            <KeyRound size={12} />
            {getAccessTypeLabel(accessType)}
          </StatusBadge>
        </div>
      </CardHeader>

      <CardContent className="space-y-2.5 p-4 sm:p-5">
        <SummaryRow
          label="Модульдер"
          value={moduleCount}
          icon={<FileText size={13} />}
        />

        <SummaryRow
          label="Сабақтар"
          value={lessonCount}
          icon={<BookOpen size={13} />}
        />

        <SummaryRow
          label="Оқушылар"
          value={selectedCourse.students}
          icon={<Users size={13} />}
        />

        <SummaryRow
          label="Қолжетімділік"
          value={getAccessTypeLabel(accessType)}
          icon={<KeyRound size={13} />}
        />

        {pricingVisible ? (
          <SummaryRow
            label="Баға"
            value={selectedCoursePrice}
            icon={<Tag size={13} />}
            emphasized
          />
        ) : null}
      </CardContent>
    </Card>
  );
}