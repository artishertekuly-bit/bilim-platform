import { Trash2 } from 'lucide-react';

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
    <Card className="border-destructive/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-destructive">
          Danger zone
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Бұл әрекет курсты толық өшіреді. Қайтару мүмкін болмауы мүмкін.
        </p>
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={onDeleteCourse}
          disabled={deleting}
        >
          <Trash2 size={14} className="mr-1.5" />
          {t('page.teacher_course_builder.action.delete_course')}
        </Button>
      </CardContent>
    </Card>
  );
}
