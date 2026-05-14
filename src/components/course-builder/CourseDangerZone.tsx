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
    <Card className="overflow-hidden border-destructive-muted bg-destructive-soft/55">
      <CardHeader className="border-b border-destructive-muted/70 bg-card/65 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-sm font-semibold text-destructive">
                Danger zone
              </CardTitle>

              <StatusBadge tone="danger">
                <AlertTriangle size={12} />
                Қауіпті әрекет
              </StatusBadge>
            </div>

            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Бұл блок тек қайтарылуы қиын әрекеттер үшін. Курсты өшіру алдында
              оның модульдері, сабақтары және байланысқан материалдары керек емес
              екеніне көз жеткізіңіз.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="rounded-3xl border border-destructive-muted bg-card/75 p-4 shadow-soft">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-destructive-muted bg-destructive-soft text-destructive shadow-inner-soft">
              <Trash2 size={17} />
            </div>

            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Курсты толық өшіру
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Бұл әрекет курсты толық өшіреді. Қайтару мүмкін болмауы мүмкін.
                Егер курс уақытша керек емес болса, өшірудің орнына архивке жіберген дұрыс.
              </p>
            </div>
          </div>
        </div>

        <Button
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