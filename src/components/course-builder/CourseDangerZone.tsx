import { AlertTriangle, Trash2 } from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import t from '@/lib/i18n';

export function CourseDangerZone({
  deleting,
  onDeleteCourse,
}: {
  deleting: boolean;
  onDeleteCourse: () => void;
}) {
  return (
    <Card className="overflow-hidden border-destructive-muted bg-destructive-soft/35">
      <CardHeader className="border-b border-destructive-muted/70 bg-card pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold text-destructive">
            Қауіпті әрекет
          </CardTitle>

          <StatusBadge tone="danger">
            <AlertTriangle size={12} />
            Өшіру
          </StatusBadge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center gap-3 rounded-3xl border border-destructive-muted bg-card p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-destructive-muted bg-destructive-soft text-destructive">
            <Trash2 size={17} />
          </div>

          <p className="text-sm font-semibold text-foreground">
            Курсты толық өшіру
          </p>
        </div>

        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={onDeleteCourse}
          disabled={deleting}
        >
          <Trash2 size={14} className="mr-1.5" />
          {deleting
            ? t('page.teacher_course_builder.action.saving')
            : t('page.teacher_course_builder.action.delete_course')}
        </Button>
      </CardContent>
    </Card>
  );
}