import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CourseStatus } from '@/lib/course-creator/course-builder-utils';

export function CoursePublishPanel({
  courseId,
  status,
  pending,
  onChangeStatus,
}: {
  courseId: string;
  status: CourseStatus;
  pending: boolean;
  onChangeStatus: (input: { courseId: string; status: CourseStatus }) => void;
}) {
  return (
    <>
      <Card id="publish" className="scroll-mt-24">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Жариялау</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Жарияланған курс каталогта көрінеді. Жабық курс жарияланса да, тек invite
            арқылы ашылады.
          </p>

          {status === 'archived' ? (
            <div className="rounded-lg border bg-muted px-3 py-2 text-xs text-muted-foreground">
              Курс архивте тұр. Алдымен архивтен қайтарыңыз.
            </div>
          ) : status === 'published' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onChangeStatus({ courseId, status: 'draft' })}
              disabled={pending}
            >
              Жариялаудан алу
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => onChangeStatus({ courseId, status: 'published' })}
              disabled={pending}
            >
              Жариялау
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Архив</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Архивке түскен курс оқушыларға белсенді курс ретінде көрсетілмейді. Кейін
            оны қайта draft күйіне қайтаруға болады.
          </p>

          {status === 'archived' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onChangeStatus({ courseId, status: 'draft' })}
              disabled={pending}
            >
              Архивтен қайтару
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onChangeStatus({ courseId, status: 'archived' })}
              disabled={pending}
            >
              Архивке жіберу
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  );
}
