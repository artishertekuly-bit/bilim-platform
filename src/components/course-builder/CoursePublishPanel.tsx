import {
  Archive,
  CheckCircle2,
  Eye,
  EyeOff,
  RotateCcw,
} from 'lucide-react';

import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CourseStatus } from '@/lib/course-creator/course-builder-utils';

function getPublishState(status: CourseStatus) {
  if (status === 'published') {
    return {
      title: 'Курс жарияланған',
      description:
        'Курс каталогта көрінеді. Егер курс жабық болса, оқушылар тек invite арқылы кіре алады.',
      tone: 'success' as const,
      icon: <CheckCircle2 size={12} />,
    };
  }

  if (status === 'archived') {
    return {
      title: 'Курс архивте',
      description:
        'Архивтегі курс белсенді каталогта көрсетілмейді. Қайта өңдеу үшін draft күйіне қайтарыңыз.',
      tone: 'muted' as const,
      icon: <Archive size={12} />,
    };
  }

  return {
    title: 'Курс draft күйінде',
    description:
      'Курс әлі жарияланбаған. Дайын болғаннан кейін жариялауға болады.',
    tone: 'completed' as const,
    icon: <EyeOff size={12} />,
  };
}

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
  const state = getPublishState(status);

  return (
    <Card id="publish" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-sm font-semibold">
                Жариялау және архив
              </CardTitle>

              <StatusBadge tone={state.tone}>
                {state.icon}
                {state.title}
              </StatusBadge>
            </div>

            <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
              Publish курс каталогына шығарады. Archive курсты белсенді аймақтан
              алып тастайды, бірақ кейін қайта draft күйіне қайтаруға болады.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-soft">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
              {status === 'published' ? (
                <Eye size={17} />
              ) : status === 'archived' ? (
                <Archive size={17} />
              ) : (
                <EyeOff size={17} />
              )}
            </div>

            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {state.title}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {state.description}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-primary-muted bg-primary-soft/70 p-4">
            <div className="mb-3 flex items-center gap-2">
              <StatusBadge tone="primary">
                <Eye size={12} />
                Publish
              </StatusBadge>
            </div>

            <p className="text-xs leading-5 text-muted-foreground">
              Курс дайын болса, оны жариялаңыз. Жарияланған курс оқушыға каталогта
              көрінеді.
            </p>

            <div className="mt-4">
              {status === 'archived' ? (
                <Button type="button" variant="outline" size="sm" disabled>
                  Алдымен архивтен қайтарыңыз
                </Button>
              ) : status === 'published' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onChangeStatus({ courseId, status: 'draft' })}
                  disabled={pending}
                >
                  <EyeOff size={14} className="mr-2" />
                  Жариялаудан алу
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onChangeStatus({ courseId, status: 'published' })}
                  disabled={pending}
                >
                  <Eye size={14} className="mr-2" />
                  Жариялау
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-muted/55 p-4">
            <div className="mb-3 flex items-center gap-2">
              <StatusBadge tone={status === 'archived' ? 'important' : 'muted'}>
                <Archive size={12} />
                Archive
              </StatusBadge>
            </div>

            <p className="text-xs leading-5 text-muted-foreground">
              Архивке түскен курс белсенді курс ретінде көрсетілмейді. Кейін оны
              қайта draft күйіне қайтаруға болады.
            </p>

            <div className="mt-4">
              {status === 'archived' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onChangeStatus({ courseId, status: 'draft' })}
                  disabled={pending}
                >
                  <RotateCcw size={14} className="mr-2" />
                  Архивтен қайтару
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onChangeStatus({ courseId, status: 'archived' })}
                  disabled={pending}
                >
                  <Archive size={14} className="mr-2" />
                  Архивке жіберу
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}